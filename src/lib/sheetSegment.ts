/**
 * Cutting a prepared sheet into the individual pictures the recogniser reads.
 *
 * TrOCR reads one line. The sheet is a table. This module is the bridge.
 *
 * COLUMNS ARE FOUND BEFORE ROWS, and that ordering is the whole design. The
 * obvious way round -- band the rows by counting ink across each scanline,
 * then split those bands into columns -- cannot be made to work on a
 * photograph. A phone photo of a notebook has the dark edge of the book, a
 * shadow, or a thumb running the full height of the frame, and any one of
 * those puts ink on every single scanline. The row profile is then solid from
 * top to bottom and the entire page comes back as one row, however well the
 * printed grid has been erased. That is exactly what happened on the first
 * real sheet tried.
 *
 * Finding the columns first fixes it, because the product column is interior
 * to the page: band the rows by looking ONLY inside it and the border cannot
 * reach. It also happens to be the right definition -- a row of this table is
 * a line of writing in the product column, not a line of anything else.
 *
 * Columns themselves are identified by role rather than counted from the
 * left. Order sheets are written in whatever ruled book the shop had: the
 * number of dividers varies, the left margin may be one red line or two, the
 * last few columns are usually blank, and -- as on the sheet this was built
 * against -- there may be no divider at all between the serial number and the
 * product name. What is stable is the SHAPE: one column with far more ink
 * than any other, with narrow numeric ones to its right.
 *
 * Not every sheet has a printed table. When no dividers are found the row is
 * emitted as one wide crop and the caller parses the recognised line
 * right-to-left, which is what `priceListExtractor.ts` already does for
 * vendor PDFs.
 */

import type { PreparedSheet } from "./sheetImagePrep";

/** Ink on a scanline below this share of the product column is not a row. */
const ROW_INK_THRESHOLD = 0.012;
/** Rows closer together than this share of the page height are one row. */
const ROW_MERGE_GAP = 0.006;
/** A band shorter than this share of the page height is a smudge. */
const MIN_ROW_HEIGHT = 0.008;
/** A cell with fewer lit pixels than this is blank; do not waste a pass on it. */
const MIN_CELL_INK = 12;
/** A slab with less than this share of the page's ink is an unused column. */
const SLAB_INK_SHARE = 0.015;
/** Ignored at each edge when profiling columns: page edge, shadow, thumb. */
const EDGE_MARGIN = 0.03;

export type CellRole = "serial" | "name" | "price" | "quantity" | "line";

export interface SheetCell {
  role: CellRole;
  /** Data URL of the crop, fed to the recogniser and shown in the review table. */
  image: string;
  /** Lit pixels in the crop. Zero means the cell was blank and was not read. */
  inkPixels: number;
}

export interface SheetRow {
  index: number;
  top: number;
  bottom: number;
  /** The full-width strip, shown beside the parsed row so it can be checked. */
  stripImage: string;
  cells: SheetCell[];
}

export interface SegmentedSheet {
  rows: SheetRow[];
  /** False when no printed table was found and rows are single `line` crops. */
  hasColumns: boolean;
}

export interface Band {
  top: number;
  bottom: number;
}

export interface Slab {
  /** Both in the straightened coordinate `x - y*columnSlant`. */
  left: number;
  right: number;
  ink: number;
}

/** The part of a {@link PreparedSheet} the geometry actually reads. */
export type SheetGeometry = Pick<
  PreparedSheet,
  "writing" | "width" | "height" | "verticalRules" | "columnSlant"
>;

/**
 * Where a straightened x sits on a given scanline.
 *
 * The dividers lean, so a slab is a parallelogram and not a rectangle.
 * Everything here works in the straightened coordinate, where the boundaries
 * are constant, and converts back only to read pixels.
 */
const atRow = (boundary: number, y: number, slant: number) =>
  Math.round(boundary + y * slant);

export type Columns = Record<Exclude<CellRole, "line">, Slab | null>;

