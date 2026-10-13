import { useEffect } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { ExternalLink, X } from "lucide-react";
import { REFERRAL_RATE, type Referrer } from "../lib/referrals";

/**
 * The orders one person referred (Analytics → Referral Bonuses).
 *
 * Each order number opens that order on the Orders page in a new tab -- see
 * the `?order=` handling there -- so this list stays open to work through.
 * Portalled to the body: the panel it is opened from can be expanded into an
 * overlay of its own.
 */
export function ReferredOrdersModal({
  referrer,
  onClose,
}: {
  referrer: Referrer | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!referrer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [referrer, onClose]);

  if (!referrer) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-card-border/10">
          <div>
            <h2 className="text-lg font-bold">{referrer.name || referrer.phoneDisplay}</h2>
            <p className="text-sm text-text/60">
              {referrer.name ? `${referrer.phoneDisplay} · ` : ""}
              {referrer.ordersCount} order{referrer.ordersCount === 1 ? "" : "s"} referred
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-text/60 hover:bg-card/70">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left">
                <th className="p-3">Order</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Date</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Value (₹)</th>
              </tr>
            </thead>
            <tbody>
              {referrer.orders.map((o) => (
                <tr key={o.id} className="border-t border-card-border/10">
                  <td className="p-3 whitespace-nowrap">
                    <a
                      href={`/orders?order=${encodeURIComponent(o.id)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary-orange hover:underline font-medium"
                    >
                      {o.shortId || o.id.slice(0, 8)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="p-3">{o.customer || "-"}</td>
                  <td className="p-3 whitespace-nowrap">
                    {o.createdAt ? format(new Date(o.createdAt), "dd MMM yyyy") : "-"}
                  </td>
                  <td className="p-3 whitespace-nowrap">{o.status || "-"}</td>
                  <td className="p-3 text-right tabular-nums">{o.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-card-border/20 font-semibold">
                <td className="p-3" colSpan={4}>Total</td>
                <td className="p-3 text-right tabular-nums">{referrer.totalValue.toFixed(2)}</td>
              </tr>
              <tr className="text-text/70">
                <td className="px-3 pb-3" colSpan={4}>
                  Referral bonus ({Math.round(REFERRAL_RATE * 100)}%)
                </td>
                <td className="px-3 pb-3 text-right tabular-nums">{referrer.bonus.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>,
    document.body
  );
}
