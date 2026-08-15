/**
 * Vendor price list extraction.
 *
 * Vendors publish in quite different shapes. The three real samples:
 *
 *   Sangamithra  S.No | Item Name | Box Contents | Price | Per rate | Cs/Cont
 *                S101 | Lucky Money (3 Pcs) | 3 Pcs | 140 | 1 Box | 60 Boxes
 *                S201 | 2 3/4" Kuruvi Crackers |    | 7300 | 1000 Pkt | 1600 Pkts
 *
 *   AK           S.NO | PARTICULARS | PERBOX | PER CASE | RATE PER BOX
 *                1 | MAGIC PEACOCK 3 IN 1 | 1 PIECE | 60 BOX | 120
 *
 *   Karpagaraja  NAME OF THE PRODUCTS | PRICE | PER | CASE CONTENT
 *                JAGAJAL (30pcs) | 270 | BOX | 96BOX
 *
 * Despite the differences they all encode the same four facts, so extraction
 * targets those rather than any one vendor's column order:
 *
 *   label      what the item is called
 *   rate       the money, and HOW MANY UNITS it covers (Sangamithra's "1000 Pkt")
 *   pack       how many pieces are inside one unit
 *   case       how many units make a case
 *
 * Extraction is deliberately conservative: a row that cannot be read
 * confidently is still returned, flagged, so a human resolves it on the review
 * screen rather than it silently vanishing.
 */

export type RateUnit = 'box' | 'piece' | 'pkt' | 'bag' | 'unit' | 'tin' | 'case';

export interface ExtractedRow {
  /** Line number in the source, for traceability. */
  sourceLine: number;
  /** Vendor's item code if the sheet has one (S101, SWC1...). */
  vendorCode: string | null;
  label: string;
  /** The quoted money figure. */
  listPrice: number;
  /** How many rateUnits that money covers. "7300 per 1000 Pkt" -> 1000. */
  rateQty: number;
  rateUnit: RateUnit;
  /** Pieces inside one rateUnit. "3 Pcs" -> 3. */
  packQty: number | null;
  /** rateUnits per case. "60 Boxes" -> 60. */
  caseQty: number | null;
  rawPackText: string | null;
  rawCaseText: string | null;
  rawRateText: string | null;
  rawLine: string;
  /** 0-1. Below ~0.6 the review screen should demand attention. */
  confidence: number;
  warnings: string[];
}

export interface ExtractionResult {
  rows: ExtractedRow[];
  /** Lines that looked like headings or notes rather than products. */
  skipped: string[];
  detectedFormat: string;
}

const UNIT_WORDS: Record<string, RateUnit> = {
  box: 'box', boxes: 'box', bx: 'box',
  pcs: 'piece', pc: 'piece', piece: 'piece', pieces: 'piece', pce: 'piece',
  pkt: 'pkt', pkts: 'pkt', packet: 'pkt', packets: 'pkt',
  bag: 'bag', bags: 'bag',
  unit: 'unit', units: 'unit',
  tin: 'tin',
  case: 'case', cases: 'case', cs: 'case',
};

const normaliseUnit = (word: string | undefined | null): RateUnit | null => {
  if (!word) return null;
  const key = word.toLowerCase().replace(/[^a-z]/g, '');
  return UNIT_WORDS[key] ?? null;
};

