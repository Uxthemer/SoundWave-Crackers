import { useEffect, useMemo, useState } from "react";
import {
  Loader2, UploadCloud, FileText, Plus, Trash2, Search, Printer,
  AlertTriangle, CheckCircle2, Wand2, ShoppingCart, Tag, Link2,
  Scale, Download, ClipboardPaste,
} from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useSeasons } from "../context/SeasonContext";
import {
  extractRowsFromText, extractRowsFromSheet, extractTextFromPdf,
  looksLikeScannedPdf, type ExtractedRow,
} from "../lib/priceListExtractor";
import {
  useVendors, usePriceLists, usePriceListRows, usePurchasePlans, usePlanLines,
  usePurchaseOrders, matchRowsToProducts, suggestVendors, previewPriceList,
  applyPriceList, loadCaseRecommendations, loadPriceListForExport,
  type VendorSuggestion, type PriceListPreviewRow, type CaseRecommendation,
} from "../hooks/usePurchasing";
import { ComparisonTab } from "../components/purchasing/ComparisonTab";
import { CaseRecommendations } from "../components/purchasing/CaseRecommendations";
import { VendorSwitcher } from "../components/purchasing/VendorSwitcher";
import { PriceListExport } from "../components/purchasing/PriceListExport";

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type Tab = "pricelists" | "comparison" | "plan" | "orders" | "retail";

/**
 * A cell that only writes on blur/Enter, so typing never fires a round trip
 * per keystroke and the value survives the list re-sorting underneath it.
 */
function EditableCell({
  value, onSave, type = "text", width = "w-24", align = "text-right", placeholder,
}: {
  value: string | number | null;
  onSave: (v: string) => void | Promise<void>;
  type?: "text" | "number";
  width?: string;
  align?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);

  const commit = () => {
    if (String(draft) === String(value ?? "")) return;
    onSave(String(draft));
  };

  return (
    <input
      type={type}
      step={type === "number" ? "0.01" : undefined}
      value={draft as any}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(value ?? "");
      }}
      className={`${width} ${align} px-2 py-1 rounded bg-card border border-card-border/10 text-xs focus:border-primary-orange focus:outline-none`}
    />
  );
}

export function Purchasing() {
  const { userRole } = useAuth();
  const { seasons, selectedSeason, selectedSeasonId, setSelectedSeasonId } = useSeasons();
  const [tab, setTab] = useState<Tab>("pricelists");

  const isAdmin = ["admin", "superadmin"].includes(userRole?.name || "");

  if (!userRole) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen pt-24 pb-12 text-center">
        <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
        <p>You don't have permission to access this page.</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof FileText }[] = [
    { key: "pricelists", label: "Vendor Price Lists", icon: FileText },
    { key: "comparison", label: "Price Comparison", icon: Scale },
    { key: "plan", label: "Purchase Plan", icon: Wand2 },
    { key: "orders", label: "Purchase Orders", icon: ShoppingCart },
    { key: "retail", label: "Generate Price List", icon: Tag },
  ];

  return (
    <div className="min-h-screen pt-8 pb-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
          <div>
            <h1 className="font-heading text-4xl">Purchasing</h1>
            <p className="text-text/60 mt-1">
              Vendor price lists, purchase planning, orders and retail pricing
            </p>
          </div>
          <select
            value={selectedSeasonId ?? ""}
            onChange={(e) => setSelectedSeasonId(e.target.value)}
            className="px-4 py-2 rounded-lg bg-card border border-card-border/10 w-full md:w-auto"
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                Season {s.name}
                {s.status === "active" ? " (live)" : s.status === "draft" ? " (draft)" : " (closed)"}
              </option>
            ))}
          </select>
        </div>

        <p className="text-sm text-text/60 mb-6">
          Everything below belongs to{" "}
          <span className="font-semibold text-primary-orange">
            season {selectedSeason?.name ?? "—"}
          </span>
          . Vendor quotes are per season, so last year's rates stay untouched.
        </p>

        <div className="flex flex-wrap gap-2 mb-8">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  active ? "bg-primary-orange text-white shadow-md" : "bg-card hover:bg-card/70 text-text/80"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "pricelists" && <PriceListsTab seasonId={selectedSeasonId} />}
        {tab === "comparison" && <ComparisonTab seasonId={selectedSeasonId} />}
        {tab === "plan" && <PlanTab seasonId={selectedSeasonId} />}
        {tab === "orders" && <OrdersTab seasonId={selectedSeasonId} />}
        {tab === "retail" && (
          <RetailTab seasonId={selectedSeasonId} seasonName={selectedSeason?.name ?? null} />
        )}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Vendor price lists: upload -> extract -> review -> match                    */
/* ========================================================================== */

