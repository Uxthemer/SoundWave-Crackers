/**
 * Tamil text, drawn correctly, inside a jsPDF document.
 *
 * jsPDF's built-in fonts are Latin-1: a Tamil string handed to `doc.text`
 * comes out as a row of question marks. Embedding a Tamil TTF fixes the
 * glyphs but not the writing system, because jsPDF writes one glyph per
 * codepoint in the order it is given and Tamil is not written in that order:
 *
 *   - ெ ே ை are stored after their consonant and drawn before it, so
 *     "செ" (ச + ெ) would print as "ச" followed by a stranded ெ.
 *   - ொ ோ ௌ are two marks in one codepoint, one on each side.
 *   - the pulli ் is a zero-width mark placed by the font's GPOS table; with
 *     no shaper it lands over the following letter instead of its own.
 *
 * Doing that properly means a shaping engine. The browser already has one —
 * it is what draws Tamil on every page of this site — so the text is laid out
 * on a canvas and the result goes into the PDF as an image. The cell is then
 * a picture of the name rather than selectable text, which for a price list
 * that is printed and sent over WhatsApp costs nothing.
 *
 * The font is shipped with the app rather than left to the device, so a sheet
 * built on a machine with no Tamil font still prints Tamil instead of boxes,
 * and two people printing the same list get the same page.
 */

/**
 * Noto Serif Tamil, served from the site rather than from Google's CDN: the
 * price list has to build the same way on a counter PC with no internet as it
 * does here, and a webfont request that quietly fails would leave the column
 * in whatever face the machine happens to have.
 */
const FONT_FAMILY = "SoundwaveTamil";
const FONT_URL = "/assets/fonts/NotoSerifTamil-Regular.ttf";

/** Device pixels per PDF point. Enough that the text stays sharp in print. */
const SCALE = 4;

/** Tamil block, plus the ₹/superscript odds and ends the names use. */
const TAMIL_RANGE = /[஀-௿]/;

/** True when a string has anything in it that helvetica cannot draw. */
export function hasTamil(text: string | null | undefined): boolean {
  return !!text && TAMIL_RANGE.test(text);
}

let fontLoad: Promise<boolean> | null = null;

/**
 * Loads the bundled Tamil face into the document, once per page load.
 *
 * Resolves false when the font cannot be had — an old browser with no
 * FontFace, or a missing file. That is not fatal: the canvas falls back to
 * whatever Tamil font the device has, which is usually present on the phones
 * and Windows machines this is run from, and the shaping is the browser's
 * either way.
 */
export function ensureTamilFont(): Promise<boolean> {
  if (fontLoad) return fontLoad;

  fontLoad = (async () => {
    if (typeof document === "undefined" || typeof FontFace === "undefined") {
      return false;
    }
    try {
      const face = new FontFace(FONT_FAMILY, `url(${FONT_URL})`);
      await face.load();
      document.fonts.add(face);
      return true;
    } catch {
      return false;
    }
  })();

  return fontLoad;
}

export interface TamilImage {
  dataUrl: string;
  /** In PDF points, the size the image should be drawn at. */
  width: number;
  height: number;
}

interface RenderOptions {
  /** The column width to wrap inside, in points. */
  maxWidth: number;
  /** Matching the surrounding table's font size, in points. */
  fontSize: number;
  /** Any CSS colour. The table body is near-black; headings are cream. */
  color?: string;
  bold?: boolean;
}

/**
 * One canvas, reused. Creating one per product name is a lot of garbage for
 * a 130-row price list.
 */
let scratch: HTMLCanvasElement | null = null;

function context(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!scratch) scratch = document.createElement("canvas");
  return scratch.getContext("2d");
}

/**
 * A Tamil syllable, or a single character of anything else.
 *
 * Breaking a long word between a consonant and the vowel sign or pulli that
 * belongs to it would put half a letter at the end of one line, so the marks
 * that follow a letter travel with it.
 */
