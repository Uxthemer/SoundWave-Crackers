import { jsPDF } from "jspdf";
import autoTable, { type RowInput, type Styles } from "jspdf-autotable";
import { actualFromOffer, isUsableDiscount } from "./pricing";

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

/**
 * The columns a superadmin may rename, drop or reorder-by-omission.
 *
 * S.No, Product and the category bands are not here: they are what makes the
 * sheet a price list, and every screen that reads one back assumes they are
 * present.
 *
 *   price       the original price, struck through by default
 *   offerPrice  what the customer pays
 *   quantity    the pack content ("10 pcs", "1 box")
 *   requirement blank, for the customer to write in
 *   amount      blank, for the customer to total up
 */
export type PriceListColumnKey =
  | "price"
  | "offerPrice"
  | "quantity"
  | "requirement"
  | "amount";

export interface PriceListColumn {
  key: PriceListColumnKey;
  /** Heading to print. Blank falls back to the standard one. */
  label?: string;
  enabled: boolean;
}

/** In printed order. Also the fallback when a caller passes no columns. */
export const PRICE_LIST_COLUMNS: PriceListColumnKey[] = [
  "price",
  "offerPrice",
  "quantity",
  "requirement",
  "amount",
];

/** The headings the list has always used, for placeholders and fallbacks. */
export const DEFAULT_COLUMN_LABELS: Record<PriceListColumnKey, string> = {
  price: "Price (Rs.)",
  offerPrice: "Offer Price (Rs.)",
  quantity: "Quantity",
  requirement: "Requirement",
  amount: "Amount",
};

/**
 * What each column would like to be, in points.
 *
 * These are the widths the list was drawn at when all five were present. They
 * are a starting point, not a result: `layOutColumns` below shares out the
 * real page width from them, so dropping a column widens what is left rather
 * than leaving a gap down the right-hand side.
 */
const PREFERRED_WIDTH: Record<PriceListColumnKey, number> = {
  price: 62,
  offerPrice: 62,
  quantity: 70,
  requirement: 58,
  amount: 65,
};

const SERIAL_WIDTH = 28;
/** Product names wrap, but below this they wrap to nonsense. */
const MIN_PRODUCT_WIDTH = 150;

/**
 * The shape a banner has to be, or wider, to span the page.
 *
 * A banner is drawn at the full table width unless doing so would make it
 * taller than `BANNER_MAX_HEIGHT` — a square image across an A4 page would
 * swallow page one. Past that the height is what is held and the width comes
 * in, so the banner ends up narrower than the table under it. On A4 portrait
 * that happens below roughly 1.6:1; the standard banner is 2:1.
 *
 * Exported so the screen that takes an upload can say so before the file is
 * built rather than after.
 */
export const MIN_FULL_WIDTH_BANNER_RATIO = (() => {
  // A4 portrait in points, matching the document below.
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  return (pageWidth - 28 * 2) / (pageHeight * 0.4);
})();

/**
 * The same products, with the struck-out price worked out at a different
 * discount.
 *
 * The price list is entered offer-price-first: the selling price is the real
 * number and the struck-out one beside it is derived from the season's
 * discount (see `actualFromOffer`). So a custom sheet that names a different
 * discount in its heading has to recompute that column, or the sheet argues
 * with itself — "90% off" printed against a pair of prices that are 80% apart.
 *
 * This returns new objects and touches nothing else. The catalogue, the
 * season's own discount and every stored price stay exactly as they are; the
 * numbers live only in the file about to be built.
 *
 * A product with no usable offer price keeps whatever price it had, rather
 * than losing the column to a dash.
 *
 * The result is rounded to whole rupees. Dividing by the discount lands on
 * paise more often than not — 45 at 78% is 204.5454… — and a struck-out price
 * is there to be read at a glance, not paid, so the decimals are noise.
 */
export function repriceGroups(
  groups: PriceListGroup[],
  discountPercent: number | null | undefined
): PriceListGroup[] {
  if (!isUsableDiscount(discountPercent)) return groups;

  return groups.map((group) => ({
    ...group,
    products: group.products.map((product) => {
      const repriced = actualFromOffer(product.offer_price, discountPercent);
      return {
        ...product,
        actual_price:
          repriced == null ? product.actual_price : Math.round(repriced),
      };
    }),
  }));
}

export interface PriceListPdfOptions {
  groups: PriceListGroup[];
  seasonName: string;
  /**
   * Banner drawn across the top of page one. A `data:` URL works as well as a
   * path, which is how an uploaded banner gets here without being stored
   * anywhere first.
   */
  headerImageUrl?: string;
  /** Shown under the banner, e.g. "Diwali 2025". */
  subtitle?: string;
  /**
   * The season's headline discount, named in the Offer Price heading so the
   * customer reads the saving off the column itself.
   */
  discountPercent?: number | null;
  /**
   * Which of the optional columns to print and what to call them. Omitted
   * means all five, named as they always were.
   */
  columns?: PriceListColumn[];
  /** The line through the original price. On unless turned off. */
  strikePrice?: boolean;
}

