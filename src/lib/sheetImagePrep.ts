/**
 * Turning a photograph of a handwritten order sheet into something a
 * line-recognition model can read.
 *
 * TrOCR (see `handwritingOcr.ts`) reads ONE line of writing at a time. It has
 * no idea what a table is. So everything between "the counter photographed a
 * page of a notebook" and "here is a picture of a single cell" has to happen
 * here and in `sheetSegment.ts`, with nothing but a canvas.
 *
 * The hard-won lesson, from the first version of this file failing completely
 * on the first real photograph: A PHONE PHOTO IS NOT A SCAN. It has
 * perspective. The page is a rectangle held at an angle, so its rows and its
 * columns do not tilt by the same amount and neither of them is square to the
 * pixels. On the sheet that broke it, the printed column dividers leaned
 * about three degrees while the ruled lines stayed nearly flat.
 *
 * Anything that assumes axis alignment therefore finds nothing:
 *
 *   - A rule is only a "long horizontal run" if it is horizontal. Slanted two
 *     degrees across 1100px it drifts 39 rows, so the longest run on any one
 *     scanline is about 30px. Every ruled line survived, bridged the gaps
 *     between the rows, and the whole page came out as a single row.
 *   - The column dividers likewise never formed a tall vertical run, so no
 *     columns were found at all and each "row" was read as one wide crop.
 *
 * So nothing here assumes the page is square. Both line directions are
 * measured first, and everything afterwards works along them.
 */

/**
 * The long edge every sheet is scaled to before analysis.
 *
 * Big enough that a notebook row is 40-70px tall, which is roughly what TrOCR
 * wants after its own resize; small enough that the per-pixel passes below
 * stay instant. Photos smaller than this are scaled UP -- a 600px-wide photo
 * produces cell crops too coarse to read, and interpolating is better than
 * handing the model eight-pixel-tall writing.
 */
const TARGET_LONG_EDGE = 2000;

/** Angles searched for the two line directions, in degrees. */
const MAX_TILT = 6;
const TILT_STEP = 0.1;

/** A scanline this full, once rows are level, is a ruled line and not writing. */
const H_RULE_FILL = 0.4;
/** A column this full, in the dividers' own direction, is a printed divider. */
const V_RULE_FILL = 0.25;

export interface PreparedSheet {
  /** The row-levelled, contrast-corrected page, for showing crops to the user. */
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** 1 where there is ink, printed grid included. Rule finding runs on this. */
  ink: Uint8Array;
  /** The same mask with the printed grid erased, so only handwriting is left. */
  writing: Uint8Array;
  /**
   * Where each printed divider crosses the TOP of the page, left to right.
   * With {@link columnSlant} this gives its x at any y.
   */
  verticalRules: number[];
  /**
   * How far the dividers lean, as dx/dy. Rotating the page levels the rows
   * but perspective means the columns are left with a tilt of their own, so
   * it has to be carried rather than assumed away.
   */
  columnSlant: number;
  /** Degrees the page was rotated by, for the diagnostics line in the UI. */
  deskewedBy: number;
}

/** Decodes the file and scales it so the long edge is {@link TARGET_LONG_EDGE}. */
async function loadScaled(file: File | Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = TARGET_LONG_EDGE / Math.max(bitmap.width, bitmap.height);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas;
}

/**
 * Luminance, but weighted against blue.
 *
 * A notebook's ruled lines are pale cyan and the pen is dark blue, and plain
 * luminance puts those closer together than they look to the eye. Pulling the
 * blue channel down separates them: pale blue goes light, blue-black ink
 * stays dark.
 */
function toGray(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = (data[i] * 0.45 + data[i + 1] * 0.45 + data[i + 2] * 0.1) as number;
  }
  return gray;
}

/**
 * Sauvola-style local thresholding over integral images.
 *
 * A single global cut-off (Otsu) is what you reach for first, and it fails on
 * exactly the photos people actually take: one shadowed edge and the whole of
 * that side binarises to solid black. Judging each pixel against the mean and
 * spread of its own neighbourhood survives that, and the integral images keep
 * it to two passes regardless of window size.
 */
