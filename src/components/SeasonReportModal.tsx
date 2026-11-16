import { useState } from "react";
import { FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAppSettings } from "../context/AppSettingsContext";
import { useAuth } from "../context/AuthContext";
import { businessFromSettings } from "../lib/businessDetails";
import type { ReportRange } from "../lib/seasonReport";

const CONTENTS = [
  "Summary: orders, actual & expected revenue, amount received, balance due, extra received, expenses, customers, stock",
  "Revenue by stage and amount received by payment method",
  "Expenses by type, by person, and every expense",
  "Every order with its status, discount, received and balance",
  "Analytics: sales by month, state, district, city and product (amount and number of orders), referrals",
  "New customers in the period",
  "Stock availability for the season",
];

/**
 * Overview → Report. One file for the season (or dates) on screen, as CSV or
 * PDF; see lib/seasonReport for what goes in it and why it is read fresh.
 */
export default function SeasonReportModal({
  range,
  periodLabel,
  onClose,
}: {
  range: ReportRange;
  periodLabel: string;
  onClose: () => void;
}) {
  const { settings } = useAppSettings();
  const { userRole } = useAuth();
  const [kind, setKind] = useState<"pdf" | "csv">("pdf");
  const [building, setBuilding] = useState(false);
  /** Profit is shown on the Dashboard behind an eye; in a file it is superadmin's call. */
  const isSuperadmin = userRole?.name === "superadmin";
  const [includeProfit, setIncludeProfit] = useState(false);

  const download = async () => {
    setBuilding(true);
    try {
      const { buildSeasonReport, seasonReportCsv, seasonReportFileName } = await import(
        "../lib/seasonReport"
      );
      const report = await buildSeasonReport(range, periodLabel, businessFromSettings(settings), {
        includeProfit: isSuperadmin && includeProfit,
      });
      if (kind === "csv") {
        const blob = new Blob([seasonReportCsv(report)], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = seasonReportFileName(periodLabel, "csv");
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const { buildSeasonReportPdf } = await import("../lib/seasonReportPdf");
        const pdf = await buildSeasonReportPdf(report);
        pdf.save(seasonReportFileName(periodLabel, "pdf"));
      }
      toast.success("Report downloaded");
      onClose();
    } catch (error) {
      console.error("Failed to build the season report:", error);
      toast.error("Could not build the report. Please try again.");
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/60 sm:p-4"
      onClick={() => !building && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Download report"
        onClick={(e) => e.stopPropagation()}
        className="bg-background w-full sm:max-w-lg sm:rounded-xl flex flex-col max-h-full sm:max-h-[90vh]"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-card-border/10">
          <div>
            <h2 className="font-heading text-2xl">Report</h2>
            <p className="text-sm text-text/60">{periodLabel}</p>
          </div>
          <button
            onClick={onClose}
            disabled={building}
            className="p-2 rounded-full hover:bg-card/60 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="File type">
            {(
              [
                ["pdf", "PDF", "To print or share", FileText],
                ["csv", "CSV", "To open in Excel", FileSpreadsheet],
              ] as const
            ).map(([value, label, hint, Icon]) => (
              <button
                key={value}
                role="radio"
                aria-checked={kind === value}
                onClick={() => setKind(value)}
                className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                  kind === value
                    ? "border-primary-orange bg-primary-orange/10"
                    : "border-card-border/20 hover:bg-card/60"
                }`}
              >
                <Icon className={`w-6 h-6 ${kind === value ? "text-primary-orange" : "text-text/60"}`} />
                <span>
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-xs text-text/60">{hint}</span>
                </span>
              </button>
            ))}
          </div>

          <div>
            <p className="font-semibold mb-1">What it includes</p>
            <ul className="list-disc pl-5 space-y-1 text-text/70">
              {CONTENTS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          {isSuperadmin && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeProfit}
                onChange={(e) => setIncludeProfit(e.target.checked)}
                className="w-4 h-4 accent-primary-orange"
              />
              <span>Include profit</span>
            </label>
          )}
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-card-border/10">
          <button
            onClick={onClose}
            disabled={building}
            className="px-4 py-2 rounded-lg bg-card hover:bg-card/70 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={download}
            disabled={building}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-orange text-white disabled:opacity-50"
          >
            {building && <Loader2 className="w-4 h-4 animate-spin" />}
            {building ? "Building…" : `Download ${kind.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
