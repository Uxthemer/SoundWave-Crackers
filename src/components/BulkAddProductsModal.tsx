import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { actualFromOffer, formatPrice, isUsableDiscount } from "../lib/pricing";
import {
  nextProductCodes,
  nextOrderInCategory,
  PRODUCT_CODE_PREFIX,
} from "../lib/ordering";

interface Category {
  id: string;
  name: string;
  order?: number;
}

/** The fields a product needs before it can go on a price list. */
interface DraftRow {
  key: string;
  product_code: string;
  name: string;
  category_id: string;
  content: string;
  stock: string;
  offer_price: string;
  actual_price: string;
  apr: string;
  order: string;
  is_active: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  seasonId: string | null;
  seasonName?: string;
  isLive: boolean;
  categories: Category[];
  /** Every product already in this season — for codes and end-of-list order. */
  existingProducts: {
    id: string;
    product_code?: string;
    category_id: string;
    order?: number;
  }[];
  /** The season's price-list discount; drives the actual price. */
  seasonDiscount: number;
  canEditCost: boolean;
}

const STARTING_ROWS = 5;

let rowSequence = 0;
const newKey = () => `draft-${++rowSequence}`;

function blankRow(code: string, categoryId: string): DraftRow {
  return {
    key: newKey(),
    product_code: code,
    name: "",
    category_id: categoryId,
    content: "",
    stock: "",
    offer_price: "",
    actual_price: "",
    apr: "",
    order: "",
    is_active: true,
  };
}

/**
 * Enters several products in one pass.
 *
 * A price list is built a category at a time — twenty flower pots, then
 * fifteen fountains — so the single Add Product dialog means twenty round
 * trips through the same form. Here the codes and positions fill themselves
 * in and only the name, category and price have to be typed.
 */
