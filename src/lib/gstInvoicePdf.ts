import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { loadImage } from "./priceListPdf";
import { gstTotals, rupeesInWords, type GstInvoice, type GstInvoiceParty } from "./gstInvoice";

/**
 * A GST tax invoice drawn from whatever the user types in: the "Generate
 * dummy invoice" form in the user menu (admin and superadmin).
 *
 * It is not documentPdf's invoice with more columns. That one prints an
 * order that exists -- one grand total, GST optional. This one is the full
 * tax layout: HSN, taxable value, CGST + SGST or IGST, place of supply,
 * amount in words. Nothing here is read from or written to the database;
 * the order books do not know this invoice exists.
 */

/** The rupee sign is not in the standard PDF fonts; see priceListPdf. */
const amount = (value: number) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const BRAND: [number, number, number] = [255, 87, 34];

export async function buildGstInvoicePdf(invoice: GstInvoice): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 36;
  const right = pageWidth - margin;
  const { business } = invoice;
  const totals = gstTotals(invoice);
  const rate = invoice.gstRate;

  // ---- header: same arrangement as documentPdf -----------------------------
  let leftY = margin;
  const logo = await loadImage("/assets/img/logo/logo_2.png");
  if (logo) {
    const height = 62;
    const width = (logo.width / logo.height) * height;
    pdf.addImage(logo.dataUrl, margin, leftY, width, height, undefined, "FAST");
    leftY += height + 8;
  }

  let rightY = margin;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
  pdf.text("TAX INVOICE", right, rightY + 18, { align: "right" });
  rightY += 32;

  pdf.setTextColor(30);
  pdf.setFontSize(12);
  pdf.text(business.name, right, rightY, { align: "right" });
  rightY += 15;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(80);
  const businessLines = [
    ...(business.address ? pdf.splitTextToSize(business.address, 260) : []),
    ...(business.state ? [business.state] : []),
    `Phone: ${business.phone}`,
    `Email: ${business.email}`,
  ] as string[];
  businessLines.forEach((line) => {
    pdf.text(line, right, rightY, { align: "right" });
    rightY += 12;
  });
  if (invoice.sellerGstin) {
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(30);
    pdf.text(`GSTIN: ${invoice.sellerGstin}`, right, rightY, { align: "right" });
    rightY += 12;
    pdf.setFont("helvetica", "normal");
  }

  rightY += 4;
  pdf.setFontSize(9);
  pdf.setTextColor(60);
  const placeOfSupply = (invoice.shipTo?.state || invoice.billTo.state || "").trim();
  const meta: [string, string][] = [
    ["Invoice No", invoice.number],
    ["Date", format(invoice.date, "dd MMM yyyy")],
    ...(placeOfSupply ? ([["Place of Supply", placeOfSupply]] as [string, string][]) : []),
    ["Reverse Charge", "No"],
  ];
  meta.forEach(([label, value]) => {
    pdf.setFont("helvetica", "bold");
    const valueWidth = pdf.getTextWidth(value);
    pdf.text(value, right, rightY, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.text(`${label}:`, right - valueWidth - 6, rightY, { align: "right" });
    rightY += 13;
  });

  let y = Math.max(leftY, rightY) + 10;
  pdf.setDrawColor(BRAND[0], BRAND[1], BRAND[2]);
  pdf.setLineWidth(1.5);
  pdf.line(margin, y, right, y);
  y += 18;

  // ---- bill to / ship to ---------------------------------------------------
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

  const partyLines = (p: GstInvoiceParty, withContact: boolean) =>
    [
      p.name,
      p.address ?? "",
      [p.city, p.state].filter(Boolean).join(", "),
      p.pincode ? `PIN: ${p.pincode}` : "",
      withContact && p.phone ? `Phone: ${p.phone}` : "",
      withContact && p.gstin ? `GSTIN: ${p.gstin}` : "",
    ]
      .map((line) => String(line).trim())
      .filter(Boolean);

  const endLeft = column("Bill To", partyLines(invoice.billTo, true), margin);
  const endRight = column(
    "Ship To",
    invoice.shipTo
      ? partyLines(invoice.shipTo, true)
      : ["Same as billing address"],
    pageWidth / 2 + 10
  );
  y = Math.max(endLeft, endRight) + 4;

  const transport = [
    invoice.transport?.name ? `Transport: ${invoice.transport.name}` : "",
    invoice.transport?.vehicle ? `Vehicle No: ${invoice.transport.vehicle}` : "",
    invoice.transport?.lrNumber ? `LR No: ${invoice.transport.lrNumber}` : "",
  ].filter(Boolean);
  if (transport.length) {
    pdf.setFontSize(9);
    pdf.setTextColor(70);
    pdf.text(transport.join("     "), margin, y + 6);
    y += 14;
  }
  y += 6;

  // ---- items ---------------------------------------------------------------
  // Rate and amount are printed before tax whatever basis they were typed
  // on: a tax invoice shows the taxable value and the tax beside it.
  const factor = invoice.pricesIncludeGst ? 1 / (1 + rate / 100) : 1;
  const totalQuantity = invoice.lines.reduce((sum, line) => sum + (line.quantity || 0), 0);

  autoTable(pdf, {
    startY: y,
    head: [["S.No", "Product", "HSN", "Qty", "Rate (Rs.)", "Taxable Value (Rs.)"]],
    body: invoice.lines.map((line, index) => [
      String(index + 1),
      line.name,
      line.hsn || "-",
      String(line.quantity),
      amount(line.rate * factor),
      amount(totals.lines[index].taxable),
    ]),
    foot: [
      [
        "",
        { content: `${invoice.lines.length} products`, styles: { halign: "center" as const } },
        "",
        { content: String(totalQuantity), styles: { halign: "center" as const } },
        "",
        { content: amount(totals.goods), styles: { halign: "right" as const } },
      ],
    ],
    margin: { left: margin, right: margin, bottom: 50 },
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, lineColor: [215, 215, 215], lineWidth: 0.4 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold", halign: "center" },
    footStyles: { fillColor: [248, 248, 248], textColor: 60, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 32, halign: "center" },
      2: { cellWidth: 50, halign: "center" },
      3: { cellWidth: 40, halign: "center" },
      4: { cellWidth: 70, halign: "right" },
      5: { cellWidth: 90, halign: "right" },
    },
  });

  // ---- totals --------------------------------------------------------------
  const tableEnd =
    (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  let totalsY = tableEnd + 18;
  if (totalsY + 230 > pageHeight - 50) {
    pdf.addPage();
    totalsY = margin + 10;
  }

  const totalRow = (label: string, value: string, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(bold ? 11 : 9.5);
    pdf.setTextColor(bold ? 20 : 60);
    pdf.text(label, right - 210, totalsY);
    pdf.text(value, right, totalsY, { align: "right" });
    totalsY += bold ? 18 : 15;
  };

  totalRow("Goods value", `Rs. ${amount(totals.goods)}`);
  if (totals.discount > 0) totalRow("Less: Discount", `- Rs. ${amount(totals.discount)}`);
  if (totals.shipping > 0) totalRow("Add: Packing & forwarding", `Rs. ${amount(totals.shipping)}`);
  totalRow("Taxable value", `Rs. ${amount(totals.taxable)}`);
  if (invoice.interState) {
    totalRow(`IGST @ ${rate}%`, `Rs. ${amount(totals.igst)}`);
  } else {
    totalRow(`CGST @ ${rate / 2}%`, `Rs. ${amount(totals.cgst)}`);
    totalRow(`SGST @ ${rate / 2}%`, `Rs. ${amount(totals.sgst)}`);
  }
  if (totals.roundOff !== 0) {
    totalRow("Round off", `${totals.roundOff > 0 ? "+" : "-"} Rs. ${amount(Math.abs(totals.roundOff))}`);
  }
  pdf.setDrawColor(200);
  pdf.setLineWidth(0.6);
  pdf.line(right - 210, totalsY - 9, right, totalsY - 9);
  totalsY += 4;
  totalRow("Grand Total", `Rs. ${amount(totals.total)}`, true);
  if (invoice.paymentTerms) totalRow("Payment", invoice.paymentTerms);

  // Amount in words, under the totals and across the page.
  totalsY += 6;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(40);
  pdf.text("Amount in words:", margin, totalsY);
  pdf.setFont("helvetica", "normal");
  (pdf.splitTextToSize(rupeesInWords(totals.total), right - margin - 90) as string[]).forEach(
    (part, index) => pdf.text(part, margin + 86, totalsY + index * 12)
  );
  totalsY += 30;

  // ---- declaration and signature -------------------------------------------
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(60);
  pdf.text("Declaration", margin, totalsY);
  pdf.setFont("helvetica", "normal");
  pdf.text(
    pdf.splitTextToSize(
      "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
      280
    ),
    margin,
    totalsY + 12
  );

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(30);
  pdf.text(`For ${business.name}`, right, totalsY, { align: "right" });
  if (invoice.signature) {
    // Fitted into the gap between the two lines, right-aligned with them,
    // keeping the picture's own proportions.
    const { dataUrl, width, height } = invoice.signature;
    const scale = Math.min(140 / width, 32 / height);
    const w = width * scale;
    const h = height * scale;
    pdf.addImage(dataUrl, "PNG", right - w, totalsY + 34 - h, w, h, undefined, "FAST");
  }
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(80);
  pdf.text("Authorised Signatory", right, totalsY + 44, { align: "right" });

  // ---- footer on every page ------------------------------------------------
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text(
      `This is a computer generated invoice  |  ${business.website}  |  ${business.phone}`,
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