/** Ink per straightened-x bucket, over the whole page. */
function columnProfile(sheet: SheetGeometry): Int32Array {
  const { writing, width, height, columnSlant } = sheet;
  const profile = new Int32Array(width + 2);
  const marginY = Math.round(height * EDGE_MARGIN);
  for (let y = marginY; y < height - marginY; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (!writing[row + x]) continue;
      const b = Math.round(x - y * columnSlant);
      if (b >= 0 && b < profile.length) profile[b] += 1;
    }
  }
  return profile;
}

/**
 * Splits the serial number off the front of the product column.
 *
 * Most sheets rule a line between the two. The one this was built against
 * does not -- the numbers just sit in the left margin of the same column --
 * and losing them matters more than anything else here, because the serial is
 * the only signal that identifies a product exactly rather than by
 * resemblance.
 *
 * So when no divider is present the gap is found instead: down the left of
 * the column there is a vertical corridor of white between the numbers and
 * the start of the names, because every row has one. It is only accepted if
 * it is genuinely empty relative to the column's own ink, otherwise a column
 * with no serials at all would be cut arbitrarily in two.
 */
function splitSerial(profile: Int32Array, slab: Slab): { serial: Slab; name: Slab } | null {
  const total = slab.ink;
  if (total <= 0) return null;

  // Smoothed, because the gap between two columns of handwriting is a dip a
  // few tens of pixels wide, and the raw profile inside it is spiky enough
  // to hide where the middle of it is.
  const smooth = new Float64Array(profile.length);
  const radius = 5;
  for (let x = slab.left; x <= slab.right; x += 1) {
    let sum = 0;
    let n = 0;
    for (let k = -radius; k <= radius; k += 1) {
      const v = profile[x + k];
      if (v !== undefined) {
        sum += v;
        n += 1;
      }
    }
    smooth[x] = n ? sum / n : 0;
  }

  /*
   * The cut is the quietest place that still leaves a believable serial
   * column behind it.
   *
   * Looking for an "empty" corridor does not work, and the reason is worth
   * keeping: the emptiest gap on the left of the page is the paper margin,
   * between the edge and the first digit. It is wider and emptier than the
   * gap between the numbers and the names, so it wins every time, and the
   * column gets cut where there is nothing on either side of it.
   *
   * Requiring a share of the column's ink to the LEFT of the cut rules the
   * margin out -- there is almost nothing over there -- while still allowing
   * the real gap, which has every serial on the page behind it.
   */
  const minShare = total * 0.08;
  const maxShare = total * 0.35;
  let running = 0;
  let best = -1;
  let bestValue = Infinity;
  for (let x = slab.left; x <= slab.right; x += 1) {
    running += profile[x] ?? 0;
    if (running < minShare) continue;
    if (running > maxShare) break;
    if (smooth[x] < bestValue) {
      bestValue = smooth[x];
      best = x;
    }
  }
  if (best < 0) return null;

  // A real boundary has writing on both sides of it. Without this a column
  // of names and no serials at all would be cut at its own quietest point,
  // which is just the gap between two words.
  const reach = 70;
  let peakLeft = 0;
  let peakRight = 0;
  for (let x = Math.max(slab.left, best - reach); x < best; x += 1) {
    peakLeft = Math.max(peakLeft, smooth[x]);
  }
  for (let x = best + 1; x <= Math.min(slab.right, best + reach); x += 1) {
    peakRight = Math.max(peakRight, smooth[x]);
  }
  if (bestValue > Math.min(peakLeft, peakRight) * 0.55) return null;

  /*
   * The serial column starts at the digits, not at the paper's edge.
   *
   * To the left of the numbers there is usually the red margin rule, and
   * whatever of it survives stripping is still ink. Left in, it sets the
   * left edge of every serial crop, so the model is handed a picture that is
   * three-quarters empty margin with two small digits in the corner -- and
   * reads nothing. Walking back from the cut to the first real gap finds the
   * digits themselves.
   */
  const peakSerial = (() => {
    let peak = 0;
    for (let x = slab.left; x < best; x += 1) peak = Math.max(peak, smooth[x]);
    return peak;
  })();
  let serialLeft = slab.left;
  let gap = 0;
  for (let x = best - 1; x > slab.left; x -= 1) {
    if (smooth[x] < peakSerial * 0.2) {
      gap += 1;
      if (gap >= 14) {
        serialLeft = x + gap;
        break;
      }
    } else {
      gap = 0;
    }
  }

  let serialInk = 0;
  for (let x = serialLeft; x < best; x += 1) serialInk += profile[x] ?? 0;

  return {
    serial: { left: serialLeft, right: best - 1, ink: serialInk },
    name: { left: best, right: slab.right, ink: total - serialInk },
  };
}

