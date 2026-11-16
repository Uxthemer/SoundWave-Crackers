import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { loadImage } from "./priceListPdf";
import { rupeesInWords } from "./gstInvoice";
import type { BusinessDetails } from "./businessDetails";
import type { ChitReceiptFacts } from "./chitReceipt";

type RGB = [number, number, number];
const INK: RGB = [30, 41, 59];
const MUTED: RGB = [100, 116, 139];
const LINE: RGB = [226, 232, 240];
const SOFT: RGB = [248, 250, 252];
const BRAND: RGB = [255, 87, 34];
const GREEN: RGB = [22, 163, 74];

/** The rupee sign is not in the standard PDF fonts; see priceListPdf. */
const rs = (value: number) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const day = (value: string | null) => (value ? format(new Date(value), "dd MMM yyyy") : "—");

/**
 * One chit payment receipt, on an A5 page: the business at the top, the
 * amount in figures and in words, what the payment was for and which months
 * it filled, and where the chit stands after it. Small enough to read on a
 * phone in WhatsApp without zooming.
 */
export async function buildChitReceiptPdf(facts: ChitReceiptFacts, business: BusinessDetails): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a5" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 28;
  const right = width - margin;
  const content = width - margin * 2;

  const fill = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
  const ink = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => pdf.setDrawColor(c[0], c[1], c[2]);
  const font = (style: "normal" | "bold" | "italic", size: number) => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
  };

  // ---- header ----------------------------------------------------------------
  fill(BRAND);
  pdf.rect(0, 0, width, 5, "F");
  let y = 22;
  const logo = await loadImage("/assets/img/logo/logo_2.png");
  if (logo) {
    const h = 40;
    pdf.addImage(logo.dataUrl, margin, y, (logo.width / logo.height) * h, h, undefined, "FAST");
  }
  font("bold", 15);
  ink(BRAND);
  pdf.text("PAYMENT RECEIPT", right, y + 14, { align: "right" });
  font("normal", 8.5);
  ink(MUTED);
  pdf.text(`Receipt no. ${facts.number}`, right, y + 28, { align: "right" });
  pdf.text(`Date ${day(facts.approvedOn ?? facts.paidOn)}`, right, y + 40, { align: "right" });
  y += 54;

  font("bold", 10);
  ink(INK);
  pdf.text(business.name, margin, y);
  font("normal", 8);
  ink(MUTED);
  const businessLines = [
    [business.address, business.state].filter(Boolean).join(", "),
    business.phone,
    [business.email, business.website].filter(Boolean).join("  ·  "),
  ].filter(Boolean);
  businessLines.forEach((line) => {
    y += 11;
    pdf.text(line, margin, y);
  });
  y += 12;
  stroke(LINE);
  pdf.setLineWidth(0.8);
  pdf.line(margin, y, right, y);
  y += 22;

  // ---- the amount ------------------------------------------------------------
  fill(SOFT);
  stroke(LINE);
  pdf.roundedRect(margin, y, content, 74, 6, 6, "FD");
  font("normal", 8.5);
  ink(MUTED);
  pdf.text("AMOUNT RECEIVED", margin + 14, y + 18);
  font("bold", 22);
  ink(INK);
  pdf.text(rs(facts.amount), margin + 14, y + 44);
  font("italic", 8.5);
  ink(MUTED);
  pdf.text(pdf.splitTextToSize(rupeesInWords(facts.amount), content - 120)[0], margin + 14, y + 61);

  // A "PAID" stamp in the box's corner.
  const stampW = 70;
  stroke(GREEN);
  pdf.setLineWidth(1.5);
  pdf.roundedRect(right - stampW - 12, y + 20, stampW, 30, 4, 4, "S");
  font("bold", 14);
  ink(GREEN);
  pdf.text("PAID", right - 12 - stampW / 2, y + 40, { align: "center" });
  y += 92;

  font("normal", 9);
  ink(INK);
  const sentence = pdf.splitTextToSize(
    `Received with thanks from ${facts.memberName} towards the ${facts.planName} chit scheme.`,
    content
  );
  pdf.text(sentence, margin, y);
  y += sentence.length * 12 + 10;

  // ---- details ---------------------------------------------------------------
  const rows: [string, string][] = [
    ["Member", facts.memberName],
    ["Phone", facts.phone],
    ["Plan", `${facts.planName} (${rs(facts.monthlyAmount)} x ${facts.months} months)`],
    ["For month(s)", facts.monthsCovered],
    ["Paid on", day(facts.paidOn)],
    ["Payment mode", facts.method ?? (facts.recordedAtShop ? "At the shop" : "—")],
    ["Transaction ID", facts.transactionRef ?? "—"],
    ["Verified on", day(facts.approvedOn)],
  ];
  rows.forEach(([label, value], i) => {
    if (i % 2 === 0) {
      fill(SOFT);
      pdf.rect(margin, y - 10, content, 17, "F");
    }
    font("normal", 8.5);
    ink(MUTED);
    pdf.text(label, margin + 8, y + 2);
    font("bold", 8.5);
    ink(INK);
    pdf.text(pdf.splitTextToSize(value, content - 120)[0], margin + 112, y + 2);
    y += 17;
  });
  y += 14;

  // ---- where the chit stands --------------------------------------------------
  const third = content / 3;
  const standing: [string, string, RGB][] = [
    ["Paid so far", rs(facts.paidSoFar), GREEN],
    ["Plan total", rs(facts.target), INK],
    ["Balance", rs(facts.balance), facts.balance > 0 ? BRAND : GREEN],
  ];
  stroke(LINE);
  pdf.setLineWidth(0.8);
  pdf.roundedRect(margin, y, content, 44, 6, 6, "S");
  standing.forEach(([label, value, color], i) => {
    const cx = margin + third * i + third / 2;
    font("normal", 7.5);
    ink(MUTED);
    pdf.text(label.toUpperCase(), cx, y + 16, { align: "center" });
    font("bold", 11);
    ink(color);
    pdf.text(value, cx, y + 33, { align: "center" });
  });
  y += 60;

  // ---- footer ----------------------------------------------------------------
  font("normal", 7.5);
  ink(MUTED);
  pdf.text("This is a computer-generated receipt and needs no signature.", width / 2, height - 34, {
    align: "center",
  });
  pdf.text(`Thank you for saving with ${business.name}!`, width / 2, height - 22, { align: "center" });
  fill(BRAND);
  pdf.rect(0, height - 5, width, 5, "F");

  return pdf;
}