export function __binarize(
  gray: Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array {
  const window = Math.max(15, Math.round(Math.min(width, height) / 40)) | 1;
  const radius = window >> 1;
  const k = 0.2;
  const R = 128; // dynamic range of the standard deviation, per Sauvola

  const stride = width + 1;
  const sum = new Float64Array(stride * (height + 1));
  const sumSq = new Float64Array(stride * (height + 1));

  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    let rowSumSq = 0;
    for (let x = 0; x < width; x += 1) {
      const v = gray[y * width + x];
      rowSum += v;
      rowSumSq += v * v;
      sum[(y + 1) * stride + (x + 1)] = sum[y * stride + (x + 1)] + rowSum;
      sumSq[(y + 1) * stride + (x + 1)] = sumSq[y * stride + (x + 1)] + rowSumSq;
    }
  }

  const ink = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const area = (y1 - y0 + 1) * (x1 - x0 + 1);
      const a = y1 + 1;
      const b = y0;
      const c = x1 + 1;
      const d = x0;
      const s =
        sum[a * stride + c] - sum[b * stride + c] - sum[a * stride + d] + sum[b * stride + d];
      const sq =
        sumSq[a * stride + c] - sumSq[b * stride + c] - sumSq[a * stride + d] + sumSq[b * stride + d];
      const mean = s / area;
      const variance = Math.max(0, sq / area - mean * mean);
      const threshold = mean * (1 + k * (Math.sqrt(variance) / R - 1));
      if (gray[y * width + x] < threshold) ink[y * width + x] = 1;
    }
  }
  return ink;
}

/**
 * Ink coordinates worth measuring an angle from.
 *
 * Two things are thrown out, and both matter. The outer border goes because a
 * photographed page has the dark edge of the book, a shadow or a thumb down
 * one side, and that is a huge block of ink that belongs to no line. Columns
 * that are almost solid ink go for the same reason -- on the sheet that broke
 * this file, the black band down the left was a greater weight of ink than
 * all the handwriting put together and it pinned the estimate at zero.
 */
export function __sampleInk(
  ink: Uint8Array,
  width: number,
  height: number
): { xs: Int32Array; ys: Int32Array } {
  const columnInk = new Int32Array(width);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) columnInk[x] += ink[row + x];
  }

  const marginX = Math.round(width * 0.04);
  const marginY = Math.round(height * 0.04);
  const solid = Math.round(height * 0.5);

  const xs: number[] = [];
  const ys: number[] = [];
  // Every scanline, not every other one. Sampling on a stride is a trap here:
  // with step 2 the only y values present are even, so at an angle of exactly
  // zero every sample lands in an even bucket and the profile is twice as
  // concentrated as it has any right to be. That artifact beat every real
  // angle and pinned the estimate at zero on the first photograph tried.
  const step = 1;
  for (let y = marginY; y < height - marginY; y += step) {
    const row = y * width;
    for (let x = marginX; x < width - marginX; x += step) {
      if (!ink[row + x]) continue;
      if (columnInk[x] >= solid) continue;
      xs.push(x);
      ys.push(y);
    }
  }
  return { xs: Int32Array.from(xs), ys: Int32Array.from(ys) };
}

/**
 * The tilt, in degrees, that makes a projection sharpest.
 *
 * Shearing rather than rotating: for a small angle the pixel at (x, y)
 * projects to `y - x·tan0` across the page, or `x - y·tan0` down it, so one
 * pass over the ink per candidate angle is enough and the image is never
 * actually transformed.
 *
 * "Sharpest" is the sum of squared bucket counts. Lines and rows of writing
 * pile into few buckets, which squares large; at the wrong angle they smear
 * across many, which does not.
 */
