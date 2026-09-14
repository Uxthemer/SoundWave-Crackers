import { jsPDF } from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";

/**
 * The printed price list, as a real PDF.
 *
 * It used to be an HTML tab that called window.print() and closed itself, so
 * there was nothing to look at before committing to paper and nothing to send
 * a customer. A PDF opens in the browser's own viewer, which already has
 * print, zoom and save, and the same file is what goes out over WhatsApp.
 */

export interface PriceListProduct {
  name: string;
  actual_price: number | null;
  offer_price: number | null;
  content: string | null;
}

export interface PriceListGroup {
  category: string;
  products: PriceListProduct[];
}

/**
 * Bare numbers in the cells; the unit is stated once in the column heading.
 * The rupee sign is not in the standard PDF fonts, so the heading says "Rs."
 * rather than printing a broken glyph several hundred times.
 */
const money = (value: number | null | undefined) =>
  value == null || Number.isNaN(Number(value))
    ? "-"
    : Number(value).toLocaleString("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });

/**
 * Reads an image off the site into a data URL, since jsPDF cannot fetch.
 * A missing banner is not worth failing the whole list over — the caller
 * falls back to a plain heading.
 */
export async function loadImage(
  url: string,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const size = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const image = new Image();
        image.onload = () =>
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = reject;
        image.src = dataUrl;
      },
    );

    return { dataUrl, ...size };
  } catch {
    return null;
  }
}

const BRAND = [139, 69, 19] as const; // the brown the printed list has always used
const BAND = [253, 237, 226] as const; // category strip

/** Printed under the table, the way the old HTML list closed. */
const FOOTER_NOTE = [
  "Soundwave Crackers - Your premier destination for premium-quality crackers " +
    "and fireworks, making your celebrations brighter and more memorable.",
  "Thank you for choosing Soundwave Crackers! For inquiries, contact us",
];

export interface PriceListPdfOptions {
  groups: PriceListGroup[];
  seasonName: string;
  /** Banner drawn across the top of page one. */
  headerImageUrl?: string;
  /** Shown under the banner, e.g. "Diwali 2025". */
  subtitle?: string;
  /**
   * The season's headline discount, named in the Offer Price heading so the
   * customer reads the saving off the column itself.
   */
  discountPercent?: number | null;
}

/**
 * Builds the document. Returns the jsPDF instance so the caller decides
 * between viewing it, saving it and attaching it.
 */
