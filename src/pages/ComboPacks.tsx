import { useMemo, useState } from "react";
import {
  Boxes,
  Check,
  Loader2,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useSeasons } from "../context/SeasonContext";
import { useCategories } from "../hooks/useCategories";
import {
  calculatePackTotals,
  useComboPacks,
  type ComboPack,
  type PackComponent,
} from "../hooks/useComboPacks";
import { NumberInput } from "../components/NumberInput";

/**
 * Family / combo packs.
 *
 * A pack is priced as a whole, so the decision being made here is "does this
 * combination of products work at this rate" — which needs the cost of the
 * contents, what they would sell for separately, and the margin, all moving
 * as products go in and out. So the totals recalculate on every change rather
 * than on save.
 */

const money = (value: number) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

interface DraftPack {
  id?: string;
  name: string;
  pack_code: string;
  description: string;
  pack_price: string;
  is_active: boolean;
  display_order: string;
  category_id: string;
  components: PackComponent[];
}

const emptyDraft = (): DraftPack => ({
  name: "",
  pack_code: "",
  description: "",
  pack_price: "",
  is_active: true,
  display_order: "",
  category_id: "",
  components: [],
});

const draftFrom = (pack: ComboPack): DraftPack => ({
  id: pack.id,
  name: pack.name,
  pack_code: pack.pack_code ?? "",
  description: pack.description ?? "",
  pack_price: String(pack.pack_price ?? ""),
  is_active: pack.is_active,
  display_order: pack.display_order == null ? "" : String(pack.display_order),
  category_id: pack.category_id ?? "",
  components: pack.items.map((item) => ({ ...item })),
});

