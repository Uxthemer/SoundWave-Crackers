import { jsPDF } from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";
import { loadImage } from "./priceListPdf";
import type { BusinessDetails } from "./businessDetails";
import type { PamphletPack } from "./familyPackPamphlet";

/**
 * The family-pack pamphlet, drawn.
 *
 * One page-wide header carrying who we are and how to reach us, then a block
 * per pack: the pack's name and rate, a table of what is inside it, and the
 * two numbers a customer asks for at the counter — how many different items,
 * and how many pieces in total.
 *
 * Deliberately its own file rather than a mode of `priceListPdf`. A price
 * list is one long table of every product; a pamphlet is a stack of small
 * tables, one per pack, and the two share only the brand colours and
 * `loadImage`.
 */

const BRAND = [139, 69, 19] as const; // the brown every printed sheet uses
const BAND = [253, 237, 226] as const; // pack heading strip
const RULE = [210, 210, 210] as const;

const MARGIN = 32;
/**
 * A pack heading with no table under it reads as a mistake, so a block that
 * cannot fit its heading plus a couple of rows starts the next page instead.
 */
const MIN_BLOCK_HEIGHT = 96;

const money = (value: number) =>
  Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

export interface FamilyPackPamphletOptions {
  packs: PamphletPack[];
  /** Printed under the title, e.g. "Diwali 2025". */
  seasonName: string;
  business: BusinessDetails;
  /** The site logo, drawn at the left of the header when it loads. */
  logoUrl?: string | null;
  /** Overrides the standard title, for a sheet that is not the usual one. */
  title?: string;
}

/**
 * Builds the document and hands back the jsPDF instance, so the caller
 * chooses between saving it, viewing it and attaching it.
 */
