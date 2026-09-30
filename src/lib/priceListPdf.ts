import { jsPDF } from "jspdf";
import autoTable, { type RowInput, type Styles } from "jspdf-autotable";
import { actualFromOffer, isUsableDiscount } from "./pricing";
import { ensureTamilFont, hasTamil, renderTamil, type TamilImage } from "./tamilText";

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
  /** The name in Tamil, printed only when that column is switched on. */
  tamil_name?: string | null;
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
 *   tamilName   the product name in Tamil, beside the English one
 *   price       the original price, struck through by default
 *   offerPrice  what the customer pays
 *   quantity    the pack content ("10 pcs", "1 box")
 *   requirement blank, for the customer to write in
 *   amount      blank, for the customer to total up
 */
export type PriceListColumnKey =
  | "tamilName"
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

/** In printed order: Tamil sits next to the English name it translates. */
export const PRICE_LIST_COLUMNS: PriceListColumnKey[] = [
  "tamilName",
  "price",
  "offerPrice",
  "quantity",
  "requirement",
  "amount",
];

/**
 * The columns a caller gets when it says nothing about columns — which is the
 * season's own price list and the storefront's. Tamil is left out of it: it
 * is a column a superadmin switches on for a particular sheet, and adding it
 * to the standard list would change every page that has ever been printed.
 */
export const DEFAULT_ON_COLUMNS: PriceListColumnKey[] = PRICE_LIST_COLUMNS.filter(
  (key) => key !== "tamilName"
);

/** The headings the list has always used, for placeholders and fallbacks. */
export const DEFAULT_COLUMN_LABELS: Record<PriceListColumnKey, string> = {
  tamilName: "Tamil Name",
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
  // A name, not a number, and Tamil sets wider than Latin. Asking for more
  // than the value columns is the point: with all seven columns on, every
  // width below is scaled down together, so what matters is the share the
  // Tamil column takes of the squeeze, not the figure itself. At 130 it came
  // out at 105pt and the names wrapped to a second line, which cost far more
  // height than the extra width costs the columns beside it.
  tamilName: 150,
  price: 58,
  offerPrice: 58,
  quantity: 64,
  requirement: 52,
  amount: 58,
};

/**
 * The table's body type size and cell padding, in points.
 *
 * Named because the Tamil column is drawn rather than typeset (see
 * `tamilText`) and has to be measured against the same numbers, or the Tamil
 * name reads a size apart from the English one next to it.
 */
const BODY_FONT_SIZE = 8.5;
/**
 * Cell padding, in points.
 *
 * Tightened from 3.5. With the Tamil column on, the page is oversubscribed
 * and every column is squeezed (see `layOutColumns`), so a point of padding
 * is a point the Tamil name cannot use — and padding is paid twice per row,
 * on a list several hundred rows long.
 */
const CELL_PADDING = 2.5;

/**
 * The page margin, in points.
 *
 * Also tightened, from 28. It buys width, which is what keeps a Tamil name on
 * one line, and height on every page at once. A printer still holds this
 * comfortably — the old figure was generous rather than required.
 */
const PAGE_MARGIN = 20;

/**
 * Room kept at the foot of every page for the page number, in points.
 *
 * Tightened with the rest: 8pt type needs far less than the 34 it had, and
 * unlike the banner this is paid back on every page of the list.
 */
const FOOTER_SPACE = 20;

const SERIAL_WIDTH = 28;
/** Product names wrap, but below this they wrap to nonsense. */
const MIN_PRODUCT_WIDTH = 140;

/**
 * The Tamil name is drawn a shade smaller than the English one beside it.
 *
 * Tamil sets wider than Latin at the same size, and the column it gets is
 * the narrowest on the sheet. At 0.95 a name that would have taken two lines
 * usually takes one, which is worth far more vertically than the fraction of
 * a point it gives up — and the two names still read as a matched pair.
 */
const TAMIL_FONT_SCALE = 0.95;

/**
 * How much of page one a banner may take before the guard bites, as a
 * fraction of the page height.
 *
 * Left where it was. Shortening the banner is a weaker lever than it looks —
 * it costs space on page one only, so it is worth about a quarter of a page
 * across the whole list — and the standard header is artwork that uses its
 * full height, with the phone numbers along the bottom edge. Bringing it in
 * would shrink it away from the table's width rather than crop it, and lose
 * that. A caller that genuinely has a shorter banner says so with
 * `bannerMaxHeight` instead.
 */
const DEFAULT_BANNER_MAX_RATIO = 0.4;

/**
 * The shape a banner has to be, or wider, to span the page.
 *
 * A banner is drawn at the full table width unless doing so would make it
 * taller than the cap — a square image across an A4 page would swallow page
 * one. Past that the height is what is held and the width comes in, so the
 * banner ends up narrower than the table under it. On A4 portrait that
 * happens below roughly 1.7:1; the standard banner is 2:1.
 *
 * Exported so the screen that takes an upload can say so before the file is
 * built rather than after.
 */