const toNumber = (raw: string | undefined | null): number | null => {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

/**
 * Parses a quantity-with-unit phrase: "3 Pcs", "60 Boxes", "96BOX",
 * "1000 Pkt", "1 PIECE", "140units".
 */
const parseQtyUnit = (
  raw: string | undefined | null
): { qty: number | null; unit: RateUnit | null } => {
  if (!raw) return { qty: null, unit: null };
  const text = String(raw).trim();
  // Digits then letters, with optional space: "96BOX", "1000 Pkt"
  const m = text.match(/(\d+(?:\.\d+)?)\s*([A-Za-z]+)/);
  if (m) {
    return { qty: Number(m[1]), unit: normaliseUnit(m[2]) };
  }
  const justNumber = toNumber(text);
  if (justNumber !== null) return { qty: justNumber, unit: null };
  return { qty: null, unit: normaliseUnit(text) };
};

/**
 * Pulls a piece count out of a product name: "Lucky Money (3 Pcs)" -> 3.
 * Many vendors put the pack size only in the name.
 */
export const packQtyFromLabel = (label: string): number | null => {
  const m = label.match(/\((\d+)\s*(?:pcs?|pieces?)\)/i);
  if (m) return Number(m[1]);
  const m2 = label.match(/\b(\d+)\s*(?:pcs|pieces)\b/i);
  return m2 ? Number(m2[1]) : null;
};

/** Heading rows ("Sankamithra Specials", "Ground Chakkars", "Terms & Conditions"). */
const isHeadingOrNoise = (line: string): boolean => {
  const t = line.trim();
  if (t.length < 3) return true;
  if (!/\d/.test(t)) return true;                      // no numbers at all
  if (/^(terms|thank|yours|all rates|packing|the order|subject|an advance|\d+\s*\.)/i.test(t)) return true;
  if (/valid upto|price list|s\.?no\b.*(item|product|particulars)/i.test(t)) return true;
  return false;
};

interface TailToken {
  qty: number | null;
  unit: RateUnit;
  text: string;
}

/** Strips one trailing "60 Boxes" / "96BOX" / "unit" / "BOX" token. */
const takeTrailingUnitToken = (
  text: string
): { token: TailToken; rest: string } | null => {
  // "60 Boxes", "96BOX", "1 PIECE"
  const withQty = text.match(/\s(\d+(?:\.\d+)?)\s*([A-Za-z]{2,7})\s*$/);
  if (withQty) {
    const unit = normaliseUnit(withQty[2]);
    if (unit) {
      return {
        token: { qty: Number(withQty[1]), unit, text: withQty[0].trim() },
        rest: text.slice(0, withQty.index).trimEnd(),
      };
    }
  }
  // A bare unit word: Karpagaraja's "PER = BOX", Sangamithra's "unit"
  const bare = text.match(/\s([A-Za-z]{2,7})\s*$/);
  if (bare) {
    const unit = normaliseUnit(bare[1]);
    if (unit) {
      return {
        token: { qty: null, unit, text: bare[0].trim() },
        rest: text.slice(0, bare.index).trimEnd(),
      };
    }
  }
  return null;
};

/** Strips one trailing bare number, e.g. AK's rate column or a price. */
const takeTrailingNumber = (
  text: string
): { value: number; rest: string } | null => {
  const m = text.match(/\s₹?\s*(\d{1,7}(?:\.\d{1,2})?)\s*$/);
  if (!m) return null;
  return { value: Number(m[1]), rest: text.slice(0, m.index).trimEnd() };
};

/**
 * Extracts rows from flat text (a PDF's text layer, or pasted text).
 *
 * Parses RIGHT TO LEFT. PDF extraction destroys the column grid, but every
 * vendor sheet puts the numeric columns after the item name, so the structure
 * survives at the end of the line even when the name itself contains digits.
 *
 * Parsing left-to-right and taking the largest number does not work: it reads
 * Karpagaraja's "DHARSHA(10000 Wala color) 530 BOX 18BOX" as costing 10000, and
 * truncates 'Lucky Money (3 Pcs)' at the bracket. Anchoring on the right-hand
 * columns fixes both.
 *
 * Two column orders occur in the wild and both are handled:
 *   ... pack, PRICE, per-rate, case     (Sangamithra, Karpagaraja)
 *   ... pack, case, PRICE               (AK — price is the final column)
 */
export function extractRowsFromText(rawText: string): ExtractionResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const rows: ExtractedRow[] = [];
  const skipped: string[] = [];

  lines.forEach((line, index) => {
    if (isHeadingOrNoise(line)) {
      skipped.push(line);
      return;
    }

    const warnings: string[] = [];
    let confidence = 0.55;
    let working = line;

    // Leading vendor code: "S101 ...", "1 ...", "SWC-12 ..."
    let vendorCode: string | null = null;
    const codeMatch = working.match(/^([A-Z]{1,4}-?\d{2,5}|\d{1,3})\s+/);
    if (codeMatch) {
      vendorCode = codeMatch[1];
      working = working.slice(codeMatch[0].length).trim();
      confidence += 0.1;
    }

    // AK put the price last. If the line ends in a bare number, that is it.
    let money: number | null = null;
    const trailingNumber = takeTrailingNumber(working);
    if (trailingNumber) {
      money = trailingNumber.value;
      working = trailingNumber.rest;
    }

    // Peel the unit columns off the right: case, then any per-rate spec.
    const tail: TailToken[] = [];
    for (let guard = 0; guard < 4; guard += 1) {
      const taken = takeTrailingUnitToken(working);
      if (!taken) break;
      tail.push(taken.token);
      working = taken.rest;
    }

    // Sangamithra / Karpagaraja style: the price sits before the unit columns.
    if (money === null) {
      const priceToken = takeTrailingNumber(working);
      if (priceToken) {
        money = priceToken.value;
        working = priceToken.rest;
      }
    }

    // "270 BOX" is ambiguous in flattened text: it can be 270 boxes, or Rs270
    // per box (Karpagaraja's PRICE + PER columns run together). If peeling the
    // unit columns left no price behind, one of the tokens we consumed was
    // really the price with its unit — so give it back.
    //
    // Piece counts are skipped: "25 Pcs" is always the pack column, never the
    // price. Reclaiming it would read Sangamithra's "255 unit" line as costing
    // Rs25.
    if (money === null) {
      for (let i = tail.length - 1; i >= 0; i -= 1) {
        if (tail[i].unit === 'piece' || tail[i].qty === null) continue;
        money = tail[i].qty;
        // Its unit still describes what the rate is per.
        tail.splice(i, 1, { qty: null, unit: tail[i].unit, text: tail[i].unit });
        break;
      }
    }

    if (money === null) {
      skipped.push(line);
      return;
    }
    confidence += 0.2;

    // Anything still trailing that is a piece count is the pack column.
    const preTail: TailToken[] = [];
    for (let guard = 0; guard < 2; guard += 1) {
      const taken = takeTrailingUnitToken(working);
      if (!taken || taken.token.unit !== 'piece') break;
      preTail.push(taken.token);
      working = taken.rest;
    }

    const label = working.replace(/[|:\-–]+$/, '').trim();
    if (!label || label.length < 3) {
      skipped.push(line);
      return;
    }
    confidence += 0.15;

    // tail[0] is the rightmost unit column, which is the case in every sample.
    const caseToken = tail.length > 0 ? tail[0] : null;
    // Anything further left that is not a piece count is the per-rate spec.
    const rateToken = tail.slice(1).find((t) => t.unit !== 'piece') ?? null;
    const packToken =
      preTail.find((t) => t.unit === 'piece') ??
      tail.find((t) => t.unit === 'piece') ??
      null;

    const packFromLabel = packQtyFromLabel(label);
    const packQty = packToken?.qty ?? packFromLabel;
    if (packQty === null) {
      warnings.push('Pack size not found — pieces per unit is unknown.');
      confidence -= 0.1;
    }

    const caseQty = caseToken?.qty ?? null;
    if (caseQty === null) {
      warnings.push('Case size not found — cannot order in whole cases.');
      confidence -= 0.15;
    } else {
      confidence += 0.1;
    }

    const rateQty = rateToken?.qty ?? 1;
    if (rateQty > 1) {
      warnings.push(
        `Rate covers ${rateQty} ${rateToken?.unit ?? 'units'} — check this, it divides the price.`
      );
    }

    rows.push({
      sourceLine: index + 1,
      vendorCode,
      label,
      listPrice: money,
      rateQty: rateQty > 0 ? rateQty : 1,
      rateUnit: rateToken?.unit ?? caseToken?.unit ?? 'box',
      packQty,
      caseQty,
      rawPackText: packToken?.text ?? (packFromLabel ? `${packFromLabel} Pcs` : null),
      rawCaseText: caseToken?.text ?? null,
      rawRateText: rateToken?.text ?? null,
      rawLine: line,
      confidence: Math.max(0, Math.min(1, confidence)),
      warnings,
    });
  });

  return { rows, skipped, detectedFormat: 'text' };
}