/**
 * Column slabs, keyed by what they are rather than where they are.
 *
 * Returns null when the sheet has no usable printed table, which tells the
 * caller to fall back to whole-line recognition.
 */
export function findColumns(sheet: SheetGeometry): Columns | null {
  const { width, verticalRules } = sheet;
  if (verticalRules.length < 1) return null;

  const profile = columnProfile(sheet);
  const margin = Math.round(width * EDGE_MARGIN);

  const edges = [margin, ...verticalRules.filter((x) => x > margin && x < width - margin), width - margin];
  const slabs: Slab[] = [];
  // Kept clear of the dividers themselves. A line is two or three pixels of
  // hard black with a soft edge either side, and the soft edge survives both
  // the stripping and the grid whiteout -- arriving at the left of the price
  // crop as a tall thin mark that reads as a 1. "45" became "145".
  const inset = 5;
  for (let i = 0; i < edges.length - 1; i += 1) {
    const left = edges[i] + 1 + (i > 0 ? inset : 0);
    const right = edges[i + 1] - 1 - (i < edges.length - 2 ? inset : 0);
    if (right - left < 8) continue; // the gap between a double margin rule
    let ink = 0;
    for (let x = left; x <= right; x += 1) ink += profile[x] ?? 0;
    slabs.push({ left, right, ink });
  }
  if (!slabs.length) return null;

  const totalInk = slabs.reduce((sum, slab) => sum + slab.ink, 0);
  if (totalInk === 0) return null;
  // Drop the blank columns at the right-hand side and the paper margin at the
  // left, so "the slab after the name" means the next USED one.
  const used = slabs.filter((slab) => slab.ink / totalInk >= SLAB_INK_SHARE);
  if (!used.length) return null;

  // The product column: the one carrying the most ink. Width alone is not
  // enough -- a wide blank margin beats a tightly written name column -- and
  // ink is what actually distinguishes words from emptiness.
  let nameIndex = 0;
  used.forEach((slab, index) => {
    if (slab.ink > used[nameIndex].ink) nameIndex = index;
  });

  let serial: Slab | null = nameIndex > 0 ? used[nameIndex - 1] : null;
  let name = used[nameIndex];
  if (!serial) {
    const split = splitSerial(profile, name);
    if (split) {
      serial = split.serial;
      name = split.name;
    }
  }

  const rightOfName = used.slice(nameIndex + 1);
  return {
    serial,
    name,
    price: rightOfName[0] ?? null,
    quantity: rightOfName[1] ?? null,
  };
}

/**
 * Bands of consecutive scanlines carrying writing, measured inside one slab.
 *
 * Restricted to the product column on purpose; see the note at the top of the
 * file. Passing the whole page here is what produced a single row.
 */
