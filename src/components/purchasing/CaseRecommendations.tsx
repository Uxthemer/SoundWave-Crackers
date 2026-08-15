import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Download, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  loadCaseRecommendations,
  type CaseRecommendation,
} from "../../hooks/usePurchasing";

const money = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Turns last season's sales into a case recommendation, showing the working.
 *
 * The business reasons in cases, not pieces: "we sold 180 boxes, a case is 18,
 * that was 10 cases, allow for growth and buy 12." Every step of that is shown
 * so the number can be argued with rather than just accepted.
 */
export function CaseRecommendations({
  seasonId,
  basisSeasonId,
  basisSeasonName,
  growth,
}: {
  seasonId: string | null;
  basisSeasonId: string | null;
  basisSeasonName: string | null;
  growth: number;
}) {
  const [rows, setRows] = useState<CaseRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyNeeded, setOnlyNeeded] = useState(true);

  useEffect(() => {
    if (!seasonId || !basisSeasonId) {
      setRows([]);
      return;
    }
    setLoading(true);
    loadCaseRecommendations(seasonId, basisSeasonId, growth)
      .then(setRows)
      .catch((e) => toast.error(e?.message || "Could not load recommendations"))
      .finally(() => setLoading(false));
  }, [seasonId, basisSeasonId, growth]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!onlyNeeded || (r.recommended_cases ?? 0) > 0) &&
        (!q || r.product_name.toLowerCase().includes(q))
    );
  }, [rows, search, onlyNeeded]);

  const estimate = useMemo(
    () =>
      visible.reduce(
        (sum, r) => sum + (r.recommended_cases ?? 0) * (r.landed_case_cost ?? 0),
        0
      ),
    [visible]
  );

  const noQuote = rows.filter((r) => r.packs_per_case === null).length;

  const exportRows = () => {
    const flat = visible.map((r) => ({
      Product: r.product_name,
      [`Sold in ${basisSeasonName ?? "last season"}`]: r.sold_last_season,
      "Packs per case": r.packs_per_case ?? "",
      "Cases sold": r.cases_sold_last_season ?? "",
      "Stock on hand": r.stock_on_hand,
      "Recommended cases": r.recommended_cases ?? "",
      Vendor: r.vendor_name ?? "",
      "Cost per case": r.landed_case_cost ?? "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), "Recommendation");
    XLSX.writeFile(wb, "case_recommendations.xlsx");
  };

  if (!basisSeasonId) {
    return (
      <p className="text-text/60 text-sm">
        Pick a season to base demand on above, and the case recommendation will
        appear here.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-primary-orange" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[12rem]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-card border border-card-border/10 text-sm"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text/50" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyNeeded}
            onChange={(e) => setOnlyNeeded(e.target.checked)}
            className="w-4 h-4 accent-primary-orange"
          />
          Only items to buy
        </label>
        <button
          onClick={exportRows}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 text-sm"
        >
          <Download className="w-4 h-4" /> Export
        </button>
        <div className="ml-auto text-right">
          <p className="text-xs text-text/60">Estimated spend</p>
          <p className="text-xl font-bold text-primary-orange">{money(estimate)}</p>
        </div>
      </div>

      {noQuote > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-text/70">
            {noQuote} products have no vendor quote this season, so no case size is
            known and they cannot be recommended.
          </span>
        </div>
      )}

      <div className="overflow-x-auto border border-card-border/10 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-card/60">
            <tr>
              <th className="p-2 text-left">Product</th>
              <th className="p-2 text-right">Sold in {basisSeasonName ?? "basis"}</th>
              <th className="p-2 text-right">Packs / case</th>
              <th className="p-2 text-right">= cases sold</th>
              <th className="p-2 text-right">In stock</th>
              <th className="p-2 text-right">Buy (cases)</th>
              <th className="p-2 text-left">Best vendor</th>
              <th className="p-2 text-right">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-text/60">
                  Nothing to buy at a {Math.round((growth - 1) * 100)}% growth
                  allowance — stock already covers expected demand.
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr key={r.product_id} className="border-t border-card-border/10">
                <td className="p-2">
                  {r.product_order !== null && (
                    <span className="text-text/40 mr-2">#{r.product_order}</span>
                  )}
                  {r.product_name}
                </td>
                <td className="p-2 text-right">{r.sold_last_season}</td>
                <td className="p-2 text-right text-text/60">
                  {r.packs_per_case ?? "—"}
                </td>
                <td className="p-2 text-right text-text/60">
                  {r.cases_sold_last_season ?? "—"}
                </td>
                <td className="p-2 text-right text-text/60">{r.stock_on_hand}</td>
                <td className="p-2 text-right font-bold text-primary-orange">
                  {r.recommended_cases ?? "—"}
                </td>
                <td className="p-2 text-text/70">{r.vendor_name ?? "—"}</td>
                <td className="p-2 text-right">
                  {r.recommended_cases && r.landed_case_cost
                    ? money(r.recommended_cases * r.landed_case_cost)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
