import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { ExternalLink, Printer, X } from "lucide-react";
import { REFERRAL_RATE, type Referrer } from "../lib/referrals";
import { useAppSettings } from "../context/AppSettingsContext";
import { businessFromSettings, escapeHtml } from "../lib/businessDetails";
import { addPrintToolbar } from "../lib/printWindow";

const money = (value: number) =>
  value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The orders one person referred (Analytics → Referral Bonuses).
 *
 * Each order number opens that order on the Orders page in a new tab -- see
 * the `?order=` handling there -- so this list stays open to work through.
 * Portalled to the body: the panel it is opened from can be expanded into an
 * overlay of its own.
 *
 * The name and the commission rate (which starts at the standard
 * REFERRAL_RATE) can be changed here for this one referrer -- some are agreed
 * at a different rate. They only change what this popup shows and prints;
 * nothing is saved, and the Referral Bonuses table keeps its names and the
 * standard rate.
 */
export function ReferredOrdersModal({
  referrer,
  onClose,
}: {
  referrer: Referrer | null;
  onClose: () => void;
}) {
  const { settings: appSettings } = useAppSettings();
  const [ratePercent, setRatePercent] = useState(String(REFERRAL_RATE * 100));
  // The name printed for this referrer. Often the number belongs to nobody we
  // know, or the name on file is not what the referrer goes by -- so it can be
  // typed here, for this popup and its printout only, like the rate.
  const [nameInput, setNameInput] = useState("");

  // Each referrer opens at the standard rate and their own name, not
  // whatever was typed for the last one.
  useEffect(() => {
    if (!referrer) return;
    setRatePercent(String(REFERRAL_RATE * 100));
    setNameInput(referrer.name ?? "");
  }, [referrer]);

  useEffect(() => {
    if (!referrer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [referrer, onClose]);

  if (!referrer) return null;

  const parsed = Number(ratePercent);
  const rate = Number.isFinite(parsed) && parsed > 0 ? parsed / 100 : 0;
  const rateLabel = `${Number((rate * 100).toFixed(2))}%`;
  const commission = referrer.totalValue * rate;
  const name = nameInput.trim();

  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const business = businessFromSettings(appSettings);
    const title = name || referrer.phoneDisplay;
    const rows = referrer.orders
      .map(
        (o, i) => `
          <tr>
            <td class="c">${i + 1}</td>
            <td>${escapeHtml(o.shortId || o.id.slice(0, 8))}</td>
            <td>${escapeHtml(o.customer || "-")}</td>
            <td>${o.createdAt ? format(new Date(o.createdAt), "dd MMM yyyy") : "-"}</td>
            <td>${escapeHtml(o.status || "-")}</td>
            <td class="r">${money(o.amount)}</td>
            <td class="r">${money(o.amount * rate)}</td>
          </tr>`
      )
      .join("");

    win.document.open();
    win.document.write(`<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Referral commission - ${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #222; margin: 24px; }
          .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #ff5722; padding-bottom: 10px; margin-bottom: 16px; }
          h1 { color: #ff5722; font-size: 20px; margin: 0 0 4px; }
          .muted { color: #666; font-size: 12px; }
          .who { margin-bottom: 14px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #ff5722; color: #fff; }
          .c { text-align: center; }
          .r { text-align: right; white-space: nowrap; }
          tfoot td { font-weight: bold; background: #f8f8f8; }
        </style>
      </head>
      <body>
        <div class="head">
          <div>
            <h1>Referral Commission</h1>
            <div class="muted">Printed ${format(new Date(), "dd MMM yyyy, h:mm a")}</div>
          </div>
          <div style="text-align:right">
            <strong>${escapeHtml(business.name)}</strong>
            <div class="muted">${escapeHtml(business.phone)}</div>
          </div>
        </div>
        <div class="who">
          <strong>Referred by:</strong> ${escapeHtml(title)}
          ${name ? ` &middot; ${escapeHtml(referrer.phoneDisplay)}` : ""}
          <br />
          <strong>Orders:</strong> ${referrer.ordersCount}
          &nbsp;&nbsp; <strong>Commission rate:</strong> ${rateLabel}
        </div>
        <table>
          <thead>
            <tr>
              <th class="c">S.No</th><th>Order</th><th>Customer</th><th>Date</th><th>Status</th>
              <th class="r">Value (Rs.)</th><th class="r">Commission (Rs.)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="5">Total</td>
              <td class="r">${money(referrer.totalValue)}</td>
              <td class="r">${money(commission)}</td>
            </tr>
          </tfoot>
        </table>
      </body>
      </html>`);
    win.document.close();
    addPrintToolbar(win);

    const doPrint = () => {
      try {
        win.focus();
        win.print();
      } catch (err) {
        console.error("Print failed:", err);
      }
    };
    if (win.document.readyState === "complete") doPrint();
    else win.onload = doPrint;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-card-border/10">
          <div>
            <h2 className="text-lg font-bold">{name || referrer.phoneDisplay}</h2>
            <p className="text-sm text-text/60">
              {name ? `${referrer.phoneDisplay} · ` : ""}
              {referrer.ordersCount} order{referrer.ordersCount === 1 ? "" : "s"} referred
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-card-border/10 hover:border-primary-orange/40 text-sm font-medium"
            >
              <Printer className="w-4 h-4 text-primary-orange" />
              Print
            </button>
            <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-text/60 hover:bg-card/70">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-card-border/10">
          <label htmlFor="referral-name" className="text-sm font-medium">
            Name
          </label>
          <input
            id="referral-name"
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder={referrer.phoneDisplay}
            className="w-full sm:w-56 px-3 py-1.5 rounded-lg border border-card-border/20 bg-card focus:outline-none focus:border-primary-orange"
          />
          <label htmlFor="referral-rate" className="text-sm font-medium">
            Commission
          </label>
          <div className="flex items-center gap-1">
            <input
              id="referral-rate"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.5"
              value={ratePercent}
              onChange={(e) => setRatePercent(e.target.value)}
              className="w-24 px-3 py-1.5 rounded-lg border border-card-border/20 bg-card focus:outline-none focus:border-primary-orange"
            />
            <span className="text-sm text-text/60">%</span>
          </div>
          <span className="ml-auto text-sm">
            Commission:{" "}
            <span className="font-bold text-primary-orange tabular-nums">₹{money(commission)}</span>
          </span>
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
                <th className="p-3 text-right">Commission (₹)</th>
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
                  <td className="p-3 text-right tabular-nums">{(o.amount * rate).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-card-border/20 font-semibold">
                <td className="p-3" colSpan={4}>Total</td>
                <td className="p-3 text-right tabular-nums">{referrer.totalValue.toFixed(2)}</td>
                <td className="p-3 text-right tabular-nums">{commission.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>,
    document.body
  );
}
