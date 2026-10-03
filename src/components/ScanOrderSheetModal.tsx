import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Camera,
  FileWarning,
  Loader2,
  ScanLine as ScanIcon,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { NumberInput } from "./NumberInput";
import { useCartStore } from "../store/cartStore";
import { useSeasons } from "../context/SeasonContext";
import { crackerImage } from "../lib/productImage";
import { loadCatalogue, type Catalogue, type CatalogueEntry } from "../lib/priceListSerials";
import { REVIEW_THRESHOLD } from "../lib/orderSheetMatch";
import { scanOrderSheet, type ScanLine, type ScanProgress } from "../lib/scanOrderSheet";
import { MODEL_MEGABYTES } from "../lib/handwritingOcr";

/**
 * Reading a customer's handwritten order off a photograph.
 *
 * The screen is built around one admission: the recognition WILL be wrong
 * sometimes, and a quotation with a wrong line on it is worse than no
 * quotation. So nothing here is automatic. Every line arrives with the strip
 * of the original page it came from printed directly above it, so checking a
 * row is a glance rather than a trip back to the paper, and anything the
 * matcher is less than sure of is pulled to the top and coloured.
 *
 * The recognition itself is local: an MIT-licensed TrOCR model downloaded
 * from Hugging Face on first use and cached by the browser. No key, no
 * account, no per-page cost, and the customer's order never leaves the
 * counter PC.
 */

/** A line as the reviewer has left it. */
interface ReviewLine {
  key: string;
  source: ScanLine;
  include: boolean;
  entry: CatalogueEntry | null;
  quantity: number;
  /** Set once a human has chosen the product, which clears the warning tint. */
  touched: boolean;
}

type Phase = "idle" | "scanning" | "review";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ProductOption {
  value: string;
  label: string;
  entry: CatalogueEntry;
}

/** The product shape the cart expects; the same one Explore and Wishlist build. */
function toCartProduct(entry: CatalogueEntry) {
  const row = entry.raw ?? {};
  return {
    id: entry.id,
    name: entry.name,
    category: row.categories?.name,
    image: row.image_url
      ? String(row.image_url).split(",").map((image: string) => crackerImage(image.trim()))
      : ["/assets/img/logo/logo-product.png"],
    actual_price: entry.actualPrice,
    offer_price: entry.offerPrice,
    discount: row.discount_percentage,
    content: entry.content,
    stock: row.stock,
    yt_link: row.yt_link,
    combo_pack_id: row.combo_pack_id ?? null,
  };
}

const confidenceTone = (line: ReviewLine): "good" | "check" | "bad" => {
  if (!line.entry) return "bad";
  // A line someone has picked by hand is as good as it gets; leaving it
  // amber would mean the "needs a look" count never falls as they work.
  if (line.touched || line.source.confidence >= REVIEW_THRESHOLD) return "good";
  return "check";
};

