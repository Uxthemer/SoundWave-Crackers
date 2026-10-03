/**
 * Which recognition model the scan uses, and what each column may say.
 *
 * Its own module, with no dependencies, because both sides need it: the
 * worker to load the model, the review screen to quote the download size. If
 * the screen imported these from the worker it would pull the ONNX runtime
 * into the main bundle, which is the whole reason the worker is a separate
 * entry point.
 */

/**
 * PaddleOCR PP-OCRv5, not TrOCR.
 *
 * TrOCR is the obvious choice and it was the first thing tried, and on this
 * job it is useless. It is trained on IAM: English prose, in European
 * cursive, written out as sentences. A counter order sheet is none of those.
 * Handed a clean, correctly cropped line reading "Grand Chakkar Ashoka" it
 * returned "difference between overseas" -- not a near miss that fuzzy
 * matching could rescue, but a fluent English sentence invented wholesale,
 * which is exactly what a model with a strong prose prior does when the
 * picture means nothing to it. Every size and precision behaved the same
 * way, so this was never a capacity problem:
 *
 *   trocr-small fp32   "difference between overseas"
 *   trocr-base  q8     (worse still, and four times slower)
 *   PP-OCRv5           "GandchaenAshoka"
 *
 * That last one is a mess, and it is a mess the matcher eats for breakfast:
 * the trigram score against "Grand Chakkar Ashoka" is high, and the serial
 * and the price confirm it. Near-miss text is worth everything here;
 * confident fiction is worth less than nothing.
 *
 * PP-OCRv5 is better suited for reasons beyond the training data. It is a
 * CTC model, so it reads a line in ONE forward pass instead of generating a
 * token at a time -- for a page of 29 rows that is the difference between
 * minutes and seconds. And because the output is per-position class scores
 * rather than a sequence, restricting a column to digits is a mask over the
 * logits rather than a fight with a language model.
 *
 * Apache 2.0, from the Hub, no key, cached by the browser after first use.
 */
const REPO = "https://huggingface.co/aoiandroid/paddleocr-ppocrv5-onnx/resolve/main";

export const MODEL_URL = `${REPO}/PP-OCRv5_server_rec_infer.onnx`;
export const DICT_URL = `${REPO}/ppocrv5_dict.txt`;

/** Roughly what the weights cost on a first scan, for the UI to warn about. */
export const MODEL_MEGABYTES = 81;

/** The model's input height is fixed by its graph; only the width varies. */
export const REC_HEIGHT = 48;

/**
 * Which characters a column is allowed to contain.
 *
 * Three of the four columns hold nothing but figures, and saying so is most
 * of the accuracy available cheaply: every class outside the set is driven
 * to minus infinity before the arg-max, so "45" cannot come back as a word
 * however much the model would like it to.
 */
export type Charset = "digits" | "quantity" | "free";

export const ALLOWED: Record<Exclude<Charset, "free">, RegExp> = {
  digits: /^[0-9.,\-/ ]$/,
  // Digits plus the letters that spell box / nos / pcs / pkt / bag / set.
  quantity: /^[0-9.,\-/ AaBbCcEeGgKkNnOoPpSsTtXx]$/,
};