function bestTilt(
  xs: Int32Array,
  ys: Int32Array,
  span: number,
  across: "rows" | "columns"
): number {
  let best = 0;
  let bestScore = -1;
  const pad = Math.ceil(Math.tan((MAX_TILT * Math.PI) / 180) * span) + 2;
  const buckets = new Float64Array(span + 2 * pad + 2);

  for (let deg = -MAX_TILT; deg <= MAX_TILT + 1e-9; deg += TILT_STEP) {
    buckets.fill(0);
    const tan = Math.tan((deg * Math.PI) / 180);
    for (let i = 0; i < xs.length; i += 1) {
      const value =
        (across === "rows" ? ys[i] - xs[i] * tan : xs[i] - ys[i] * tan) + pad;
      // Split each point between the two buckets it falls between, rather
      // than truncating into one. Truncation rewards whichever angle happens
      // to land on whole pixels -- which is always zero -- by an amount that
      // swamps the difference between a right angle and a wrong one.
      const low = Math.floor(value);
      const frac = value - low;
      buckets[low] += 1 - frac;
      buckets[low + 1] += frac;
    }
    let score = 0;
    for (let i = 0; i < buckets.length; i += 1) score += buckets[i] * buckets[i];
    if (score > bestScore) {
      bestScore = score;
      best = deg;
    }
  }
  return best;
}

function rotate(canvas: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  if (Math.abs(degrees) < 0.05) return canvas;
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  // White, not transparent: the page is paper, and a transparent corner reads
  // as ink once the result is binarised again.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((-degrees * Math.PI) / 180);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
}

/**
 * Erases the notebook's ruled lines.
 *
 * Done in the rules' OWN direction, not scanline by scanline. Levelling the
 * page gets the rows close to flat but perspective leaves a fraction of a
 * degree behind, and that is enough: a rule drifting six pixels across the
 * width never forms a run longer than about 190px on any single scanline, so
 * a run-length test misses every one of them. Binned along their real
 * direction they land in one bucket and are obvious.
 *
 * A bucket holding ink across 40% of the page is a printed line; handwriting
 * never reaches a third. The guard is what stops this gouging the letters: a
 * pixel is only erased if its own column has little ink just above and below
 * it, which is true of a thin horizontal rule and false of the downstroke of
 * a letter crossing one.
 */
function stripHorizontalRules(
  ink: Uint8Array,
  writing: Uint8Array,
  width: number,
  height: number,
  slant: number
): void {
  const pad = Math.ceil(Math.abs(slant) * width) + 2;
  const counts = new Float64Array(height + 2 * pad + 2);
  const bucketOf = (x: number, y: number) => Math.round(y - x * slant) + pad;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (ink[row + x]) counts[bucketOf(x, y)] += 1;
    }
  }

  const minInk = Math.round(width * H_RULE_FILL);
  const isRule = new Uint8Array(counts.length);
  for (let b = 0; b < counts.length; b += 1) if (counts[b] >= minInk) isRule[b] = 1;

  const reach = 5;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (!ink[row + x] || !isRule[bucketOf(x, y)]) continue;
      let above = 0;
      let below = 0;
      for (let d = 2; d <= reach; d += 1) {
        if (y - d >= 0 && ink[(y - d) * width + x]) above += 1;
        if (y + d < height && ink[(y + d) * width + x]) below += 1;
      }
      // Ink continuing both ways is a stroke passing through, so keep it.
      if (above >= 2 && below >= 2) continue;
      writing[row + x] = 0;
    }
  }
}

/**
 * Finds and erases the printed column dividers, along their own direction.
 *
 * They are measured in the sheared frame `x - y·tan(slant)` so that a leaning
 * divider still lands in one bucket. A bucket holding ink down a quarter of
 * the page is a printed line: no handwriting is that tall and that thin.
 */
