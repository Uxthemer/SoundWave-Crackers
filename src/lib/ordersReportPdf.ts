import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { loadImage } from "./priceListPdf";
import type { BusinessDetails } from "./businessDetails";
import {
  ORDERS_EXPORT_COLUMNS,
  exportCellValue,
  type OrdersExportColumnKey,
  type OrdersExportRow,
} from "./ordersExport";

/** The rupee sign is not in the standard PDF fonts; see priceListPdf. */
const amount = (value: number) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const BRAND: [number, number, number] = [255, 87, 34];

/**
 * The All Orders list as a printable report: one line per order, landscape so
 * the order number, customer and money all fit without wrapping.
 *
 * The rows are whatever the Orders table is showing, in its order. Cancelled
 * ones, when the filter brings them in, are listed but left out of the money
 * in the foot -- a cancelled order was never revenue.
 *
 * S.No and the order number always print; the rest are the columns ticked
 * in the export popup. Short columns are sized to their content and the
 * free-text ones (customer, city) take what is left, so dropping columns
 * gives the names room rather than leaving a gap.
 */
export async function buildOrdersReportPdf(
  rows: OrdersExportRow[],
  keys: OrdersExportColumnKey[],
  business: BusinessDetails
): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 32;
  const right = pageWidth - margin;

  // ---- header --------------------------------------------------------------
  let leftY = margin;
  const logo = await loadImage("/assets/img/logo/logo_2.png");
  if (logo) {
    const height = 46;
    const width = (logo.width / logo.height) * height;
    pdf.addImage(logo.dataUrl, margin, leftY, width, height, undefined, "FAST");
    leftY += height + 6;
  }

  let rightY = margin;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
  pdf.text("ORDERS REPORT", right, rightY + 16, { align: "right" });
  rightY += 30;

  pdf.setTextColor(30);
  pdf.setFontSize(11);
  pdf.text(business.name, right, rightY, { align: "right" });
  rightY += 14;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(80);
  const times = rows.map((row) => new Date(row.date).getTime()).filter(Number.isFinite);
  if (times.length) {
    const first = format(new Date(Math.min(...times)), "dd MMM yyyy");
    const last = format(new Date(Math.max(...times)), "dd MMM yyyy");
    pdf.text(
      first === last ? `Orders on ${first}` : `Orders from ${first} to ${last}`,
      right,
      rightY,
      { align: "right" }
    );
    rightY += 12;
  }
  pdf.text(`Generated ${format(new Date(), "dd MMM yyyy, h:mm a")}`, right, rightY, {
    align: "right",
  });
  rightY += 12;

  let y = Math.max(leftY, rightY) + 6;
  pdf.setDrawColor(BRAND[0], BRAND[1], BRAND[2]);
  pdf.setLineWidth(1.5);
  pdf.line(margin, y, right, y);
  y += 12;

  // ---- table ---------------------------------------------------------------
  const live = rows.filter((row) => row.status !== "Cancelled");
  const liveTotal = live.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const liveDiscount = live.reduce((sum, row) => sum + Number(row.discount || 0), 0);
  const cancelled = rows.length - live.length;
  const footTotals: Partial<Record<OrdersExportColumnKey, number>> = {
    total: liveTotal,
    discount: liveDiscount,
    net: liveTotal - liveDiscount,
  };

  const columns = ORDERS_EXPORT_COLUMNS.filter((column) => keys.includes(column.key));
  const plainCount = 2 + columns.filter((column) => !column.money).length;
  const columnStyles: Record<number, { cellWidth?: "wrap"; halign?: "center" | "right" }> = {
    0: { halign: "center" },
    1: { cellWidth: "wrap" },
  };
  columns.forEach((column, index) => {
    if (column.key === "customer" || column.key === "city") return;
    columnStyles[index + 2] = {
      cellWidth: "wrap",
      ...(column.money ? { halign: "right" as const } : {}),
      ...(column.key === "itemCount" ? { halign: "center" as const } : {}),
    };
  });

  autoTable(pdf, {
    startY: y,
    head: [[
      "S.No",
      "Order ID",
      ...columns.map((column) =>
        column.money ? `${column.label} (Rs.)` : column.key === "date" ? "Date" : column.label
      ),
    ]],
    body: rows.map((row, index) => [
      String(index + 1),
      row.number,
      ...columns.map((column) => {
        const value = exportCellValue(row, column.key);
        if (column.key === "discount" && !value) return "-";
        return column.money ? amount(Number(value)) : String(value);
      }),
    ]),
    foot: [[
      {
        content: cancelled
          ? `${rows.length} orders (${cancelled} cancelled, not counted in the totals)`
          : `${rows.length} orders`,
        colSpan: plainCount,
        styles: { halign: "left" as const },
      },
      ...columns
        .filter((column) => column.money)
        .map((column) => ({
          content: amount(footTotals[column.key] ?? 0),
          styles: { halign: "right" as const },
        })),
    ]],
    showFoot: "lastPage",
    margin: { left: margin, right: margin, bottom: 40 },
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 3.5, lineColor: [215, 215, 215], lineWidth: 0.4 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold", halign: "center" },
    footStyles: { fillColor: [248, 248, 248], textColor: 40, fontStyle: "bold" },
    columnStyles,
  });

  // ---- footer on every page -------------------------------------------------
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text(`${business.name}  |  Internal report`, margin, pageHeight - 20);
    pdf.text(`Page ${page} of ${pages}`, right, pageHeight - 20, { align: "right" });
  }

  return pdf;
}
