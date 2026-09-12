import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { loadImage } from "./priceListPdf";
import type { BusinessDetails } from "./businessDetails";

/**
 * Invoices and quotations as PDF files.
 *
 * The printed invoice is an HTML page sent to the print dialog, which is fine
 * on paper but gives you nothing to send anyone. Sharing on WhatsApp needs a
 * real file, so both documents are drawn here with the same layout: business
 * on the left, document number and date on the right, customer, items,
 * totals.
 */

export interface DocumentLine {
  code: string | null;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface DocumentParty {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
}

export interface BusinessDocument {
  kind: "invoice" | "quotation";
  number: string;
  date: string | Date;
  status?: string | null;
  customer: DocumentParty;
  lines: DocumentLine[];
  /** Sum of the lines, before any discount. */
  subtotal: number;
  discount?: number;
  paymentMethod?: string | null;
  business: BusinessDetails;
}

/** The rupee sign is not in the standard PDF fonts; see priceListPdf. */
const amount = (value: number) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const BRAND: [number, number, number] = [255, 87, 34];

export async function buildDocumentPdf(doc: BusinessDocument): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 36;
  const right = pageWidth - margin;

  const { business } = doc;
  const isInvoice = doc.kind === "invoice";
  // The GST switch is about invoices. A quotation is not a tax document, so
  // it never claims to be one.
  const showGst = isInvoice && business.showGst && !!business.gstin;

  // ---- business, top left --------------------------------------------------
  let leftY = margin;
  const logo = await loadImage("/assets/img/logo/logo_2.png");
  if (logo) {
    const height = 48;
    const width = (logo.width / logo.height) * height;
    pdf.addImage(logo.dataUrl, margin, leftY, width, height, undefined, "FAST");
    leftY += height + 8;
  }

  pdf.setTextColor(30);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(business.name, margin, leftY + 10);
  leftY += 16;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(80);
  const businessLines = [
    ...(business.address ? pdf.splitTextToSize(business.address, 240) : []),
    ...(business.state ? [business.state] : []),
    `Phone: ${business.phone}`,
    `Email: ${business.email}`,
  ] as string[];
  businessLines.forEach((line) => {
    pdf.text(line, margin, leftY + 9);
    leftY += 12;
  });
  if (showGst) {
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(30);
    pdf.text(`GSTIN: ${business.gstin}`, margin, leftY + 9);
    leftY += 12;
    pdf.setFont("helvetica", "normal");
  }

  // ---- document, top right -------------------------------------------------
  let rightY = margin;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
  pdf.text(
    isInvoice ? (showGst ? "TAX INVOICE" : "INVOICE") : "QUOTATION",
    right,
    rightY + 18,
    { align: "right" }
  );
  rightY += 34;

  pdf.setFontSize(9);
  pdf.setTextColor(60);
  const meta: [string, string][] = [
    [isInvoice ? "Order No" : "Quote No", doc.number],
    ["Date", format(new Date(doc.date), "dd MMM yyyy, h:mm a")],
  ];
  if (doc.status) meta.push(["Status", doc.status]);
  meta.forEach(([label, value]) => {
    pdf.setFont("helvetica", "normal");
    pdf.text(`${label}:`, right - 170, rightY);
    pdf.setFont("helvetica", "bold");
    pdf.text(value, right, rightY, { align: "right" });
    rightY += 13;
  });

  let y = Math.max(leftY, rightY) + 10;
  pdf.setDrawColor(BRAND[0], BRAND[1], BRAND[2]);
  pdf.setLineWidth(1.5);
  pdf.line(margin, y, right, y);
  y += 18;

  // ---- customer ------------------------------------------------------------
  const c = doc.customer;
  const column = (title: string, lines: string[], x: number) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(30);
    pdf.text(title, x, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(70);
    let lineY = y + 14;
    lines.forEach((line) => {
      (pdf.splitTextToSize(line, 240) as string[]).forEach((part) => {
        pdf.text(part, x, lineY);
        lineY += 12;
      });
    });
    return lineY;
  };

