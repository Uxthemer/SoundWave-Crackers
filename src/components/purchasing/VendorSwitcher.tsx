import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { suggestVendors, type VendorSuggestion } from "../../hooks/usePurchasing";

/**
 * Shows the vendor on a plan line and lets it be swapped for any other vendor
 * who quoted the same product.
 *
 * Alternatives are fetched on demand rather than eagerly for every row — a plan
 * can run to hundreds of lines and pre-loading all of them would be a request
 * per product on page load.
 */
export function VendorSwitcher({
  seasonId,
  productId,
  currentName,
  onPick,
}: {
  seasonId: string | null;
  productId: string;
  currentName: string | null;
  onPick: (s: VendorSuggestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<VendorSuggestion[]>([]);

  const load = async () => {
    if (!seasonId) return;
    setOpen(true);
    if (options.length > 0) return;
    setLoading(true);
    try {
      setOptions(await suggestVendors(seasonId, productId));
    } catch (e: any) {
      toast.error(e?.message || "Could not load vendors");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => (open ? setOpen(false) : load())}
        className="flex items-center gap-1 text-left hover:text-primary-orange transition-colors"
      >
        <span className={currentName ? "" : "text-amber-600"}>
          {currentName ?? "no vendor"}
        </span>
        <RefreshCw className="w-3 h-3 opacity-50" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-72 bg-background border border-card-border/20 rounded-lg shadow-lg p-2">
            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-primary-orange" />
              </div>
            ) : options.length === 0 ? (
              <p className="text-xs text-text/60 p-2">
                No vendor has quoted this product this season.
              </p>
            ) : (
              options.map((o) => (
                <button
                  key={o.price_item_id}
                  onClick={() => {
                    onPick(o);
                    setOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-card text-xs flex items-center justify-between gap-2"
                >
                  <span>
                    {o.vendor_name}
                    {o.vendor_rank === 1 && (
                      <span className="ml-1 text-green-600 font-semibold">best</span>
                    )}
                  </span>
                  <span className="text-text/60">
                    ₹{Number(o.landed_retail_cost).toFixed(2)}/pack
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
