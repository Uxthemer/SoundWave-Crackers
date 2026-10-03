/**
 * Turning what the recogniser read into catalogue products.
 *
 * The thing that makes this work is that handwriting recognition does NOT
 * have to be right. It only has to be close enough to pick one product out of
 * a few hundred known ones, and there are three independent ways to do that:
 *
 *   the S.No      exact, when the customer copied it off our price list
 *   the name      fuzzy, and the only signal on a sheet with no numbering
 *   the price     a strong confirmation, because a wrong product almost never
 *                 happens to cost the same as the right one
 *
 * Any one of them alone is a guess. Together they are close to certain, and
 * more usefully they DISAGREE when something is wrong -- which is the whole
 * basis of what the review screen flags. A row where the serial says one
 * product and the handwriting plainly says another is exactly the row a human
 * needs to look at, and it is invisible to a system that only reads names.
 */

import type { Catalogue, CatalogueEntry } from "./priceListSerials";

export interface ParsedRow {
  serial: number | null;
  nameText: string;
  price: number | null;
  quantity: number | null;
  /** The unit the customer wrote, kept so the review screen can show it. */
  quantityUnit: string | null;
}

export interface MatchCandidate {
  entry: CatalogueEntry;
  score: number;
  /** Why it scored, for the tooltip on the review row. */
  reasons: string[];
}

export interface MatchedRow extends ParsedRow {
  candidates: MatchCandidate[];
  confidence: number;
  warnings: string[];
}

/* ------------------------------------------------------------------ *
 * Reading the cells
 * ------------------------------------------------------------------ */

/**
 * Digits that the recogniser routinely reports as letters.
 *
 * Applied only to cells that should be nothing BUT a number, where there is
 * no ambiguity about what was meant -- "4S" in the price column is 45.
 */
const LETTER_TO_DIGIT: Record<string, string> = {
  o: "0", O: "0", Q: "0", D: "0",
  l: "1", I: "1", i: "1", "|": "1", "/": "1",
  z: "2", Z: "2",
  s: "5", S: "5",
  b: "6", G: "6",
  T: "7",
  B: "8",
  g: "9", q: "9",
};

/**
 * Characters that could be part of a handwritten figure, including the
 * letters above. Commas and dots are in so that "1,250" and "45.50" survive
 * as one run instead of splitting into two numbers.
 */
const FIGURE_RUN = /[0-9OoQDlIi|/zZsSbBGgqT.,]+/g;

/**
 * Reads a figure out of a cell that is supposed to hold nothing else.
 *
 * The rule that matters is the `\d` test: a run has to contain at least one
 * unambiguous digit before any of its letters are read as digits. Without it
 * a cell holding only letters -- a stray mark, a word that drifted in from
 * the next column -- is converted wholesale and becomes a number out of
 * nothing. That is worse than reading nothing at all, because a fabricated
 * serial resolves to a real product and carries the full serial bonus with
 * it, quietly putting a line nobody ordered on a priced quotation. Reading
 * nothing just falls back to matching on the name.
 */
