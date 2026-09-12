import { format } from 'date-fns';
import {
  DEFAULT_BUSINESS,
  escapeHtml,
  type BusinessDetails,
} from '../lib/businessDetails';
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
  short_id?: string;
  created_at: string;
  full_name: string;
  email: string;
  phone: string;
  alternate_phone: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  total_amount: number;
  status: string;
  payment_method: string;
  items?: OrderItem[];
  discount_amt?: number;
}

interface InvoiceTemplateProps {
  order: Order;
}

/**
 * The printed invoice, as an HTML page.
 *
 * `business` comes from Admin Settings. Its GSTIN is printed only while
 * "Show GST on invoice" is on; with it off the invoice carries no GST line at
 * all, rather than an empty one.
 */
export function InvoiceTemplate({
  order,
  business = DEFAULT_BUSINESS,
}: {
  order: any;
  business?: BusinessDetails;
}) {
  // ensure items are rendered ordered by product.order column
  const items = (order.items || []).slice().sort((a: any, b: any) => {
    return Number(a.product?.order ?? 0) - Number(b.product?.order ?? 0);
  });

  const totalProducts = order.items?.length || 0;
  const totalQuantity = order.items?.reduce((s: number, it: OrderItem) => s + (it.quantity || 0), 0) || 0;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Invoice - ${order.short_id}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #FF5722; }
        .logo { height: 100px; }
        .business p { margin: 2px 0; font-size: 0.9rem; }
        .business-name { font-weight: bold; font-size: 1rem !important; }
        .gstin { font-weight: bold; letter-spacing: 0.5px; }
        .invoice-details { text-align: right; }
        .section { margin-bottom: 30px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .items-header { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:8px; }
        .totals { font-size: 0.95rem; color: #333; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f8f8f8; }
        .total { text-align: right; font-size: 1.2em; margin-top: 20px; }
        .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; }
        @media print { body { margin: 0; } .no-print { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="business">
          <img src="/assets/img/logo/logo_2.png" alt="${escapeHtml(business.name)}" class="logo" />
          <p class="business-name">${escapeHtml(business.name)}</p>
          ${business.address ? `<p>${escapeHtml(business.address)}</p>` : ''}
          ${business.state ? `<p>${escapeHtml(business.state)}</p>` : ''}
          ${business.showGst && business.gstin ? `<p class="gstin">GSTIN: ${escapeHtml(business.gstin)}</p>` : ''}
        </div>
        <div class="invoice-details">
          <h2>${business.showGst ? 'TAX INVOICE' : 'INVOICE'}</h2>
          <p>Order ID: ${order.short_id || order.id}</p>
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
          <p>${order.city}, ${order.district}, ${order.state}</p>
          <p>PIN: ${order.pincode}</p>
        </div>
      </div>

      <div class="section">
        <div class="items-header">
          <h3>Order Items</h3>
          <div class="totals">
            <div><strong>Total Products:</strong> ${totalProducts}</div>
            <div><strong>Total Quantity:</strong> ${totalQuantity}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>S.No.</th>
              <th>Code</th>
              <th>Product</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${items?.map((it: any, idx: any) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${(it.product as any)?.product_code || "-"}</td>
                <td>${it.product.name}</td>
                <td>${it.quantity}</td>
                <td>₹${it.price}</td>
                <td>₹${it.total_price}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div class="total">
          ${(order.discount_amt ?? 0) > 0 ? `<p><strong>Total Amount: ₹${order.total_amount.toFixed(2)}</strong></p>
          <p><strong>Discount: -₹${order.discount_amt?.toFixed(2) || "0.00"}</strong></p>`:""}
          <p><strong>Grand Total: ₹${(order.total_amount - (order.discount_amt || 0)).toFixed(2)}</strong></p>
          <p>Payment Method: ${order.payment_method}</p>
        </div>
      </div>

      <div class="footer">
        <p>Thank you for shopping with ${escapeHtml(business.name)}!</p>
        <p>Website: ${escapeHtml(business.website)} | Email: ${escapeHtml(business.email)}</p>
        <p>Phone: ${escapeHtml(business.phone)}</p>
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