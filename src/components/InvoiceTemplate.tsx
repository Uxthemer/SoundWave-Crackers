import { format } from 'date-fns';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';

interface OrderItem {
  product: {
    name: string;
    categories: {
      name: string;
    };
  };
  quantity: number;
  price: number;
  total_price: number;
}

interface Order {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  phone: string;
  alternate_phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  total_amount: number;
  status: string;
  payment_method: string;
  items?: OrderItem[];
}

interface InvoiceTemplateProps {
  order: Order;
}

export function InvoiceTemplate({ order }: InvoiceTemplateProps) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Invoice - ${order.id}</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 20px;
          color: #333;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #FF5722;
        }
        .logo {
          height: 100px;
        }
        .invoice-details {
          text-align: right;
        }
        .section {
          margin-bottom: 30px;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 12px;
          text-align: left;
        }
        th {
          background-color: #f8f8f8;
        }
        .total {
          text-align: right;
          font-size: 1.2em;
          margin-top: 20px;
        }
        .footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          text-align: center;
          color: #666;
        }
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="/assets/img/logo/logo_2.png" alt="SoundWave Crackers" class="logo" />
        <div class="invoice-details">
          <h2>INVOICE</h2>
          <p>Order ID: ${order.id}</p>
          <p>Date: ${format(new Date(order.created_at), 'PPpp')}</p>
          <p>Status: ${order.status}</p>
        </div>
      </div>

      <div class="grid">
        <div class="section">
          <h3>Bill To:</h3>
          <p>${order.full_name}</p>
          <p>${order.email}</p>
          <p>Phone: ${order.phone}</p>
          ${order.alternate_phone ? `<p>Alt. Phone: ${order.alternate_phone}</p>` : ''}
        </div>

        <div class="section">
          <h3>Shipping Address:</h3>
          <p>${order.address}</p>
          <p>${order.city}, ${order.state}</p>
          <p>PIN: ${order.pincode}</p>
        </div>
      </div>

      <div class="section">
        <h3>Order Items</h3>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${order.items?.map(item => `
              <tr>
                <td>${item.product.name}</td>
                <td>${item.product.categories.name}</td>
                <td>${item.quantity}</td>
                <td>₹${item.price}</td>
                <td>₹${item.total_price}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total">
          <p><strong>Total Amount: ₹${order.total_amount}</strong></p>
          <p>Payment Method: ${order.payment_method}</p>
        </div>
      </div>

      <div class="footer">
        <p>Thank you for shopping with SoundWave Crackers!</p>
        <p>Website: www.soundwavecrackers.com | Email: soundwavecrackers@gmail.com</p>
        <p>Phone: +91 9363515184, +91 9994827099</p>
      </div>

      <div class="no-print" style="margin-top: 20px; text-align: center;">
        <button onclick="window.print()" style="padding: 10px 20px; background: #FF5722; color: white; border: none; border-radius: 5px; cursor: pointer;">
          Print Invoice
        </button>
      </div>
    </body>
    </html>
  `;
}