function PriceListsTab({ seasonId }: { seasonId: string | null }) {
  const { vendors } = useVendors();
  const { lists, saveExtraction, deleteList, refresh } = usePriceLists(seasonId);
  const [vendorId, setVendorId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<ExtractedRow[] | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [openListId, setOpenListId] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (!vendorId && vendors.length > 0) setVendorId(vendors[0].id);
  }, [vendors, vendorId]);

  const handleParse = async () => {
    if (!file || !vendorId) { toast.error("Pick a vendor and a file"); return; }
    setParsing(true);
    setPreview(null);
    setParseError(null);
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith(".pdf")) {
        const text = await extractTextFromPdf(file);
        if (looksLikeScannedPdf(text)) {
          throw new Error(
            "This PDF has no text layer — it is a scan or an image. Export it from Excel, or add the rows manually below."
          );
        }
        const r = extractRowsFromText(text);
        setPreview(r.rows);
        setSkipped(r.skipped);
      } else if (/\.(xlsx?|csv)$/.test(name)) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        const r = extractRowsFromSheet(json);
        setPreview(r.rows);
        setSkipped(r.skipped);
      } else {
        throw new Error("Upload a PDF, XLSX or CSV price list.");
      }
    } catch (e: any) {
      // Show the real reason and keep it on screen — a toast disappears before
      // it can be acted on, and these messages say what to do next.
      const msg = e?.message || "Could not read that file";
      setParseError(msg);
      toast.error(msg);
    } finally {
      setParsing(false);
    }
  };

  const handlePaste = () => {
    if (!pasted.trim()) { toast.error("Paste the price list rows first"); return; }
    const r = extractRowsFromText(pasted);
    if (r.rows.length === 0) {
      setParseError("No product rows could be read from that text.");
      return;
    }
    setPreview(r.rows);
    setSkipped(r.skipped);
    setPasteOpen(false);
    setParseError(null);
  };

  const handleSave = async () => {
    if (!preview || !seasonId || !vendorId) return;
    try {
      const id = await saveExtraction({
        vendorId, seasonId,
        sourceName: file?.name || "manual",
        sourceType: file?.name.toLowerCase().endsWith(".pdf") ? "pdf" : "excel",
        rows: preview,
      });
      toast.success(`Saved ${preview.length} rows`);
      setPreview(null);
      setFile(null);
      setOpenListId(id);
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    }
  };

  const lowConfidence = preview?.filter((r) => r.confidence < 0.7).length ?? 0;

  return (
    <div className="space-y-8">
      <div className="bg-card/30 rounded-xl p-5">
        <h2 className="text-xl font-semibold mb-1">Upload a vendor price list</h2>
        <p className="text-sm text-text/60 mb-4">
          PDF or Excel. The rates, pack size and case size are read automatically —
          you confirm them before anything is saved.
        </p>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className="px-3 py-2 rounded-lg bg-card border border-card-border/10"
          >
            <option value="">Select vendor…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} — {v.discount_percent}% disc, {v.gst_percent}% GST, {v.packing_percent}% packing
              </option>
            ))}
          </select>
          <input
            type="file"
            accept=".pdf,.xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="px-3 py-2 rounded-lg bg-card border border-card-border/10 text-sm"
          />
          <button
            onClick={handleParse}
            disabled={parsing || !file || !vendorId}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary-orange text-white disabled:opacity-40"
          >
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            {parsing ? "Reading…" : "Read file"}
          </button>
        </div>

        <button
          onClick={() => setPasteOpen(true)}
          className="mt-3 flex items-center gap-2 text-sm text-primary-orange hover:underline"
        >
          <ClipboardPaste className="w-4 h-4" />
          Or paste the rows as text — works when a PDF is a scan
        </button>

        {parseError && (
          <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
            <p className="font-semibold text-red-600">Could not read that file</p>
            <p className="text-text/70 mt-1">{parseError}</p>
          </div>
        )}
      </div>

      {pasteOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="font-heading text-xl mb-1">Paste price list rows</h3>
            <p className="text-sm text-text/60 mb-3">
              Copy the rows straight out of the PDF or spreadsheet — one item per
              line. Headings and terms are ignored automatically.
            </p>
            <textarea
              rows={12}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={
                "S101 Lucky Money (3 Pcs) 3 Pcs 140 1 Box 60 Boxes\nS103 Oola Vedi (25 Pcs) 25 Pcs 135 1 Box 60 Boxes"
              }
              className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10 font-mono text-xs"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setPasteOpen(false)} className="px-4 py-2 rounded-lg bg-card hover:bg-card/70">
                Cancel
              </button>
              <button onClick={handlePaste} className="px-4 py-2 rounded-lg bg-primary-orange text-white">
                Read rows
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="bg-card/30 rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-xl font-semibold">
                Check {preview.length} extracted rows
              </h2>
              <p className="text-sm text-text/60">
                {skipped.length} lines ignored as headings or notes
                {lowConfidence > 0 && (
                  <> · <span className="text-amber-600 font-semibold">{lowConfidence} need a look</span></>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)} className="px-4 py-2 rounded-lg bg-card hover:bg-card/70">
                Discard
              </button>
              <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700">
                Save {preview.length} rows
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[26rem] overflow-y-auto border border-card-border/10 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-card/60 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Code</th>
                  <th className="p-2 text-left">Item</th>
                  <th className="p-2 text-right">Rate</th>
                  <th className="p-2 text-left">Per</th>
                  <th className="p-2 text-right">Pack</th>
                  <th className="p-2 text-right">Case</th>
                  <th className="p-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr
                    key={i}
                    className={`border-t border-card-border/10 ${r.confidence < 0.7 ? "bg-amber-500/10" : ""}`}
                  >
                    <td className="p-2 text-text/60">{r.vendorCode ?? "—"}</td>
                    <td className="p-2">{r.label}</td>
                    <td className="p-2 text-right">{money(r.listPrice)}</td>
                    <td className="p-2 text-text/70">
                      {r.rateQty > 1 ? `${r.rateQty} ` : ""}{r.rateUnit}
                    </td>
                    <td className="p-2 text-right">{r.packQty ?? "—"}</td>
                    <td className="p-2 text-right">{r.caseQty ?? "—"}</td>
                    <td className="p-2 text-xs text-amber-700 dark:text-amber-400">
                      {r.warnings.join(" ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold mb-3">
          Saved price lists — season total {lists.length}
        </h2>
        {lists.length === 0 ? (
          <p className="text-text/60">No price lists uploaded for this season yet.</p>
        ) : (
          <div className="space-y-3">
            {lists.map((l) => {
              const vendor = vendors.find((v) => v.id === l.vendor_id);
              return (
                <div key={l.id} className="bg-card/30 rounded-xl">
                  <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{vendor?.name ?? "Unknown vendor"}</p>
                      <p className="text-sm text-text/60">
                        {l.source_name} · {l.row_count} rows ·{" "}
                        {format(new Date(l.created_at), "d MMM yyyy")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setOpenListId(openListId === l.id ? null : l.id)}
                        className="px-4 py-2 rounded-lg bg-card hover:bg-card/70"
                      >
                        {openListId === l.id ? "Hide" : "View & match"}
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm("Delete this price list and all its rows?")) return;
                          await deleteList(l.id);
                          toast.success("Deleted");
                        }}
                        className="px-3 py-2 rounded-lg bg-card hover:bg-red-500/20 text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {openListId === l.id && (
                    <PriceListDetail
                      priceListId={l.id}
                      seasonId={seasonId}
                      vendorId={l.vendor_id}
                      onChanged={refresh}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PriceListDetail({
  priceListId, seasonId, vendorId, onChanged,
}: {
  priceListId: string; seasonId: string | null; vendorId: string; onChanged: () => void;
}) {
  const { rows, refresh, updateRow, addRow, deleteRow } = usePriceListRows(priceListId);
  const [products, setProducts] = useState<any[]>([]);
  const [matching, setMatching] = useState(false);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (!seasonId) return;
    supabase
      .from("season_catalog")
      .select("id,name,product_code,content")
      .eq("season_id", seasonId)
      .order("order", { nullsFirst: false })
      .order("name")
      .then(({ data }) => setProducts(data || []));
  }, [seasonId]);

  const runMatch = async () => {
    if (!seasonId) return;
    setMatching(true);
    try {
      const unmatched = rows.filter((r) => !r.product_id).map((r) => ({ id: r.id, raw_label: r.raw_label }));
      const res = await matchRowsToProducts(seasonId, unmatched);
      toast.success(
        `Matched ${res.matched}` +
          (res.ambiguous > 0 ? ` · ${res.ambiguous} too close to call, map them by hand` : "")
      );
      await refresh();
      onChanged();
    } finally {
      setMatching(false);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.raw_label.toLowerCase().includes(q));
  }, [rows, search]);

  const unmatchedCount = rows.filter((r) => !r.product_id).length;
  const needsUnitCount = rows.filter((r) => r.needs_unit_review).length;

  return (
    <div className="border-t border-card-border/10 p-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative flex-1 min-w-[12rem]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rows…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-card border border-card-border/10 text-sm"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text/50" />
        </div>
        <button
          onClick={runMatch}
          disabled={matching || unmatchedCount === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 text-sm disabled:opacity-40"
        >
          <Link2 className="w-4 h-4" />
          {matching ? "Matching…" : `Auto-match ${unmatchedCount} unmatched`}
        </button>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 text-sm"
        >
          <Plus className="w-4 h-4" /> Add item manually
        </button>
      </div>

      {needsUnitCount > 0 && (
        <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {needsUnitCount} rows need the retail ratio confirmed
          </p>
          <p className="text-text/70 mt-1">
            A vendor unit is often several of your retail packs — Sangamithra quote
            ₹280 per unit for an item you sell at ₹41 a box. Set{" "}
            <strong>retail packs per vendor unit</strong> below so the cost per pack
            is right; every price and margin depends on it.
          </p>
        </div>
      )}

      <div className="overflow-x-auto border border-card-border/10 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-card/60">
            <tr>
              <th className="p-2 text-left">Vendor item</th>
              <th className="p-2 text-left">Mapped product</th>
              <th className="p-2 text-right">Rate</th>
              <th className="p-2 text-right">Case qty</th>
              <th className="p-2 text-right" title="Pieces the vendor states per unit">
                Pieces / unit
              </th>
              <th className="p-2 text-right" title="Retail packs yielded by one vendor unit">
                Packs / unit
              </th>
              <th className="p-2 text-right">Cost / pack</th>
              <th className="p-2 text-right">Cost / case</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-t border-card-border/10">
                <td className="p-2">
                  <EditableCell
                    value={r.raw_label}
                    width="w-full min-w-[10rem]"
                    align="text-left"
                    onSave={(v) => {
                      if (v.trim()) updateRow(r.id, { raw_label: v.trim() } as any);
                    }}
                  />
                  <div className="text-xs text-text/50 mt-1">
                    per {r.rate_qty > 1 ? `${r.rate_qty} ` : ""}{r.rate_unit}
                    {r.raw_pack_text ? ` · ${r.raw_pack_text}` : ""}
                  </div>
                </td>
                <td className="p-2">
                  <select
                    value={r.product_id ?? ""}
                    onChange={(e) =>
                      updateRow(r.id, {
                        product_id: e.target.value || null,
                        match_method: e.target.value ? "manual" : null,
                        match_confidence: e.target.value ? 1 : null,
                      } as any)
                    }
                    className={`w-full px-2 py-1 rounded bg-card border text-xs ${
                      r.product_id ? "border-card-border/10" : "border-amber-500/60"
                    }`}
                  >
                    <option value="">— not mapped —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.content ? ` (${p.content})` : ""}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2 text-right">
                  <EditableCell
                    type="number"
                    value={r.list_price}
                    width="w-24"
                    onSave={(v) => updateRow(r.id, { list_price: Number(v) || 0 } as any)}
                  />
                </td>
                <td className="p-2 text-right">
                  <EditableCell
                    type="number"
                    value={r.case_qty}
                    width="w-20"
                    placeholder="?"
                    onSave={(v) =>
                      updateRow(r.id, { case_qty: v === "" ? null : Number(v) } as any)
                    }
                  />
                </td>
                <td className="p-2 text-right">
                  <EditableCell
                    type="number"
                    value={r.pack_qty}
                    width="w-20"
                    placeholder="?"
                    onSave={(v) =>
                      updateRow(r.id, { pack_qty: v === "" ? null : Number(v) } as any)
                    }
                  />
                </td>
                <td className="p-2 text-right">
                  <div className={r.needs_unit_review ? "ring-1 ring-amber-500/60 rounded" : ""}>
                    <EditableCell
                      type="number"
                      value={r.retail_units_per_rate_unit}
                      width="w-20"
                      placeholder={String(r.pack_qty ?? 1)}
                      onSave={(v) =>
                        updateRow(r.id, {
                          retail_units_per_rate_unit: v === "" ? null : Number(v),
                        } as any)
                      }
                    />
                  </div>
                </td>
                <td className="p-2 text-right font-semibold">{money(r.landed_retail_cost)}</td>
                <td className="p-2 text-right">{money(r.landed_case_cost)}</td>
                <td className="p-2">
                  <button
                    onClick={() => deleteRow(r.id)}
                    className="p-1 text-red-500 hover:bg-red-500/10 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <ManualItemForm
          products={products}
          onCancel={() => setShowAdd(false)}
          onSave={async (row) => {
            await addRow({
              ...row,
              price_list_id: priceListId,
              vendor_id: vendorId,
              season_id: seasonId!,
            } as any);
            setShowAdd(false);
            toast.success("Item added");
          }}
        />
      )}
    </div>
  );
}

function ManualItemForm({
  products, onCancel, onSave,
}: {
  products: any[];
  onCancel: () => void;
  onSave: (row: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    raw_label: "", product_id: "", list_price: "", rate_qty: "1",
    rate_unit: "box", pack_qty: "", retail_units_per_rate_unit: "", case_qty: "",
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <h3 className="font-heading text-xl mb-4">Add item to this vendor's list</h3>
        <div className="grid gap-3">
          <input
            placeholder="Item name as the vendor calls it"
            value={form.raw_label}
            onChange={(e) => setForm({ ...form, raw_label: e.target.value })}
            className="px-3 py-2 rounded-lg bg-card border border-card-border/10"
          />
          <select
            value={form.product_id}
            onChange={(e) => setForm({ ...form, product_id: e.target.value })}
            className="px-3 py-2 rounded-lg bg-card border border-card-border/10"
          >
            <option value="">Map to product (optional)</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-sm">
              Rate
              <input type="number" step="0.01" value={form.list_price}
                onChange={(e) => setForm({ ...form, list_price: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10" />
            </label>
            <label className="text-sm">
              per qty
              <input type="number" value={form.rate_qty}
                onChange={(e) => setForm({ ...form, rate_qty: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10" />
            </label>
            <label className="text-sm">
              unit
              <select value={form.rate_unit}
                onChange={(e) => setForm({ ...form, rate_unit: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10">
                {["box", "piece", "pkt", "bag", "unit", "tin", "case"].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-sm">
              Pieces / unit
              <input type="number" value={form.pack_qty}
                onChange={(e) => setForm({ ...form, pack_qty: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10" />
            </label>
            <label className="text-sm" title="How many of your retail packs one vendor unit yields">
              Retail packs / unit
              <input type="number" step="0.01" value={form.retail_units_per_rate_unit}
                onChange={(e) => setForm({ ...form, retail_units_per_rate_unit: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10" />
            </label>
            <label className="text-sm">
              Units / case
              <input type="number" value={form.case_qty}
                onChange={(e) => setForm({ ...form, case_qty: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10" />
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-card hover:bg-card/70">Cancel</button>
          <button
            onClick={() => {
              if (!form.raw_label || !form.list_price) { toast.error("Name and rate are required"); return; }
              onSave({
                raw_label: form.raw_label,
                product_id: form.product_id || null,
                match_method: form.product_id ? "manual" : null,
                list_price: Number(form.list_price),
                rate_qty: Number(form.rate_qty) || 1,
                rate_unit: form.rate_unit,
                pack_qty: form.pack_qty ? Number(form.pack_qty) : null,
                retail_units_per_rate_unit: form.retail_units_per_rate_unit
                  ? Number(form.retail_units_per_rate_unit) : null,
                case_qty: form.case_qty ? Number(form.case_qty) : null,
              });
            }}
            className="px-4 py-2 rounded-lg bg-primary-orange text-white"
          >
            Add item
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Purchase plan                                                              */
/* ========================================================================== */

function PlanTab({ seasonId }: { seasonId: string | null }) {
  const { seasons, activeSeason } = useSeasons();
  const { plans, generate, createEmpty, remove } = usePurchasePlans(seasonId);
  const [planId, setPlanId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [coverage, setCoverage] = useState("1.2");
  const [basisSeason, setBasisSeason] = useState<string>("");

  useEffect(() => {
    if (!planId && plans.length > 0) setPlanId(plans[0].id);
  }, [plans, planId]);

  useEffect(() => {
    if (basisSeason) return;
    // Default the demand basis to the season before the one being planned.
    const target = seasons.find((s) => s.id === seasonId);
    if (!target) return;
    const prior = seasons
      .filter((s) => s.start_date < target.start_date)
      .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0];
    if (prior) setBasisSeason(prior.id);
  }, [seasons, seasonId, basisSeason]);

  const handleGenerate = async () => {
    if (!seasonId) return;
    setBusy(true);
    try {
      const id = await generate({
        seasonId,
        name: `Auto plan ${format(new Date(), "d MMM HH:mm")}`,
        coverage: Number(coverage) || 1,
        basisSeasonId: basisSeason || null,
      });
      setPlanId(id);
      toast.success("Plan generated");
    } catch (e: any) {
      toast.error(e?.message || "Could not generate plan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-card/30 rounded-xl p-5">
        <h2 className="text-xl font-semibold mb-1">Build a purchase plan</h2>
        <p className="text-sm text-text/60 mb-4">
          Demand comes from last season's sales less stock in hand, converted into
          cases using each vendor's case size, then rounded up — sell 180 boxes of
          an item packed 18 to a case and that was 10 cases, so a 20% allowance
          means buying 12. The vendor is whoever is cheapest per pack after
          discount, GST and packing, with rating breaking close calls.
        </p>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm">
            Demand based on
            <select
              value={basisSeason}
              onChange={(e) => setBasisSeason(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10"
            >
              <option value="">Reorder levels only</option>
              {seasons.filter((s) => s.id !== seasonId).map((s) => (
                <option key={s.id} value={s.id}>Sales in {s.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm" title="1.2 buys 20% more than last season sold">
            Growth allowance
            <input
              type="number" step="0.05" min="0.1" value={coverage}
              onChange={(e) => setCoverage(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10"
            />
            <span className="text-xs text-text/50">
              {Math.round((Number(coverage) - 1) * 100)}% over last season
            </span>
          </label>
          <div className="flex items-end">
            <button
              onClick={handleGenerate}
              disabled={busy || !seasonId}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary-orange text-white disabled:opacity-40"
            >
              <Wand2 className="w-4 h-4" /> {busy ? "Working…" : "Generate automatically"}
            </button>
          </div>
          <div className="flex items-end">
            <button
              onClick={async () => {
                if (!seasonId) return;
                const id = await createEmpty(seasonId, `Manual plan ${format(new Date(), "d MMM HH:mm")}`);
                setPlanId(id);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70"
            >
              <Plus className="w-4 h-4" /> Start an empty plan
            </button>
          </div>
        </div>
      </div>

      <div className="bg-card/30 rounded-xl p-5">
        <h3 className="font-semibold mb-1">What the numbers say</h3>
        <p className="text-sm text-text/60 mb-4">
          A preview of the recommendation before you commit it to a plan.
        </p>
        <CaseRecommendations
          seasonId={seasonId}
          basisSeasonId={basisSeason || null}
          basisSeasonName={seasons.find((s) => s.id === basisSeason)?.name ?? null}
          growth={Number(coverage) || 1}
        />
      </div>

      {plans.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={planId ?? ""}
            onChange={(e) => setPlanId(e.target.value)}
            className="px-3 py-2 rounded-lg bg-card border border-card-border/10"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.status}
              </option>
            ))}
          </select>
          {planId && (
            <button
              onClick={async () => {
                if (!confirm("Delete this plan?")) return;
                await remove(planId);
                setPlanId(null);
              }}
              className="px-3 py-2 rounded-lg bg-card hover:bg-red-500/20 text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {planId && <PlanLines planId={planId} seasonId={seasonId} />}
    </div>
  );
}

function PlanLines({ planId, seasonId }: { planId: string; seasonId: string | null }) {
  const { lines, refresh, updateLine, deleteLine, upsertLine } = usePlanLines(planId);
  const { createFromPlan } = usePurchaseOrders(seasonId);
  const [products, setProducts] = useState<any[]>([]);
  const [addProduct, setAddProduct] = useState("");
  const [suggestions, setSuggestions] = useState<VendorSuggestion[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!seasonId) return;
    supabase
      .from("season_catalog")
      .select("id,name,product_code,content,stock")
      .eq("season_id", seasonId)
      .order("order", { nullsFirst: false })
      .order("name")
      .then(({ data }) => setProducts(data || []));
  }, [seasonId]);

  // When a product is picked for manual entry, show who can supply it.
  useEffect(() => {
    if (!addProduct || !seasonId) { setSuggestions([]); return; }
    suggestVendors(seasonId, addProduct).then(setSuggestions).catch(() => setSuggestions([]));
  }, [addProduct, seasonId]);

  const totals = useMemo(() => {
    const byVendor = new Map<string, { name: string; total: number; cases: number; lines: number }>();
    let grand = 0;
    lines.forEach((l) => {
      grand += Number(l.line_total || 0);
      const key = l.vendor_id ?? "unassigned";
      const name = l.vendor?.name ?? "No vendor";
      const cur = byVendor.get(key) ?? { name, total: 0, cases: 0, lines: 0 };
      cur.total += Number(l.line_total || 0);
      cur.cases += Number(l.order_cases || 0);
      cur.lines += 1;
      byVendor.set(key, cur);
    });
    return { grand, byVendor: [...byVendor.values()].sort((a, b) => b.total - a.total) };
  }, [lines]);

  const addLine = async (suggestion: VendorSuggestion | null) => {
    if (!addProduct) return;
    await upsertLine({
      plan_id: planId,
      product_id: addProduct,
      required_qty: 0,
      order_cases: 1,
      vendor_id: suggestion?.vendor_id ?? null,
      price_item_id: suggestion?.price_item_id ?? null,
      unit_landed_cost: suggestion?.landed_retail_cost ?? null,
      pieces_ordered: suggestion ? Math.round(suggestion.packs_per_case) : 0,
      line_total: suggestion?.landed_case_cost ?? 0,
      selection_reason: suggestion ? "manual_override" : "no_offer",
    } as any);
    setAddProduct("");
    toast.success("Line added");
  };

  return (
    <div className="space-y-5">
      <div className="bg-card/30 rounded-xl p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add a product to this plan
        </h3>
        <select
          value={addProduct}
          onChange={(e) => setAddProduct(e.target.value)}
          className="w-full md:w-1/2 px-3 py-2 rounded-lg bg-card border border-card-border/10"
        >
          <option value="">Choose a product…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.content ? ` (${p.content})` : ""} — stock {p.stock}
            </option>
          ))}
        </select>

        {addProduct && (
          <div className="mt-4">
            {suggestions.length === 0 ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                No vendor has quoted this product for this season. Upload or add
                their price list first, or add the line without a vendor.
              </p>
            ) : (
              <>
                <p className="text-sm text-text/60 mb-2">
                  Who can supply it — cheapest first after discount, GST, packing
                  and rating:
                </p>
                <div className="overflow-x-auto border border-card-border/10 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-card/60">
                      <tr>
                        <th className="p-2 text-left">Vendor</th>
                        <th className="p-2 text-right">Rating</th>
                        <th className="p-2 text-right">Cost / pack</th>
                        <th className="p-2 text-right">Packs / case</th>
                        <th className="p-2 text-right">Cost / case</th>
                        <th className="p-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {suggestions.map((s) => (
                        <tr key={s.price_item_id} className="border-t border-card-border/10">
                          <td className="p-2">
                            {s.vendor_name}
                            {s.vendor_rank === 1 && (
                              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                best
                              </span>
                            )}
                            {s.needs_unit_review && (
                              <span className="ml-2 text-xs text-amber-600">ratio unconfirmed</span>
                            )}
                          </td>
                          <td className="p-2 text-right">{s.rating}</td>
                          <td className="p-2 text-right font-semibold">{money(s.landed_retail_cost)}</td>
                          <td className="p-2 text-right">{s.packs_per_case}</td>
                          <td className="p-2 text-right">{money(s.landed_case_cost)}</td>
                          <td className="p-2 text-right">
                            <button
                              onClick={() => addLine(s)}
                              className="px-3 py-1 rounded bg-primary-orange text-white text-xs"
                            >
                              Add
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto border border-card-border/10 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-card/60">
            <tr>
              <th className="p-2 text-left">Product</th>
              <th className="p-2 text-left">Vendor</th>
              <th className="p-2 text-right">Needed</th>
              <th className="p-2 text-right">Cases</th>
              <th className="p-2 text-right">Packs</th>
              <th className="p-2 text-right">Cost / pack</th>
              <th className="p-2 text-right">Line total</th>
              <th className="p-2 text-left">Chosen by</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr><td colSpan={9} className="p-6 text-center text-text/60">
                No lines yet. Generate automatically, or add products above.
              </td></tr>
            )}
            {lines.map((l) => (
              <tr key={l.id} className="border-t border-card-border/10">
                <td className="p-2">{l.product?.name ?? "—"}</td>
                <td className="p-2">
                  <VendorSwitcher
                    seasonId={seasonId}
                    productId={l.product_id}
                    currentName={l.vendor?.name ?? null}
                    onPick={(s2) =>
                      updateLine(l.id, {
                        vendor_id: s2.vendor_id,
                        price_item_id: s2.price_item_id,
                        unit_landed_cost: s2.landed_retail_cost,
                        line_total: Number(
                          (s2.landed_case_cost * (l.order_cases || 1)).toFixed(2)
                        ),
                        pieces_ordered: Math.round(
                          s2.packs_per_case * (l.order_cases || 1)
                        ),
                        selection_reason: "manual_override",
                      })
                    }
                  />
                </td>
                <td className="p-2 text-right">
                  <EditableCell
                    type="number"
                    value={l.required_qty}
                    width="w-20"
                    onSave={(v) => updateLine(l.id, { required_qty: Number(v) || 0 })}
                  />
                </td>
                <td className="p-2 text-right">
                  <EditableCell
                    type="number"
                    value={l.order_cases}
                    width="w-20"
                    onSave={(v) => {
                      const cases = Number(v) || 0;
                      // Keep packs and money consistent with the new case count,
                      // using this line's own per-case figures.
                      const perCase = l.order_cases > 0 ? l.pieces_ordered / l.order_cases : 0;
                      const costPerCase = l.order_cases > 0 ? l.line_total / l.order_cases : 0;
                      updateLine(l.id, {
                        order_cases: cases,
                        pieces_ordered: Math.round(perCase * cases),
                        line_total: Number((costPerCase * cases).toFixed(2)),
                      });
                    }}
                  />
                </td>
                <td className="p-2 text-right">
                  <EditableCell
                    type="number"
                    value={l.pieces_ordered}
                    width="w-20"
                    onSave={(v) => updateLine(l.id, { pieces_ordered: Number(v) || 0 })}
                  />
                </td>
                <td className="p-2 text-right">
                  <EditableCell
                    type="number"
                    value={l.unit_landed_cost}
                    width="w-24"
                    onSave={(v) => {
                      const cost = Number(v) || 0;
                      updateLine(l.id, {
                        unit_landed_cost: cost,
                        line_total: Number((cost * l.pieces_ordered).toFixed(2)),
                      });
                    }}
                  />
                </td>
                <td className="p-2 text-right">
                  <EditableCell
                    type="number"
                    value={l.line_total}
                    width="w-28"
                    onSave={(v) => updateLine(l.id, { line_total: Number(v) || 0 })}
                  />
                </td>
                <td className="p-2 text-xs text-text/60">
                  {l.selection_reason.replace(/_/g, " ")}
                </td>
                <td className="p-2">
                  <button onClick={() => deleteLine(l.id)} className="p-1 text-red-500 hover:bg-red-500/10 rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="bg-card/30 rounded-xl p-4">
          <h3 className="font-semibold mb-3">Spend by vendor</h3>
          {totals.byVendor.length === 0 ? (
            <p className="text-text/60 text-sm">Nothing planned yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {totals.byVendor.map((v) => (
                  <tr key={v.name} className="border-b border-card-border/10 last:border-0">
                    <td className="py-2">{v.name}</td>
                    <td className="py-2 text-right text-text/60">{v.lines} items · {v.cases} cases</td>
                    <td className="py-2 text-right font-semibold">{money(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="bg-primary-orange/10 border border-primary-orange/30 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <p className="text-sm text-text/70">Total purchase value</p>
            <p className="text-3xl font-bold text-primary-orange">{money(totals.grand)}</p>
          </div>
          <button
            onClick={async () => {
              if (!confirm("Create purchase orders for each vendor in this plan?")) return;
              setBusy(true);
              try {
                const n = await createFromPlan(planId);
                toast.success(`Created ${n} purchase order${n === 1 ? "" : "s"}`);
                await refresh();
              } catch (e: any) {
                toast.error(e?.message || "Could not create orders");
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy || lines.length === 0}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary-orange text-white disabled:opacity-40"
          >
            <ShoppingCart className="w-4 h-4" />
            {busy ? "Creating…" : "Create purchase orders"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Purchase orders                                                            */
/* ========================================================================== */

function OrdersTab({ seasonId }: { seasonId: string | null }) {
  const { orders, setStatus, confirm } = usePurchaseOrders(seasonId);

  const printOrder = (po: any) => {
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = (po.items || [])
      .map(
        (it: any, i: number) => `<tr>
          <td>${i + 1}</td><td>${it.description}</td>
          <td style="text-align:right">${it.cases}</td>
          <td style="text-align:right">${it.units_per_case ?? "-"}</td>
          <td style="text-align:right">${Number(it.unit_rate).toFixed(2)}</td>
          <td style="text-align:right">${Number(it.line_total).toFixed(2)}</td>
        </tr>`
      )
      .join("");
    w.document.write(`<!doctype html><html><head><title>${po.po_number}</title>
      <style>
        body{font-family:sans-serif;padding:24px;color:#222}
        h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}
        th,td{border:1px solid #ccc;padding:6px 8px;font-size:13px}
        th{background:#f3f3f3;text-align:left}
        .tot{text-align:right;font-size:16px;font-weight:bold;margin-top:12px}
      </style></head><body>
      <h1>Purchase Order ${po.po_number}</h1>
      <p>Soundwave Crackers &middot; ${format(new Date(po.order_date), "d MMM yyyy")}</p>
      <p><strong>To:</strong> ${po.vendor?.name ?? ""}<br/>
      ${po.vendor?.address ?? ""}<br/>${po.vendor?.phone ?? ""} ${po.vendor?.gstin ? "&middot; GSTIN " + po.vendor.gstin : ""}</p>
      <table><thead><tr><th>#</th><th>Item</th><th>Cases</th><th>Units/case</th><th>Rate</th><th>Amount</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="tot">Total (landed): ₹${Number(po.total).toFixed(2)}</p>
      <p style="font-size:12px;color:#666">Landed total includes discount, GST, packing and other charges per agreed terms.</p>
      </body></html>`);
    w.document.close();
    w.print();
  };

  if (orders.length === 0) {
    return <p className="text-text/60">No purchase orders yet. Create them from a purchase plan.</p>;
  }

  return (
    <div className="space-y-4">
      {orders.map((po: any) => (
        <div key={po.id} className="bg-card/30 rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-lg font-semibold">
                {po.po_number} · {po.vendor?.name}
              </h3>
              <p className="text-sm text-text/60">
                {format(new Date(po.order_date), "d MMM yyyy")} · {po.items?.length ?? 0} items ·{" "}
                <span className="capitalize">{po.status}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => printOrder(po)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card hover:bg-card/70 text-sm">
                <Printer className="w-4 h-4" /> Print
              </button>
              {po.status === "draft" && (
                <button onClick={() => setStatus(po.id, "sent")} className="px-3 py-2 rounded-lg bg-card hover:bg-card/70 text-sm">
                  Mark sent
                </button>
              )}
              {po.status !== "confirmed" && po.status !== "cancelled" && (
                <button
                  onClick={async () => {
                    if (!confirm) return;
                    if (!window.confirm("Confirm this order? Its landed cost becomes the product cost for this season.")) return;
                    try {
                      await confirm(po.id);
                      toast.success("Confirmed — costs recorded against the season");
                    } catch (e: any) {
                      toast.error(e?.message || "Could not confirm");
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600 text-white text-sm"
                >
                  <CheckCircle2 className="w-4 h-4" /> Confirm
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto border border-card-border/10 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-card/60">
                <tr>
                  <th className="p-2 text-left">Item</th>
                  <th className="p-2 text-right">Cases</th>
                  <th className="p-2 text-right">Units / case</th>
                  <th className="p-2 text-right">Rate</th>
                  <th className="p-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(po.items || []).map((it: any) => (
                  <tr key={it.id} className="border-t border-card-border/10">
                    <td className="p-2">{it.description}</td>
                    <td className="p-2 text-right">{it.cases}</td>
                    <td className="p-2 text-right">{it.units_per_case ?? "—"}</td>
                    <td className="p-2 text-right">{money(it.unit_rate)}</td>
                    <td className="p-2 text-right font-semibold">{money(it.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-right mt-3 text-lg font-bold text-primary-orange">
            Total {money(po.total)}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ========================================================================== */
/* Retail price list generation                                               */
/* ========================================================================== */

function RetailTab({
  seasonId, seasonName,
}: { seasonId: string | null; seasonName: string | null }) {
  const [rows, setRows] = useState<PriceListPreviewRow[] | null>(null);
  const [margin, setMargin] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!seasonId) return;
    setBusy(true);
    try {
      setRows(await previewPriceList(seasonId, margin === "" ? null : Number(margin)));
    } catch (e: any) {
      toast.error(e?.message || "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const priced = rows?.filter((r) => r.new_offer !== null) ?? [];
  const missing = rows?.filter((r) => r.new_offer === null) ?? [];

  return (
    <div className="space-y-6">
      <div className="bg-card/30 rounded-xl p-5">
        <h2 className="text-xl font-semibold mb-1">Generate the retail price list</h2>
        <p className="text-sm text-text/60 mb-4">
          Selling price is worked out from what you actually paid:{" "}
          <strong>offer = cost ÷ (1 − margin)</strong>, then the struck-through
          price is the offer times each category's display factor. Category
          settings override the default below. Costs come from confirmed purchase
          orders.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">
            Margin override (%)
            <input
              type="number" step="0.5" value={margin} placeholder="use category / default"
              onChange={(e) => setMargin(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10"
            />
          </label>
          <button onClick={load} disabled={busy} className="px-4 py-2 rounded-lg bg-card hover:bg-card/70 disabled:opacity-40">
            {busy ? "Working…" : "Preview"}
          </button>
          <button
            onClick={async () => {
              if (!seasonId) return;
              if (!window.confirm(`Apply new prices to ${priced.length} products? This overwrites this season's prices.`)) return;
              setBusy(true);
              try {
                await applyPriceList(seasonId, margin === "" ? null : Number(margin));
                toast.success("Price list applied");
                await load();
              } catch (e: any) {
                toast.error(e?.message || "Apply failed");
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy || priced.length === 0}
            className="px-4 py-2 rounded-lg bg-primary-orange text-white disabled:opacity-40"
          >
            Apply to {priced.length} products
          </button>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {missing.length} products have no recorded cost
          </p>
          <p className="text-text/70 mt-1">
            They are skipped rather than priced at zero. Confirm a purchase order
            covering them, or set their cost in Stock Management.
          </p>
        </div>
      )}

      <PriceListExport seasonId={seasonId} seasonName={seasonName} />

      {rows && (
        <div className="overflow-x-auto border border-card-border/10 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-card/60">
              <tr>
                <th className="p-2 text-left">Product</th>
                <th className="p-2 text-left">Category</th>
                <th className="p-2 text-right">Cost / pack</th>
                <th className="p-2 text-right">Margin</th>
                <th className="p-2 text-right">Current price</th>
                <th className="p-2 text-right">New offer</th>
                <th className="p-2 text-right">New actual</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.product_id} className={`border-t border-card-border/10 ${r.new_offer === null ? "opacity-50" : ""}`}>
                  <td className="p-2">{r.product_name}</td>
                  <td className="p-2 text-text/60">{r.category_name ?? "—"}</td>
                  <td className="p-2 text-right">{money(r.piece_cost)}</td>
                  <td className="p-2 text-right">{r.margin_percent ?? "—"}%</td>
                  <td className="p-2 text-right text-text/60">{money(r.old_offer)}</td>
                  <td className="p-2 text-right font-semibold text-primary-orange">{money(r.new_offer)}</td>
                  <td className="p-2 text-right line-through text-text/50">{money(r.new_actual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
