/**
 * Main-thread handle on the handwriting recogniser running in
 * `handwritingOcr.worker.ts`.
 *
 * Reads are queued one at a time rather than fired off together. The worker
 * is a single thread with one copy of the model on it, so parallel calls do
 * not go any faster -- they just arrive out of order and make the progress
 * count meaningless.
 */

// From the shared config module, never from the worker: a value import of
// the worker would pull Transformers.js and the ONNX runtime into whatever
// chunk this ends up in, which is exactly what the separate worker entry
// point exists to prevent.
export { MODEL_MEGABYTES } from "./handwritingOcrModels";
export type { Charset } from "./handwritingOcrModels";
import type { Charset } from "./handwritingOcrModels";

export interface DownloadProgress {
  /** 0-1 across every file the model needs, or null before totals are known. */
  fraction: number | null;
  megabytes: number;
}

export class HandwritingRecogniser {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();
  private ready: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  /** Bytes seen per file, so progress does not double count a re-reported chunk. */
  private downloaded = new Map<string, { loaded: number; total: number }>();
  /** The backend the worker settled on; shown in the review screen's footer. */
  device: string | null = null;

  constructor(private onDownload?: (progress: DownloadProgress) => void) {
    this.worker = new Worker(new URL("./handwritingOcr.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.addEventListener("message", this.handleMessage);
    // A worker that dies outright -- out of memory on a big model, usually --
    // reports here and nowhere else, and without this every queued read would
    // hang for ever instead of failing.
    this.worker.addEventListener("error", (event) => {
      this.failEverything(new Error(event.message || "The handwriting reader stopped unexpectedly."));
    });
  }

  private handleMessage = (event: MessageEvent<any>) => {
    const message = event.data;

    if (message.type === "download") {
      this.downloaded.set(message.file, { loaded: message.loaded, total: message.total });
      let loaded = 0;
      let total = 0;
      this.downloaded.forEach((entry) => {
        loaded += entry.loaded;
        total += entry.total;
      });
      this.onDownload?.({
        fraction: total > 0 ? Math.min(1, loaded / total) : null,
        megabytes: loaded / (1024 * 1024),
      });
      return;
    }

    if (message.type === "ready") {
      this.device = message.device;
      this.readyResolve?.();
      return;
    }

    if (message.type === "result") {
      this.pending.get(message.id)?.resolve(message.text);
      this.pending.delete(message.id);
      return;
    }

    if (message.type === "failed") {
      const error = new Error(message.message);
      if (message.id === null) {
        this.readyReject?.(error);
        this.failEverything(error);
        return;
      }
      this.pending.get(message.id)?.reject(error);
      this.pending.delete(message.id);
    }
  };

  private failEverything(error: Error) {
    this.readyReject?.(error);
    this.pending.forEach((entry) => entry.reject(error));
    this.pending.clear();
  }

  /** Downloads and compiles the model. Safe to await more than once. */
  init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.worker.postMessage({ type: "init" });
    return this.ready;
  }

  /**
   * Reads one crop. `charset` restricts what the column may say; see the
   * worker and `handwritingOcrModels.ts`.
   */
  read(image: string, charset: Charset): Promise<string> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: "recognise", id, image, charset });
    });
  }

  dispose() {
    this.worker.removeEventListener("message", this.handleMessage);
    this.worker.terminate();
    this.failEverything(new Error("The scan was cancelled."));
  }
}