/**
 * Extracts from a spreadsheet, where the grid survives and the result is far
 * more reliable than PDF text. Column names are matched loosely because every
 * vendor labels them differently.
 */
export function extractRowsFromSheet(
  jsonRows: Record<string, unknown>[]
): ExtractionResult {
  const rows: ExtractedRow[] = [];
  const skipped: string[] = [];

  const pick = (row: Record<string, unknown>, patterns: RegExp[]): string | null => {
    for (const key of Object.keys(row)) {
      if (patterns.some((p) => p.test(key))) {
        const v = row[key];
        if (v !== null && v !== undefined && String(v).trim() !== '') {
          return String(v).trim();
        }
      }
    }
    return null;
  };

  jsonRows.forEach((row, index) => {
    const label = pick(row, [/item/i, /product/i, /particular/i, /name/i, /descript/i]);
    const priceRaw = pick(row, [/^price$/i, /rate/i, /^mrp$/i, /amount/i]);
    const packRaw = pick(row, [/box\s*content/i, /per\s*box/i, /content/i, /pack/i]);
    const caseRaw = pick(row, [/cs\s*\/?\s*cont/i, /case/i, /per\s*case/i, /carton/i]);
    const perRaw = pick(row, [/per\s*rate/i, /^per$/i, /uom/i, /unit/i]);
    const codeRaw = pick(row, [/s\.?\s*no/i, /code/i, /sku/i]);

    const price = toNumber(priceRaw);
    if (!label || price === null) {
      if (label || priceRaw) skipped.push(JSON.stringify(row));
      return;
    }

    const pack = parseQtyUnit(packRaw);
    const cs = parseQtyUnit(caseRaw);
    const per = parseQtyUnit(perRaw);

    const warnings: string[] = [];
    if (per.qty && per.qty > 1) {
      warnings.push(`Rate covers ${per.qty} ${per.unit ?? 'units'} — it divides the price.`);
    }

    const packQty = pack.qty ?? packQtyFromLabel(label);
    if (packQty === null) warnings.push('Pack size not found.');
    if (cs.qty === null) warnings.push('Case size not found.');

    rows.push({
      sourceLine: index + 2, // +1 for header, +1 for 1-based
      vendorCode: codeRaw,
      label,
      listPrice: price,
      rateQty: per.qty && per.qty > 0 ? per.qty : 1,
      rateUnit: per.unit ?? cs.unit ?? 'box',
      packQty,
      caseQty: cs.qty,
      rawPackText: packRaw,
      rawCaseText: caseRaw,
      rawRateText: perRaw,
      rawLine: [codeRaw, label, packRaw, priceRaw, perRaw, caseRaw]
        .filter(Boolean)
        .join(' | '),
      // Spreadsheets keep their columns, so a parsed row is trustworthy.
      confidence: warnings.length === 0 ? 0.95 : 0.75,
      warnings,
    });
  });

  return { rows, skipped, detectedFormat: 'spreadsheet' };
}