  const billTo = [c.name, c.phone ? `Phone: ${c.phone}` : "", c.email && c.email !== "-" ? c.email : ""]
    .filter(Boolean);
  const placeLine = [c.city, c.district, c.state].filter(Boolean).join(", ");
  const shipTo = [c.address ?? "", placeLine, c.pincode ? `PIN: ${c.pincode}` : ""].filter(Boolean);

  const endLeft = column(isInvoice ? "Bill To" : "Quotation For", billTo, margin);
  const endRight = shipTo.length
    ? column("Delivery Address", shipTo, pageWidth / 2 + 10)
    : y;
  y = Math.max(endLeft, endRight) + 8;

  // ---- items ---------------------------------------------------------------
  const totalQuantity = doc.lines.reduce((sum, line) => sum + (line.quantity || 0), 0);

  autoTable(pdf, {
    startY: y,
    head: [["S.No", "Code", "Product", "Qty", "Price (Rs.)", "Total (Rs.)"]],
    body: doc.lines.map((line, index) => [
      String(index + 1),
      line.code ?? "-",
      line.name,
      String(line.quantity),
      amount(line.price),
      amount(line.total),
    ]),
    foot: [["", "", `${doc.lines.length} products`, String(totalQuantity), "", ""]],
    margin: { left: margin, right: margin, bottom: 50 },
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, lineColor: [215, 215, 215], lineWidth: 0.4 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold", halign: "center" },
    footStyles: { fillColor: [248, 248, 248], textColor: 60, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 32, halign: "center" },
      1: { cellWidth: 62 },
      3: { cellWidth: 40, halign: "center" },
      4: { cellWidth: 70, halign: "right" },
      5: { cellWidth: 78, halign: "right" },
    },
  });

  // ---- totals --------------------------------------------------------------
  const tableEnd =
    (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  let totalsY = tableEnd + 18;
  const discount = Number(doc.discount || 0);
  const grand = doc.subtotal - discount;

  const needed = (discount > 0 ? 3 : 1) * 16 + 60;
  if (totalsY + needed > pageHeight - 50) {
    pdf.addPage();
    totalsY = margin + 10;
  }

  const totalRow = (label: string, value: string, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(bold ? 11 : 9.5);
    pdf.setTextColor(bold ? 20 : 60);
    pdf.text(label, right - 190, totalsY);
    pdf.text(value, right, totalsY, { align: "right" });
    totalsY += bold ? 18 : 15;
  };

  if (discount > 0) {
    totalRow("Total", `Rs. ${amount(doc.subtotal)}`);
    totalRow("Discount", `- Rs. ${amount(discount)}`);
  }
  totalRow("Grand Total", `Rs. ${amount(grand)}`, true);
  if (doc.paymentMethod) totalRow("Payment method", doc.paymentMethod);

  if (!isInvoice) {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(8.5);
    pdf.setTextColor(110);
    pdf.text(
      "This is a quotation, not a bill. Prices are valid subject to stock availability.",
      margin,
      totalsY + 10
    );
  }

  // ---- footer on every page -------------------------------------------------
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text(
      `Thank you for choosing ${business.name}  |  ${business.website}  |  ${business.phone}`,
      pageWidth / 2,
      pageHeight - 24,
      { align: "center" }
    );
    if (pages > 1) {
      pdf.text(`Page ${page} of ${pages}`, right, pageHeight - 24, { align: "right" });
    }
  }

  return pdf;
}

/** A file name a phone will not mangle. */
export function documentFileName(kind: BusinessDocument["kind"], number: string) {
  const safe = number.replace(/[^A-Za-z0-9-]+/g, "_");
  return `${kind === "invoice" ? "Invoice" : "Quotation"}_${safe}.pdf`;
}