export function findRowBands(sheet: SheetGeometry, slab: Slab | null): Band[] {
  const { writing, width, height, columnSlant } = sheet;
  const left = slab ? slab.left : Math.round(width * EDGE_MARGIN);
  const right = slab ? slab.right : Math.round(width * (1 - EDGE_MARGIN));
  const span = Math.max(1, right - left);

  const profile = new Int32Array(height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const x0 = Math.max(0, atRow(left, y, columnSlant));
    const x1 = Math.min(width - 1, atRow(right, y, columnSlant));
    let count = 0;
    for (let x = x0; x <= x1; x += 1) count += writing[row + x];
    profile[y] = count;
  }

  /*
   * The cut-off is taken from the profile rather than fixed.
   *
   * Between two lines of writing the count does not fall to zero: a few
   * fragments of ruled line always survive, and they put a floor of a dozen
   * pixels under every scanline on the page. A fixed threshold low enough to
   * catch a sparse row ("61  2000 wala") sits under that floor, so every
   * scanline counts as occupied and the page comes back as one band -- which
   * is precisely what it did.
   *
   * Reading the floor and the peaks off the profile makes it self-adjusting:
   * a quarter of the way up from one to the other separates them with room
   * to spare on both sides, whatever the sheet.
   */
  const sorted = Int32Array.from(profile).sort();
  const low = sorted[Math.floor(sorted.length * 0.25)];
  const high = sorted[Math.floor(sorted.length * 0.92)];
  const minInk = Math.max(
    3,
    Math.round(span * ROW_INK_THRESHOLD),
    Math.round(low + (high - low) * 0.15)
  );

  const bands: Band[] = [];
  let start = -1;
  for (let y = 0; y <= height; y += 1) {
    const on = y < height && profile[y] >= minInk;
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      bands.push({ top: start, bottom: y - 1 });
      start = -1;
    }
  }

  // Descenders and the dots of i's break a single line of writing into two or
  // three bands with hairline gaps. Close those before anything downstream
  // mistakes them for separate order lines.
  const mergeGap = Math.max(2, Math.round(height * ROW_MERGE_GAP));
  const merged: Band[] = [];
  bands.forEach((band) => {
    const previous = merged[merged.length - 1];
    if (previous && band.top - previous.bottom <= mergeGap) {
      previous.bottom = band.bottom;
      return;
    }
    merged.push({ ...band });
  });

  const minHeight = Math.max(6, Math.round(height * MIN_ROW_HEIGHT));
  const kept = merged.filter((band) => band.bottom - band.top + 1 >= minHeight);
  return splitTallBands(kept, profile);
}

/**
 * Cuts apart bands that are plainly more than one line.
 *
 * Perspective makes the far end of the page tighter than the near end, so on
 * the same sheet the rows at the top can be closer together than the gap that
 * joins a letter to its own dot lower down. No single merge distance gets
 * both, and erring either way is bad: too generous and four order lines
 * arrive as one, too mean and every descender becomes its own row.
 *
 * Judging afterwards, by comparing each band against the median, avoids
 * choosing. A band around twice the typical height is two lines, and the
 * quietest scanlines inside it are where they meet.
 */
function splitTallBands(bands: Band[], profile: Int32Array): Band[] {
  if (bands.length < 3) return bands;

  const heights = bands.map((b) => b.bottom - b.top + 1).sort((a, b) => a - b);
  const median = heights[heights.length >> 1];
  if (median <= 0) return bands;

  const out: Band[] = [];
  bands.forEach((band) => {
    const height = band.bottom - band.top + 1;
    const pieces = Math.round(height / median);
    if (pieces < 2 || height < median * 1.6) {
      out.push(band);
      return;
    }

    // Cut at the quietest scanline near each expected boundary, searching a
    // window rather than taking the arithmetic split, so the cut lands in
    // white space and not through the middle of a word.
    const cuts: number[] = [];
    for (let piece = 1; piece < pieces; piece += 1) {
      const target = band.top + Math.round((height * piece) / pieces);
      const window = Math.max(4, Math.round(median * 0.35));
      let bestY = target;
      let bestInk = Infinity;
      for (let y = target - window; y <= target + window; y += 1) {
        if (y <= band.top || y >= band.bottom) continue;
        if (profile[y] < bestInk) {
          bestInk = profile[y];
          bestY = y;
        }
      }
      cuts.push(bestY);
    }

    let start = band.top;
    cuts.forEach((cut) => {
      out.push({ top: start, bottom: cut });
      start = cut + 1;
    });
    out.push({ top: start, bottom: band.bottom });
  });

  return out;
}