export const MIN_FULL_WIDTH_BANNER_RATIO = (() => {
  // A4 portrait in points, matching the document below.
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  return (pageWidth - PAGE_MARGIN * 2) / (pageHeight * DEFAULT_BANNER_MAX_RATIO);
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
  /**
   * The tallest the banner may be drawn, in points.
   *
   * Only worth setting for a banner whose artwork survives being brought in —
   * a wide strip, or one with nothing along its top and bottom edges. Past
   * this height the width comes in with it rather than the picture being
   * cropped, so a tall banner given a short cap ends up a small block centred
   * over a full-width table. Omitted, a banner may take
   * `DEFAULT_BANNER_MAX_RATIO` of the page.
   */
  bannerMaxHeight?: number;
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
  bannerMaxHeight,
}: PriceListPdfOptions): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = PAGE_MARGIN;

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
  const BANNER_MAX_HEIGHT =
    bannerMaxHeight && bannerMaxHeight > 0
      ? bannerMaxHeight
      : pageHeight * DEFAULT_BANNER_MAX_RATIO;
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
      pageHeight - FOOTER_SPACE / 2,
    );
    doc.text(`Page ${page}`, pageWidth - margin, pageHeight - FOOTER_SPACE / 2, {
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
  // says nothing gets the standard list, exactly as before.
  const enabled: PriceListColumnKey[] = PRICE_LIST_COLUMNS.filter((key) =>
    columns
      ? columns.some((column) => column.key === key && column.enabled)
      : DEFAULT_ON_COLUMNS.includes(key)
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
      case "tamilName":
        // Drawn as an image in didDrawCell, because helvetica has no Tamil.
        return "";
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

  // Widths, shared out so the table ends where the banner does. Worked out
  // before the rows are built: a Tamil name is wrapped to the width of the
  // column it is going into, so the column has to be measured first.
  const layout = layOutColumns(enabled, pageWidth - margin * 2);

  /**
   * The Tamil column, if it is on.
   *
   * Each name is laid out by the browser and arrives as a small transparent
   * image, drawn into the cell in `didDrawCell` -- the why is in `tamilText`.
   * Keyed by the row's position in `body`, which is what autoTable reports
   * back. Nothing here runs, and the font is never fetched, unless the
   * superadmin switched the column on.
   */
  const tamilIndex = enabled.indexOf("tamilName");
  const tamilColumnIndex = tamilIndex < 0 ? -1 : 2 + tamilIndex;
  const tamilWidth =
    tamilIndex < 0 ? 0 : layout.optional[tamilIndex] - CELL_PADDING * 2;
  const tamilImages = new Map<number, TamilImage>();
  if (tamilColumnIndex >= 0) await ensureTamilFont();

  // A heading typed in Tamil is drawn the same way, in the cream the other
  // headings are printed in. An English heading is left to helvetica.
  const tamilHeadLabel = tamilColumnIndex < 0 ? "" : headingOf("tamilName");
  const tamilHeading = hasTamil(tamilHeadLabel)
    ? renderTamil(tamilHeadLabel, {
        maxWidth: tamilWidth,
        fontSize: BODY_FONT_SIZE * TAMIL_FONT_SCALE,
        color: "#fff8dc",
        bold: true,
      })
    : null;

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
      const cells: (string | { content: string; styles: Partial<Styles> })[] =
        enabled.map((key) => cellOf(key, product));

      // The row has to be tall enough for the picture of the Tamil name,
      // which autoTable cannot work out from an empty cell.
      if (tamilIndex >= 0) {
        const image = renderTamil(product.tamil_name, {
          maxWidth: tamilWidth,
          fontSize: BODY_FONT_SIZE * TAMIL_FONT_SCALE,
        });
        if (image) {
          tamilImages.set(body.length, image);
          cells[tamilIndex] = {
            content: "",
            styles: { minCellHeight: image.height + CELL_PADDING * 2 },
          };
        }
      }

      body.push([String(serial++), product.name, ...cells]);
    });
  });

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
      // A name reads left-aligned, like the English one beside it.
      ...(key === "tamilName" ? { halign: "left" as const } : {}),
    };
  });

  autoTable(doc, {
    head: [
      [
        "S.No",
        "Product",
        // A Tamil heading is drawn over the cell, so the text is left out.
        ...enabled.map((key) =>
          key === "tamilName" && tamilHeading ? "" : headingOf(key)
        ),
      ],
    ],
    body,
    startY: headerHeight + 10,
    margin: {
      top: margin,
      right: margin,
      bottom: FOOTER_SPACE + 6,
      left: margin,
    },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: BODY_FONT_SIZE,
      cellPadding: CELL_PADDING,
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
    // Shared out by layOutColumns above. This used to be a second, literal
    // map that silently shadowed it, which is why switching a column off left
    // a gap down the right-hand side instead of widening what was left.
    columnStyles,
    // The struck-through original price, drawn by hand: autoTable has no
    // line-through style. The column it lives in moves as columns are turned
    // off, and a superadmin can switch the line off entirely.
    didDrawCell: (data) => {
      // The Tamil column is a picture of the name, not text. Body cells are
      // left-aligned on the padding like the English name; the heading is
      // centred like the other headings.
      if (tamilColumnIndex >= 0 && data.column.index === tamilColumnIndex) {
        const image =
          data.section === "head"
            ? tamilHeading
            : data.section === "body"
              ? tamilImages.get(data.row.index) ?? null
              : null;
        if (image) {
          const width = Math.min(
            image.width,
            data.cell.width - CELL_PADDING * 2
          );
          const height = image.height * (width / image.width);
          const x =
            data.section === "head"
              ? data.cell.x + (data.cell.width - width) / 2
              : data.cell.x + CELL_PADDING;
          doc.addImage(
            image.dataUrl,
            "PNG",
            x,
            data.cell.y + (data.cell.height - height) / 2,
            width,
            height,
            undefined,
            "FAST"
          );
        }
      }

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
  if (y + noteHeight > pageHeight - FOOTER_SPACE - 6) {
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
