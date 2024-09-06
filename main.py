from fastapi import FastAPI, HTTPException, File, UploadFile, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import List, Optional
import json
import os
from datetime import datetime
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# 静态文件服务
app.mount("/static", StaticFiles(directory="static"), name="static")

# 修改数据模型
class Invoice(BaseModel):
    id: Optional[str] = None
    date: Optional[str] = None
    location: Optional[str] = None
    purpose: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    exchange_rate: Optional[float] = None
    photo_url: Optional[str] = None

# 读取JSON文件
def read_invoices():
    if os.path.exists("invoices.json"):
        with open("invoices.json", "r", encoding='utf-8') as f:
            return json.load(f)
    return []

# 写入JSON文件
def write_invoices(invoices):
    with open("invoices.json", "w", encoding='utf-8') as f:
        json.dump(invoices, f, ensure_ascii=False, indent=4)

# API路由
@app.get("/api/invoices")
def get_invoices():
    return read_invoices()

# 修改创建发票的API端点
@app.post("/api/invoices")
async def create_invoice(invoice: Invoice):
    invoice_dict = invoice.dict(exclude_unset=True)
    invoice_dict['id'] = invoice_dict.get('id') or str(datetime.now().timestamp())
    invoice_dict['date'] = invoice_dict.get('date') or datetime.now().strftime("%Y-%m-%d")
    invoice_dict['location'] = invoice_dict.get('location') or "Unknown Location"
    invoice_dict['purpose'] = invoice_dict.get('purpose') or "Unspecified Purpose"
    invoice_dict['amount'] = float(invoice_dict.get('amount', 0))
    invoice_dict['currency'] = invoice_dict.get('currency') or "CNY"
    invoice_dict['exchange_rate'] = float(invoice_dict.get('exchange_rate', 1))
    invoice_dict['photo_url'] = invoice_dict.get('photo_url') or ""
    
    print("Received invoice data:", invoice_dict)  # 修改为英文
    
    invoices = read_invoices()
    invoices.append(invoice_dict)
    write_invoices(invoices)
    return invoice_dict

# 修改更新发票的API端点
@app.put("/api/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, invoice: Invoice):
    invoices = read_invoices()
    for i, inv in enumerate(invoices):
        if inv["id"] == invoice_id:
            updated_invoice = invoice.dict(exclude_unset=True)
            inv.update(updated_invoice)
            inv['amount'] = float(inv.get('amount', 0))
            inv['exchange_rate'] = float(inv.get('exchange_rate', 1))
            write_invoices(invoices)
            print("Updated invoice:", inv)  # 修改为英文
            return inv
    raise HTTPException(status_code=404, detail="Invoice not found")

@app.delete("/api/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str):
    invoices = read_invoices()
    invoices = [inv for inv in invoices if inv["id"] != invoice_id]
    write_invoices(invoices)
    return {"message": "Invoice deleted"}

@app.post("/api/upload_photo")
async def upload_photo(file: UploadFile = File(...)):
    file_location = f"static/photos/{file.filename}"
    with open(file_location, "wb+") as file_object:
        file_object.write(file.file.read())
    return {"photo_url": f"/static/photos/{file.filename}"}

# 主页
@app.get("/")
async def read_index():
    return FileResponse('static/index.html')

# CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源，生产环境中应该更具体
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)