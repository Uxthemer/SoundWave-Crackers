import { useEffect, useState } from "react";
import { format } from "date-fns";
import { History, Loader2, RefreshCw, User, X } from "lucide-react";
import {
  describeHistoryEntry,
  fetchOrderHistory,
  historyActorLabel,
  type OrderHistoryEntry,
} from "../lib/orderHistory";

const EVENT_DOT: Record<string, string> = {
  created: "bg-sky-500",
  status: "bg-primary-orange",
  updated: "bg-amber-500",
  items: "bg-purple-500",
  edited: "bg-amber-500",
  payment: "bg-green-600",
};

/**
 * Everything that has happened to one order, oldest first, each step with
 * its time and the person who was logged in when it happened.
 *
 * Opens above the order details dialog (z-[60]) because it is reached from
 * there as well as from the row.
 */
export default function OrderHistoryModal({
  order,
  onClose,
}: {
  order: { id: string; short_id?: string | null; full_name?: string | null };
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<OrderHistoryEntry[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setEntries(await fetchOrderHistory(order.id));
    } catch (e) {
      console.error("Failed to load order history:", e);
      setError("Could not load this order's history. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center bg-black/60 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`History of order ${order.short_id || ""}`}
        onClick={(e) => e.stopPropagation()}
        className="bg-background w-full sm:max-w-xl sm:rounded-xl flex flex-col max-h-full sm:max-h-[90vh]"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-card-border/10">
          <div className="min-w-0">
            <h2 className="font-heading text-xl flex items-center gap-2">
              <History className="w-5 h-5 text-primary-orange" />
              Order history
            </h2>
            <p className="text-xs text-text/60 truncate">
              <span className="font-mono">{order.short_id || order.id.slice(0, 8)}</span>
              {order.full_name ? ` — ${order.full_name}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={load}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-card/60 disabled:opacity-40"
              title="Reload"
              aria-label="Reload history"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-card/60"
              title="Close"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && !entries ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary-orange" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          ) : !entries || entries.length === 0 ? (
            <p className="text-sm text-text/60 text-center py-10">Nothing recorded yet.</p>
          ) : (
            <ol className="relative border-l-2 border-card-border/20 ml-2 space-y-5">
              {entries.map((entry) => {
                const { title, lines, note } = describeHistoryEntry(entry);
                return (
                  <li key={entry.id} className="ml-4">
                    <span
                      className={`absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full ring-4 ring-background ${
                        EVENT_DOT[entry.event] ?? "bg-gray-400"
                      }`}
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="font-semibold text-sm">{title}</p>
                      <time
                        dateTime={entry.happenedAt}
                        className="text-xs text-text/60 whitespace-nowrap"
                      >
                        {format(new Date(entry.happenedAt), "dd MMM yyyy, h:mm:ss a")}
                      </time>
                    </div>
                    {lines.length > 0 && (
                      <ul className="mt-1 text-sm text-text/80 space-y-0.5 break-words">
                        {lines.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-1 text-xs text-text/60 flex items-center gap-1.5 flex-wrap">
                      <User className="w-3.5 h-3.5 shrink-0" />
                      <span className="break-all">{historyActorLabel(entry)}</span>
                      {entry.actor.role && (
                        <span className="px-1.5 py-0.5 rounded-full bg-card text-[10px] uppercase tracking-wide">
                          {entry.actor.role}
                        </span>
                      )}
                    </p>
                    {note && <p className="mt-0.5 text-[11px] italic text-text/50">{note}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