/** Reads a PDF's text layer. Scanned PDFs have none — that is reported. */
export async function extractTextFromPdf(file: File): Promise<string> {
  // Dynamic import keeps pdfjs (1.2 MB) out of the main bundle.
  const pdfjsLib: any = await import('pdfjs-dist');

  if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    // The worker URL must come from a `?url` import.
    //
    // `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` looks
    // right and even builds — Vite emits the asset — but it is a BARE
    // specifier, which `new URL` resolves relative to the importing module. In
    // dev that becomes /src/lib/pdfjs-dist/build/... and 404s, so the worker
    // never starts and every extraction fails. `?url` is resolved by Vite in
    // both dev and build.
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url'))
      .default as string;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  }

  const buffer = await file.arrayBuffer();

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  } catch (err: any) {
    // Surface the real reason instead of a bare "extraction failed".
    const detail = err?.message || String(err);
    if (/password/i.test(detail)) {
      throw new Error('This PDF is password protected. Remove the password and try again.');
    }
    if (/worker/i.test(detail)) {
      throw new Error(
        `The PDF reader could not start (${detail}). Try uploading the price list as Excel or CSV instead.`
      );
    }
    throw new Error(`Could not open the PDF: ${detail}`);
  }

  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Group text fragments into visual lines by their y coordinate, otherwise
    // every cell arrives as a separate fragment and the row structure is lost.
    const byLine = new Map<number, { x: number; str: string }[]>();
    content.items.forEach((item: any) => {
      if (!item.str || !item.str.trim()) return;
      const y = Math.round(item.transform[5]);
      // 2px tolerance so slightly offset cells still group together.
      const key = [...byLine.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key)!.push({ x: item.transform[4], str: item.str });
    });

    const ordered = [...byLine.entries()]
      .sort((a, b) => b[0] - a[0]) // top of page first
      .map(([, frags]) =>
        frags.sort((a, b) => a.x - b.x).map((f) => f.str).join(' ')
      );

    pages.push(ordered.join('\n'));
  }

  return pages.join('\n');
}

/** True when a PDF yielded no usable text — i.e. it is a scan and needs OCR. */
export const looksLikeScannedPdf = (text: string): boolean =>
  text.replace(/\s/g, '').length < 40;
