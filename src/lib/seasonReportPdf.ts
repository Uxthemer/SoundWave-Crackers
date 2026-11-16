import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { loadImage } from "./priceListPdf";
import {
  isMoneyCell,
  type ReportCell,
  type ReportChart,
  type ReportKpi,
  type ReportTable,
  type SeasonReport,
} from "./seasonReport";

/**
 * The season report (lib/seasonReport) as a PDF meant to be read, not just
 * kept: a cover band, headline cards, a collection bar, then each section with
 * a chart drawn from the table beside or above it.
 *
 * Charts are drawn with jsPDF's own shapes rather than rendered by Chart.js
 * into an image: vector, so they stay sharp in print, add nothing to the file
 * size, and need no canvas that a phone browser might refuse to export.
 *
 * Landscape throughout, because the orders table has twelve columns and a
 * report that turns sideways half-way through is awkward to print or read.
 */

type RGB = [number, number, number];

const INK: RGB = [30, 41, 59];
const MUTED: RGB = [100, 116, 139];
const LINE: RGB = [226, 232, 240];
const SOFT: RGB = [248, 250, 252];
const HEAD: RGB = [241, 245, 249];
const BRAND: RGB = [255, 87, 34];
const GREEN: RGB = [22, 163, 74];
const AMBER: RGB = [217, 119, 6];
const RED: RGB = [220, 38, 38];
const BLUE: RGB = [37, 99, 235];
const SLATE: RGB = [71, 85, 105];

const TONES: Record<NonNullable<ReportKpi["tone"]>, RGB> = {
  brand: BRAND,
  good: GREEN,
  warn: AMBER,
  bad: RED,
  neutral: SLATE,
};

/** Chart colours, in order; the brand orange first. */
const PALETTE: RGB[] = [
  BRAND,
  [33, 150, 243],
  [76, 175, 80],
  [255, 193, 7],
  [156, 39, 176],
  [0, 150, 136],
  [233, 30, 99],
  [121, 85, 72],
  [96, 125, 139],
  [63, 81, 181],
];

/**
 * Labels whose colour should mean something, whatever order they come in:
 * delivered and in stock are green, low is amber, out of stock and cancelled
 * are red. Anything else takes the next palette colour.
 */
const MEANING: Record<string, RGB> = {
  delivered: GREEN,
  shipped: BLUE,
  packing: AMBER,
  "order confirmed": [13, 148, 136],
  "enquiry received": [14, 165, 233],
  cancelled: RED,
  "in stock": GREEN,
  low: AMBER,
  "out of stock": RED,
};

const MARGIN = 36;
/** Below the slim running header on every page after the first. */
const TOP = 58;
const BOTTOM = 42;
/** Space between a narrow table and the chart set beside it. */
const GUTTER = 24;

/** The rupee sign is not in the standard PDF fonts; see priceListPdf. */
const rupees = (value: number, decimals = 2) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;

/** Short figures for chart labels: 12.4 L, 1.2 Cr, 8.5K. */
const compact = (value: number, money: boolean) => {
  const v = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const text =
    v >= 1e7
      ? `${(v / 1e7).toFixed(2)} Cr`
      : v >= 1e5
        ? `${(v / 1e5).toFixed(1)} L`
        : v >= 1e3
          ? `${(v / 1e3).toFixed(1)}K`
          : `${Math.round(v)}`;
  return `${sign}${money ? "Rs. " : ""}${text}`;
};

const numberOf = (cell: ReportCell | undefined) =>
  isMoneyCell(cell) ? cell.money : typeof cell === "number" ? cell : Number(cell) || 0;

/** Columns short enough to keep on one line: a wrapped date or order number reads badly. */
const NO_WRAP = new Set(["order", "date", "phone", "joined", "code", "receipts", "orders", "quantity", "stock"]);

type Item = { label: string; value: number };