/**
 * Shares the printable width out between the columns that are switched on.
 *
 * The table has to end exactly where the banner does — a price list that
 * stops two thirds of the way across the page looks like a mistake. So the
 * preferred widths above are treated as proportions of a budget: whatever is
 * left after S.No goes to Product, and only if Product would be squeezed
 * below readability do the value columns give ground instead.
 */
function layOutColumns(
  enabled: PriceListColumnKey[],
  contentWidth: number
): { serial: number; product: number; optional: number[] } {
  const preferred = enabled.map((key) => PREFERRED_WIDTH[key]);
  const wanted = preferred.reduce((sum, width) => sum + width, 0);
  let product = contentWidth - SERIAL_WIDTH - wanted;

  if (product >= MIN_PRODUCT_WIDTH) {
    return { serial: SERIAL_WIDTH, product, optional: preferred };
  }

  // Too many columns for the page. Everything but the product name shrinks in
  // proportion, so no single column collapses to a sliver.
  const budget = Math.max(contentWidth - SERIAL_WIDTH - MIN_PRODUCT_WIDTH, 0);
  const scale = wanted > 0 ? budget / wanted : 0;
  product = MIN_PRODUCT_WIDTH;
  return {
    serial: SERIAL_WIDTH,
    product,
    optional: preferred.map((width) => width * scale),
  };
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
  columns,
  strikePrice = true,
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

  // A season printed at 90% shows "Offer Price - 90%"; a season with no
  // headline discount set just says "Offer Price".
  const discount =
    discountPercent == null || Number(discountPercent) <= 0
      ? null
      : Number(discountPercent);
  const offerHeading = discount
    ? `Offer Price - ${Number(discount.toFixed(2))}% (Rs.)`
    : DEFAULT_COLUMN_LABELS.offerPrice;

  // Which optional columns survive, in their printed order. A caller that
  // says nothing gets all five, exactly as before.
  const enabled: PriceListColumnKey[] = PRICE_LIST_COLUMNS.filter((key) =>
    columns ? columns.some((column) => column.key === key && column.enabled) : true
  );

  const headingOf = (key: PriceListColumnKey) => {
    const chosen = columns?.find((column) => column.key === key)?.label?.trim();
    if (chosen) return chosen;
    return key === "offerPrice" ? offerHeading : DEFAULT_COLUMN_LABELS[key];
  };

  /** What goes in this column's cell for a product. Blanks stay blank. */
  const cellOf = (key: PriceListColumnKey, product: PriceListProduct) => {
    switch (key) {
      case "price":
        return money(product.actual_price);
      case "offerPrice":
        return money(product.offer_price);
      case "quantity":
        return product.content || "-";
      default:
        // Requirement and Amount are for the customer's pen.
        return "";
    }
  };

  // Where the struck-through price ended up, now that the column in front of
  // it may be gone. -1 when the column is off or the line is not wanted.
  const priceColumnIndex =
    strikePrice && enabled.includes("price") ? 2 + enabled.indexOf("price") : -1;
  const columnCount = 2 + enabled.length;

  // Category names ride in the table as full-width bands, so a category that
  // straddles a page break keeps its heading with its rows.
  const body: RowInput[] = [];
  let serial = 1;
  groups.forEach((group) => {
    if (!group.products.length) return;
    body.push([
      {
        content: group.category,
        colSpan: columnCount,
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
        ...enabled.map((key) => cellOf(key, product)),
      ]);
    });
  });

  // Widths, shared out so the table ends where the banner does.
  const layout = layOutColumns(enabled, pageWidth - margin * 2);
  const columnStyles: Record<number, Partial<Styles>> = {
    0: { cellWidth: layout.serial, halign: "center" },
    1: { cellWidth: layout.product, halign: "left" },
  };
  enabled.forEach((key, index) => {
    columnStyles[2 + index] = {
      cellWidth: layout.optional[index],
      halign: "center",
      // The original price reads as the one you are not paying: grey, and
      // struck through below. The offer price is the one to notice.
      ...(key === "price" ? { textColor: [130, 130, 130] } : {}),
      ...(key === "offerPrice" ? { fontStyle: "bold" } : {}),
    };
  });

  autoTable(doc, {
    head: [["S.No", "Product", ...enabled.map(headingOf)]],
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
    // line-through style. The column it lives in moves as columns are turned
    // off, and a superadmin can switch the line off entirely.
    didDrawCell: (data) => {
      if (
        priceColumnIndex < 0 ||
        data.section !== "body" ||
        data.column.index !== priceColumnIndex ||
        data.row.raw == null ||
        // A category band is one wide cell, not a product row.
        (data.row.raw as unknown[]).length !== columnCount
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