export function ComboPacks() {
  const { userRole } = useAuth();
  const {
    seasons,
    selectedSeason,
    selectedSeasonId,
    setSelectedSeasonId,
    isSelectedReadOnly,
  } = useSeasons();
  const {
    packs,
    candidates,
    catalog,
    loading,
    error,
    savePack,
    deletePack,
    setPackActive,
  } = useComboPacks(selectedSeasonId);

  const { categories } = useCategories();
  /**
   * Where a new pack is listed by default: the existing Family Pack (or
   * Combo) category, so packs appear alongside the family packs already
   * on sale without anyone having to pick it.
   */
  const defaultCategoryId =
    categories.find((category) => /family|combo/i.test(category.name))?.id ?? "";

  const [draft, setDraft] = useState<DraftPack | null>(null);
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  const isSuperadmin = userRole?.name === "superadmin";
  const canEdit = isSuperadmin && !isSelectedReadOnly;

  /** Live economics for whatever is in the editor right now. */
  const totals = useMemo(
    () =>
      calculatePackTotals(
        draft?.components ?? [],
        catalog,
        Number(draft?.pack_price || 0)
      ),
    [draft?.components, draft?.pack_price, catalog]
  );

  /** Pieces in the pack: every line's quantity added up. */
  const totalQuantity = totals.lines.reduce((sum, line) => sum + line.quantity, 0);

  /** Products not already in the pack, narrowed by the search box. */
  const pickable = useMemo(() => {
    const taken = new Set((draft?.components ?? []).map((c) => c.product_id));
    const term = productSearch.trim().toLowerCase();
    return candidates
      .filter((product) => !taken.has(product.product_id))
      .filter(
        (product) =>
          term === "" ||
          product.name.toLowerCase().includes(term) ||
          (product.product_code ?? "").toLowerCase().includes(term)
      )
      .slice(0, 40);
  }, [candidates, draft?.components, productSearch]);

  const patchDraft = (patch: Partial<DraftPack>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  const addProduct = (productId: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            components: [
              ...current.components,
              { product_id: productId, quantity: 1 },
            ],
          }
        : current
    );
    setProductSearch("");
  };

  const setQuantity = (productId: string, quantity: number) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            components: current.components.map((component) =>
              component.product_id === productId
                ? { ...component, quantity }
                : component
            ),
          }
        : current
    );

  const removeProduct = (productId: string) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            components: current.components.filter(
              (component) => component.product_id !== productId
            ),
          }
        : current
    );

  const handleSave = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error("Give the pack a name");
      return;
    }
    if (draft.components.length === 0) {
      toast.error("A pack needs at least one product");
      return;
    }
    if (draft.components.some((component) => Number(component.quantity) <= 0)) {
      toast.error("Every product in the pack needs a quantity of at least 1");
      return;
    }

    setSaving(true);
    try {
      await savePack(
        {
          id: draft.id,
          name: draft.name.trim(),
          pack_code: draft.pack_code.trim() || null,
          description: draft.description.trim() || null,
          pack_price: Number(draft.pack_price || 0),
          is_active: draft.is_active,
          display_order:
            draft.display_order.trim() === ""
              ? null
              : Number(draft.display_order),
          category_id: draft.category_id || null,
        },
        draft.components
      );
      toast.success(draft.id ? "Pack updated" : "Pack created");
      setDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the pack");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pack: ComboPack) => {
    if (!confirm(`Delete "${pack.name}"? This cannot be undone.`)) return;
    try {
      await deletePack(pack.id);
      toast.success("Pack deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  };

  if (!userRole) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  if (!isSuperadmin) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
          <p>Family packs are managed by superadmins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-8 pb-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Boxes className="w-8 h-8 text-primary-orange" />
            <div>
              <h1 className="font-heading text-4xl">Family Packs</h1>
              <p className="text-sm text-text/70">
                Bundles sold at one rate. Once added to the product list,
                a pack is stocked like any product: the number of packs packed.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedSeasonId ?? ""}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
              className="px-4 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
            >
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  Season {season.name}
                  {season.status === "active"
                    ? " (live)"
                    : season.status === "draft"
                    ? " (draft)"
                    : " (closed)"}
                </option>
              ))}
            </select>
            {canEdit && !draft && (
              <button
                onClick={() =>
                  setDraft({ ...emptyDraft(), category_id: defaultCategoryId })
                }
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/90 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>New pack</span>
              </button>
            )}
          </div>
        </div>

        {isSelectedReadOnly && (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
            <p className="font-semibold text-amber-700 dark:text-amber-400">
              Season {selectedSeason?.name} is closed and read-only
            </p>
            <p className="text-sm text-text/70">
              Its packs are shown as an archive. Switch to the live season to
              make changes.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-600">
            {error}
          </div>
        )}

        {/* ---------------------------------------------------------------
            The editor. Products on the left, economics on the right, both
            recalculating as the pack is put together.
        --------------------------------------------------------------- */}
        {draft && (
          <div className="mb-8 rounded-xl border border-primary-orange/30 bg-card/40 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {draft.id ? `Editing ${draft.name || "pack"}` : "New pack"}
              </h2>
              <button
                onClick={() => setDraft(null)}
                aria-label="Close editor"
                className="p-2 rounded-lg hover:bg-card/70 text-text/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
              <div>
                <label className="block mb-1 text-sm font-medium">
                  Pack name
                </label>
                <input
                  value={draft.name}
                  onChange={(e) => patchDraft({ name: e.target.value })}
                  placeholder="Family Pack 1"
                  className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">
                  Pack code
                </label>
                <input
                  value={draft.pack_code}
                  onChange={(e) => patchDraft({ pack_code: e.target.value })}
                  placeholder="SWC-FP1"
                  className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">
                  Pack rate ₹
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.pack_price}
                  onChange={(e) => patchDraft({ pack_price: e.target.value })}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange no-spinner"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">
                  Display order
                </label>
                <input
                  type="number"
                  min={0}
                  value={draft.display_order}
                  onChange={(e) =>
                    patchDraft({ display_order: e.target.value })
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="auto"
                  className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange no-spinner"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 mb-5">
              <div>
                <label className="block mb-1 text-sm font-medium">
                  Listed under category
                </label>
                <select
                  value={draft.category_id}
                  onChange={(e) => patchDraft({ category_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
                >
                  <option value="">Family Packs (own group)</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">
                  Description
                </label>
                <input
                  value={draft.description}
                  onChange={(e) => patchDraft({ description: e.target.value })}
                  placeholder="Shown to the customer under the pack name"
                  className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
                />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={(e) => patchDraft({ is_active: e.target.checked })}
                />
                <span>Active — customers can order this pack</span>
              </label>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              {/* -------- contents -------- */}
              <div className="lg:col-span-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <h3 className="font-semibold">Products in this pack</h3>
                  {/* Two different counts: how many lines, and how many
                      pieces go in the box once quantities are multiplied in. */}
                  <div className="flex gap-2 text-sm">
                    <span className="px-2.5 py-0.5 rounded-full bg-card border border-card-border/20">
                      {totals.lines.length} product{totals.lines.length === 1 ? "" : "s"}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-primary-orange/10 text-primary-orange border border-primary-orange/30">
                      {totalQuantity} total qty
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-card-border/10">
                  <table className="w-full text-sm">
                    <thead className="bg-card/70">
                      <tr className="text-left">
                        <th className="py-2 px-3 font-medium w-12 text-center">S.No</th>
                        <th className="py-2 px-3 font-medium">Product</th>
                        <th className="py-2 px-3 font-medium w-20">Qty</th>
                        <th className="py-2 px-3 font-medium w-24">APR</th>
                        <th className="py-2 px-3 font-medium w-24">Offer ₹</th>
                        <th className="py-2 px-3 font-medium w-28">
                          Line total
                        </th>
                        <th className="py-2 px-3 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {totals.lines.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="py-6 text-center text-text/60"
                          >
                            Nothing in the pack yet — add products from the
                            list on the right.
                          </td>
                        </tr>
                      ) : (
                        totals.lines.map((line, index) => (
                          <tr
                            key={line.product_id}
                            className="border-t border-card-border/10"
                          >
                            <td className="py-2 px-3 text-center text-text/60 tabular-nums">
                              {index + 1}
                            </td>
                            <td className="py-2 px-3">
                              <div className="font-medium">{line.name}</div>
                              <div className="text-xs text-text/60">
                                {line.product_code ?? "—"}
                                {line.content ? ` · ${line.content}` : ""}
                                {" · stock "}
                                <span
                                  className={
                                    line.stock <= 0 ? "text-red-500" : ""
                                  }
                                >
                                  {line.stock}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              <NumberInput
                                min={1}
                                value={line.quantity}
                                onValueChange={(n) =>
                                  setQuantity(
                                    line.product_id,
                                    n
                                  )
                                }
                                aria-label={`Quantity of ${line.name}`}
                                className="w-16 px-2 py-1 rounded bg-card border border-card-border/20 focus:outline-none focus:border-primary-orange no-spinner"
                              />
                            </td>
                            <td className="py-2 px-3">
                              {line.apr == null ? (
                                <span
                                  title="No cost recorded for this product in this season"
                                  className="text-amber-600"
                                >
                                  not set
                                </span>
                              ) : (
                                money(line.apr)
                              )}
                            </td>
                            <td className="py-2 px-3">
                              {money(line.offer_price)}
                            </td>
                            <td className="py-2 px-3">
                              <div>{money(line.lineOffer)}</div>
                              {line.lineApr != null && (
                                <div className="text-xs text-text/60">
                                  cost {money(line.lineApr)}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <button
                                onClick={() => removeProduct(line.product_id)}
                                aria-label={`Remove ${line.name}`}
                                className="p-1.5 rounded text-red-500 hover:bg-card/70"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {totals.lines.length > 0 && (
                      <tfoot className="bg-card/70 font-semibold">
                        <tr className="border-t border-card-border/20">
                          <td className="py-2 px-3" />
                          <td className="py-2 px-3">
                            Total: {totals.lines.length} product
                            {totals.lines.length === 1 ? "" : "s"}
                          </td>
                          <td className="py-2 px-3 tabular-nums">{totalQuantity}</td>
                          <td className="py-2 px-3" />
                          <td className="py-2 px-3" />
                          <td className="py-2 px-3 tabular-nums">
                            {money(totals.offerTotal)}
                          </td>
                          <td className="py-2 px-3" />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* -------- running economics -------- */}
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat
                    label="Contents sell for"
                    value={money(totals.offerTotal)}
                    hint="Bought separately"
                  />
                  <Stat
                    label="Total APR"
                    value={
                      totals.aprTotal == null ? "—" : money(totals.aprTotal)
                    }
                    hint={
                      totals.missingApr > 0
                        ? `${totals.missingApr} product${
                            totals.missingApr === 1 ? "" : "s"
                          } without a cost`
                        : "Cost of the contents"
                    }
                    tone={totals.missingApr > 0 ? "warn" : "plain"}
                  />
                  <Stat
                    label="Pack rate"
                    value={money(Number(draft.pack_price || 0))}
                    hint={
                      totals.customerSaving > 0
                        ? `Customer saves ${money(totals.customerSaving)}`
                        : totals.customerSaving < 0
                        ? `${money(-totals.customerSaving)} above the contents`
                        : "Same as the contents"
                    }
                    tone={totals.customerSaving < 0 ? "warn" : "plain"}
                  />
                  <Stat
                    label="Profit"
                    value={totals.profit == null ? "—" : money(totals.profit)}
                    hint={
                      totals.marginPercentage == null
                        ? "Needs a cost on every product"
                        : `${totals.marginPercentage}% margin`
                    }
                    tone={
                      totals.profit == null
                        ? "plain"
                        : totals.profit < 0
                        ? "bad"
                        : "good"
                    }
                  />
                </div>
              </div>

              {/* -------- product picker -------- */}
              <div>
                <h3 className="font-semibold mb-2">Add a product</h3>
                <div className="relative mb-2">
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search by name or code"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text/60" />
                </div>
                <div className="max-h-[26rem] overflow-auto rounded-lg border border-card-border/10 divide-y divide-card-border/10">
                  {pickable.length === 0 ? (
                    <p className="p-4 text-sm text-text/60">
                      {productSearch
                        ? "Nothing matches that search."
                        : "Every product is already in this pack."}
                    </p>
                  ) : (
                    pickable.map((product) => (
                      <button
                        key={product.product_id}
                        onClick={() => addProduct(product.product_id)}
                        className="w-full text-left px-3 py-2 hover:bg-card/70 transition-colors flex items-start gap-2"
                      >
                        <Plus className="w-4 h-4 mt-0.5 text-primary-orange shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium truncate">
                            {product.name}
                          </span>
                          <span className="block text-xs text-text/60">
                            {product.product_code ?? "—"} ·{" "}
                            {money(product.offer_price)} · APR{" "}
                            {product.apr == null ? "—" : money(product.apr)} ·
                            stock {product.stock}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => setDraft(null)}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-card hover:bg-card/70 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !canEdit}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{draft.id ? "Save pack" : "Create pack"}</span>
              </button>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------
            The packs themselves
        --------------------------------------------------------------- */}
        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
          </div>
        ) : packs.length === 0 ? (
          <div className="py-16 text-center text-text/60">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No packs in season {selectedSeason?.name ?? "—"} yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {packs.map((pack) => {
              const packTotals = calculatePackTotals(
                pack.items,
                catalog,
                pack.pack_price
              );
              return (
                <div
                  key={pack.id}
                  className={`rounded-xl border p-4 ${
                    pack.is_active
                      ? "border-card-border/10 bg-card/40"
                      : "border-card-border/10 bg-card/20 opacity-70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{pack.name}</h3>
                      <p className="text-xs text-text/60">
                        {pack.pack_code ?? "no code"} · {pack.items.length}{" "}
                        product{pack.items.length === 1 ? "" : "s"} ·{" "}
                        {pack.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}{" "}
                        total qty
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${
                        pack.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-card text-text/60 border border-card-border/20"
                      }`}
                    >
                      {pack.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {/* Built here, sold from Stock Management: say which step
                      this pack has reached. */}
                  <p
                    className={`mb-2 text-xs rounded-lg px-2 py-1 ${
                      pack.listing
                        ? "bg-green-50 text-green-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {pack.listing
                      ? `On the product list${pack.listing.category ? ` · ${pack.listing.category}` : ""}`
                      : "Not on the product list yet — add it from Stock Management → Bulk → Add family pack"}
                  </p>

                  <ul className="text-sm text-text/80 mb-3 space-y-0.5">
                    {packTotals.lines.map((line, index) => (
                      <li key={line.product_id} className="flex gap-2">
                        <span className="w-5 text-right text-text/40 tabular-nums">
                          {index + 1}.
                        </span>
                        <span className="text-text/50">{line.quantity}×</span>
                        <span className="truncate">{line.name}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <Mini label="Pack rate" value={money(pack.pack_price)} />
                    <Mini
                      label="Contents"
                      value={money(packTotals.offerTotal)}
                    />
                    <Mini
                      label="Total APR"
                      value={
                        packTotals.aprTotal == null
                          ? "—"
                          : money(packTotals.aprTotal)
                      }
                    />
                    <Mini
                      label="Profit"
                      value={
                        packTotals.profit == null
                          ? "—"
                          : `${money(packTotals.profit)}${
                              packTotals.marginPercentage == null
                                ? ""
                                : ` (${packTotals.marginPercentage}%)`
                            }`
                      }
                      tone={
                        packTotals.profit == null
                          ? "plain"
                          : packTotals.profit < 0
                          ? "bad"
                          : "good"
                      }
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setDraft(draftFrom(pack))}
                      className="px-3 py-1.5 rounded-lg text-sm bg-card border border-card-border/10 hover:bg-card/70"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setPackActive(pack.id, !pack.is_active)}
                      disabled={!canEdit}
                      className="px-3 py-1.5 rounded-lg text-sm bg-card border border-card-border/10 hover:bg-card/70 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {pack.is_active ? "Switch off" : "Switch on"}
                    </button>
                    <button
                      onClick={() => handleDelete(pack)}
                      disabled={!canEdit}
                      className="px-3 py-1.5 rounded-lg text-sm text-red-500 bg-card border border-card-border/10 hover:bg-card/70 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "plain",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "plain" | "good" | "bad" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "text-green-600"
      : tone === "bad"
      ? "text-red-500"
      : tone === "warn"
      ? "text-amber-600"
      : "";
  return (
    <div className="rounded-lg border border-card-border/10 bg-card px-3 py-2">
      <div className="text-xs text-text/60">{label}</div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
      {hint && <div className="text-xs text-text/50">{hint}</div>}
    </div>
  );
}

function Mini({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "good" | "bad";
}) {
  const toneClass =
    tone === "good" ? "text-green-600" : tone === "bad" ? "text-red-500" : "";
  return (
    <div>
      <div className="text-xs text-text/60">{label}</div>
      <div className={`font-medium ${toneClass}`}>{value}</div>
    </div>
  );
}
