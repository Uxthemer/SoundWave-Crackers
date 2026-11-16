import { useState } from "react";
import { Download, FileDown, Loader2, X } from "lucide-react";
import {
  ORDERS_EXPORT_COLUMNS,
  loadExportColumns,
  saveExportColumns,
  type OrdersExportColumnKey,
  type OrdersExportFormat,
} from "../lib/ordersExport";

interface ExportOrdersModalProps {
  /** How many orders the table is showing, which is what will be exported. */
  orderCount: number;
  onClose: () => void;
  onExport: (
    kind: OrdersExportFormat,
    columns: OrdersExportColumnKey[],
    options: { includeItems: boolean }
  ) => Promise<void> | void;
}

/**
 * Choose Excel or PDF and which columns go in. Each format remembers its own
 * ticks, because a printed report and a spreadsheet are rarely wanted with
 * the same columns.
 */
export default function ExportOrdersModal({
  orderCount,
  onClose,
  onExport,
}: ExportOrdersModalProps) {
  const [kind, setKind] = useState<OrdersExportFormat>("pdf");
  const [selected, setSelected] = useState<Record<OrdersExportFormat, OrdersExportColumnKey[]>>(
    () => ({ excel: loadExportColumns("excel"), pdf: loadExportColumns("pdf") })
  );
  const [includeItems, setIncludeItems] = useState(true);
  const [exporting, setExporting] = useState(false);

  const keys = selected[kind];
  const toggle = (key: OrdersExportColumnKey, on: boolean) =>
    setSelected((current) => ({
      ...current,
      [kind]: on ? [...current[kind], key] : current[kind].filter((k) => k !== key),
    }));

  const handleExport = async () => {
    setExporting(true);
    try {
      saveExportColumns(kind, keys);
      await onExport(kind, keys, { includeItems });
      onClose();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-auto p-5 relative">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-lg text-text/60 hover:bg-card/70"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <Download className="w-5 h-5 text-primary-orange" />
          <h2 className="text-xl font-semibold">Export orders</h2>
        </div>
        <p className="text-sm text-text/60 mb-5">
          {orderCount} {orderCount === 1 ? "order" : "orders"}, as filtered and
          sorted on screen.
        </p>

        <section className="mb-5">
          <h3 className="font-semibold mb-2">Format</h3>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "pdf", label: "PDF", icon: FileDown },
                { value: "excel", label: "Excel", icon: Download },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setKind(value)}
                aria-pressed={kind === value}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  kind === value
                    ? "border-primary-orange bg-primary-orange/10 text-primary-orange"
                    : "border-card-border/20 bg-card hover:border-primary-orange/40"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-5">
          <h3 className="font-semibold mb-1">Columns</h3>
          <p className="text-sm text-text/60 mb-3">
            {kind === "pdf" ? "S.No and Order ID" : "Order ID"} always go in.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ORDERS_EXPORT_COLUMNS.map((column) => (
              <label
                key={column.key}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={keys.includes(column.key)}
                  onChange={(e) => toggle(column.key, e.target.checked)}
                  className="w-4 h-4 accent-primary-orange shrink-0"
                />
                <span className="text-sm font-medium">{column.label}</span>
              </label>
            ))}
          </div>

          {/* The items sheet is a second tab of the workbook; a PDF has no
              equivalent, it is one line per order. */}
          {kind === "excel" && (
            <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={includeItems}
                onChange={(e) => setIncludeItems(e.target.checked)}
                className="w-4 h-4 accent-primary-orange"
              />
              Add an "All Items" sheet with every product line
            </label>
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
            onClick={handleExport}
            disabled={exporting || orderCount === 0}
            className="btn-primary flex items-center gap-2 disabled:opacity-60 disabled:cursor-wait"
          >
            {exporting && <Loader2 className="w-4 h-4 animate-spin" />}
            {exporting ? "Preparing…" : `Download ${kind === "pdf" ? "PDF" : "Excel"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
