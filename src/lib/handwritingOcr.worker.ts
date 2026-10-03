/// <reference lib="webworker" />
/**
 * The handwriting recogniser, off the main thread.
 *
 * This runs in a worker because it has to. ONNX Runtime's WASM backend is
 * synchronous C++ compiled to WebAssembly: a call occupies the thread it is
 * on until it returns. On the main thread the tab freezes for the whole
 * scan -- no progress bar, no cancel, and the browser eventually offers to
 * kill the page.
 *
 * The model is PaddleOCR PP-OCRv5's recognition network (Apache 2.0); see
 * `handwritingOcrModels.ts` for why it, and not TrOCR. It is a CTC
 * recogniser: one forward pass turns a picture of a line into a grid of
 * per-position character scores, and the text is read straight off it. There
 * is no decoder loop and no language model, which is what makes it both fast
 * and literal -- it reports what the strokes look like rather than what
 * would be a plausible English sentence.
 */

// The WASM-only build: no WebGPU, which this does not use and which would
// otherwise pull in a much larger runtime.
import * as ort from "onnxruntime-web/wasm";
import {
  ALLOWED,
  DICT_URL,
  MODEL_URL,
  REC_HEIGHT,
  type Charset,
} from "./handwritingOcrModels";

/*
 * Where the WebAssembly binary lives.
 *
 * Two things here are deliberate and both were arrived at the hard way.
 *
 * The import is a path into node_modules rather than a package import,
 * because `onnxruntime-web` does not list the .wasm in its `exports` map and
 * the resolver refuses the tidy spelling with "Missing specifier". `?url`
 * makes Vite emit it as an asset and hand back a URL that is right in dev
 * and in a build -- the same trap `priceListExtractor` documents for the
 * pdf.js worker. It is served from our own origin rather than a CDN for the
 * reason the Tamil font is: a counter PC with no internet must still manage
 * a scan once the model is cached.
 *
 * Only the .wasm is named. `onnxruntime-web/wasm` is the "bundle" build,
 * with the JavaScript that instantiates the module compiled into it; giving
 * `wasmPaths` a bare directory instead makes the runtime fetch that glue
 * separately, and in dev Vite rewrites the request to `...mjs?import`, tries
 * to transform a prebuilt Emscripten module, and the lot fails with an
 * unhelpful "no available backend found".
 */
import wasmUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url";

ort.env.wasm.wasmPaths = { wasm: wasmUrl };

/*
 * Threads, when the page is allowed to have them.
 *
 * ONNX Runtime only threads with a SharedArrayBuffer, which needs the
 * document to be cross-origin isolated (COOP + COEP). This site is not, and
 * must not be -- COEP would block the Supabase images, the Hugging Face CDN
 * and Google Fonts, i.e. most of the app. So in practice this is 1. It is
 * written as a check because the moment the host does send those headers the
 * scan gets several times faster for nothing.
 */
ort.env.wasm.numThreads =
  typeof SharedArrayBuffer === "undefined"
    ? 1
    : Math.min(4, navigator.hardwareConcurrency || 1);

type Incoming =
  | { type: "init" }
  | { type: "recognise"; id: number; image: string; charset: Charset }
  | { type: "dispose" };

type Outgoing =
  | { type: "download"; file: string; loaded: number; total: number }
  | { type: "ready"; device: string }
  | { type: "result"; id: number; text: string }
  | { type: "failed"; id: number | null; message: string };

const post = (message: Outgoing) => (self as DedicatedWorkerGlobalScope).postMessage(message);

let session: ort.InferenceSession | null = null;
let charset: string[] = [];
let loading: Promise<void> | null = null;
/** Suppression masks are the same for every cell, so build each once. */
const masks = new Map<Charset, Uint8Array>();

