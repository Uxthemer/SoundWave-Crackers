import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Download, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import { loadComparison, type ComparisonRow } from "../../hooks/usePurchasing";

const money = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Every vendor quote for the season, pivoted by product so the cheapest is
 * obvious at a glance.
 *
 * Only rows mapped to a product can appear — an unmapped vendor line has
 * nothing to be compared against — so the count of unmapped rows is surfaced
 * rather than letting them silently drop out of the picture.
 */
export function ComparisonTab({ seasonId }: { seasonId: string | null }) {
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [unmatched, setUnmatched] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyMulti, setOnlyMulti] = useState(false);

  useEffect(() => {
    if (!seasonId) return;
    setLoading(true);
    loadComparison(seasonId)
      .then((r) => {
        setRows(r.rows);
        setUnmatched(r.unmatchedCount);
      })
      .catch((e) => toast.error(e?.message || "Could not load comparison"))
      .finally(() => setLoading(false));
  }, [seasonId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!onlyMulti || r.offers.length > 1) &&
        (!q ||
          r.product_name.toLowerCase().includes(q) ||
          r.offers.some((o) => o.vendor_name.toLowerCase().includes(q)))
    );
  }, [rows, search, onlyMulti]);

  // What buying from the cheapest saves against the dearest, per case.
  const savings = useMemo(
    () =>
      rows.reduce((sum, r) => {
        const costs = r.offers.map((o) => o.landed_case_cost).filter((c) => c > 0);
        if (costs.length < 2) return sum;
        return sum + (Math.max(...costs) - Math.min(...costs));
      }, 0),
    [rows]
  );

  const exportComparison = () => {
    const flat = rows.flatMap((r) =>
      r.offers.map((o) => ({
        Product: r.product_name,
        Category: r.category_name ?? "",
        Vendor: o.vendor_name,
        "Vendor item": o.raw_label,
        Rating: o.rating,
        "List price": o.list_price,
        "Cost per pack": o.landed_retail_cost,
        "Packs per case": o.packs_per_case,
        "Cost per case": o.landed_case_cost,
        Rank: o.vendor_rank,
      }))
    );
    if (flat.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), "Comparison");
    XLSX.writeFile(wb, "vendor_price_comparison.xlsx");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-card/30 rounded-xl p-8 text-center">
        <p className="font-semibold mb-1">No vendor quotes to compare yet</p>
        <p className="text-text/60 text-sm">
          Upload price lists on the Vendor Price Lists tab, then map their rows to
          your products. Only mapped rows can be compared.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="bg-card/30 rounded-xl p-4">
          <p className="text-sm text-text/60">Products quoted</p>
          <p className="text-2xl font-bold">{rows.length}</p>
        </div>
        <div className="bg-card/30 rounded-xl p-4">
          <p className="text-sm text-text/60">With competing vendors</p>
          <p className="text-2xl font-bold">
            {rows.filter((r) => r.offers.length > 1).length}
          </p>
        </div>
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <p className="text-sm text-text/70">Saving by taking the cheapest</p>
          <p className="text-2xl font-bold text-green-600">{money(savings)}</p>
          <p className="text-xs text-text/50">per case, across contested products</p>
        </div>
      </div>

      {unmatched > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {unmatched} vendor rows are not mapped to a product
          </p>
          <p className="text-text/70 mt-1">
            They are excluded from this comparison. Map them on the Vendor Price
            Lists tab so their prices count.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[14rem]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product or vendor…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-card border border-card-border/10 text-sm"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text/50" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyMulti}
            onChange={(e) => setOnlyMulti(e.target.checked)}
            className="w-4 h-4 accent-primary-orange"
          />
          Only where vendors compete
        </label>
        <button
          onClick={exportComparison}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 text-sm"
        >
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      <div className="space-y-3">
        {visible.map((r) => (
          <div key={r.product_id} className="bg-card/30 rounded-xl p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h3 className="font-semibold">
                {r.product_order !== null && (
                  <span className="text-text/40 mr-2">#{r.product_order}</span>
                )}
                {r.product_name}
              </h3>
              <span className="text-xs text-text/50">{r.category_name ?? "—"}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-card/50">
                  <tr>
                    <th className="p-2 text-left">Vendor</th>
                    <th className="p-2 text-left">Their item</th>
                    <th className="p-2 text-right">Rating</th>
                    <th className="p-2 text-right">List</th>
                    <th className="p-2 text-right">Cost / pack</th>
                    <th className="p-2 text-right">Packs / case</th>
                    <th className="p-2 text-right">Cost / case</th>
                  </tr>
                </thead>
                <tbody>
                  {r.offers.map((o) => {
                    const best = o.vendor_rank === 1;
                    return (
                      <tr
                        key={o.price_item_id}
                        className={`border-t border-card-border/10 ${best ? "bg-green-500/10" : ""}`}
                      >
                        <td className="p-2 font-medium">
                          {o.vendor_name}
                          {best && (
                            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-600 text-white">
                              best
                            </span>
                          )}
                          {o.needs_unit_review && (
                            <span
                              className="ml-2 text-xs text-amber-600"
                              title="Retail packs per vendor unit not confirmed"
                            >
                              ratio unconfirmed
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-text/60">{o.raw_label}</td>
                        <td className="p-2 text-right">{o.rating}</td>
                        <td className="p-2 text-right text-text/60">{money(o.list_price)}</td>
                        <td
                          className={`p-2 text-right ${
                            best ? "font-bold text-green-700 dark:text-green-400" : ""
                          }`}
                        >
                          {money(o.landed_retail_cost)}
                        </td>
                        <td className="p-2 text-right">{o.packs_per_case || "—"}</td>
                        <td className="p-2 text-right">{money(o.landed_case_cost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {r.offers.length === 1 && (
              <p className="text-xs text-text/50 mt-2">
                Only one vendor has quoted this, so there is nothing to compare.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