export async function buildSeasonReportPdf(report: SeasonReport): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const right = pageWidth - MARGIN;

  const fill = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => pdf.setDrawColor(c[0], c[1], c[2]);
  const ink = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);
  const font = (style: "normal" | "bold" | "italic", size: number) => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
  };
  /** One line of text cut to a width, with an ellipsis if it was cut. */
  const fit = (text: string, width: number) => {
    if (width <= 0) return "";
    if (pdf.getTextWidth(text) <= width) return text;
    let cut = text;
    while (cut.length > 1 && pdf.getTextWidth(`${cut}…`) > width) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
  };
  const colourFor = (label: string, index: number) =>
    MEANING[label.trim().toLowerCase()] ?? PALETTE[index % PALETTE.length];

  let y = 0;
  const room = () => pageHeight - BOTTOM - y;
  /** Starts a new page unless `height` still fits on this one. */
  const ensure = (height: number) => {
    if (height > room()) {
      pdf.addPage();
      y = TOP;
    }
  };

  // ---- cover band ------------------------------------------------------------
  const bandHeight = 104;
  fill(INK);
  pdf.rect(0, 0, pageWidth, bandHeight, "F");
  fill(BRAND);
  pdf.rect(0, bandHeight, pageWidth, 3, "F");

  let textX = MARGIN;
  const logo = await loadImage("/assets/img/logo/logo_2.png");
  if (logo) {
    const logoHeight = 52;
    const logoWidth = (logo.width / logo.height) * logoHeight;
    fill([255, 255, 255]);
    pdf.roundedRect(MARGIN, 22, logoWidth + 16, logoHeight + 8, 6, 6, "F");
    pdf.addImage(logo.dataUrl, MARGIN + 8, 26, logoWidth, logoHeight, undefined, "FAST");
    textX = MARGIN + logoWidth + 32;
  }

  font("bold", 9);
  pdf.setTextColor(255, 171, 145);
  pdf.text(report.business.name.toUpperCase(), textX, 38);
  font("bold", 24);
  ink([255, 255, 255]);
  pdf.text("Season Report", textX, 64);
  font("normal", 11);
  pdf.setTextColor(203, 213, 225);
  pdf.text(report.periodLabel, textX, 82);

  font("normal", 8.5);
  pdf.text(`Generated ${format(report.generatedAt, "dd MMM yyyy, h:mm a")}`, right, 38, { align: "right" });
  pdf.text("Internal · Confidential", right, 52, { align: "right" });
  pdf.text("Amounts in Indian rupees", right, 66, { align: "right" });

  y = bandHeight + 24;

  // ---- headline cards --------------------------------------------------------
  const perRow = report.kpis.length > 8 ? 5 : 4;
  const gap = 10;
  const cardWidth = (contentWidth - gap * (perRow - 1)) / perRow;
  const cardHeight = 64;
  report.kpis.forEach((kpi, i) => {
    const x = MARGIN + (i % perRow) * (cardWidth + gap);
    const top = y + Math.floor(i / perRow) * (cardHeight + gap);
    fill(SOFT);
    stroke(LINE);
    pdf.setLineWidth(0.6);
    pdf.roundedRect(x, top, cardWidth, cardHeight, 6, 6, "FD");
    fill(TONES[kpi.tone ?? "neutral"]);
    pdf.roundedRect(x, top, 4, cardHeight, 2, 2, "F");

    font("bold", 7);
    ink(MUTED);
    pdf.text(kpi.label.toUpperCase(), x + 14, top + 16);
    font("bold", 16);
    ink(INK);
    pdf.text(
      fit(kpi.money ? rupees(kpi.value, 0) : kpi.value.toLocaleString("en-IN"), cardWidth - 22),
      x + 14,
      top + 38
    );
    if (kpi.note) {
      font("normal", 7.5);
      ink(MUTED);
      pdf.text(fit(kpi.note, cardWidth - 22), x + 14, top + 54);
    }
  });
  y += Math.ceil(report.kpis.length / perRow) * (cardHeight + gap) + 8;

  /** A legend that flows along a line and wraps, each entry as wide as it needs. */
  const legend = (entries: [RGB, string][], x: number, width: number) => {
    let lx = x;
    font("normal", 8);
    entries.forEach(([color, text]) => {
      const w = pdf.getTextWidth(text) + 13;
      if (lx > x && lx + w > x + width) {
        lx = x;
        y += 14;
      }
      fill(color);
      stroke(LINE);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(lx, y - 7, 8, 8, 2, 2, "FD");
      ink(INK);
      pdf.text(text, lx + 13, y);
      lx += w + 18;
    });
  };

  // ---- collection bar --------------------------------------------------------
  {
    const { received, due, extra } = report.collection;
    const whole = Math.max(received + due, 1);
    font("bold", 10);
    ink(INK);
    pdf.text("Collection", MARGIN, y + 8);
    font("normal", 8);
    ink(MUTED);
    pdf.text(
      `${Math.round((received / whole) * 100)}% of the live order book has been received`,
      right,
      y + 8,
      { align: "right" }
    );
    y += 16;
    const barHeight = 14;
    fill(HEAD);
    pdf.roundedRect(MARGIN, y, contentWidth, barHeight, 7, 7, "F");
    const receivedWidth = Math.min(contentWidth, (received / whole) * contentWidth);
    if (receivedWidth > 0) {
      fill(GREEN);
      pdf.roundedRect(MARGIN, y, Math.max(receivedWidth, 14), barHeight, 7, 7, "F");
    }
    y += barHeight + 14;
    legend(
      [
        [GREEN, `Received ${rupees(received, 0)}`],
        [HEAD, `Yet to receive ${rupees(due, 0)}`],
        ...(extra > 0.01 ? ([[BRAND, `Extra received ${rupees(extra, 0)}`]] as [RGB, string][]) : []),
      ],
      MARGIN,
      contentWidth
    );
    y += 22;
  }

  // ---- charts ----------------------------------------------------------------
  // Each draws into a box (x, width) from the current y and returns how tall
  // it was, so a chart can sit above its table or beside it.

  const chartItems = (table: ReportTable, chart: ReportChart): Item[] => {
    if (chart.type === "tally") {
      const tally = new Map<string, number>();
      table.rows.forEach((row) => {
        const label = String(row[chart.label] ?? "") || "—";
        tally.set(label, (tally.get(label) || 0) + 1);
      });
      return [...tally.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);
    }
    const items = table.rows
      .map((row) => ({ label: String(row[chart.label] ?? ""), value: numberOf(row[chart.value ?? 1]) }))
      .filter((item) => item.value > 0);
    return chart.type === "columns" ? items : items.slice(0, chart.limit ?? items.length);
  };

  /** How tall a chart will be, for page-break decisions before drawing. */
  const chartHeight = (chart: ReportChart, items: Item[], width: number) => {
    if (chart.type === "bars") return 18 + items.length * 17;
    if (chart.type === "columns") return 186;
    // share / tally: the bar, then a legend that wraps; ~150pt an entry.
    return 50 + Math.max(0, Math.ceil(items.length / Math.max(1, Math.floor(width / 150))) - 1) * 14;
  };

  const caption = (text: string | undefined, x: number) => {
    if (!text) return;
    font("bold", 7.5);
    ink(MUTED);
    pdf.text(text.toUpperCase(), x, y + 8);
  };

  /** A ranking: label, bar, figure -- one line each. */
  const drawBars = (items: Item[], money: boolean, x: number, width: number) => {
    const labelWidth = Math.min(170, width * 0.32);
    const valueWidth = 66;
    const barArea = width - labelWidth - valueWidth;
    const max = Math.max(...items.map((i) => i.value), 1);
    let rowY = y + 18;
    items.forEach((item, i) => {
      font("normal", 8);
      ink(INK);
      pdf.text(fit(item.label, labelWidth - 10), x, rowY + 7);
      fill(HEAD);
      pdf.roundedRect(x + labelWidth, rowY, barArea, 9, 4.5, 4.5, "F");
      fill(i === 0 ? BRAND : PALETTE[1]);
      pdf.roundedRect(x + labelWidth, rowY, Math.max((item.value / max) * barArea, 9), 9, 4.5, 4.5, "F");
      font("bold", 8);
      ink(INK);
      pdf.text(compact(item.value, money), x + width, rowY + 7, { align: "right" });
      rowY += 17;
    });
  };

  /** A series in order (months): columns over a light grid. */
  const drawColumns = (items: Item[], money: boolean, x: number, width: number) => {
    const top = y + 22;
    const height = 136;
    const axisWidth = 52;
    const left = x + axisWidth;
    const plotWidth = width - axisWidth;
    const max = Math.max(...items.map((i) => i.value), 1);
    font("normal", 7);
    for (let g = 0; g <= 4; g++) {
      const gy = top + height - (height * g) / 4;
      stroke(LINE);
      pdf.setLineWidth(0.5);
      pdf.line(left, gy, x + width, gy);
      ink(MUTED);
      pdf.text(compact((max * g) / 4, money), left - 6, gy + 2.5, { align: "right" });
    }
    const slot = plotWidth / Math.max(items.length, 1);
    const columnWidth = Math.min(42, slot * 0.6);
    items.forEach((item, i) => {
      const h = (item.value / max) * height;
      const cx = left + slot * i + (slot - columnWidth) / 2;
      fill(BRAND);
      pdf.roundedRect(cx, top + height - h, columnWidth, h, 3, 3, "F");
      // Square the foot so the column stands on the axis.
      if (h > 3) pdf.rect(cx, top + height - 3, columnWidth, 3, "F");
      font("bold", 7);
      ink(INK);
      pdf.text(compact(item.value, money), cx + columnWidth / 2, top + height - h - 4, { align: "center" });
      font("normal", 7);
      ink(MUTED);
      pdf.text(fit(item.label, slot - 4), cx + columnWidth / 2, top + height + 12, { align: "center" });
    });
  };

  /** Parts of a whole: one proportion bar, and a legend with each share. */
  const drawShare = (items: Item[], money: boolean, x: number, width: number) => {
    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    const top = y + 16;
    const barHeight = 16;
    let sx = x;
    items.forEach((item, i) => {
      const w = (item.value / total) * width;
      fill(colourFor(item.label, i));
      pdf.rect(sx, top, w, barHeight, "F");
      if (w > 34) {
        font("bold", 7);
        ink([255, 255, 255]);
        pdf.text(`${Math.round((item.value / total) * 100)}%`, sx + w / 2, top + 11, { align: "center" });
      }
      sx += w;
    });
    const before = y;
    y = top + barHeight + 18;
    legend(
      items.map((item, i) => [
        colourFor(item.label, i),
        `${item.label}  ${compact(item.value, money)} (${Math.round((item.value / total) * 100)}%)`,
      ]),
      x,
      width
    );
    y = before;
  };

  const drawChart = (table: ReportTable, items: Item[], x: number, width: number) => {
    const chart = table.chart!;
    const money = chart.money !== false;
    caption(chart.caption, x);
    if (chart.type === "bars") drawBars(items, money, x, width);
    else if (chart.type === "columns") drawColumns(items, money, x, width);
    else drawShare(items, money, x, width);
    return chartHeight(chart, items, width);
  };

  // ---- tables ----------------------------------------------------------------
  const cellText = (value: ReportCell | undefined, money?: boolean) => {
    if (isMoneyCell(value)) return rupees(value.money);
    if (money && typeof value === "number") return rupees(value).replace("Rs. ", "");
    if (typeof value === "number") return value.toLocaleString("en-IN");
    return String(value ?? "");
  };

  /** Draws a table from the current y; returns where it ended. */
  const drawTable = (
    table: Pick<ReportTable, "columns" | "rows" | "foot">,
    left: number,
    width: number,
    /** Tighter rows, for the summary under the cards on the first page. */
    compactRows = false
  ) => {
    const pad = compactRows ? 3 : 4.5;
    const alignOf = (i: number) =>
      table.columns[i]?.money || table.columns[i]?.numeric ? "right" : "left";
    autoTable(pdf, {
      startY: y,
      head: [table.columns.map((c) => (c.money ? `${c.header} (Rs.)` : c.header).toUpperCase())],
      body: table.rows.map((row) => row.map((v, i) => cellText(v, table.columns[i]?.money))),
      foot: table.foot ? [table.foot.map((v, i) => cellText(v, table.columns[i]?.money))] : undefined,
      showFoot: "lastPage",
      showHead: "everyPage",
      tableWidth: width,
      margin: { left, right: pageWidth - left - width, top: TOP, bottom: BOTTOM },
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 8,
        textColor: INK,
        cellPadding: { top: pad, bottom: pad, left: 6, right: 6 },
        overflow: "linebreak",
      },
      headStyles: { fillColor: HEAD, textColor: MUTED, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [252, 252, 253] },
      footStyles: { fillColor: [255, 255, 255], textColor: INK, fontStyle: "bold" },
      columnStyles: Object.fromEntries(
        table.columns.map((c, i) => [
          i,
          {
            halign: alignOf(i) as "left" | "right",
            ...(c.money || NO_WRAP.has(c.header.toLowerCase()) ? { cellWidth: "wrap" as const } : {}),
          },
        ])
      ),
      didParseCell: (data) => {
        data.cell.styles.halign = alignOf(data.column.index);
        // A status in its colour reads at a glance down a long list.
        if (data.section === "body") {
          const meaning = MEANING[String(data.cell.raw ?? "").trim().toLowerCase()];
          if (meaning && table.columns[data.column.index]?.header.toLowerCase() === "status") {
            data.cell.styles.textColor = meaning;
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
      // Hairlines under the rows and a firmer one over the totals, instead of
      // a full grid: lighter on the eye, and the figures line up on their own.
      didDrawCell: (data) => {
        const { x, y: cy, width: w, height: h } = data.cell;
        if (data.section === "body") {
          stroke(LINE);
          pdf.setLineWidth(0.4);
          pdf.line(x, cy + h, x + w, cy + h);
        } else if (data.section === "foot") {
          stroke(INK);
          pdf.setLineWidth(0.8);
          pdf.line(x, cy, x + w, cy);
        }
      },
    });
    return (pdf as any).lastAutoTable?.finalY ?? y;
  };

  /** Three columns once the summary is long, so it still fits under the cards. */
  const summaryColumns = (table: ReportTable) => (table.rows.length > 14 ? 3 : 2);

  /** Rough height of a table's first few rows, so a heading never sits alone. */
  const tableStart = (table: ReportTable) => 24 + Math.min(table.rows.length, 4) * 18;

  /**
   * How much of a table block must fit before it starts: its title, its chart
   * (above or beside), and the start of the table -- or, for the summary, all
   * of it, because its two columns must stay on one page.
   */
  const blockStart = (table: ReportTable) => {
    if (table.title === "Summary") {
      return 26 + Math.ceil(table.rows.length / summaryColumns(table)) * 15.5 + 22;
    }
    const items = table.chart ? chartItems(table, table.chart) : [];
    if (!table.chart || items.length < 2) return 26 + tableStart(table);
    const beside = table.columns.length <= 3 && table.chart.type !== "columns";
    const chartWidth = beside ? contentWidth / 2 - GUTTER / 2 : contentWidth;
    const chart = chartHeight(table.chart, items, chartWidth);
    return 26 + (beside ? Math.max(chart, tableStart(table)) : chart + 10 + tableStart(table));
  };

  // ---- sections --------------------------------------------------------------
  let currentSection: string | undefined;
  for (const table of report.tables) {
    const need = blockStart(table);

    if (table.section && table.section !== currentSection) {
      currentSection = table.section;
      // The heading and its first table move to a new page together.
      ensure(46 + need);
      if (y > TOP + 4) y += 4;
      fill(BRAND);
      pdf.rect(MARGIN, y, 4, 18, "F");
      font("bold", 15);
      ink(INK);
      pdf.text(table.section, MARGIN + 12, y + 14);
      stroke(LINE);
      pdf.setLineWidth(0.6);
      pdf.line(MARGIN, y + 26, right, y + 26);
      y += 42;
    } else {
      ensure(need);
    }

    font("bold", 11);
    ink(INK);
    pdf.text(table.title, MARGIN, y + 8);
    if (table.note) {
      const titleWidth = pdf.getTextWidth(table.title);
      font("normal", 8);
      ink(MUTED);
      pdf.text(fit(table.note, contentWidth - titleWidth - 30), right, y + 8, { align: "right" });
    }
    y += 20;

    if (table.rows.length === 0) {
      font("italic", 9);
      ink(MUTED);
      pdf.text("None in this period.", MARGIN, y + 6);
      y += 30;
      continue;
    }

    // The summary side by side in columns, under the cards on the first page.
    if (table.title === "Summary") {
      const columns = summaryColumns(table);
      const perColumn = Math.ceil(table.rows.length / columns);
      const columnWidth = (contentWidth - GUTTER * (columns - 1)) / columns;
      const startY = y;
      let end = y;
      for (let c = 0; c < columns; c++) {
        y = startY;
        end = Math.max(
          end,
          drawTable(
            { columns: table.columns, rows: table.rows.slice(c * perColumn, (c + 1) * perColumn) },
            MARGIN + c * (columnWidth + GUTTER),
            columnWidth,
            true
          )
        );
      }
      y = end + 26;
      continue;
    }

    const items = table.chart ? chartItems(table, table.chart) : [];
    const hasChart = Boolean(table.chart) && items.length > 1;

    // A narrow table and its chart side by side: the table on the left, the
    // chart beside it on the right half. Wide tables and month columns take
    // the full width with the chart above.
    if (hasChart && table.columns.length <= 3 && table.chart!.type !== "columns") {
      const half = contentWidth / 2 - GUTTER / 2;
      const startPage = pdf.getNumberOfPages();
      const startY = y;
      const chartEnd = startY + drawChart(table, items, MARGIN + half + GUTTER, half);
      const tableEnd = drawTable(table, MARGIN, half);
      // A long table runs on over the page; then only it decides where we are.
      y = (pdf.getNumberOfPages() > startPage ? tableEnd : Math.max(tableEnd, chartEnd)) + 26;
      continue;
    }

    if (hasChart) {
      y += drawChart(table, items, MARGIN, contentWidth) + 10;
    }
    y = drawTable(table, MARGIN, table.columns.length <= 3 ? 460 : contentWidth) + 26;
  }

  // ---- running header and footer -------------------------------------------
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    if (page > 1) {
      font("bold", 8);
      ink(INK);
      pdf.text(`${report.business.name}  ·  Season Report`, MARGIN, 30);
      font("normal", 8);
      ink(MUTED);
      pdf.text(report.periodLabel, right, 30, { align: "right" });
      fill(BRAND);
      pdf.rect(MARGIN, 38, 28, 2, "F");
      stroke(LINE);
      pdf.setLineWidth(0.5);
      pdf.line(MARGIN + 28, 39, right, 39);
    }
    stroke(LINE);
    pdf.setLineWidth(0.5);
    pdf.line(MARGIN, pageHeight - 30, right, pageHeight - 30);
    font("normal", 7.5);
    ink(MUTED);
    pdf.text(
      `${report.business.name}  ·  Generated ${format(report.generatedAt, "dd MMM yyyy, h:mm a")}  ·  Internal`,
      MARGIN,
      pageHeight - 18
    );
    pdf.text(`Page ${page} of ${pages}`, right, pageHeight - 18, { align: "right" });
  }

  return pdf;
}
