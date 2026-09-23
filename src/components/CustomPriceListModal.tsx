import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, RotateCcw, Settings2, Trash2, X } from "lucide-react";
import {
  DEFAULT_COLUMN_LABELS,
  MIN_FULL_WIDTH_BANNER_RATIO,
  PRICE_LIST_COLUMNS,
  type PriceListColumn,
  type PriceListColumnKey,
} from "../lib/priceListPdf";
import { actualFromOffer, formatPrice } from "../lib/pricing";
import { NumberInput } from "./NumberInput";

/**
 * The settings sheet for a one-off price list.
 *
 * The Export menu's price list is the season's own: the banner on file, every
 * column, the season's discount. That is the right default and it stays. But
 * a superadmin sending a list to a wholesaler wants a different banner, their
 * own discount, and often only two of the five value columns — printing the
 * standard list and editing the PDF afterwards was the workaround.
 *
 * Nothing here is saved. These are the settings for the sheet about to be
 * generated, and the next one starts from the season's defaults again.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (settings: CustomPriceListSettings) => Promise<void> | void;
  /** The season's own discount, offered as the starting point. */
  seasonDiscount: number | null;
  seasonName: string;
}

export interface CustomPriceListSettings {
  /** A data URL for an uploaded banner, or null to keep the standard one. */
  bannerDataUrl: string | null;
  columns: PriceListColumn[];
  strikePrice: boolean;
  discountPercent: number | null;
}

const MAX_BANNER_BYTES = 5 * 1024 * 1024;

/** What the sheet looks like before anyone touches it: today's price list. */
function defaultColumns(): PriceListColumn[] {
  return PRICE_LIST_COLUMNS.map((key) => ({ key, label: "", enabled: true }));
}