export function BulkAddProductsModal({
  isOpen,
  onClose,
  onSuccess,
  seasonId,
  seasonName,
  isLive,
  categories,
  existingProducts,
  seasonDiscount,
  canEditCost,
}: Props) {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [autoActual, setAutoActual] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const discountUsable = isUsableDiscount(seasonDiscount);

  /** Codes already taken, so generated ones never collide with stored data. */
  const existingCodes = useMemo(
    () => existingProducts.map((product) => product.product_code),
    [existingProducts]
  );

  // Seed a fresh sheet each time the dialog opens; a half-typed sheet from
  // last time is more likely to be re-saved by accident than wanted.
  useEffect(() => {
    if (!isOpen) return;
    const codes = nextProductCodes(existingCodes, STARTING_ROWS);
    const firstCategory = categories[0]?.id ?? "";
    setRows(codes.map((code) => blankRow(code, firstCategory)));
    setAutoActual(true);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /** A row counts as filled in once it has a name — blanks are ignored. */
  const filledRows = rows.filter((row) => row.name.trim() !== "");

  const patchRow = (key: string, patch: Partial<DraftRow>) =>
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );

  /** Offer price drives the actual price, exactly as it does on the stock page. */
  const handleOfferChange = (key: string, raw: string) => {
    const patch: Partial<DraftRow> = { offer_price: raw };
    if (autoActual) {
      const derived = actualFromOffer(Number(raw), seasonDiscount);
      if (derived !== null) patch.actual_price = String(derived);
    }
    patchRow(key, patch);
  };

  const addRows = (count: number) => {
    setRows((prev) => {
      const taken = [...existingCodes, ...prev.map((row) => row.product_code)];
      const codes = nextProductCodes(taken, count);
      const category = prev[prev.length - 1]?.category_id ?? categories[0]?.id ?? "";
      return [...prev, ...codes.map((code) => blankRow(code, category))];
    });
  };

  const removeRow = (key: string) =>
    setRows((prev) => prev.filter((row) => row.key !== key));

  /**
   * Position a row will take if its Order box is left blank: the end of its
   * category, counting the rows above it in this sheet that share the
   * category so a batch of ten does not all land on the same number.
   */
  const resolvedOrder = (row: DraftRow): number => {
    if (row.order.trim() !== "") return Number(row.order);
    const base = nextOrderInCategory(existingProducts, row.category_id);
    const aheadInSheet = filledRows
      .slice(0, filledRows.indexOf(row))
      .filter(
        (other) => other.category_id === row.category_id && other.order.trim() === ""
      ).length;
    return base + aheadInSheet;
  };

  /** Everything that would make the insert fail, reported before it runs. */
  const validate = (): string | null => {
    if (!filledRows.length) return "Fill in at least one product name";

    for (const row of filledRows) {
      if (!row.category_id) return `Choose a category for "${row.name}"`;
      if (!row.product_code.trim())
        return `"${row.name}" needs a product code`;
    }

    const codes = filledRows.map((row) => row.product_code.trim().toLowerCase());
    const duplicate = codes.find(
      (code, index) => codes.indexOf(code) !== index
    );
    if (duplicate) return `Product code ${duplicate} is used twice in this sheet`;

    const taken = new Set(
      existingCodes
        .filter(Boolean)
        .map((code) => String(code).trim().toLowerCase())
    );
    const clash = codes.find((code) => taken.has(code));
    if (clash) return `Product code ${clash} already exists in this season`;

    return null;
  };

  const handleSave = async () => {
    if (!seasonId) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    setError(null);
    // Ids from step 1, so a later step failing does not strand identity rows
    // whose codes would then block every retry.
    let createdIds: string[] = [];
    try {
      // 1. Identity rows, shared across every season. Price, stock, content
      // and order are deliberately absent — they belong to the season.
      const { data: created, error: productError } = await supabase
        .from("products")
        .insert(
          filledRows.map((row) => ({
            name: row.name.trim(),
            category_id: row.category_id,
            product_code: row.product_code.trim(),
            description: null,
          }))
        )
        .select("id, product_code");
      if (productError) throw productError;
      createdIds = ((created ?? []) as { id: string }[]).map((p) => p.id);

      // product_code is unique, so it maps the returned ids back to the rows
      // that produced them without depending on insert order.
      const idByCode = new Map(
        ((created ?? []) as { id: string; product_code: string }[]).map(
          (product) => [
            String(product.product_code).trim().toLowerCase(),
            product.id,
          ]
        )
      );

      const seasonRows = filledRows.map((row) => {
        const id = idByCode.get(row.product_code.trim().toLowerCase());
        const stock = Number(row.stock || 0);
        return {
          season_id: seasonId,
          product_id: id!,
          actual_price: Number(row.actual_price || 0),
          offer_price: Number(row.offer_price || 0),
          discount_percentage:
            autoActual && discountUsable ? seasonDiscount : 0,
          content: row.content.trim() || null,
          opening_stock: stock,
          stock,
          display_order: resolvedOrder(row),
          is_active: row.is_active,
        };
      });

      // 2. Commercials, for the selected season only.
      const { error: seasonError } = await supabase
        .from("product_seasons")
        .insert(seasonRows);
      if (seasonError) throw seasonError;

      // 3. Cost, admin-only and only where one was entered.
      if (canEditCost) {
        const costRows = filledRows
          .filter((row) => row.apr.trim() !== "")
          .map((row) => ({
            season_id: seasonId,
            product_id: idByCode.get(row.product_code.trim().toLowerCase())!,
            apr: Number(Number(row.apr).toFixed(2)),
          }));
        if (costRows.length) {
          const { error: costError } = await supabase
            .from("product_season_costs")
            .insert(costRows);
          if (costError) throw costError;
        }
      }

      onSuccess();
      onClose();
    } catch (err) {
      // Roll the identity rows back by hand: PostgREST has no transaction
      // across calls, and a half-written product is worse than none.
      if (createdIds.length) {
        await supabase.from("products").delete().in("id", createdIds);
      }
      setError(
        err instanceof Error ? err.message : "Failed to add products"
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const cellClass =
    "w-full px-2 py-1 rounded border border-card-border/20 bg-card focus:outline-none focus:border-primary-orange no-spinner";

  return (
    <>
      <style>{`body { overflow: hidden !important; }`}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
        <div className="bg-background rounded-xl shadow-lg w-full max-w-[95vw] max-h-[92vh] flex flex-col">
          <div className="flex items-start justify-between gap-4 p-4 border-b border-card-border/10">
            <div>
              <h2 className="font-heading text-2xl">Bulk add products</h2>
              <p className="text-sm text-text/70 mt-1">
                Saving to{" "}
                <span
                  className={`font-semibold ${
                    isLive ? "text-primary-orange" : "text-amber-600"
                  }`}
                >
                  season {seasonName ?? "—"}
                  {isLive ? " (live)" : " (not live)"}
                </span>
                . Codes and positions fill in automatically — type a name,
                pick a category, set the price.
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 rounded-lg hover:bg-card/70 text-text/60"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-card-border/10">
            <button
              onClick={() => addRows(1)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card hover:bg-card/70 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add row</span>
            </button>
            <button
              onClick={() => addRows(5)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card hover:bg-card/70 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add 5 rows</span>
            </button>
            {discountUsable && (
              <label className="flex items-center gap-2 text-sm text-text/70">
                <input
                  type="checkbox"
                  checked={autoActual}
                  onChange={(e) => setAutoActual(e.target.checked)}
                />
                Auto actual price at {formatPrice(seasonDiscount)}%
              </label>
            )}
            <span className="text-sm text-text/60 ml-auto">
              {filledRows.length} of {rows.length} rows filled in
            </span>
          </div>

          {error && (
            <div className="mx-4 mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-auto p-4">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background z-10">
                <tr className="text-left">
                  <th className="py-2 pr-2 font-medium w-28">Code</th>
                  <th className="py-2 pr-2 font-medium min-w-[14rem]">
                    Product name
                  </th>
                  <th className="py-2 pr-2 font-medium w-40">Category</th>
                  <th className="py-2 pr-2 font-medium w-28">Content</th>
                  <th className="py-2 pr-2 font-medium w-20">Stock</th>
                  <th className="py-2 pr-2 font-medium w-24">Offer ₹</th>
                  <th className="py-2 pr-2 font-medium w-24">Actual ₹</th>
                  {canEditCost && (
                    <th className="py-2 pr-2 font-medium w-20">APR</th>
                  )}
                  <th className="py-2 pr-2 font-medium w-20">Order</th>
                  <th className="py-2 pr-2 font-medium w-24">Active</th>
                  <th className="py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-t border-card-border/10">
                    <td className="py-1.5 pr-2">
                      <input
                        value={row.product_code}
                        onChange={(e) =>
                          patchRow(row.key, { product_code: e.target.value })
                        }
                        placeholder={`${PRODUCT_CODE_PREFIX}1`}
                        aria-label="Product code"
                        className={cellClass}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        value={row.name}
                        onChange={(e) =>
                          patchRow(row.key, { name: e.target.value })
                        }
                        placeholder="Product name"
                        aria-label="Product name"
                        className={cellClass}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        value={row.category_id}
                        onChange={(e) =>
                          patchRow(row.key, { category_id: e.target.value })
                        }
                        aria-label="Category"
                        className={cellClass}
                      >
                        <option value="">Select</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        value={row.content}
                        onChange={(e) =>
                          patchRow(row.key, { content: e.target.value })
                        }
                        placeholder="1 box"
                        aria-label="Content"
                        className={cellClass}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        min={0}
                        value={row.stock}
                        onChange={(e) =>
                          patchRow(row.key, { stock: e.target.value })
                        }
                        onWheel={(e) => e.currentTarget.blur()}
                        aria-label="Stock"
                        className={cellClass}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.offer_price}
                        onChange={(e) =>
                          handleOfferChange(row.key, e.target.value)
                        }
                        onWheel={(e) => e.currentTarget.blur()}
                        aria-label="Offer price"
                        className={cellClass}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.actual_price}
                        onChange={(e) =>
                          patchRow(row.key, { actual_price: e.target.value })
                        }
                        onWheel={(e) => e.currentTarget.blur()}
                        readOnly={autoActual && discountUsable}
                        aria-label="Actual price"
                        className={`${cellClass} ${
                          autoActual && discountUsable
                            ? "bg-card/40 text-text/70 cursor-not-allowed"
                            : ""
                        }`}
                      />
                    </td>
                    {canEditCost && (
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.apr}
                          onChange={(e) =>
                            patchRow(row.key, { apr: e.target.value })
                          }
                          onWheel={(e) => e.currentTarget.blur()}
                          aria-label="APR"
                          className={cellClass}
                        />
                      </td>
                    )}
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        min={0}
                        value={row.order}
                        onChange={(e) =>
                          patchRow(row.key, { order: e.target.value })
                        }
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder={
                          row.name.trim() && row.category_id
                            ? String(resolvedOrder(row))
                            : "auto"
                        }
                        aria-label="Display order"
                        className={cellClass}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        value={row.is_active ? "true" : "false"}
                        onChange={(e) =>
                          patchRow(row.key, {
                            is_active: e.target.value === "true",
                          })
                        }
                        aria-label="Active"
                        className={cellClass}
                      >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                    </td>
                    <td className="py-1.5">
                      <button
                        onClick={() => removeRow(row.key)}
                        disabled={rows.length === 1}
                        aria-label="Remove row"
                        title="Remove row"
                        className="p-1.5 rounded text-red-500 hover:bg-card/70 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3 p-4 border-t border-card-border/10">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-card hover:bg-card/70 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || filledRows.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {saving
                  ? "Adding…"
                  : `Add ${filledRows.length} product${
                      filledRows.length === 1 ? "" : "s"
                    }`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
