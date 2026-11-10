import { format } from "date-fns";

/** One order as the All Orders export sees it, whichever file it goes to. */
export interface OrdersExportRow {
  number: string;
  date: string;
  customer: string;
  phone: string;
  city: string;
  status: string;
  /** Paid / Unpaid / Part paid / Refunded, as the Orders table labels it. */
  payment: string;
  paymentMethod: string;
  itemCount: number;
  total: number;
  discount: number;
}

export type OrdersExportFormat = "excel" | "pdf";

export type OrdersExportColumnKey =
  | "date"
  | "customer"
  | "phone"
  | "city"
  | "status"
  | "payment"
  | "paymentMethod"
  | "itemCount"
  | "total"
  | "discount"
  | "net";

export interface OrdersExportColumn {
  key: OrdersExportColumnKey;
  label: string;
  /** Summed in the PDF's foot, and right-aligned. */
  money?: boolean;
  /** Ticked the first time someone exports to that format. */
  defaultOn: Record<OrdersExportFormat, boolean>;
}

/**
 * Every column the export can carry, in the order they print. The order
 * number is not here because it is always there -- without it a row cannot
 * be traced back to an order. The money columns come last so the PDF's foot
 * can put the order count across everything before them.
 *
 * The defaults are what each file carried before columns could be chosen.
 */
export const ORDERS_EXPORT_COLUMNS: OrdersExportColumn[] = [
  { key: "date", label: "Order Date", defaultOn: { excel: true, pdf: true } },
  { key: "customer", label: "Customer", defaultOn: { excel: true, pdf: true } },
  { key: "phone", label: "Phone", defaultOn: { excel: true, pdf: true } },
  { key: "city", label: "City", defaultOn: { excel: true, pdf: true } },
  { key: "status", label: "Status", defaultOn: { excel: true, pdf: true } },
  { key: "payment", label: "Payment", defaultOn: { excel: false, pdf: true } },
  { key: "paymentMethod", label: "Payment Method", defaultOn: { excel: true, pdf: false } },
  { key: "itemCount", label: "Items", defaultOn: { excel: true, pdf: false } },
  { key: "total", label: "Total", money: true, defaultOn: { excel: true, pdf: true } },
  { key: "discount", label: "Discount", money: true, defaultOn: { excel: false, pdf: true } },
  { key: "net", label: "Net", money: true, defaultOn: { excel: false, pdf: true } },
];

/** The cell as a number for money and counts, text for everything else. */
export function exportCellValue(
  row: OrdersExportRow,
  key: OrdersExportColumnKey
): string | number {
  switch (key) {
    case "date":
      return format(new Date(row.date), "dd MMM yyyy, h:mm a");
    case "net":
      return Number(row.total || 0) - Number(row.discount || 0);
    case "total":
    case "discount":
    case "itemCount":
      return Number(row[key] || 0);
    default:
      return row[key] || "-";
  }
}

const storageKey = (kind: OrdersExportFormat) => `orders-export-columns:${kind}`;

/**
 * The columns ticked last time for this format, so a shop that always drops
 * the same ones is not unticking them on every export. Only a convenience:
 * if storage is unavailable the defaults are used.
 */
export function loadExportColumns(kind: OrdersExportFormat): OrdersExportColumnKey[] {
  const fallback = ORDERS_EXPORT_COLUMNS.filter((c) => c.defaultOn[kind]).map((c) => c.key);
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(kind)) || "null");
    if (!Array.isArray(saved)) return fallback;
    const known = new Set(ORDERS_EXPORT_COLUMNS.map((c) => c.key));
    return saved.filter((key): key is OrdersExportColumnKey => known.has(key));
  } catch {
    return fallback;
  }
}

export function saveExportColumns(kind: OrdersExportFormat, keys: OrdersExportColumnKey[]) {
  try {
    localStorage.setItem(storageKey(kind), JSON.stringify(keys));
  } catch {
    // Not remembered next time; this export still goes ahead.
  }
}