export function ScanOrderSheetModal({ open, onClose }: Props) {
  const { addToCart, openCart } = useCartStore();
  const { activeSeason } = useSeasons();

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);

  // Read inside the scan loop, which cannot see React state updates.
  const cancelled = useRef(false);
  // Pages are numbered across scans, not within one, so that "Scan another
  // page" cannot mint a key that collides with a line already on screen.
  const pagesScanned = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  /**
   * Closing stops the scan.
   *
   * The caller unmounts this on close, which throws away the half-reviewed
   * page -- right, because it belongs to the customer who has now left the
   * counter. But the read loop is an async function holding its own
   * references and React cannot interrupt it: without this flag it would
   * carry on reading a discarded page to the end, setting state on a
   * component that no longer exists and keeping a few hundred megabytes of
   * model alive in a worker nobody can reach. The loop checks the flag
   * between cells and unwinds through the `finally` that disposes the worker.
   */
  useEffect(
    () => () => {
      cancelled.current = true;
    },
    []
  );

  const options: ProductOption[] = useMemo(
    () =>
      (catalogue?.entries ?? []).map((entry) => ({
        value: entry.id,
        label: `${entry.serial}. ${entry.name}${entry.offerPrice ? ` — ₹${entry.offerPrice}` : ""}`,
        entry,
      })),
    [catalogue]
  );

  const runScan = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      if (!activeSeason?.id) {
        toast.error("No active season — the catalogue to match against is not set.");
        return;
      }

      cancelled.current = false;
      setError(null);
      setPhase("scanning");

      try {
        let loaded = catalogue;
        if (!loaded) {
          setProgress({ stage: "preparing", fraction: null, detail: "Loading the catalogue" });
          loaded = await loadCatalogue(activeSeason.id);
          setCatalogue(loaded);
        }
        if (!loaded.entries.length) {
          throw new Error("This season's catalogue is empty, so there is nothing to match against.");
        }

        const collected: ReviewLine[] = [];
        const collectedNotes: string[] = [];

        // Pages are read one after another rather than together: they share
        // the one model in the one worker, so overlapping them would only
        // scramble the progress count.
        for (let page = 0; page < files.length; page += 1) {
          const pageNumber = pagesScanned.current + page;
          const result = await scanOrderSheet({
            file: files[page],
            catalogue: loaded,
            isCancelled: () => cancelled.current,
            onProgress: (update) =>
              setProgress(
                files.length > 1
                  ? { ...update, detail: `Page ${page + 1} of ${files.length} — ${update.detail}` }
                  : update
              ),
          });

          result.lines.forEach((line) => {
            collected.push({
              key: `${pageNumber}:${line.rowIndex}`,
              source: line,
              // A confident match is ticked; anything doubtful has to be
              // agreed to deliberately, so a hurried Add cannot quietly put a
              // guess on a priced document.
              include: line.confidence >= REVIEW_THRESHOLD,
              entry: line.candidates[0]?.entry ?? null,
              quantity: line.quantity ?? 1,
              touched: false,
            });
          });
          collectedNotes.push(
            ...(files.length > 1 ? result.notes.map((note) => `Page ${page + 1}: ${note}`) : result.notes)
          );
        }

        // Doubtful lines first: they are the only ones that need attention,
        // and on a forty-line page they would otherwise be scattered through
        // a long scroll.
        collected.sort((a, b) => {
          const aOk = a.include ? 1 : 0;
          const bOk = b.include ? 1 : 0;
          if (aOk !== bOk) return aOk - bOk;
          return a.key.localeCompare(b.key);
        });

        pagesScanned.current += files.length;
        // Appended, not replaced: "Scan another page" is how a two-page
        // order is put together, and replacing would throw away the first
        // page's corrections at the moment the second one finishes.
        setLines((current) => [...current, ...collected]);
        setNotes((current) => [...current, ...collectedNotes]);
        setPhase("review");
      } catch (caught) {
        console.error("The order sheet could not be scanned", caught);
        setError(caught instanceof Error ? caught.message : "The page could not be read.");
        setPhase("idle");
      } finally {
        setProgress(null);
      }
    },
    [activeSeason?.id, catalogue]
  );

  const update = (key: string, patch: Partial<ReviewLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const chosen = lines.filter((line) => line.include && line.entry);
  const total = chosen.reduce(
    (sum, line) => sum + Number(line.entry?.offerPrice ?? 0) * line.quantity,
    0
  );
  const problems = lines.filter((line) => confidenceTone(line) !== "good").length;

  const handleAdd = () => {
    if (!chosen.length) {
      toast.error("Nothing is ticked to add.");
      return;
    }
    chosen.forEach((line) => addToCart(toCartProduct(line.entry!) as any, line.quantity));
    toast.success(
      `${chosen.length} ${chosen.length === 1 ? "product" : "products"} added — ` +
        "fill in the customer and save the quotation."
    );
    onClose();
    openCart();
  };

  if (!open) return null;

  const visible = onlyProblems ? lines.filter((line) => confidenceTone(line) !== "good") : lines;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-5xl max-h-[95vh] sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-4 sm:px-6 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <ScanIcon className="w-5 h-5 text-primary-orange shrink-0" />
              Scan a handwritten order
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Photograph the customer's list and check what was read before it becomes a quotation.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
          {/* ---------------- Upload ---------------- */}
          {phase === "idle" && (
            <div className="space-y-5">
              {error && (
                <div className="flex gap-3 p-4 rounded-lg bg-red-50 border border-red-100 text-sm text-red-800">
                  <FileWarning className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
                <Upload className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                <p className="font-medium text-gray-900">Choose a photo of the order sheet</p>
                <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                  Shoot square-on in even light with the page filling the frame. Several pages can be
                  picked at once.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
                  <button
                    onClick={() => fileInput.current?.click()}
                    className="px-4 py-2 rounded-lg bg-primary-orange text-white font-medium hover:opacity-90 flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" /> Choose images
                  </button>
                  <button
                    onClick={() => cameraInput.current?.click()}
                    className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4" /> Use the camera
                  </button>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(event) => {
                    void runScan(event.target.files);
                    event.target.value = "";
                  }}
                />
                <input
                  ref={cameraInput}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(event) => {
                    void runScan(event.target.files);
                    event.target.value = "";
                  }}
                />
              </div>

              <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
                <p className="text-sm font-medium text-gray-900">How this works</p>
                <p className="text-xs text-gray-500 mt-1">
                  The page is straightened, the ruled lines are removed and each cell is read
                  by PaddleOCR running on this computer — about {MODEL_MEGABYTES} MB, downloaded
                  once and then kept by the browser. The photo is not uploaded anywhere.
                </p>
              </div>
            </div>
          )}

          {/* ---------------- Progress ---------------- */}
          {phase === "scanning" && (
            <div className="py-10 text-center">
              <Loader2 className="w-10 h-10 mx-auto text-primary-orange animate-spin" />
              <p className="mt-4 font-medium text-gray-900">
                {progress?.detail ?? "Working"}
              </p>
              <div className="mt-4 max-w-md mx-auto h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full bg-primary-orange transition-all duration-300"
                  style={{
                    width: progress?.fraction == null ? "25%" : `${progress.fraction * 100}%`,
                  }}
                />
              </div>
              <p className="text-sm text-gray-500 mt-3 max-w-md mx-auto">
                {progress?.stage === "loading-model"
                  ? "The model is fetched once and then kept by the browser, so later scans start straight away."
                  : "The reading runs on this computer's processor, so a full page takes a while. You can carry on working in another tab."}
              </p>
              <button
                onClick={() => {
                  cancelled.current = true;
                  setPhase("idle");
                }}
                className="mt-5 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm hover:bg-gray-50"
              >
                Stop
              </button>
            </div>
          )}

          {/* ---------------- Review ---------------- */}
          {phase === "review" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="text-sm text-gray-600">
                  <span className="font-medium text-gray-900">{lines.length} lines</span> read
                  {problems > 0 && (
                    <>
                      {" · "}
                      <span className="text-amber-700 font-medium">{problems} need a look</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer text-gray-700">
                    <input
                      type="checkbox"
                      checked={onlyProblems}
                      onChange={(event) => setOnlyProblems(event.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Only show those
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-gray-700">
                    <input
                      type="checkbox"
                      checked={showRaw}
                      onChange={(event) => setShowRaw(event.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Show what was read
                  </label>
                </div>
              </div>

              {visible.map((line) => {
                const tone = confidenceTone(line);
                const writtenPrice = line.source.price;
                const catalogPrice = line.entry?.offerPrice ?? null;
                const priceDiffers =
                  writtenPrice != null &&
                  catalogPrice != null &&
                  Math.abs(writtenPrice - catalogPrice) / catalogPrice > 0.02;

                return (
                  <div
                    key={line.key}
                    className={`rounded-xl border overflow-hidden ${
                      tone === "good"
                        ? "border-gray-200"
                        : tone === "check"
                          ? "border-amber-300 bg-amber-50/40"
                          : "border-red-300 bg-red-50/40"
                    }`}
                  >
                    {/* The page itself, so checking a row needs no second look
                        at the paper. */}
                    <img
                      src={line.source.stripImage}
                      alt={`Line ${line.source.rowIndex + 1} of the order sheet`}
                      className="w-full object-cover max-h-14 bg-white border-b border-gray-100"
                    />

                    <div className="p-3 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={line.include}
                            disabled={!line.entry}
                            onChange={(event) => update(line.key, { include: event.target.checked })}
                            className="w-4 h-4 rounded border-gray-300 accent-primary-orange"
                          />
                          <span className="sm:hidden text-sm text-gray-600">Include</span>
                        </label>

                        <div className="flex-1 min-w-0">
                          <Select<ProductOption>
                            value={
                              line.entry
                                ? {
                                    value: line.entry.id,
                                    label: `${line.entry.serial}. ${line.entry.name}`,
                                    entry: line.entry,
                                  }
                                : null
                            }
                            onChange={(option) =>
                              update(line.key, {
                                entry: option?.entry ?? null,
                                include: Boolean(option),
                                touched: true,
                              })
                            }
                            options={options}
                            // The matcher's own shortlist first, then the
                            // whole catalogue — the right answer is nearly
                            // always in the first three, and typing a name
                            // the recogniser already mangled is slow.
                            filterOption={(candidate, input) =>
                              !input ||
                              candidate.label.toLowerCase().includes(input.toLowerCase())
                            }
                            placeholder="Pick the product…"
                            isClearable
                            classNamePrefix="scan-select"
                            menuPortalTarget={document.body}
                            styles={{ menuPortal: (base) => ({ ...base, zIndex: 80 }) }}
                          />
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <NumberInput
                            value={line.quantity}
                            min={1}
                            onValueChange={(value) =>
                              update(line.key, { quantity: Math.max(1, Math.round(value)) })
                            }
                            className="w-20 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center"
                            aria-label="Quantity"
                          />
                          <span className="w-24 text-right text-sm font-medium text-gray-900">
                            {catalogPrice == null
                              ? "—"
                              : `₹${(catalogPrice * line.quantity).toLocaleString()}`}
                          </span>
                          <button
                            onClick={() =>
                              setLines((current) => current.filter((row) => row.key !== line.key))
                            }
                            className="p-2 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-50"
                            title="Drop this line"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Candidate chips: one tap to take the matcher's second
                          guess, which is usually the right one when it is
                          wrong at all. */}
                      {tone !== "good" && line.source.candidates.length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                          {line.source.candidates.slice(0, 4).map((candidate) => (
                            <button
                              key={candidate.entry.id}
                              onClick={() =>
                                update(line.key, {
                                  entry: candidate.entry,
                                  include: true,
                                  touched: true,
                                })
                              }
                              className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                                line.entry?.id === candidate.entry.id
                                  ? "border-primary-orange bg-orange-50 text-orange-800"
                                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                              }`}
                              title={candidate.reasons.join(" · ")}
                            >
                              {candidate.entry.name}
                              <span className="text-gray-400 ml-1">
                                {Math.round(candidate.score * 100)}%
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {(line.source.warnings.length > 0 || priceDiffers) && (
                        <ul className="space-y-0.5">
                          {priceDiffers && (
                            <li className="flex gap-1.5 text-xs text-amber-800">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                              Written as ₹{writtenPrice}, but this product is ₹{catalogPrice}. The
                              quotation uses ours.
                            </li>
                          )}
                          {line.source.warnings.map((warning) => (
                            <li key={warning} className="flex gap-1.5 text-xs text-amber-800">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                              {warning}
                            </li>
                          ))}
                        </ul>
                      )}

                      {showRaw && (
                        <p className="text-xs text-gray-400 font-mono break-words">
                          {line.source.rawCells
                            .map((cell) => `${cell.role}: ${cell.text || "—"}`)
                            .join("   ")}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

              {!visible.length && (
                <p className="text-center text-sm text-gray-500 py-8">
                  Nothing to show — every line was matched confidently.
                </p>
              )}

              {notes.length > 0 && (
                <p className="text-xs text-gray-400 pt-2">{notes.join(" ")}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === "review" && (
          <div className="border-t border-gray-100 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 bg-gray-50">
            <div className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{chosen.length}</span> of {lines.length}{" "}
              ticked · <span className="font-semibold text-gray-900">₹{total.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPhase("idle")}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm hover:bg-white"
              >
                Scan another page
              </button>
              <button
                onClick={handleAdd}
                disabled={!chosen.length}
                className="px-4 py-2 rounded-lg bg-primary-orange text-white font-medium text-sm hover:opacity-90 disabled:opacity-40"
              >
                Add {chosen.length || ""} to the cart
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