export function CustomPriceListModal({
  isOpen,
  onClose,
  onGenerate,
  seasonDiscount,
  seasonName,
}: Props) {
  const [columns, setColumns] = useState<PriceListColumn[]>(defaultColumns);
  const [strikePrice, setStrikePrice] = useState(true);
  const [discount, setDiscount] = useState<number | null>(null);
  const [bannerDataUrl, setBannerDataUrl] = useState<string | null>(null);
  const [bannerName, setBannerName] = useState<string>("");
  const [bannerError, setBannerError] = useState<string | null>(null);
  /** Set when the image is too square to reach both margins. */
  const [bannerNarrow, setBannerNarrow] = useState(false);
  const [generating, setGenerating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Opening the sheet is what resets it: a superadmin who closed it by
  // mistake should not lose what they had set up, but a fresh open starts
  // from the season again.
  useEffect(() => {
    if (!isOpen) return;
    setColumns(defaultColumns());
    setStrikePrice(true);
    setDiscount(seasonDiscount != null && seasonDiscount > 0 ? seasonDiscount : null);
    setBannerDataUrl(null);
    setBannerName("");
    setBannerError(null);
    setBannerNarrow(false);
    setGenerating(false);
    // Only on open; the fields are the superadmin's from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /** A blank or nonsensical box means "no discount named", not zero percent. */
  const discountValue = useMemo(
    () =>
      discount != null && Number.isFinite(discount) && discount > 0
        ? discount
        : null,
    [discount]
  );

  /**
   * A worked example of the discount, so a superadmin can see which way the
   * arithmetic runs before generating anything. 20 is a common shelf price.
   */
  const example = useMemo(() => {
    const offer = 20;
    const actual = actualFromOffer(offer, discountValue);
    // Rounded the same way the sheet rounds it, or the example would promise
    // a figure the PDF does not print.
    return actual == null ? null : { offer, actual: Math.round(actual) };
  }, [discountValue]);

  /**
   * The heading shown as the placeholder for a column left unnamed. The offer
   * price carries the discount, so it follows the box above it.
   */
  const placeholderFor = (key: PriceListColumnKey) => {
    if (key !== "offerPrice") return DEFAULT_COLUMN_LABELS[key];
    return discountValue
      ? `Offer Price - ${Number(discountValue.toFixed(2))}% (Rs.)`
      : DEFAULT_COLUMN_LABELS.offerPrice;
  };

  const update = (key: PriceListColumnKey, patch: Partial<PriceListColumn>) =>
    setColumns((current) =>
      current.map((column) =>
        column.key === key ? { ...column, ...patch } : column
      )
    );

  const enabledCount = columns.filter((column) => column.enabled).length;

  const handleBanner = (file: File | undefined) => {
    setBannerError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setBannerError("That is not an image.");
      return;
    }
    if (file.size > MAX_BANNER_BYTES) {
      setBannerError("Please use a banner under 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setBannerDataUrl(dataUrl);
      setBannerName(file.name);

      // A banner too close to square is drawn smaller so it does not eat the
      // first page, and then it no longer reaches the edges of the table.
      // Better to say so now than to explain the finished PDF afterwards.
      const probe = new Image();
      probe.onload = () =>
        setBannerNarrow(
          probe.naturalHeight > 0 &&
            probe.naturalWidth / probe.naturalHeight < MIN_FULL_WIDTH_BANNER_RATIO
        );
      probe.onerror = () => setBannerNarrow(false);
      probe.src = dataUrl;
    };
    reader.onerror = () => setBannerError("That image could not be read.");
    reader.readAsDataURL(file);
  };

  const clearBanner = () => {
    setBannerDataUrl(null);
    setBannerName("");
    setBannerError(null);
    setBannerNarrow(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await onGenerate({
        bannerDataUrl,
        columns,
        strikePrice,
        discountPercent: discountValue,
      });
    } finally {
      setGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-auto p-5 relative">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-lg text-text/60 hover:bg-card/70"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <Settings2 className="w-5 h-5 text-primary-orange" />
          <h2 className="text-xl font-semibold">Custom price list</h2>
        </div>
        <p className="text-sm text-text/60 mb-5">
          A one-off sheet for {seasonName}. Nothing here is saved — the
          season's own price list is unchanged.
        </p>

        {/* --- Banner ------------------------------------------------------ */}
        <section className="mb-6">
          <h3 className="font-semibold mb-1">Banner</h3>
          <p className="text-sm text-text/60 mb-3">
            Leave this empty to use the standard price list banner. A wide
            image, around 2:1, sits across the page the way that one does.
          </p>

          {bannerDataUrl ? (
            <div className="rounded-lg border border-card-border/20 overflow-hidden">
              <img
                src={bannerDataUrl}
                alt="Banner to print on this price list"
                className="w-full max-h-40 object-contain bg-card"
              />
              <div className="flex items-center justify-between gap-3 px-3 py-2 bg-card">
                <span className="text-sm truncate" title={bannerName}>
                  {bannerName}
                </span>
                <button
                  type="button"
                  onClick={clearBanner}
                  className="flex items-center gap-1 text-sm text-primary-red hover:underline shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                  Use the default
                </button>
              </div>
            </div>
          ) : (
            <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-card-border/40 cursor-pointer hover:border-primary-orange">
              <ImagePlus className="w-5 h-5 text-primary-orange" />
              <span className="text-sm">
                Upload a banner
                <span className="text-text/50"> — optional, under 5 MB</span>
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleBanner(e.target.files?.[0])}
              />
            </label>
          )}
          {bannerError && (
            <p className="text-sm text-primary-red mt-2">{bannerError}</p>
          )}
          {bannerNarrow && !bannerError && (
            <p className="text-sm text-text/70 mt-2">
              This banner is nearly square, so it is printed smaller to leave
              room on the first page and will not run the full width of the
              table. A wider image sits flush with it.
            </p>
          )}
        </section>

        {/* --- Discount ---------------------------------------------------- */}
        <section className="mb-6">
          <h3 className="font-semibold mb-1">Discount</h3>
          <p className="text-sm text-text/60 mb-3">
            Named in the Offer Price heading, and the struck-out Price column
            is worked back from each product's offer price to match it. Only
            on this sheet — the catalogue, the season's discount and every
            saved price are left alone.
          </p>
          <div className="flex items-center gap-3">
            <NumberInput
              value={discount}
              onValueChange={setDiscount}
              onClear={() => setDiscount(null)}
              placeholder="e.g. 90"
              aria-label="Discount percentage printed in the Offer Price heading"
              className="w-32 px-3 py-2 rounded-lg border border-card-border/20 bg-card focus:outline-none focus:border-primary-orange"
            />
            <span className="text-sm text-text/60">%</span>
            {seasonDiscount != null && seasonDiscount > 0 && (
              <button
                type="button"
                onClick={() => setDiscount(seasonDiscount)}
                className="flex items-center gap-1 text-sm text-primary-orange hover:underline"
              >
                <RotateCcw className="w-4 h-4" />
                Season's {seasonDiscount}%
              </button>
            )}
          </div>
          {/* The arithmetic, on a real number, so it is obvious which way
              round it goes before a sheet is sent to anyone. */}
          <p className="text-sm text-text/60 mt-2">
            {example
              ? `A product selling at ${formatPrice(
                  example.offer
                )} prints as ${formatPrice(example.actual)} struck through.`
              : "Leave it empty to print the prices exactly as they are stored."}
          </p>
        </section>

        {/* --- Columns ----------------------------------------------------- */}
        <section className="mb-6">
          <h3 className="font-semibold mb-1">Columns</h3>
          <p className="text-sm text-text/60 mb-3">
            S.No, Product and the category bands always print. Switch off what
            you do not need and the rest widen to fill the page.
          </p>

          <div className="space-y-2">
            {columns.map((column) => (
              <div
                key={column.key}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card"
              >
                <input
                  type="checkbox"
                  id={`col-${column.key}`}
                  checked={column.enabled}
                  onChange={(e) =>
                    update(column.key, { enabled: e.target.checked })
                  }
                  className="w-4 h-4 accent-primary-orange shrink-0"
                />
                <label
                  htmlFor={`col-${column.key}`}
                  className="w-28 text-sm font-medium shrink-0 cursor-pointer"
                >
                  {DEFAULT_COLUMN_LABELS[column.key]}
                </label>
                <input
                  type="text"
                  value={column.label ?? ""}
                  onChange={(e) => update(column.key, { label: e.target.value })}
                  placeholder={placeholderFor(column.key)}
                  disabled={!column.enabled}
                  aria-label={`Heading for the ${DEFAULT_COLUMN_LABELS[column.key]} column`}
                  className="flex-1 min-w-0 px-3 py-1.5 text-sm rounded-lg border border-card-border/20 bg-background focus:outline-none focus:border-primary-orange disabled:opacity-40"
                />
              </div>
            ))}
          </div>

          {/* The line through the old price only means anything while that
              column is on the sheet. */}
          <label
            className={`flex items-center gap-2 mt-3 text-sm ${
              columns.find((column) => column.key === "price")?.enabled
                ? "cursor-pointer"
                : "opacity-40"
            }`}
          >
            <input
              type="checkbox"
              checked={strikePrice}
              disabled={!columns.find((column) => column.key === "price")?.enabled}
              onChange={(e) => setStrikePrice(e.target.checked)}
              className="w-4 h-4 accent-primary-orange"
            />
            Strike out the Price column
          </label>

          {enabledCount === 0 && (
            <p className="text-sm text-text/60 mt-3">
              With every column off the sheet is just the product names, which
              is allowed but rarely what is wanted.
            </p>
          )}
        </section>

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-text/70 hover:bg-card"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="btn-primary flex items-center gap-2 disabled:opacity-60 disabled:cursor-wait"
          >
            {generating && <Loader2 className="w-4 h-4 animate-spin" />}
            {generating ? "Generating…" : "Generate price list"}
          </button>
        </div>
      </div>
    </div>
  );
}