/**
 * Builds the picture handed to the recogniser.
 *
 * Three things happen that each measurably change what comes back:
 *
 *   - The printed grid is painted out. Those pixels are in `ink` but not in
 *     `writing`, so the difference between the two masks is exactly the grid.
 *     Leaving them in makes the model emit long dashes and underscores.
 *   - The crop is tightened onto the writing's own bounding box. TrOCR
 *     squashes whatever it is given to a fixed square, so a cell that is
 *     mostly empty arrives as unreadably small writing.
 *   - Contrast is stretched to full black-on-white. IAM, which the model was
 *     trained on, is clean scans; a grey phone photo is out of distribution.
 */
function cropCell(
  sheet: PreparedSheet,
  gray: Uint8ClampedArray,
  band: Band,
  left: number,
  right: number,
  limit: { top: number; bottom: number }
): { image: string; inkPixels: number } {
  const { ink, writing, width, columnSlant } = sheet;

  /*
   * Which band of ink in this column belongs to this row.
   *
   * Not simply "all the ink between the two neighbouring rows". The bands
   * are measured in the product column, and the other columns are not
   * written on the same baseline -- a serial sits a little high, a price a
   * little low, and towards the foot of a page people stop lining things up
   * altogether. Taking the bounding box of everything in the window then
   * spans from one row's digits to the next row's, and the crop comes out as
   * two half-rows with nothing readable in either.
   *
   * So the ink is grouped into clusters down the window and the one that
   * overlaps this row best is taken. A column that drifts half a line out of
   * step still gets cropped to one entry.
   */
  const lineInk = new Int32Array(limit.bottom - limit.top + 1);
  for (let y = limit.top; y <= limit.bottom; y += 1) {
    const row = y * width;
    const a = Math.max(0, atRow(left, y, columnSlant));
    const b = Math.min(width - 1, atRow(right, y, columnSlant));
    let count = 0;
    for (let x = a; x <= b; x += 1) count += writing[row + x];
    lineInk[y - limit.top] = count;
  }

  const clusters: { top: number; bottom: number }[] = [];
  const gapTolerance = 4;
  let runStart = -1;
  let lastOn = -1;
  for (let i = 0; i <= lineInk.length; i += 1) {
    const on = i < lineInk.length && lineInk[i] > 0;
    if (on) {
      if (runStart < 0) runStart = i;
      lastOn = i;
    } else if (runStart >= 0 && (i - lastOn > gapTolerance || i === lineInk.length)) {
      clusters.push({ top: limit.top + runStart, bottom: limit.top + lastOn });
      runStart = -1;
    }
  }
  if (!clusters.length) return { image: "", inkPixels: 0 };

  const overlapWith = (c: { top: number; bottom: number }) =>
    Math.min(c.bottom, band.bottom) - Math.max(c.top, band.top);
  const centre = (band.top + band.bottom) / 2;
  let chosen = clusters[0];
  clusters.forEach((cluster) => {
    const better = overlapWith(cluster) - overlapWith(chosen);
    if (better > 0) {
      chosen = cluster;
      return;
    }
    // Nothing overlaps on a badly offset column; fall back to the nearest.
    if (better === 0 && overlapWith(cluster) < 0) {
      const d = Math.abs((cluster.top + cluster.bottom) / 2 - centre);
      const dc = Math.abs((chosen.top + chosen.bottom) / 2 - centre);
      if (d < dc) chosen = cluster;
    }
  });

  let minX = width;
  let maxX = 0;
  let minY = chosen.bottom;
  let maxY = chosen.top;
  let inkPixels = 0;
  for (let y = chosen.top; y <= chosen.bottom; y += 1) {
    const row = y * width;
    const a = Math.max(0, atRow(left, y, columnSlant));
    const b = Math.min(width - 1, atRow(right, y, columnSlant));
    for (let x = a; x <= b; x += 1) {
      if (!writing[row + x]) continue;
      inkPixels += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (inkPixels < MIN_CELL_INK) return { image: "", inkPixels: 0 };

  // Tighten onto the writing, then give it room to breathe -- the model reads
  // a line with a little white around it far better than a flush one.
  // Breathing room, but never past halfway to the neighbouring row. Lines on
  // a notebook page are close enough that a fixed margin reaches into the
  // next one, and a crop with the top of the following line hanging off its
  // bottom edge is read as a second line of text.
  const padY = Math.round((maxY - minY + 1) * 0.3);
  const padX = Math.round((maxY - minY + 1) * 0.25);
  const x0 = Math.max(0, minX - padX);
  const x1 = Math.min(width - 1, maxX + padX);
  const y0 = Math.max(0, limit.top, minY - padY);
  const y1 = Math.min(sheet.height - 1, limit.bottom, maxY + padY);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w < 4 || h < 4) return { image: "", inkPixels: 0 };

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const out = ctx.createImageData(w, h);

  // The stretch bounds come from the writing itself, so a pale pencil line
  // ends up as black rather than mid-grey.
  let darkest = 255;
  let lightest = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const v = gray[y * width + x];
      if (v < darkest) darkest = v;
      if (v > lightest) lightest = v;
    }
  }
  const span = Math.max(1, lightest - darkest);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const source = (y + y0) * width + (x + x0);
      const isGrid = ink[source] === 1 && writing[source] === 0;
      const stretched = isGrid
        ? 255
        : Math.max(0, Math.min(255, ((gray[source] - darkest) / span) * 255));
      const target = (y * w + x) * 4;
      out.data[target] = stretched;
      out.data[target + 1] = stretched;
      out.data[target + 2] = stretched;
      out.data[target + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);

  // PNG, not JPEG: these are near-bilevel images and JPEG rings around every
  // stroke, which the model reads as extra marks.
  return { image: canvas.toDataURL("image/png"), inkPixels };
}