function figureFrom(raw: string): number | null {
  const runs = raw.match(FIGURE_RUN) ?? [];
  for (const run of runs) {
    if (!/\d/.test(run)) continue;
    const digits = run
      .split("")
      .map((character) => LETTER_TO_DIGIT[character] ?? character)
      .join("")
      .replace(/,/g, "")
      // Only the first dot can be a decimal point; the rest are ink.
      .replace(/\.(?=.*\.)/g, "")
      .replace(/[^\d.]/g, "")
      .replace(/\.$/, "");
    if (!digits) continue;
    const value = Number(digits);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

export function parseSerial(raw: string): number | null {
  const value = figureFrom(raw);
  if (value == null) return null;
  // Four digits is not a serial on a price list of a few hundred lines; it is
  // a misread of something else, and acting on it would resolve to nothing
  // anyway while suppressing the name match.
  return Number.isInteger(value) && value > 0 && value < 2000 ? value : null;
}

export function parsePrice(raw: string): number | null {
  const value = figureFrom(raw);
  return value != null && value > 0 ? value : null;
}

/**
 * Unit words a counter order is written in.
 *
 * Note there is no leading `\b`. People write "1Box" and "4nos" with nothing
 * between the figure and the word, and a word boundary needs a non-word
 * character there to match. With one, those cells fell through to the figure
 * reader with the unit still attached, and "1Box" came out as 180.
 */
const UNIT_WORDS = /(box(?:es)?|bx|pkt?s?|packets?|nos?|pcs?|pieces?|bags?|tins?|sets?)\b/i;

/**
 * "2 Box" -> 2. "4nos" -> 4. "1 no" -> 1. "Box" -> 1.
 *
 * A bare unit with no figure means one of them: people write "Box" and not
 * "1 Box". Defaulting to one is right far more often than leaving it blank,
 * and the review screen shows the crop next to it either way.
 */
export function parseQuantity(raw: string): { quantity: number | null; unit: string | null } {
  const unitMatch = raw.match(UNIT_WORDS);
  const unit = unitMatch ? unitMatch[1].toLowerCase() : null;

  // The unit word is cut off before the figure is read. Left in, its own
  // letters would be converted: the "Bo" of "Box" reads as 80.
  const head = unitMatch ? raw.slice(0, unitMatch.index) : raw;
  const value = figureFrom(head);
  if (value != null) {
    // Nobody orders nine hundred boxes off a notebook page; that is a price
    // that landed in the quantity column.
    if (value > 0 && value <= 500) return { quantity: Math.round(value), unit };
  }

  if (unit) return { quantity: 1, unit };
  return { quantity: null, unit: null };
}

/**
 * Splits a whole recognised row, for sheets with no printed columns.
 *
 * Right to left, for the reason `priceListExtractor.ts` sets out at length:
 * product names contain digits ("1000 Wala", "15 Cm", "(10 Pieces)") and any
 * left-to-right rule picks one of those as the price. The columns after the
 * name are the stable part of the line, so they are peeled off the end.
 */
export function parseWholeLine(line: string): ParsedRow {
  let working = line.replace(/\s+/g, " ").trim();

  let quantity: number | null = null;
  let quantityUnit: string | null = null;
  const tail = working.match(/\s(\d{0,3}\s*[A-Za-z]{1,7})\s*$/);
  if (tail && UNIT_WORDS.test(tail[1])) {
    const parsed = parseQuantity(tail[1]);
    quantity = parsed.quantity;
    quantityUnit = parsed.unit;
    working = working.slice(0, tail.index).trimEnd();
  }

  let price: number | null = null;
  const money = working.match(/\s(\d{2,5})\s*$/);
  if (money) {
    price = Number(money[1]);
    working = working.slice(0, money.index).trimEnd();
  }

  let serial: number | null = null;
  const lead = working.match(/^(\d{1,3})[.)\s]+/);
  if (lead) {
    serial = Number(lead[1]);
    working = working.slice(lead[0].length).trim();
  }

  return { serial, nameText: working, price, quantity, quantityUnit };
}

/* ------------------------------------------------------------------ *
 * Comparing names
 * ------------------------------------------------------------------ */

/**
 * Letters the recogniser swaps for digits inside words.
 *
 * The reverse of {@link LETTER_TO_DIGIT}, and applied only to tokens that are
 * mostly letters. A token that is all digits is left alone: in this catalogue
 * those are sizes and counts, and they are the most discriminating part of
 * the name.
 */
const normaliseWord = (word: string): string =>
  word
    .replace(/0/g, "o")
    .replace(/1/g, "l")
    .replace(/5/g, "s")
    .replace(/8/g, "b")
    .replace(/2/g, "z");

interface NameParts {
  text: string;
  words: string[];
  numbers: string[];
}

function splitName(raw: string): NameParts {
  const cleaned = raw
    .toLowerCase()
    // "cm", "pcs" and friends written tight against a figure: "15cm", "5pcs".
    .replace(/(\d)\s*(cm|mm|pcs|pc|pieces|wala|shot|inch)/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const tokens = cleaned.split(" ").filter(Boolean);
  const numbers: string[] = [];
  const words: string[] = [];
  tokens.forEach((token) => {
    if (/^\d+$/.test(token)) numbers.push(token);
    else words.push(normaliseWord(token));
  });

  return { text: words.join(" "), words, numbers };
}

/** Dice coefficient over character trigrams — forgiving of misread letters. */
function trigramDice(a: string, b: string): number {
  const grams = (text: string) => {
    const padded = `  ${text} `;
    const set = new Set<string>();
    for (let i = 0; i < padded.length - 2; i += 1) set.add(padded.slice(i, i + 3));
    return set;
  };
  if (!a || !b) return 0;
  const left = grams(a);
  const right = grams(b);
  let shared = 0;
  left.forEach((gram) => {
    if (right.has(gram)) shared += 1;
  });
  return (2 * shared) / (left.size + right.size);
}

/**
 * How much of the shorter name is present in the longer one, word by word.
 *
 * Trigrams alone punish length differences badly, and length differences are
 * the norm here: people write "Grand Chakkar Deluxe" for a catalogue entry
 * called "Grand Chakkar Deluxe (5 Pcs) Special". Containment does not care.
 */
function wordContainment(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  let hits = 0;
  shorter.forEach((word) => {
    const best = longer.reduce((max, other) => Math.max(max, trigramDice(word, other)), 0);
    if (best >= 0.6) hits += 1;
  });
  return hits / shorter.length;
}

/**
 * 0-1 similarity between what was written and a catalogue name.
 *
 * The numeric multiplier at the end is the important part. "15 Cm Electric
 * Sparkler", "30 Cm Electric Sparkler" and "50 Cm Electric Sparkler" are
 * three different products whose names agree on every letter; so do "1000
 * Wala" and "10000 Wala". Judged on words alone the matcher picks whichever
 * happens to sort first and is confidently wrong, which is the single worst
 * failure this feature can have -- a wrong line on a priced quotation that
 * looks right. Disagreeing figures cut the score hard.
 */
export function nameSimilarity(written: string, candidate: string): number {
  const a = splitName(written);
  const b = splitName(candidate);
  if (!a.text && !a.numbers.length) return 0;

  const textual = Math.max(trigramDice(a.text, b.text), wordContainment(a.words, b.words));

  if (!a.numbers.length || !b.numbers.length) return textual;

  const wanted = new Set(a.numbers);
  const found = new Set(b.numbers);
  let agree = 0;
  wanted.forEach((number) => {
    if (found.has(number)) agree += 1;
  });
  const numeric = agree / Math.max(wanted.size, found.size);

  return textual * (0.45 + 0.55 * numeric);
}

/**
 * How many catalogue entries cost a given amount.
 *
 * Cached per catalogue, because it is the same for every row on the page.
 */
const priceCounts = new WeakMap<Catalogue, Map<number, number>>();

function pricePopulation(catalogue: Catalogue): Map<number, number> {
  const cached = priceCounts.get(catalogue);
  if (cached) return cached;
  const counts = new Map<number, number>();
  catalogue.entries.forEach((entry) => {
    [entry.offerPrice, entry.actualPrice].forEach((value) => {
      if (value == null || value <= 0) return;
      const key = Math.round(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });
  priceCounts.set(catalogue, counts);
  return counts;
}

/** 1 when the written price is the catalogue's, falling away either side. */
function priceSimilarity(written: number | null, entry: CatalogueEntry): number {
  if (written == null) return 0;
  const options = [entry.offerPrice, entry.actualPrice].filter(
    (value): value is number => value != null && value > 0
  );
  if (!options.length) return 0;
  return options.reduce((best, value) => {
    const drift = Math.abs(written - value) / value;
    if (drift <= 0.005) return Math.max(best, 1);
    if (drift >= 0.2) return best;
    return Math.max(best, 1 - drift / 0.2);
  }, 0);
}

/* ------------------------------------------------------------------ *
 * Matching
 * ------------------------------------------------------------------ */

/**
 * What resolving the serial is worth.
 *
 * Tuned so a bare serial with illegible everything else still produces a
 * usable match, while a serial that contradicts a clearly written name loses
 * to the name. Raising it past about 0.6 starts overriding good handwriting
 * with stale serials off last season's price list, which is the failure mode
 * to avoid.
 */
const SERIAL_BONUS = 0.55;
/**
 * What an exact price is worth when hardly anything else costs that.
 *
 * A signal is worth what it rules out. Matching 182 rupees in a catalogue
 * where one product costs 182 says almost as much as the serial does;
 * matching 50 where thirty products cost 50 says nearly nothing. Scoring
 * both the same was losing rows whose serial had been misread and whose
 * handwriting was poor, but whose price was read perfectly -- which is a
 * common combination, because figures survive bad handwriting better than
 * words do.
 */
const PRICE_UNIQUE_BONUS = 0.4;
/** Below this the review screen demands a look. */
export const REVIEW_THRESHOLD = 0.8;
/** Two candidates closer than this are a coin toss, however high they score. */
const AMBIGUITY_GAP = 0.08;

export function matchRow(parsed: ParsedRow, catalogue: Catalogue): MatchedRow {
  const serialEntry = parsed.serial == null ? null : catalogue.bySerial.get(parsed.serial) ?? null;
  // Some sheets quote our product_code rather than the printed S.No.
  const codeEntry = catalogue.byCode.get(parsed.nameText.trim().toUpperCase()) ?? null;

  const hasName = splitName(parsed.nameText).text.length >= 3;
  const hasPrice = parsed.price != null;
  const population = pricePopulation(catalogue);

  // How many independent signals back the winner. Kept alongside the score
  // because the two answer different questions: the score says which product
  // this most resembles, and this says whether to believe it.
  let topAgreement = 0;

  const scored: (MatchCandidate & { agreement: number })[] = catalogue.entries.map((entry) => {
    const name = hasName ? nameSimilarity(parsed.nameText, entry.name) : 0;
    const price = priceSimilarity(parsed.price, entry);

    // Only the signals actually present share the weight. A row with no
    // readable price must not be capped at 0.55 for want of one.
    let base: number;
    if (hasName && hasPrice) base = 0.55 * name + 0.45 * price;
    else if (hasName) base = name;
    else if (hasPrice) base = price * 0.7; // price alone is not identifying
    else base = 0;

    const reasons: string[] = [];
    if (hasName && name > 0.5) reasons.push(`name ${Math.round(name * 100)}%`);
    if (price >= 0.99) reasons.push("price matches exactly");
    else if (price > 0.6) reasons.push("price is close");

    let total = base;
    if (price >= 0.99 && parsed.price != null) {
      const shared = population.get(Math.round(parsed.price)) ?? 1;
      const bonus = PRICE_UNIQUE_BONUS / Math.sqrt(shared);
      total += bonus;
      if (shared <= 2) reasons.push(`only ${shared === 1 ? "this product costs" : "two products cost"} ₹${parsed.price}`);
    }
    if (serialEntry && entry.id === serialEntry.id) {
      total += SERIAL_BONUS;
      reasons.unshift(`S.No ${parsed.serial} on the price list`);
    }
    if (codeEntry && entry.id === codeEntry.id) {
      total += SERIAL_BONUS;
      reasons.unshift(`product code ${entry.productCode}`);
    }

    const agreement =
      (serialEntry && entry.id === serialEntry.id ? 1 : 0) +
      (name >= 0.5 ? 1 : 0) +
      (price >= 0.99 ? 1 : 0);

    return { entry, score: Math.min(1, total), reasons, agreement };
  });

  scored.sort((a, b) => b.score - a.score);
  topAgreement = scored[0]?.agreement ?? 0;
  const candidates = scored.filter((candidate) => candidate.score > 0.15).slice(0, 6);

  const warnings: string[] = [];
  const best = candidates[0] ?? null;
  const runnerUp = candidates[1] ?? null;

  if (parsed.serial != null && !serialEntry) {
    warnings.push(
      `S.No ${parsed.serial} is not on this season's price list — matched on the name instead.`
    );
  }
  if (serialEntry && best && best.entry.id !== serialEntry.id) {
    warnings.push(
      `S.No ${parsed.serial} is "${serialEntry.name}", but the handwriting reads closer to "${best.entry.name}".`
    );
  }
  if (best && runnerUp && best.score - runnerUp.score < AMBIGUITY_GAP) {
    warnings.push(`Too close to call between "${best.entry.name}" and "${runnerUp.entry.name}".`);
  }
  if (parsed.quantity == null) {
    warnings.push("No quantity was read — assuming 1.");
  }
  if (!best) {
    warnings.push("Nothing in the catalogue resembles this line.");
  }

  /*
   * One signal on its own is never enough to tick a line.
   *
   * A price that happens to be unique pulls the right product to the top of
   * the list even when the handwriting is unreadable, and that is worth
   * having -- but it is a coincidence away from being wrong, and twice on
   * the test page it WAS wrong while scoring in the high eighties. A
   * confident wrong line on a priced quotation is the one outcome this
   * feature must not produce, so ranking and belief are separated: the bonus
   * improves the order of the candidates, and the confidence still demands
   * that two of the three independent signals agree.
   */
  const UNCORROBORATED = REVIEW_THRESHOLD - 0.08;
  const confidence =
    best == null
      ? 0
      : topAgreement >= 2
        ? best.score
        : Math.min(best.score, UNCORROBORATED);

  if (best && topAgreement < 2 && best.score >= REVIEW_THRESHOLD) {
    warnings.push("Only one thing matches — check this against the page.");
  }

  return {
    ...parsed,
    candidates: candidates.map(({ entry, score, reasons }) => ({ entry, score, reasons })),
    confidence,
    warnings,
  };
}