/** Fetches with progress, so the UI can show the one big download. */
async function fetchWithProgress(url: string, label: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label} could not be downloaded (${response.status}).`);
  const total = Number(response.headers.get("content-length") ?? 0);
  if (!response.body) return response.arrayBuffer();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    post({ type: "download", file: label, loaded, total });
  }
  const buffer = new Uint8Array(loaded);
  let offset = 0;
  chunks.forEach((chunk) => {
    buffer.set(chunk, offset);
    offset += chunk.length;
  });
  return buffer.buffer;
}

async function load(): Promise<void> {
  if (session) return;
  if (loading) return loading;

  loading = (async () => {
    const [weights, dictionary] = await Promise.all([
      fetchWithProgress(MODEL_URL, "recognition model"),
      fetch(DICT_URL).then((r) => r.text()),
    ]);

    /*
     * Index 0 is the CTC blank and the dictionary file does not contain it,
     * so the characters are offset by one. A trailing space is appended
     * because PaddleOCR's own pipeline runs with `use_space_char`, which
     * adds one class beyond the file; without it every class is shifted and
     * the output is plausible-looking nonsense rather than an obvious error.
     */
    charset = ["", ...dictionary.split("\n"), " "];

    session = await ort.InferenceSession.create(weights, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    post({ type: "ready", device: "wasm" });
  })();

  try {
    await loading;
  } finally {
    loading = null;
  }
}

/** Classes NOT allowed for a charset, as a lookup by class index. */
function maskFor(which: Charset): Uint8Array | null {
  if (which === "free") return null;
  const cached = masks.get(which);
  if (cached) return cached;

  const allowed = ALLOWED[which];
  const mask = new Uint8Array(charset.length);
  for (let i = 1; i < charset.length; i += 1) {
    const character = charset[i];
    // Multi-character classes exist in the dictionary; a class is usable only
    // if every character in it is allowed.
    const ok = character.length > 0 && [...character].every((c) => allowed.test(c));
    if (!ok) mask[i] = 1;
  }
  masks.set(which, mask);
  return mask;
}

/**
 * The crop, as the network wants it: three planes, 48 rows tall, scaled to
 * keep its shape, and normalised to roughly minus one through one.
 */
async function toTensor(dataUrl: string): Promise<ort.Tensor> {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const width = Math.max(
    16,
    Math.round((bitmap.width / bitmap.height) * REC_HEIGHT)
  );

  const canvas = new OffscreenCanvas(width, REC_HEIGHT);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  // White behind, because a crop with any transparency would otherwise
  // normalise to black and swamp the strokes.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, REC_HEIGHT);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, REC_HEIGHT);
  bitmap.close();

  const { data } = ctx.getImageData(0, 0, width, REC_HEIGHT);
  const plane = REC_HEIGHT * width;
  const chw = new Float32Array(3 * plane);
  for (let y = 0; y < REC_HEIGHT; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const target = y * width + x;
      chw[target] = (data[source] / 255 - 0.5) / 0.5;
      chw[plane + target] = (data[source + 1] / 255 - 0.5) / 0.5;
      chw[2 * plane + target] = (data[source + 2] / 255 - 0.5) / 0.5;
    }
  }
  return new ort.Tensor("float32", chw, [1, 3, REC_HEIGHT, width]);
}

/** Greedy CTC: best class per step, drop blanks and immediate repeats. */
function decode(
  scores: Float32Array,
  steps: number,
  classes: number,
  mask: Uint8Array | null
): string {
  let text = "";
  let previous = -1;
  for (let t = 0; t < steps; t += 1) {
    let best = 0;
    let bestValue = -Infinity;
    const base = t * classes;
    for (let c = 0; c < classes; c += 1) {
      if (mask && mask[c]) continue;
      const value = scores[base + c];
      if (value > bestValue) {
        bestValue = value;
        best = c;
      }
    }
    if (best !== 0 && best !== previous) text += charset[best] ?? "";
    previous = best;
  }
  return text;
}

self.addEventListener("message", async (event: MessageEvent<Incoming>) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      await load();
      return;
    }

    if (message.type === "dispose") {
      await session?.release();
      session = null;
      masks.clear();
      return;
    }

    if (message.type === "recognise") {
      if (!session) throw new Error("The recogniser was asked to read before it was loaded.");
      const tensor = await toTensor(message.image);
      const output = await session.run({ [session.inputNames[0]]: tensor });
      const logits = output[session.outputNames[0]];
      const [, steps, classes] = logits.dims as number[];
      const text = decode(
        logits.data as Float32Array,
        steps,
        classes,
        maskFor(message.charset)
      );
      post({ type: "result", id: message.id, text: text.trim() });
    }
  } catch (error) {
    post({
      type: "failed",
      id: message.type === "recognise" ? message.id : null,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
