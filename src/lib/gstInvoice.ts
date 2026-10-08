import type { BusinessDetails } from "./businessDetails";

/**
 * The figures behind a GST tax invoice, kept apart from the drawing in
 * gstInvoicePdf.ts so the form can show running totals without loading
 * jsPDF on first paint.
 */

export interface GstInvoiceLine {
  name: string;
  hsn: string;
  quantity: number;
  /** Per unit, on whichever basis `pricesIncludeGst` says. */
  rate: number;
}

export interface GstInvoiceParty {
  name: string;
  phone?: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface GstInvoice {
  number: string;
  date: Date;
  business: BusinessDetails;
  /** Printed even when Admin Settings has "Show GST on invoice" off. */
  sellerGstin: string;
  billTo: GstInvoiceParty;
  /** Omitted when goods go to the billing address. */
  shipTo?: GstInvoiceParty | null;
  transport?: { name?: string; vehicle?: string; lrNumber?: string };
  lines: GstInvoiceLine[];
  /** e.g. 18 for 18%. One rate for the whole invoice. */
  gstRate: number;
  /**
   * True when the rates typed in already contain GST -- a shop's selling
   * price usually does. The tax is then taken out of them, not added on.
   */
  pricesIncludeGst: boolean;
  /** Rupees off the goods, on the same basis as the rates. */
  discount: number;
  /** Packing and forwarding, on the same basis as the rates; taxed with the goods. */
  shipping: number;
  /** Inter-state supply is IGST; within the state it is CGST + SGST. */
  interState: boolean;
  paymentTerms?: string;
  /** Printed above "Authorised Signatory"; see lib/businessSignature. */
  signature?: { dataUrl: string; width: number; height: number } | null;
}

export interface GstTotals {
  lines: { taxable: number }[];
  goods: number;
  discount: number;
  shipping: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  total: number;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Every figure on the invoice, on the taxable (pre-GST) basis.
 *
 * When the rates include GST each one is scaled down by (1 + rate) first,
 * so discount and shipping are treated exactly like the goods and the
 * grand total comes back to what the customer was quoted.
 */
export function gstTotals(invoice: Pick<
  GstInvoice,
  "lines" | "gstRate" | "pricesIncludeGst" | "discount" | "shipping" | "interState"
>): GstTotals {
  const rate = Math.max(0, invoice.gstRate) / 100;
  const factor = invoice.pricesIncludeGst ? 1 / (1 + rate) : 1;

  const lines = invoice.lines.map((line) => ({
    taxable: round2(line.quantity * line.rate * factor),
  }));
  const goods = round2(lines.reduce((sum, line) => sum + line.taxable, 0));
  const discount = round2(Math.max(0, invoice.discount) * factor);
  const shipping = round2(Math.max(0, invoice.shipping) * factor);
  const taxable = round2(goods - discount + shipping);

  // CGST and SGST are each rounded on their own, as they are filed.
  const half = round2((taxable * rate) / 2);
  const cgst = invoice.interState ? 0 : half;
  const sgst = invoice.interState ? 0 : half;
  const igst = invoice.interState ? round2(taxable * rate) : 0;

  const exact = round2(taxable + cgst + sgst + igst);
  const total = Math.round(exact);
  return {
    lines,
    goods,
    discount,
    shipping,
    taxable,
    cgst,
    sgst,
    igst,
    roundOff: round2(total - exact),
    total,
  };
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", rest ? belowHundred(rest) : ""]
    .filter(Boolean)
    .join(" ");
}

/** 125430 -> "One Lakh Twenty Five Thousand Four Hundred Thirty" -- the Indian grouping. */
export function rupeesInWords(value: number): string {
  let n = Math.round(Math.abs(value));
  if (n === 0) return "Rupees Zero Only";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  return `Rupees ${parts.join(" ")} Only`;
}