function stripVerticalRules(
  ink: Uint8Array,
  writing: Uint8Array,
  width: number,
  height: number,
  slant: number
): number[] {
  // Padded, because a line near the left edge binned along a slant produces
  // negative indices -- and dropping those silently is how the black bar of
  // the book's own edge survived, bridging every row on the page.
  const pad = Math.ceil(Math.abs(slant) * height) + 2;
  const counts = new Int32Array(width + 2 * pad + 2);
  const bucketOf = (x: number, y: number) => Math.round(x - y * slant) + pad;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (!ink[row + x]) continue;
      const b = bucketOf(x, y);
      if (b >= 0 && b < counts.length) counts[b] += 1;
    }
  }

  const minInk = Math.round(height * V_RULE_FILL);
  const isRule = new Uint8Array(counts.length);
  for (let b = 0; b < counts.length; b += 1) if (counts[b] >= minInk) isRule[b] = 1;

  // A drawn line is two or three pixels wide, so rule buckets arrive in
  // little clusters. Collapse each to its centre for the column boundaries.
  const rules: number[] = [];
  let clusterStart = -1;
  for (let b = 0; b <= counts.length; b += 1) {
    const on = b < counts.length && isRule[b] === 1;
    if (on && clusterStart < 0) clusterStart = b;
    if (!on && clusterStart >= 0) {
      rules.push(Math.round((clusterStart + b - 1) / 2) - pad);
      clusterStart = -1;
    }
  }

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (!ink[row + x]) continue;
      const b = bucketOf(x, y);
      if (b >= 0 && b < isRule.length && isRule[b]) writing[row + x] = 0;
    }
  }

  return rules;
}

/**
 * Removes whatever the photograph caught that is not the page.
 *
 * A phone photo has a frame full of things the scanner never saw: the dark
 * edge of the book, the shadow in the gutter, the table underneath, a thumb.
 * They are big, solid, and they touch the edge of the picture -- and because
 * they run the height of the frame they put ink on every scanline, which is
 * fatal to finding rows.
 *
 * Rule stripping does not catch them. A rule is thin and uniform; the book's
 * edge is a thick slab whose middle is not even ink, because local
 * thresholding only marks what is darker than its surroundings, so it comes
 * through as two long edges with nothing between them and never looks like a
 * single line.
 *
 * What they do all have in common is that they touch the border of the image
 * and they are far larger than any letter. So: flood out from the frame and
 * erase anything big that is reachable. Writing is interior to a usable
 * photograph, and a letter that does touch the edge is nowhere near the size
 * threshold.
 */
function removeBorderBlobs(
  writing: Uint8Array,
  width: number,
  height: number
): void {
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const component = new Int32Array(1024);

  const flood = (seed: number) => {
    let top = 0;
    let count = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    const pixels: number[] = [];

    stack[top++] = seed;
    seen[seed] = 1;
    while (top > 0) {
      const i = stack[--top];
      const x = i % width;
      const y = (i / width) | 0;
      count += 1;
      pixels.push(i);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      // Four-connected is enough and is markedly cheaper than eight on a
      // mask this size.
      if (x > 0 && writing[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[top++] = i - 1; }
      if (x < width - 1 && writing[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[top++] = i + 1; }
      if (y > 0 && writing[i - width] && !seen[i - width]) { seen[i - width] = 1; stack[top++] = i - width; }
      if (y < height - 1 && writing[i + width] && !seen[i + width]) { seen[i + width] = 1; stack[top++] = i + width; }
    }

    const tall = maxY - minY + 1 > height * 0.15;
    const wide = maxX - minX + 1 > width * 0.5;
    const big = count > width * height * 0.004;
    if (tall || wide || big) pixels.forEach((i) => { writing[i] = 0; });
  };

  for (let x = 0; x < width; x += 1) {
    const bottom = (height - 1) * width + x;
    if (writing[x] && !seen[x]) flood(x);
    if (writing[bottom] && !seen[bottom]) flood(bottom);
  }
  for (let y = 0; y < height; y += 1) {
    const left = y * width;
    const right = y * width + width - 1;
    if (writing[left] && !seen[left]) flood(left);
    if (writing[right] && !seen[right]) flood(right);
  }
  void component;
}

/**
 * Removes the stubs left behind by the printed grid.
 *
 * Rule stripping works on whole lines; what it leaves are the few short
 * pieces where a line was too faint to reach the threshold, or where it ran
 * under a word and the guard that protects letters spared it. They are tiny,
 * but they are not harmless: they sit in the margin to the left of the
 * serials where they stop the column being found at all, and they put a
 * floor under the row profile.
 *
 * They are recognisable by shape. A fragment of a ruled line is a few pixels
 * tall and much wider than it is high; no letter is, at this resolution.
 */
function removeFlatFragments(
  mask: Uint8Array,
  width: number,
  height: number
): void {
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);

  for (let seed = 0; seed < mask.length; seed += 1) {
    if (!mask[seed] || seen[seed]) continue;
    let top = 0;
    stack[top++] = seed;
    seen[seed] = 1;
    const pixels: number[] = [];
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;

    while (top > 0) {
      const i = stack[--top];
      const x = i % width;
      const y = (i / width) | 0;
      pixels.push(i);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[top++] = i - 1; }
      if (x < width - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[top++] = i + 1; }
      if (y > 0 && mask[i - width] && !seen[i - width]) { seen[i - width] = 1; stack[top++] = i - width; }
      if (y < height - 1 && mask[i + width] && !seen[i + width]) { seen[i + width] = 1; stack[top++] = i + width; }
      if (pixels.length > 20000) break; // real writing; not worth measuring
    }

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    if (h <= 5 && w >= 18 && w > h * 5) pixels.forEach((i) => { mask[i] = 0; });
  }
}

