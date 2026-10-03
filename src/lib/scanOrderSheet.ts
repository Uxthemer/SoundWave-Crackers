/**
 * The scan, end to end: a photograph in, matched quotation lines out.
 *
 *   sheetImagePrep   deskew, clean, find the printed grid
 *   sheetSegment     cut it into one picture per cell
 *   handwritingOcr   read each picture (in a worker)
 *   orderSheetMatch  resolve each row against the catalogue
 *
 * The only thing that happens here is sequencing and progress reporting, but
 * both matter: the reading is the slow part by two orders of magnitude, and a
 * page can take minutes, so the caller needs to be able to show where it has
 * got to and stop it.
 */

import { prepareSheet } from "./sheetImagePrep";
import { segmentSheet, type SheetRow } from "./sheetSegment";
import { HandwritingRecogniser, type Charset } from "./handwritingOcr";
import type { Catalogue } from "./priceListSerials";
import {
  matchRow,
  parsePrice,
  parseQuantity,
  parseSerial,
  parseWholeLine,
  type MatchedRow,
} from "./orderSheetMatch";

export interface ScanProgress {
  stage: "preparing" | "loading-model" | "reading" | "matching";
  /** 0-1 within the stage, or null when it cannot be known. */
  fraction: number | null;
  detail: string;
}

export interface ScanLine extends MatchedRow {
  /** Index of the row on the page, so the review table stays in page order. */
  rowIndex: number;
  /** The strip of the page this came from, shown beside the parsed values. */
  stripImage: string;
  /** Exactly what the recogniser returned, per cell, for the "raw" toggle. */
  rawCells: { role: string; text: string }[];
}

export interface ScanResult {
  lines: ScanLine[];
  /** How the page was read, for the footer: backend, skew, column detection. */
  notes: string[];
}

/**
 * What each column is allowed to say.
 *
 * Three of the four hold nothing but figures, and saying so is the single
 * biggest accuracy win available: TrOCR's prose prior otherwise turns "45"
 * into a word. The product column is left free, and the whole-line fallback
 * has to be too, since it contains both.
 */
const CHARSET: Record<string, Charset> = {
  serial: "digits",
  price: "digits",
  quantity: "quantity",
  name: "free",
  line: "free",
};

export interface ScanOptions {
  file: File | Blob;
  catalogue: Catalogue;
  onProgress: (progress: ScanProgress) => void;
  /** Polled between cells; the scan stops cleanly at the next boundary. */
  isCancelled: () => boolean;
}

export async function scanOrderSheet({
  file,
  catalogue,
  onProgress,
  isCancelled,
}: ScanOptions): Promise<ScanResult> {
  const notes: string[] = [];

  onProgress({ stage: "preparing", fraction: null, detail: "Straightening and cleaning the page" });
  const prepared = await prepareSheet(file);
  if (Math.abs(prepared.deskewedBy) >= 0.2) {
    notes.push(`Page straightened by ${prepared.deskewedBy.toFixed(1)}°.`);
  }

  const segmented = segmentSheet(prepared);
  if (!segmented.rows.length) {
    throw new Error(
      "No lines of writing were found on this image. A straight-on photo in even light, " +
        "filling the frame with the page, reads best."
    );
  }
  notes.push(
    segmented.hasColumns
      ? `${segmented.rows.length} lines found, in a ruled table.`
      : `${segmented.rows.length} lines found. No printed columns — each line was read whole.`
  );

  const recogniser = new HandwritingRecogniser((download) => {
    onProgress({
      stage: "loading-model",
      fraction: download.fraction,
      detail: `Downloading the handwriting model (${download.megabytes.toFixed(0)} MB so far). This happens once.`,
    });
  });

  try {
    onProgress({ stage: "loading-model", fraction: null, detail: "Starting the handwriting reader" });
    await recogniser.init();
    notes.push(`Read on the processor (${recogniser.device}).`);

    // Blank cells were never cropped, so they cost nothing; counting only the
    // ones with ink keeps the progress bar honest.
    const jobs: { row: SheetRow; cellIndex: number }[] = [];
    segmented.rows.forEach((row) => {
      row.cells.forEach((cell, cellIndex) => {
        if (cell.inkPixels > 0) jobs.push({ row, cellIndex });
      });
    });

    const readings = new Map<string, string>();
    for (let i = 0; i < jobs.length; i += 1) {
      if (isCancelled()) throw new Error("The scan was cancelled.");
      const { row, cellIndex } = jobs[i];
      const cell = row.cells[cellIndex];
      onProgress({
        stage: "reading",
        fraction: i / jobs.length,
        detail: `Reading line ${row.index + 1} of ${segmented.rows.length}`,
      });
      try {
        readings.set(
          `${row.index}:${cellIndex}`,
          await recogniser.read(cell.image, CHARSET[cell.role] ?? "free")
        );
      } catch (error) {
        // One unreadable cell must not lose the other thirty-nine lines. It
        // comes through as empty and the row is flagged for review.
        console.error("A cell could not be read", error);
        readings.set(`${row.index}:${cellIndex}`, "");
      }
    }

    onProgress({ stage: "matching", fraction: null, detail: "Matching against the catalogue" });

    const lines: ScanLine[] = segmented.rows.map((row) => {
      const textOf = (role: string): string => {
        const index = row.cells.findIndex((cell) => cell.role === role);
        return index < 0 ? "" : readings.get(`${row.index}:${index}`) ?? "";
      };

      const parsed = segmented.hasColumns
        ? (() => {
            const quantity = parseQuantity(textOf("quantity"));
            return {
              serial: parseSerial(textOf("serial")),
              nameText: textOf("name"),
              price: parsePrice(textOf("price")),
              quantity: quantity.quantity,
              quantityUnit: quantity.unit,
            };
          })()
        : parseWholeLine(textOf("line"));

      return {
        ...matchRow(parsed, catalogue),
        rowIndex: row.index,
        stripImage: row.stripImage,
        rawCells: row.cells.map((cell, cellIndex) => ({
          role: cell.role,
          text: readings.get(`${row.index}:${cellIndex}`) ?? "",
        })),
      };
    });

    return { lines, notes };
  } finally {
    recogniser.dispose();
  }
}
