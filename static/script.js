$(document).ready(function() {
    let invoices = [];
    let editingInvoice = null;
    let dataTable;
    let chart;

    const invoiceModal = new bootstrap.Modal(document.getElementById('invoiceModal'));
    const invoiceForm = document.getElementById('invoiceForm');
    const addInvoiceBtn = document.getElementById('addInvoiceBtn');
    const saveInvoiceBtn = document.getElementById('saveInvoice');
    const totalAmountSpan = document.getElementById('totalAmount');
    const messageContainer = document.getElementById('messageContainer');
    const showAllBtn = document.getElementById('showAllBtn');

    // Get all invoices
    async function fetchInvoices() {
        try {
            const response = await axios.get('/api/invoices');
            invoices = response.data;
            renderInvoices(invoices);
            createInvoiceTree();
            updateChart(invoices);
            showAllBtn.style.display = 'none'; // Hide "Show All" button initially
        } catch (error) {
            console.error('Failed to fetch invoices:', error);
            showMessage('Failed to fetch invoices: ' + (error.response?.data?.detail || error.message), 'danger');
        }
    }

    // Render invoice list
    function renderInvoices(invoicesToRender) {
        if ($.fn.DataTable.isDataTable('#invoiceTable')) {
            $('#invoiceTable').DataTable().destroy();
        }
        
        const tableBody = document.querySelector('#invoiceTable tbody');
        tableBody.innerHTML = '';
        invoicesToRender.forEach(invoice => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${invoice.date}</td>
                <td>${invoice.location}</td>
                <td>${invoice.purpose}</td>
                <td>${invoice.amount.toFixed(2)}</td>
                <td>${invoice.currency}</td>
                <td>${invoice.exchange_rate.toFixed(2)}</td>
                <td>
                    <button class="btn btn-sm btn-primary edit-btn" data-id="${invoice.id}">Edit</button>
                    <button class="btn btn-sm btn-danger delete-btn" data-id="${invoice.id}">Delete</button>
                </td>
            `;
        });
        
        dataTable = $('#invoiceTable').DataTable({
            order: [[0, 'desc']],
            language: {
                url: '//cdn.datatables.net/plug-ins/1.10.25/i18n/English.json'
            },
            columnDefs: [
                { orderable: false, targets: 6 },
                { searchable: false, targets: 6 }
            ],
            dom: 'Bfrtip',
            buttons: ['copy', 'csv', 'excel', 'pdf', 'print'],
            drawCallback: function() {
                updateChart();
            }
        });

        calculateTotalAmount(invoicesToRender);
        updateChart();
    }

    // Calculate total amount
    function calculateTotalAmount(invoicesToCalculate) {
        const total = invoicesToCalculate.reduce((sum, invoice) => {
            // Convert all amounts to JPY
            const amountInJPY = invoice.currency === 'JPY' ? invoice.amount : invoice.amount * invoice.exchange_rate;
            return sum + amountInJPY;
        }, 0);
        totalAmountSpan.textContent = `${total.toFixed(2)} JPY`;
        console.log('Total Amount:', total); // Add debugging info
    }

    // Create invoice tree
    function createInvoiceTree() {
        const treeData = {};
        invoices.forEach(invoice => {
            const [year, month] = invoice.date.split('-');
            if (!treeData[year]) {
                treeData[year] = {};
            }
            if (!treeData[year][month]) {
                treeData[year][month] = [];
            }
            treeData[year][month].push(invoice);
        });

        const treeHtml = Object.keys(treeData).map(year => `
            <div class="year">
                <span class="year-toggle" data-year="${year}">${year}</span>
                <div class="months" style="display: none;">
                    ${Object.keys(treeData[year]).map(month => `
                        <div class="month" data-year="${year}" data-month="${month}">${month}</div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        document.getElementById('invoiceTree').innerHTML = treeHtml;

        // Add event listeners
        document.querySelectorAll('.year-toggle').forEach(toggle => {
            toggle.addEventListener('click', function(e) {
                const monthsDiv = this.nextElementSibling;
                monthsDiv.style.display = monthsDiv.style.display === 'none' ? 'block' : 'none';
                this.classList.toggle('open');
                
                // Filter all data for the year
                const year = this.dataset.year;
                filterInvoices(year);
                e.stopPropagation(); // Stop event propagation
            });
        });

        document.querySelectorAll('.month').forEach(monthDiv => {
            monthDiv.addEventListener('click', function(e) {
                const year = this.dataset.year;
                const month = this.dataset.month;
                filterInvoices(year, month);
                e.stopPropagation(); // Stop event propagation
            });
        });
    }

    // Filter invoices and update table and chart
    function filterInvoices(year, month = null) {
        let filteredInvoices;
        if (month) {
            filteredInvoices = invoices.filter(invoice => invoice.date.startsWith(`${year}-${month}`));
        } else {
            filteredInvoices = invoices.filter(invoice => invoice.date.startsWith(year));
        }
        renderInvoices(filteredInvoices);
        calculateTotalAmount(filteredInvoices);
        updateChart(); // Ensure updateChart is called here
        showAllBtn.style.display = 'inline-block'; // Show "Show All" button
    }

    // Update chart
    function updateChart() {
        const chartData = {};
        const currentData = dataTable.rows({ search: 'applied' }).data().toArray();

        // Clear previous chart data
        if (chart) {
            chart.clear();
        }

        currentData.forEach(row => {
            const date = row[0]; // Use full date
            const purpose = row[2];
            const amount = parseFloat(row[3]);
            const currency = row[4];
            const exchangeRate = parseFloat(row[5]);

            if (!chartData[date]) {
                chartData[date] = {};
            }
            if (!chartData[date][purpose]) {
                chartData[date][purpose] = 0;
            }
            // Convert all amounts to JPY
            const amountInJPY = currency === 'JPY' ? amount : amount * exchangeRate;
            chartData[date][purpose] += amountInJPY;
        });

        const dates = Object.keys(chartData).sort();
        const purposes = [...new Set(currentData.map(row => row[2]))];
        const series = purposes.map(purpose => ({
            name: purpose,
            type: 'bar',
            stack: 'total',
            data: dates.map(date => chartData[date][purpose] || 0)
        }));

        const option = {
            title: {
                text: 'Monthly Invoice Amount Statistics (JPY)'
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'shadow'
                },
                formatter: function(params) {
                    let total = 0;
                    let result = `${params[0].axisValue}<br>`;
                    params.forEach(param => {
                        result += `${param.seriesName}: ${param.value.toFixed(2)} JPY<br>`;
                        total += param.value;
                    });
                    result += `Total: ${total.toFixed(2)} JPY`;
                    return result;
                }
            },
            legend: {
                data: purposes
            },
            xAxis: {
                type: 'category',
                data: dates
            },
            yAxis: {
                type: 'value',
                name: 'Amount (JPY)'
            },
            series: series
        };

        if (!chart) {
            chart = echarts.init(document.getElementById('chartContainer'));
        }
        chart.setOption(option, true); // Use true parameter to clear previous chart settings

        // Print debugging info
        console.log('Chart Data:', chartData);
        console.log('Dates:', dates);
        console.log('Purposes:', purposes);
        console.log('Series:', series);
    }

    // Add invoice
    addInvoiceBtn.addEventListener('click', () => {
        editingInvoice = null;
        document.getElementById('invoiceForm').reset();
        document.getElementById('modalTitle').textContent = 'Add Invoice';
        invoiceModal.show();
    });

    // Save invoice
    saveInvoiceBtn.addEventListener('click', async () => {
        const invoiceData = {
            id: document.getElementById('invoiceId').value,
            date: document.getElementById('date').value,
            location: document.getElementById('location').value,
            purpose: document.getElementById('purpose').value,
            amount: parseFloat(document.getElementById('amount').value) || 0,
            currency: document.getElementById('currency').value,
            exchange_rate: parseFloat(document.getElementById('exchangeRate').value) || 1,
            photo_url: '' // Not handling photo for now
        };

        // Ensure all required fields are present
        invoiceData.id = invoiceData.id || Date.now().toString();
        invoiceData.date = invoiceData.date || new Date().toISOString().split('T')[0];
        invoiceData.location = invoiceData.location || 'Unknown Location';
        invoiceData.purpose = invoiceData.purpose || 'Unspecified Purpose';
        invoiceData.currency = invoiceData.currency || 'CNY';

        try {
            let response;
            if (editingInvoice) {
                response = await axios.put(`/api/invoices/${editingInvoice.id}`, invoiceData);
                showMessage('Invoice updated successfully');
            } else {
                response = await axios.post('/api/invoices', invoiceData);
                showMessage('Invoice added successfully');
            }
            invoiceModal.hide();
            fetchInvoices();
        } catch (error) {
            console.error('Failed to save invoice:', error);
            showMessage('Failed to save invoice: ' + error.message, 'danger');
        }
    });

    // Edit invoice
    document.querySelector('#invoiceTable').addEventListener('click', (e) => {
        if (e.target.classList.contains('edit-btn')) {
            const id = e.target.dataset.id;
            editingInvoice = invoices.find(invoice => invoice.id === id);
            if (editingInvoice) {
                document.getElementById('modalTitle').textContent = 'Edit Invoice';
                Object.keys(editingInvoice).forEach(key => {
                    const input = document.getElementById(key);
                    if (input) {
                        if (key === 'exchange_rate') {
                            input.value = editingInvoice[key].toFixed(2);
                        } else {
                            input.value = editingInvoice[key];
                        }
                    }
                });
                document.getElementById('exchangeRate').value = editingInvoice.exchange_rate.toFixed(2);
                invoiceModal.show();
            }
        }
    });

    // Delete invoice
    document.querySelector('#invoiceTable').addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const id = e.target.dataset.id;
            if (confirm('Are you sure you want to delete this invoice?')) {
                try {
                    await axios.delete(`/api/invoices/${id}`);
                    showMessage('Invoice deleted successfully');
                    fetchInvoices();
                } catch (error) {
                    console.error('Failed to delete invoice:', error);
                    showMessage('Failed to delete invoice', 'danger');
                }
            }
        }
    });

    // Show message function
    function showMessage(message, type = 'success') {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.role = 'alert';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        messageContainer.appendChild(alertDiv);

        // Close automatically after 2 seconds
        setTimeout(() => {
            alertDiv.classList.remove('show');
            setTimeout(() => alertDiv.remove(), 150);
        }, 2000);
    }

    // Show All button click event
    showAllBtn.addEventListener('click', () => {
        renderInvoices(invoices);
        updateChart(); // Ensure updateChart is called here
        calculateTotalAmount(invoices);
        showAllBtn.style.display = 'none'; // Hide "Show All" button
    });

    // Initialize
    fetchInvoices();
});