/** The row as the user sees it on the page, for the review table. */
function cropStrip(sheet: PreparedSheet, band: Band): string {
  const pad = Math.round((band.bottom - band.top + 1) * 0.2);
  const y0 = Math.max(0, band.top - pad);
  const y1 = Math.min(sheet.height - 1, band.bottom + pad);
  const canvas = document.createElement("canvas");
  canvas.width = sheet.width;
  canvas.height = y1 - y0 + 1;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(sheet.canvas, 0, -y0);
  return canvas.toDataURL("image/jpeg", 0.75);
}

export function segmentSheet(sheet: PreparedSheet): SegmentedSheet {
  const columns = findColumns(sheet);
  const bands = findRowBands(sheet, columns?.name ?? null);

  // Re-read the greyscale once rather than per cell; `cropCell` is called up
  // to four times a row and getImageData is the expensive part.
  const ctx = sheet.canvas.getContext("2d", { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, sheet.width, sheet.height);
  const gray = new Uint8ClampedArray(sheet.width * sheet.height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = (data[i] * 0.45 + data[i + 1] * 0.45 + data[i + 2] * 0.1) as number;
  }

  const rows: SheetRow[] = bands.map((band, index) => {
    const cells: SheetCell[] = [];
    const previous = bands[index - 1];
    const next = bands[index + 1];
    const limit = {
      top: previous ? Math.ceil((previous.bottom + band.top) / 2) : 0,
      bottom: next ? Math.floor((band.bottom + next.top) / 2) : sheet.height - 1,
    };

    if (!columns) {
      const margin = Math.round(sheet.width * EDGE_MARGIN);
      const crop = cropCell(sheet, gray, band, margin, sheet.width - 1 - margin, limit);
      cells.push({ role: "line", ...crop });
    } else {
      (["serial", "name", "price", "quantity"] as const).forEach((role) => {
        const slab = columns[role];
        if (!slab) return;
        const crop = cropCell(sheet, gray, band, slab.left, slab.right, limit);
        cells.push({ role, ...crop });
      });
    }

    return {
      index,
      top: band.top,
      bottom: band.bottom,
      stripImage: cropStrip(sheet, band),
      cells,
    };
  });

  // A band with nothing in any cell was a stray mark between rows.
  return {
    rows: rows.filter((row) => row.cells.some((cell) => cell.inkPixels > 0)),
    hasColumns: Boolean(columns),
  };
}