export async function buildFamilyPackPamphletPdf({
  packs,
  seasonName,
  business,
  logoUrl,
  title = "Family Pack Combo Offers",
}: FamilyPackPamphletOptions): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;

  // A missing logo is not worth failing the pamphlet over; the header simply
  // starts with the brand name instead.
  const logo = logoUrl ? await loadImage(logoUrl) : null;

  /**
   * The header block, and how tall it turned out.
   *
   * Logo on the left, the business block ranged against the right margin —
   * the two read as one band across the top rather than fighting for the
   * middle of the page. Measured rather than assumed: the address and the
   * phone list wrap to as many lines as they need, and the first table has to
   * start under whatever that came to.
   *
   * GST is not printed. A pamphlet is an offer sheet handed across a counter,
   * not a tax document — the GSTIN belongs on the invoice that follows.
   */
  const drawHeader = (): number => {
    const top = MARGIN;
    const logoBox = (() => {
      if (!logo) return null;
      const height = 46;
      return { width: (logo.width / logo.height) * height, height };
    })();

    // Everything to the right of the logo is the business block's to wrap in.
    const textLeft = logoBox ? MARGIN + logoBox.width + 14 : MARGIN;
    const textWidth = pageWidth - MARGIN - textLeft;
    const right = pageWidth - MARGIN;

    if (logo && logoBox) {
      doc.addImage(
        logo.dataUrl,
        MARGIN,
        top,
        logoBox.width,
        logoBox.height,
        undefined,
        "FAST",
      );
    }

    let y = top + 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(19);
    doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
    doc.text(business.name, right, y, { align: "right" });

    // Address, phones, then email and website: the order someone reads a
    // shop's details in. Each wraps to the width it has.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(95);

    const lines: string[] = [];
    const push = (text: string) => {
      if (!text.trim()) return;
      (doc.splitTextToSize(text, textWidth) as string[]).forEach((line) =>
        lines.push(line),
      );
    };
    push([business.address, business.state].filter(Boolean).join(", "));
    push(`Phone: ${business.phone}`);
    push([business.email, business.website].filter(Boolean).join("  |  "));

    y += 12;
    lines.forEach((line) => {
      doc.text(line, right, y, { align: "right" });
      y += 10.5;
    });

    // The logo may be taller than the text beside it.
    if (logoBox) y = Math.max(y, top + logoBox.height + 10);

    doc.setDrawColor(BRAND[0], BRAND[1], BRAND[2]);
    doc.setLineWidth(1);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);

    y += 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
    doc.text(title, pageWidth / 2, y, { align: "center" });

    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(seasonName, pageWidth / 2, y, { align: "center" });

    return y + 14;
  };

  /**
   * Later pages get the brand name on one line instead of the whole block —
   * repeating the address four times wastes the space a pack could use.
   */
  const drawRunningHead = (): number => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
    doc.text(business.name, MARGIN, MARGIN + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(120);
    doc.text(title, pageWidth - MARGIN, MARGIN + 6, { align: "right" });
    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, MARGIN + 12, pageWidth - MARGIN, MARGIN + 12);
    return MARGIN + 26;
  };

  const drawFooter = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(`${business.name}  |  ${business.phone}`, MARGIN, pageHeight - 18);
    doc.text(
      `Page ${doc.getNumberOfPages()}`,
      pageWidth - MARGIN,
      pageHeight - 18,
      { align: "right" },
    );
  };

  /**
   * Pages already given their header and footer.
   *
   * Each pack is its own autoTable call, so `didDrawPage` fires once per pack
   * per page and would otherwise stamp the same footer several times over.
   */
  const decorated = new Set<number>();
  const decorate = (page: number) => {
    if (decorated.has(page)) return;
    decorated.add(page);
    if (page > 1) drawRunningHead();
    drawFooter();
  };

  let y = drawHeader();
  decorated.add(1);
  drawFooter();

  // The serial and the two numbers get what they need and the item name takes
  // the rest, so the table always ends at the right margin.
  const SERIAL = 32;
  const CONTENT = 90;
  const QTY = 52;
  const itemWidth = contentWidth - SERIAL - CONTENT - QTY;

  packs.forEach((pack) => {
    // Start a page rather than orphan a pack heading at the foot of this one.
    if (y + MIN_BLOCK_HEIGHT > pageHeight - 40) {
      doc.addPage();
      decorate(doc.getNumberOfPages());
      y = MARGIN + 26;
    }

    const body: RowInput[] = pack.items.map((item, index) => [
      String(index + 1),
      item.name,
      item.content || "-",
      String(item.quantity),
    ]);

    autoTable(doc, {
      head: [
        [
          {
            // The pack's name and its rate on one band, which is what a
            // customer scans the sheet for. The pack code is ours, not
            // theirs, so it stays off the pamphlet.
            content: `${pack.name}          Rs. ${money(pack.packPrice)}`,
            colSpan: 4,
            styles: {
              halign: "center" as const,
              fontSize: 11.5,
              fontStyle: "bold" as const,
              fillColor: [BAND[0], BAND[1], BAND[2]] as [number, number, number],
              textColor: [BRAND[0], BRAND[1], BRAND[2]] as [
                number,
                number,
                number,
              ],
              cellPadding: 6,
            },
          },
        ],
        ["S.No", "Item", "Content", "Qty"],
      ],
      body,
      // The two counts the customer asks for, closing the pack off.
      foot: [
        [
          {
            content: `Total products: ${pack.productCount}`,
            colSpan: 2,
            styles: { halign: "left" as const },
          },
          { content: "Total quantity", styles: { halign: "right" as const } },
          {
            content: String(pack.totalQuantity),
            styles: { halign: "center" as const },
          },
        ],
      ],
      startY: y,
      margin: { top: MARGIN + 26, right: MARGIN, bottom: 40, left: MARGIN },
      // A pack long enough to run over the page break is still one pack: its
      // name band and column headings belong at the top of it, and its two
      // totals at the bottom, each printed once. Repeating them on every page
      // would read as several packs with several sets of totals.
      showHead: "firstPage",
      showFoot: "lastPage",
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 4,
        lineColor: [RULE[0], RULE[1], RULE[2]],
        lineWidth: 0.4,
        overflow: "linebreak",
        valign: "middle",
      },
      headStyles: {
        fillColor: [BRAND[0], BRAND[1], BRAND[2]],
        textColor: [255, 248, 220],
        fontStyle: "bold",
        halign: "center",
        fontSize: 9,
      },
      footStyles: {
        fillColor: [BAND[0], BAND[1], BAND[2]],
        textColor: [BRAND[0], BRAND[1], BRAND[2]],
        fontStyle: "bold",
        fontSize: 9,
      },
      columnStyles: {
        0: { cellWidth: SERIAL, halign: "center" },
        1: { cellWidth: itemWidth, halign: "left" },
        2: { cellWidth: CONTENT, halign: "center" },
        3: { cellWidth: QTY, halign: "center" },
      },
      didDrawPage: (data) => decorate(data.pageNumber),
    });

    y =
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? y) + 8;

    // The pack's own note, where one is recorded, under its table.
    if (pack.description) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(120);
      const wrapped = doc.splitTextToSize(
        pack.description,
        contentWidth,
      ) as string[];
      wrapped.forEach((line) => {
        doc.text(line, MARGIN, y);
        y += 10;
      });
      y += 4;
    }

    y += 12;
  });

  return doc;
}

/** `soundwave_family_packs_diwali-2025.pdf` */
export function familyPackPamphletFileName(seasonName: string): string {
  const slug =
    String(seasonName)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "season";
  return `soundwave_family_packs_${slug}.pdf`;
}