/**
 * Removes isolated speckle from the writing mask.
 *
 * Paper grain and JPEG noise survive local thresholding as single lit pixels.
 * They are harmless to the model but they ruin the projection profiles, which
 * is how rows are found -- a scattering of noise fills the gaps between rows
 * and the page merges into one band.
 */
export function despeckle(mask: Uint8Array, width: number, height: number): void {
  const copy = Uint8Array.from(mask);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      if (!copy[i]) continue;
      const neighbours =
        copy[i - width - 1] + copy[i - width] + copy[i - width + 1] +
        copy[i - 1] + copy[i + 1] +
        copy[i + width - 1] + copy[i + width] + copy[i + width + 1];
      if (neighbours <= 1) mask[i] = 0;
    }
  }
}

/**
 * The whole preparation, in the order that works.
 *
 * Note the double binarisation: the mask is built once to measure the tilt,
 * the page is rotated, and then it is built again from the rotated pixels.
 * Rotating the mask instead would be cheaper and is wrong -- a nearest
 * neighbour rotation of a one-bit image shreds thin strokes into dotted
 * lines, and the rule detection that follows then finds nothing.
 */
export async function prepareSheet(file: File | Blob): Promise<PreparedSheet> {
  const scaled = await loadScaled(file);

  const firstPass = __binarize(toGray(scaled), scaled.width, scaled.height);
  const firstSample = __sampleInk(firstPass, scaled.width, scaled.height);
  const rowTilt = bestTilt(firstSample.xs, firstSample.ys, scaled.height, "rows");

  // Level the rows. The columns are measured afterwards, on the rotated page,
  // because perspective leaves them with a tilt of their own that this has
  // not corrected.
  const canvas = rotate(scaled, rowTilt);
  const width = canvas.width;
  const height = canvas.height;
  const ink = __binarize(toGray(canvas), width, height);

  const writing = Uint8Array.from(ink);
  const sample = __sampleInk(ink, width, height);

  // Measured again on the rotated page. The rotation levels the rows as well
  // as one angle can, but a photographed page is a trapezoid, not a tilted
  // rectangle, so a few tenths of a degree always survive -- and a few tenths
  // is the difference between finding the ruled lines and finding none.
  const residualRowTilt = bestTilt(sample.xs, sample.ys, height, "rows");
  stripHorizontalRules(
    ink,
    writing,
    width,
    height,
    Math.tan((residualRowTilt * Math.PI) / 180)
  );

  const columnTiltDegrees = bestTilt(sample.xs, sample.ys, width, "columns");
  const columnSlant = Math.tan((columnTiltDegrees * Math.PI) / 180);
  const verticalRules = stripVerticalRules(ink, writing, width, height, columnSlant);

  removeBorderBlobs(writing, width, height);
  despeckle(writing, width, height);
  removeFlatFragments(writing, width, height);

  return {
    canvas,
    width,
    height,
    ink,
    writing,
    verticalRules,
    columnSlant,
    deskewedBy: rowTilt,
  };
}