export async function buildPriceListPdf({
  groups,
  seasonName,
  headerImageUrl = "/assets/img/banners/price-list-header.png",
  subtitle,
  discountPercent,
}: PriceListPdfOptions): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;

  const banner = headerImageUrl ? await loadImage(headerImageUrl) : null;

  /**
   * The banner spans the same column as the table, edge to edge, and takes
   * whatever height its own proportions ask for — clamping the height while
   * holding the width is what squashed the 2:1 image flat.
   *
   * The cap is a guard against an unusually tall banner eating page one, not
   * a layout choice: only then does the width come in, and both sides scale
   * together so the picture still is not distorted.
   */
  const BANNER_MAX_HEIGHT = pageHeight * 0.4;
  const bannerBox = (() => {
    if (!banner) return null;
    let width = pageWidth - margin * 2;
    let height = (banner.height / banner.width) * width;
    if (height > BANNER_MAX_HEIGHT) {
      height = BANNER_MAX_HEIGHT;
      width = (banner.width / banner.height) * height;
    }
    return { width, height, x: (pageWidth - width) / 2 };
  })();

  const headerHeight = bannerBox ? margin + bannerBox.height : margin + 52;

  const drawHeader = () => {
    if (banner && bannerBox) {
      doc.addImage(
        banner.dataUrl,
        bannerBox.x,
        margin,
        bannerBox.width,
        bannerBox.height,
        undefined,
        "FAST",
      );
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
      doc.text("Soundwave Crackers", pageWidth / 2, margin + 22, {
        align: "center",
      });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(90);
      doc.text(
        subtitle || `Price List ${seasonName}`,
        pageWidth / 2,
        margin + 40,
        {
          align: "center",
        },
      );
    }
  };

  const drawFooter = () => {
    const page = doc.getNumberOfPages();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Soundwave Crackers  |  Price List ${seasonName}`,
      margin,
      pageHeight - 16,
    );
    doc.text(`Page ${page}`, pageWidth - margin, pageHeight - 16, {
      align: "right",
    });
  };

  // Category names ride in the table as full-width bands, so a category that
  // straddles a page break keeps its heading with its rows.
  const body: RowInput[] = [];
  let serial = 1;
  groups.forEach((group) => {
    if (!group.products.length) return;
    body.push([
      {
        content: group.category,
        colSpan: 7,
        styles: {
          halign: "center",
          fontStyle: "bold",
          fillColor: [BAND[0], BAND[1], BAND[2]],
          textColor: [BRAND[0], BRAND[1], BRAND[2]],
          fontSize: 10,
        },
      },
    ]);
    group.products.forEach((product) => {
      body.push([
        String(serial++),
        product.name,
        money(product.actual_price),
        money(product.offer_price),
        product.content || "-",
        "",
        "",
      ]);
    });
  });

  // A season printed at 90% shows "Offer Price - 90%"; a season with no
  // headline discount set just says "Offer Price".
  const discount =
    discountPercent == null || Number(discountPercent) <= 0
      ? null
      : Number(discountPercent);
  const offerHeading = discount
    ? `Offer Price - ${Number(discount.toFixed(2))}% (Rs.)`
    : "Offer Price (Rs.)";

  autoTable(doc, {
    head: [
      [
        "S.No",
        "Product",
        "Price (Rs.)",
        offerHeading,
        "Quantity",
        "Requirement",
        "Amount",
      ],
    ],
    body,
    startY: headerHeight + 10,
    margin: { top: margin, right: margin, bottom: 34, left: margin },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 3.5,
      lineColor: [200, 200, 200],
      lineWidth: 0.4,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [BRAND[0], BRAND[1], BRAND[2]],
      textColor: [255, 248, 220],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 28, halign: "center" },
      1: { halign: "left" },
      2: { cellWidth: 62, halign: "center", textColor: [130, 130, 130] },
      3: { cellWidth: 62, halign: "center", fontStyle: "bold" },
      4: { cellWidth: 70, halign: "center" },
      5: { cellWidth: 58, halign: "center" },
      6: { cellWidth: 65, halign: "center" },
    },
    // The struck-through original price, drawn by hand: autoTable has no
    // line-through style.
    didDrawCell: (data) => {
      if (
        data.section !== "body" ||
        data.column.index !== 2 ||
        data.row.raw == null ||
        (data.row.raw as unknown[]).length !== 7
      )
        return;
      const text = String(data.cell.text?.[0] ?? "");
      if (!text || text === "-") return;
      const width = doc.getTextWidth(text);
      const y = data.cell.y + data.cell.height / 2;
      const x = data.cell.x + data.cell.width / 2;
      doc.setDrawColor(150);
      doc.setLineWidth(0.5);
      doc.line(x - width / 2, y, x + width / 2, y);
    },
    didDrawPage: (data) => {
      // Only page one carries the banner; later pages start at the top margin.
      if (data.pageNumber === 1) drawHeader();
      drawFooter();
    },
  });

  // The closing note, under the last row. If the final page has no room for
  // it, it starts a page of its own rather than overprinting the table.
  const lineWidth = pageWidth - margin * 2 - 40;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const wrapped = FOOTER_NOTE.flatMap((line) =>
    doc.splitTextToSize(line, lineWidth),
  ) as string[];
  const noteHeight = wrapped.length * 12 + 16;

  let y =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? headerHeight) + 22;
  if (y + noteHeight > pageHeight - 34) {
    doc.addPage();
    drawFooter();
    y = margin + 20;
  }

  doc.setDrawColor(220);
  doc.setLineWidth(0.5);
  doc.line(margin, y - 12, pageWidth - margin, y - 12);
  doc.setTextColor(100);
  wrapped.forEach((line, index) => {
    doc.text(line, pageWidth / 2, y + index * 12, { align: "center" });
  });

  return doc;
}

/**
 * Builds the list and hands it to the browser's PDF viewer.
 *
 * `target` is a window opened synchronously in the click handler — building
 * the PDF is async, and a window opened after an await is treated as a popup
 * and blocked.
 */
export async function openPriceListPdf(
  options: PriceListPdfOptions,
  target: Window | null,
): Promise<void> {
  const doc = await buildPriceListPdf(options);
  const url = doc.output("bloburl") as unknown as string;

  if (target && !target.closed) {
    target.location.href = String(url);
    return;
  }

  // Popup blocked, or the caller had no window to give: fall back to a save.
  doc.save(`soundwave_price_list_${options.seasonName}.pdf`);
}