function clusters(word: string): string[] {
  const out: string[] = [];
  for (const ch of word) {
    if (out.length && /[ା-୍ா-்ௗ‌‍]/.test(ch)) {
      out[out.length - 1] += ch;
    } else {
      out.push(ch);
    }
  }
  return out;
}

/**
 * Greedy word wrap, measured with the real font.
 *
 * A word wider than the column is broken rather than allowed to run past the
 * cell border — Tamil words in this catalogue are short, but
 * "தரைச்சக்கரம்" in a narrow column would otherwise overflow.
 */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const fits = (candidate: string) =>
    ctx.measureText(candidate).width <= maxWidth;

  /** Splits one over-wide word, returning the remainder for the next line. */
  const breakWord = (word: string) => {
    let chunk = "";
    for (const cluster of clusters(word)) {
      if (chunk && !fits(chunk + cluster)) {
        lines.push(chunk);
        chunk = cluster;
      } else {
        chunk += cluster;
      }
    }
    return chunk;
  };

  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (fits(candidate)) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = fits(word) ? word : breakWord(word);
  }
  if (line) lines.push(line);

  return lines.length ? lines : [""];
}

const cache = new Map<string, TamilImage | null>();

/**
 * Draws a Tamil string to a transparent PNG sized in PDF points.
 *
 * Returns null for an empty string or outside the browser. The result is
 * cached: several products share a Tamil name, and the same name is often
 * asked for again when a superadmin generates a second sheet.
 */
export function renderTamil(
  text: string | null | undefined,
  { maxWidth, fontSize, color = "#1a1a1a", bold = false }: RenderOptions
): TamilImage | null {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  if (!value) return null;

  const key = `${value}|${maxWidth.toFixed(1)}|${fontSize}|${color}|${bold}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const result = (() => {
    const ctx = context();
    if (!ctx || !scratch) return null;

    // Measure in device pixels so the wrap matches what is drawn.
    const px = fontSize * SCALE;
    const font = `${bold ? "600 " : ""}${px}px "${FONT_FAMILY}", "Noto Serif Tamil", "Nirmala UI", "Latha", serif`;
    ctx.font = font;
    const lines = wrap(ctx, value, maxWidth * SCALE);

    // Tamil uses both ends of the line — ீ and ை reach up, ு and ூ and the
    // serif face's tails hang well down — so the box is measured from the ink
    // itself rather than from a guess at the font's metrics. Taking the
    // largest ascent and descent across the lines keeps the baselines evenly
    // spaced while guaranteeing nothing is cut off at either edge.
    const lineHeight = px * 1.35;
    let widest = 0;
    let ascent = 0;
    let descent = 0;
    for (const line of lines) {
      const metrics = ctx.measureText(line);
      widest = Math.max(widest, metrics.width);
      // Older engines report neither; the font's own extremes are the
      // fallback, and they are generous rather than tight.
      ascent = Math.max(ascent, metrics.actualBoundingBoxAscent ?? px * 1.07);
      descent = Math.max(descent, metrics.actualBoundingBoxDescent ?? px * 0.5);
    }

    // Only as large as the ink: the canvas is a transparent PNG that ends up
    // in the file, and a 130-row list pays for every blank pixel.
    scratch.width = Math.max(1, Math.ceil(Math.min(widest, maxWidth * SCALE)));
    scratch.height = Math.max(
      1,
      Math.ceil((lines.length - 1) * lineHeight + ascent + descent)
    );

    // Resizing the canvas resets the context, so the font is set again.
    ctx.clearRect(0, 0, scratch.width, scratch.height);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = "alphabetic";
    lines.forEach((line, index) => {
      ctx.fillText(line, 0, ascent + index * lineHeight);
    });

    return {
      dataUrl: scratch.toDataURL("image/png"),
      width: scratch.width / SCALE,
      height: scratch.height / SCALE,
    };
  })();

  cache.set(key, result);
  return result;
}
