import { useEffect, useState } from "react";
import { Loader2, Download, Printer, FileSpreadsheet } from "lucide-react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import { loadPriceListForExport, type ExportGroup } from "../../hooks/usePurchasing";

/**
 * Preview and download of the published price list.
 *
 * Sequence matters: categories run in their own `order`, and products inside a
 * category run in theirs, which is the order the printed list has always used.
 * Anything else and the reprint no longer matches the customer's copy.
 */
export function PriceListExport({
  seasonId,
  seasonName,
}: {
  seasonId: string | null;
  seasonName: string | null;
}) {
  const [groups, setGroups] = useState<ExportGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const slug = (seasonName || "current").replace(/\s+/g, "-");

  const load = async () => {
    if (!seasonId) return;
    setLoading(true);
    try {
      setGroups(await loadPriceListForExport(seasonId));
    } catch (e: any) {
      toast.error(e?.message || "Could not load the price list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  const total = groups.reduce((n, g) => n + g.products.length, 0);

  const downloadExcel = () => {
    const rows: Record<string, string | number>[] = [];
    let serial = 1;
    groups.forEach((g) => {
      g.products.forEach((p) => {
        rows.push({
          "S.No": serial++,
          Category: g.category,
          Product: p.name,
          "Actual Price": p.actual_price,
          "Offer Price": p.offer_price,
          Quantity: p.content ?? "",
        });
      });
    });
    if (rows.length === 0) {
      toast.error("Nothing to download");
      return;
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Price List");
    XLSX.writeFile(wb, `soundwave_price_list_${slug}.xlsx`);
  };

  const printList = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    let serial = 1;
    const body = groups
      .map(
        (g) => `
        <tr><td colspan="5" class="cat">${g.category}</td></tr>
        ${g.products
          .map(
            (p) => `<tr>
              <td>${serial++}</td>
              <td>${p.name}</td>
              <td class="r"><del>₹${p.actual_price}</del></td>
              <td class="r b">₹${p.offer_price}</td>
              <td>${p.content ?? "-"}</td>
            </tr>`
          )
          .join("")}`
      )
      .join("");

    w.document.write(`<!doctype html><html><head>
      <title>Soundwave Crackers - Price List ${slug}</title>
      <style>
        body{font-family:sans-serif;padding:24px;color:#222}
        h1{margin:0 0 4px;color:#c62828}
        table{width:100%;border-collapse:collapse;margin-top:16px}
        th,td{border:1px solid #ccc;padding:6px 8px;font-size:13px}
        th{background:#c62828;color:#fff;text-align:left}
        .cat{background:#f5f5f5;text-align:center;font-weight:bold;font-size:15px}
        .r{text-align:right}.b{font-weight:bold}
      </style></head><body>
      <h1>Soundwave Crackers</h1>
      <p>Price List ${seasonName ?? ""}</p>
      <table>
        <thead><tr><th>S.No</th><th>Product</th><th>Actual Price</th><th>Offer Price</th><th>Quantity</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
      </body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div className="bg-card/30 rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-lg font-semibold">Price list preview</h3>
          <p className="text-sm text-text/60">
            {total} products, in category and product order — the same sequence as
            the printed list.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="px-3 py-2 rounded-lg bg-card hover:bg-card/70 text-sm"
          >
            Refresh
          </button>
          <button
            onClick={downloadExcel}
            disabled={total === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 text-sm disabled:opacity-40"
          >
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
          <button
            onClick={printList}
            disabled={total === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-orange text-white text-sm disabled:opacity-40"
          >
            <Printer className="w-4 h-4" /> Print / PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary-orange" />
        </div>
      ) : total === 0 ? (
        <p className="text-text/60 text-sm">
          No active products in this season yet.
        </p>
      ) : (
        <div className="overflow-x-auto max-h-[30rem] overflow-y-auto border border-card-border/10 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-card/60 sticky top-0">
              <tr>
                <th className="p-2 text-left w-14">S.No</th>
                <th className="p-2 text-left">Product</th>
                <th className="p-2 text-right">Actual</th>
                <th className="p-2 text-right">Offer</th>
                <th className="p-2 text-left">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let serial = 1;
                return groups.flatMap((g) => [
                  <tr key={`cat-${g.category}`} className="bg-card/40">
                    <td colSpan={5} className="p-2 text-center font-semibold">
                      {g.category}
                    </td>
                  </tr>,
                  ...g.products.map((p, i) => (
                    <tr key={`${g.category}-${i}`} className="border-t border-card-border/10">
                      <td className="p-2 text-text/50">{serial++}</td>
                      <td className="p-2">{p.name}</td>
                      <td className="p-2 text-right line-through text-text/50">
                        ₹{p.actual_price}
                      </td>
                      <td className="p-2 text-right font-semibold text-primary-orange">
                        ₹{p.offer_price}
                      </td>
                      <td className="p-2 text-text/60">{p.content ?? "—"}</td>
                    </tr>
                  )),
                ]);
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
