import { Fragment, useState, useEffect, useRef } from "react";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Loader2,
  Download,
  Upload,
  Printer,
  ChevronUp,
  ChevronDown,
  PencilLine,
  TableProperties,
  ListPlus,
  LayoutList,
  GripVertical,
  RotateCcw,
  Check,
  Percent,
  Calculator,
  FileText,
  Filter,
  Boxes,
  Settings2,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { BulkImportModal } from "../components/BulkImportModal";
import { BulkAddProductsModal } from "../components/BulkAddProductsModal";
import { AddPackProductModal } from "../components/AddPackProductModal";
import * as XLSX from "xlsx";
import { useProducts } from "../hooks/useProducts";
import { useSeasons, useSeasonActions } from "../context/SeasonContext";
import {
  actualFromOffer,
  formatPrice,
  isUsableDiscount,
} from "../lib/pricing";
import {
  byOrder,
  nextOrderInCategory,
  nextProductCode,
  renumber,
} from "../lib/ordering";
import { openPriceListPdf } from "../lib/priceListPdf";
import {
  CustomPriceListModal,
  type CustomPriceListSettings,
} from "../components/CustomPriceListModal";
import toast from "react-hot-toast";
import { NumberInput } from "../components/NumberInput";

interface Product {
  id: string;
  name: string;
  category_id: string;
  stock: number;
  actual_price: number;
  offer_price: number;
  content: string;
  discount_percentage: string;
  image_url: string;
  description: string;
  product_code?: string;
  categories?: {
    name: string;
  };
  apr?: string;
  order?: number;
  is_active?: boolean;
  yt_link?: string;
  /** Set when the row came from the season catalog. */
  season_id?: string;
  product_season_id?: string;
  /** Set when this row is a family pack on sale; stock comes from its contents. */
  combo_pack_id?: string | null;
}

interface Category {
  id: string;
  name: string;
  order?: number;
}

/** Which slice of the catalog the table is showing. */
type StockFilter = "all" | "inStock" | "zero" | "low";
type StatusFilter = "all" | "active" | "inactive";

/**
 * States which season a product form writes to.
 *
 * The season selector is remembered across visits, so someone can open this
 * page days later and add a product to a draft season without realising it.
 * Price, stock and cost land in the named season only — every other season is
 * unaffected.
 */
function SeasonTargetNotice({
  seasonName,
  isLive,
}: {
  seasonName: string | undefined;
  isLive: boolean;
}) {
  if (isLive) {
    return (
      <p className="text-sm text-text/70 text-center mb-4">
        Saving to{" "}
        <span className="font-semibold text-primary-orange">
          season {seasonName ?? "—"}
        </span>{" "}
        (live). Other seasons are unaffected.
      </p>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center">
      <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
        Saving to season {seasonName ?? "—"} — this is not the live season
      </p>
      <p className="text-xs text-text/70 mt-1">
        Customers will not see this until that season is made live. Switch the
        season selector to change where it is saved.
      </p>
    </div>
  );
}

/**
 * A toolbar button that opens a menu.
 *
 * The page had grown to nine flat buttons across the top, which on a laptop
 * wrapped into two rows of near-identical pills. Grouping them by what they
 * do — bulk changes, exports — puts the row back to a glance.
 */
function ToolbarMenu({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} className="relative w-full sm:w-auto">
      <button
        onClick={() => setOpen((on) => !on)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors w-full sm:w-auto ${
          open
            ? "bg-primary-orange/10 text-primary-orange border border-primary-orange/30"
            : "bg-card hover:bg-card/70 border border-transparent"
        }`}
      >
        {icon}
        <span>{label}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        // Closing on click anywhere inside covers every item without each of
        // them having to remember to do it.
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="absolute left-0 z-40 mt-2 w-full sm:w-72 rounded-xl border border-card-border/20 bg-background shadow-xl py-1.5"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** One row in a {@link ToolbarMenu}. */
function MenuItem({
  icon,
  label,
  hint,
  onClick,
  disabled,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-card/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <span className="mt-0.5 text-text/70">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && (
          <span className="block text-xs text-text/60 leading-snug">{hint}</span>
        )}
      </span>
    </button>
  );
}

/** A labelled divider inside a menu. */
function MenuSection({ label }: { label: string }) {
  return (
    <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text/40 border-t border-card-border/10 first:border-t-0 first:pt-1">
      {label}
    </div>
  );
}

export function StockManagement() {
  const {
    seasons,
    selectedSeason,
    selectedSeasonId,
    setSelectedSeasonId,
    isSelectedReadOnly,
    loading: seasonsLoading,
  } = useSeasons();
  const { setSeasonUnlocked, updateSeason, applyPriceListDiscount } =
    useSeasonActions();
  const { exportProductsToExcel } = useProducts(selectedSeasonId);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Stock-keeping filters. A price list is worked through a slice at a time —
  // everything that ran out, everything running low, everything switched off —
  // and bulk edit then applies to exactly that slice.
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  // Held as a string so the box can be emptied while retyping without
  // snapping to 0 and hiding every row.
  const [lowStockThreshold, setLowStockThreshold] = useState("10");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [needsPricing, setNeedsPricing] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkAddModal, setShowBulkAddModal] = useState(false);
  const [showAddPackModal, setShowAddPackModal] = useState(false);
  const [showCustomPriceList, setShowCustomPriceList] = useState(false);
  const [addForm, setAddForm] = useState<Partial<Product>>({});
  // Order is auto-filled from the chosen category until it is typed over —
  // after that, switching category must not overwrite a deliberate position.
  const [addOrderTouched, setAddOrderTouched] = useState(false);
  const [sortField, setSortField] = useState<string>("order");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const { userRole } = useAuth();
  const isSuperadmin = userRole?.name === "superadmin";
  const canManage = ["admin", "superadmin"].includes(userRole?.name || "");

  // Collapsed by default: the discount is set once a season and then left
  // alone, so it should not push the table down the page every visit.
  const [priceConfigOpen, setPriceConfigOpen] = useState(false);

  // Price-list discount config, held as a string so the field can be cleared
  // while typing without snapping back to 0.
  const [discountInput, setDiscountInput] = useState("");
  const [savingDiscount, setSavingDiscount] = useState(false);
  const [repricing, setRepricing] = useState(false);

  // Actual price is derived from the offer price by default in both forms.
  // Unticking lets a one-off price be typed by hand.
  const [addAutoActual, setAddAutoActual] = useState(true);
  const [editAutoActual, setEditAutoActual] = useState(true);

  // Inline (in-row) editing — one row at a time, so an accidental keystroke
  // cannot quietly change a product three rows up.
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineForm, setInlineForm] = useState<Partial<Product>>({});
  const [inlineAutoActual, setInlineAutoActual] = useState(true);
  const [savingInline, setSavingInline] = useState(false);

  // Bulk editing — every visible row editable at once, across every column
  // the table shows. Drafts are keyed by product id and only created when a
  // row is actually touched, so the save writes the handful of rows that
  // changed rather than every product in the season.
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkForm, setBulkForm] = useState<Record<string, Partial<Product>>>({});
  const [bulkAutoActual, setBulkAutoActual] = useState(true);
  const [savingBulk, setSavingBulk] = useState(false);

  // The catalog is arranged, not sorted: categories in a chosen sequence and
  // products in a chosen sequence inside each one, exactly as the price list
  // prints. Grouping is the default view because that is what is being built.
  const [groupByCategory, setGroupByCategory] = useState(true);
  const [dragging, setDragging] = useState<{
    kind: "product" | "category";
    id: string;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    kind: "product" | "category" | "group";
    id: string;
    edge: "before" | "after";
  } | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  /** The discount every derived actual price on this page is calculated at. */
  const seasonDiscount = Number(
    selectedSeason?.price_list_discount_percentage ?? 0
  );
  const discountUsable = isUsableDiscount(seasonDiscount);

  /** Actual price for an offer price at this season's discount, or null. */
  const deriveActual = (offer: unknown) =>
    actualFromOffer(Number(offer), seasonDiscount);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (selectedSeasonId) fetchProducts();
    // Switching season abandons any half-finished edit — it belonged to the
    // catalog that just went off screen. The season selector confirms first
    // when there is unsaved bulk work.
    setInlineEditId(null);
    setInlineForm({});
    setBulkEditMode(false);
    setBulkForm({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeasonId]);

  useEffect(() => {
    setDiscountInput(
      selectedSeason ? String(selectedSeason.price_list_discount_percentage ?? 0) : ""
    );
    // Only the identity and the discount matter here; re-running on every
    // other season field would fight the field while it is being typed in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason?.id, selectedSeason?.price_list_discount_percentage]);

  const fetchProducts = async () => {
    if (!selectedSeasonId) return;
    try {
      setLoading(true);

      // Cost price lives in its own admin-only table, so it is fetched
      // separately and merged in rather than exposed through the public view.
      const [catalogRes, costsRes] = await Promise.all([
        supabase
          .from("season_catalog")
          .select("*")
          .eq("season_id", selectedSeasonId)
          .order("order", { nullsFirst: false })
          .order("name"),
        supabase
          .from("product_season_costs")
          .select("product_id, apr")
          .eq("season_id", selectedSeasonId),
      ]);

      if (catalogRes.error) throw catalogRes.error;
      if (costsRes.error) throw costsRes.error;

      const aprByProduct = new Map(
        (costsRes.data || []).map((c: any) => [c.product_id, c.apr])
      );

      setProducts(
        (catalogRes.data || []).map((row: any) => ({
          ...row,
          apr: aprByProduct.get(row.id) ?? "",
        }))
      );
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("order"); // <-- order by category order

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setEditForm(product);
    // Start in auto mode only when the stored price already matches what the
    // discount produces; otherwise the price was set by hand and reopening the
    // modal must not silently overwrite it.
    const derived = deriveActual(product.offer_price);
    setEditAutoActual(
      derived === null || Number(product.actual_price) === derived
    );
    setEditModalOpen(true);
  };

  const handleEditModalClose = () => {
    setEditModalOpen(false);
    setEditingProduct(null);
    setEditForm({});
  };

  const handleEditModalSave = async () => {
    if (!editingProduct || !selectedSeasonId) return;
    if (isSelectedReadOnly) {
      alert(
        "This season is closed and read-only. A superadmin must unlock it first."
      );
      return;
    }

    try {
      // Identity — shared across every season.
      const { error: identityError } = await supabase
        .from("products")
        .update({
          category_id: editForm.category_id,
          name: editForm.name,
          image_url: editForm.image_url,
          description: editForm.description,
          yt_link: editForm.yt_link,
          product_code: editForm.product_code,
        })
        .eq("id", editingProduct.id);

      if (identityError) throw identityError;

      // Commercials — this season only.
      const { error: seasonError } = await supabase
        .from("product_seasons")
        .update({
          stock: Number(editForm.stock ?? 0),
          actual_price: Number(editForm.actual_price ?? 0),
          offer_price: Number(editForm.offer_price ?? 0),
          content: editForm.content,
          // In auto mode the season's discount is what the actual price was
          // derived from, so store that rather than a stale per-product value.
          discount_percentage:
            editAutoActual && discountUsable
              ? seasonDiscount
              : Number(editForm.discount_percentage ?? 0),
          is_active: editForm.is_active,
          display_order: editForm.order,
        })
        .eq("product_id", editingProduct.id)
        .eq("season_id", selectedSeasonId);

      if (seasonError) throw seasonError;

      // Cost price — separate admin-only table.
      const { error: costError } = await supabase
        .from("product_season_costs")
        .upsert(
          {
            season_id: selectedSeasonId,
            product_id: editingProduct.id,
            apr: editForm.apr ? Number(Number(editForm.apr).toFixed(2)) : null,
          },
          { onConflict: "season_id,product_id" }
        );

      if (costError) throw costError;

      setEditModalOpen(false);
      setEditingProduct(null);
      setEditForm({});
      fetchProducts();
    } catch (error) {
      console.error("Error updating product:", error);
      alert(
        error instanceof Error ? error.message : "Failed to update product"
      );
    }
  };

  /**
   * Saves the season's price-list discount.
   *
   * Existing actual prices are deliberately NOT rewritten here — changing a
   * whole price list is an explicit action ("Recalculate"), not a side effect
   * of typing in a config box.
   */
  const handleSaveDiscount = async () => {
    if (!selectedSeason) return;
    const value = discountInput.trim() === "" ? 0 : Number(discountInput);
    if (!Number.isFinite(value) || value < 0 || value >= 100) {
      alert("Price list discount must be between 0 and 99.99%");
      return;
    }

    setSavingDiscount(true);
    try {
      await updateSeason(selectedSeason.id, {
        price_list_discount_percentage: value,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save discount");
    } finally {
      setSavingDiscount(false);
    }
  };

  /**
   * Re-derives actual prices across the whole season in one database
   * statement. `onlyMissing` fills in products that have no actual price yet
   * and leaves hand-set prices alone.
   */
  const handleReprice = async (onlyMissing: boolean) => {
    if (!selectedSeasonId || !selectedSeason) return;
    if (isSelectedReadOnly) {
      alert(
        "This season is closed and read-only. A superadmin must unlock it first."
      );
      return;
    }
    if (Number(discountInput) !== seasonDiscount) {
      alert("Save the discount first, then recalculate.");
      return;
    }
    const scope = onlyMissing
      ? "products that have no actual price yet"
      : "EVERY product in this season";
    if (
      !confirm(
        `Recalculate actual prices for ${scope} in season ${selectedSeason.name} at ${formatPrice(
          seasonDiscount
        )}% ?

Offer prices are not changed.`
      )
    )
      return;

    setRepricing(true);
    try {
      const updated = await applyPriceListDiscount(
        selectedSeasonId,
        onlyMissing
      );
      await fetchProducts();
      alert(`${updated} product${updated === 1 ? "" : "s"} re-priced.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to recalculate");
    } finally {
      setRepricing(false);
    }
  };

  // -------------------------------------------------------------------------
  // Inline (in-row) editing
  //
  // Covers only the fields that get corrected in bulk while preparing a price
  // list — stock, the two prices and cost. Anything identity-shaped (name,
  // category, images) still goes through the full edit modal.
  // -------------------------------------------------------------------------

  const startInlineEdit = (product: Product) => {
    setInlineEditId(product.id);
    setInlineForm({
      stock: product.stock,
      offer_price: product.offer_price,
      actual_price: product.actual_price,
      apr: product.apr,
    });
    const derived = deriveActual(product.offer_price);
    setInlineAutoActual(
      derived === null || Number(product.actual_price) === derived
    );
  };

  const cancelInlineEdit = () => {
    setInlineEditId(null);
    setInlineForm({});
  };

  /** Offer price drives the actual price whenever auto mode is on. */
  const handleInlineOfferChange = (raw: string) => {
    const offer = raw === "" ? "" : Number(raw);
    setInlineForm((f) => {
      const next = { ...f, offer_price: offer as number };
      if (inlineAutoActual) {
        const derived = deriveActual(offer);
        if (derived !== null) next.actual_price = derived;
      }
      return next;
    });
  };

  /** Enter saves the row, Escape abandons it — a keyboard-only price pass. */
  const handleInlineKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveInlineEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelInlineEdit();
    }
  };

  const saveInlineEdit = async () => {
    if (!inlineEditId || !selectedSeasonId) return;
    if (isSelectedReadOnly) {
      alert(
        "This season is closed and read-only. A superadmin must unlock it first."
      );
      return;
    }

    setSavingInline(true);
    try {
      const { error: seasonError } = await supabase
        .from("product_seasons")
        .update({
          stock: Number(inlineForm.stock ?? 0),
          offer_price: Number(inlineForm.offer_price ?? 0),
          actual_price: Number(inlineForm.actual_price ?? 0),
          ...(inlineAutoActual && discountUsable
            ? { discount_percentage: seasonDiscount }
            : {}),
        })
        .eq("product_id", inlineEditId)
        .eq("season_id", selectedSeasonId);

      if (seasonError) throw seasonError;

      // Cost is admin-only and lives in its own table; skip it entirely for
      // roles that cannot see the column, so an empty box never blanks a
      // cost the editor was not shown.
      if (userRole?.name === "superadmin") {
        const { error: costError } = await supabase
          .from("product_season_costs")
          .upsert(
            {
              season_id: selectedSeasonId,
              product_id: inlineEditId,
              apr:
                inlineForm.apr === "" || inlineForm.apr == null
                  ? null
                  : Number(Number(inlineForm.apr).toFixed(2)),
            },
            { onConflict: "season_id,product_id" }
          );
        if (costError) throw costError;
      }

      // Patch the row in place rather than refetching: a full reload would
      // re-sort the table under someone working down it row by row.
      setProducts((prev) =>
        prev.map((p) =>
          p.id === inlineEditId
            ? {
                ...p,
                stock: Number(inlineForm.stock ?? 0),
                offer_price: Number(inlineForm.offer_price ?? 0),
                actual_price: Number(inlineForm.actual_price ?? 0),
                apr:
                  userRole?.name === "superadmin"
                    ? (inlineForm.apr as string) ?? ""
                    : p.apr,
              }
            : p
        )
      );
      cancelInlineEdit();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save row");
    } finally {
      setSavingInline(false);
    }
  };

  // -------------------------------------------------------------------------
  // Bulk editing
  //
  // Every column the table displays becomes an input on every visible row.
  // Identity fields (name, code, category) belong to the product and are
  // shared by all seasons; prices, stock, order and active status belong to
  // the selected season; cost belongs to the admin-only cost table. The save
  // routes each field accordingly, exactly as the edit modal does.
  // -------------------------------------------------------------------------

  /** The columns bulk edit is allowed to change, in one place. */
  const BULK_FIELDS = [
    "name",
    "product_code",
    "category_id",
    "content",
    "order",
    "stock",
    "actual_price",
    "offer_price",
    "apr",
    "is_active",
  ] as const;

  /** What a row's inputs currently show: its draft if touched, else the row. */
  const bulkDraftFor = (product: Product): Partial<Product> =>
    bulkForm[product.id] ?? product;

  /** Records a change, seeding the draft from the row on first touch. */
  const patchBulkDraft = (product: Product, patch: Partial<Product>) =>
    setBulkForm((prev) => ({
      ...prev,
      [product.id]: { ...(prev[product.id] ?? product), ...patch },
    }));

  /** Offer price drives actual price here too, unless auto is switched off. */
  const handleBulkOfferChange = (product: Product, raw: string) => {
    const patch: Partial<Product> = {
      offer_price: raw === "" ? 0 : Number(raw),
    };
    if (bulkAutoActual) {
      const derived = deriveActual(raw);
      if (derived !== null) patch.actual_price = derived;
    }
    patchBulkDraft(product, patch);
  };

  /** True when a draft differs from the row it was seeded from. */
  const bulkRowChanged = (product: Product | undefined, draft: Partial<Product>) => {
    if (!product) return false;
    return BULK_FIELDS.some((field) => {
      const before = product[field];
      const after = draft[field];
      if (field === "is_active") return Boolean(before) !== Boolean(after);
      if (field === "apr")
        return String(before ?? "").trim() !== String(after ?? "").trim();
      if (
        field === "stock" ||
        field === "order" ||
        field === "actual_price" ||
        field === "offer_price"
      )
        return Number(before ?? 0) !== Number(after ?? 0);
      return String(before ?? "") !== String(after ?? "");
    });
  };

  /** Drafts that actually differ — what "Save all" will write. */
  const bulkChangedIds = Object.keys(bulkForm).filter((id) =>
    bulkRowChanged(
      products.find((p) => p.id === id),
      bulkForm[id]
    )
  );

  const enterBulkEdit = () => {
    cancelInlineEdit();
    setBulkForm({});
    setBulkAutoActual(true);
    setBulkEditMode(true);
  };

  const exitBulkEdit = (force = false) => {
    if (
      !force &&
      bulkChangedIds.length > 0 &&
      !confirm(
        `Discard unsaved changes to ${bulkChangedIds.length} product${
          bulkChangedIds.length === 1 ? "" : "s"
        }?`
      )
    )
      return;
    setBulkEditMode(false);
    setBulkForm({});
  };

  /** Puts one row back to its saved values without leaving bulk edit. */
  const revertBulkRow = (productId: string) =>
    setBulkForm((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });

  const saveBulkEdit = async () => {
    if (!selectedSeasonId) return;
    if (isSelectedReadOnly) {
      alert(
        "This season is closed and read-only. A superadmin must unlock it first."
      );
      return;
    }
    if (bulkChangedIds.length === 0) {
      exitBulkEdit(true);
      return;
    }

    setSavingBulk(true);
    const failures: string[] = [];

    /** Writes one product's changes across the three tables it spans. */
    const saveRow = async (productId: string) => {
      const draft = bulkForm[productId];
      const before = products.find((p) => p.id === productId);
      if (!draft || !before) return;

      const { error: identityError } = await supabase
        .from("products")
        .update({
          name: draft.name,
          product_code: draft.product_code,
          category_id: draft.category_id,
        })
        .eq("id", productId);
      if (identityError) throw identityError;

      const { error: seasonError } = await supabase
        .from("product_seasons")
        .update({
          content: draft.content,
          display_order: draft.order == null ? null : Number(draft.order),
          stock: Number(draft.stock ?? 0),
          actual_price: Number(draft.actual_price ?? 0),
          offer_price: Number(draft.offer_price ?? 0),
          is_active: Boolean(draft.is_active),
          ...(bulkAutoActual && discountUsable
            ? { discount_percentage: seasonDiscount }
            : {}),
        })
        .eq("product_id", productId)
        .eq("season_id", selectedSeasonId);
      if (seasonError) throw seasonError;

      // Cost is admin-only; roles that cannot see the column never write it,
      // so an unseen cost can't be blanked by a bulk save.
      if (
        userRole?.name === "superadmin" &&
        String(before.apr ?? "").trim() !== String(draft.apr ?? "").trim()
      ) {
        const { error: costError } = await supabase
          .from("product_season_costs")
          .upsert(
            {
              season_id: selectedSeasonId,
              product_id: productId,
              apr:
                draft.apr === "" || draft.apr == null
                  ? null
                  : Number(Number(draft.apr).toFixed(2)),
            },
            { onConflict: "season_id,product_id" }
          );
        if (costError) throw costError;
      }
    };

    // A few at a time: enough to keep a long price list quick, few enough
    // that a slow connection is not flooded with hundreds of requests.
    const CHUNK = 5;
    const saved = new Set<string>();
    for (let i = 0; i < bulkChangedIds.length; i += CHUNK) {
      const chunk = bulkChangedIds.slice(i, i + CHUNK);
      const results = await Promise.allSettled(chunk.map(saveRow));
      results.forEach((result, index) => {
        const id = chunk[index];
        if (result.status === "fulfilled") {
          saved.add(id);
        } else {
          const name = products.find((p) => p.id === id)?.name ?? id;
          failures.push(
            `${name}: ${
              result.reason instanceof Error
                ? result.reason.message
                : "failed to save"
            }`
          );
        }
      });
    }

    // Apply what actually saved and keep any failed row in edit mode with its
    // typed values intact, so a partial failure is recoverable by retrying.
    setProducts((prev) =>
      prev.map((p) => {
        if (!saved.has(p.id)) return p;
        const draft = bulkForm[p.id];
        return {
          ...p,
          name: draft.name ?? p.name,
          product_code: draft.product_code ?? p.product_code,
          category_id: draft.category_id ?? p.category_id,
          categories:
            categories.find((c) => c.id === draft.category_id)?.name != null
              ? {
                  name: categories.find((c) => c.id === draft.category_id)!
                    .name,
                }
              : p.categories,
          content: draft.content ?? p.content,
          order: draft.order == null ? undefined : Number(draft.order),
          stock: Number(draft.stock ?? 0),
          actual_price: Number(draft.actual_price ?? 0),
          offer_price: Number(draft.offer_price ?? 0),
          is_active: Boolean(draft.is_active),
          apr:
            userRole?.name === "superadmin" ? (draft.apr as string) ?? "" : p.apr,
        };
      })
    );

    setBulkForm((prev) => {
      const next: Record<string, Partial<Product>> = {};
      Object.keys(prev).forEach((id) => {
        if (!saved.has(id)) next[id] = prev[id];
      });
      return next;
    });
    setSavingBulk(false);

    if (failures.length) {
      alert(
        `${saved.size} product${saved.size === 1 ? "" : "s"} saved.\n\n` +
          `${failures.length} failed and are still open for editing:\n` +
          failures.slice(0, 10).join("\n")
      );
      return;
    }

    setBulkEditMode(false);
    alert(`${saved.size} product${saved.size === 1 ? "" : "s"} updated.`);
  };

  // -------------------------------------------------------------------------
  // Arranging the catalog
  //
  // Positions are stored, not derived: categories."order" and
  // product_seasons.display_order. Dragging works out the new sequence, then
  // writes only the rows whose position actually moved — dropping one product
  // usually shifts a handful of neighbours, not the whole season.
  // -------------------------------------------------------------------------

  /** One category's products, in the order they print. */
  const productsInCategory = (categoryId: string | null) =>
    byOrder(
      products.filter((product) => (product.category_id ?? null) === categoryId),
      (product) => product.name
    );

  /**
   * Writes new positions, and any category change, for the products that
   * moved. The table is updated first so the row lands where it was dropped
   * without waiting for a round trip; a failure reloads from the database
   * rather than leaving the screen disagreeing with it.
   */
  const persistProductOrder = async (
    updates: { id: string; order: number; category_id?: string }[]
  ) => {
    if (!selectedSeasonId || updates.length === 0) return;

    const previous = products;
    setProducts((prev) =>
      prev.map((product) => {
        const update = updates.find((u) => u.id === product.id);
        if (!update) return product;
        return {
          ...product,
          order: update.order,
          ...(update.category_id
            ? {
                category_id: update.category_id,
                categories: categories.find((c) => c.id === update.category_id)
                  ? { name: categories.find((c) => c.id === update.category_id)!.name }
                  : product.categories,
              }
            : {}),
        };
      })
    );

    setSavingOrder(true);
    try {
      await Promise.all(
        updates.map(async (update) => {
          const { error } = await supabase
            .from("product_seasons")
            .update({ display_order: update.order })
            .eq("product_id", update.id)
            .eq("season_id", selectedSeasonId);
          if (error) throw error;

          // Category lives on the product itself, so a cross-category drag
          // changes it for every season. That is intended: a sparkler does
          // not become a flowerpot for one year only.
          if (update.category_id) {
            const { error: categoryError } = await supabase
              .from("products")
              .update({ category_id: update.category_id })
              .eq("id", update.id);
            if (categoryError) throw categoryError;
          }
        })
      );
    } catch (err) {
      setProducts(previous);
      alert(
        err instanceof Error ? err.message : "Failed to save the new order"
      );
      fetchProducts();
    } finally {
      setSavingOrder(false);
    }
  };

  /**
   * Drops `productId` into `targetCategoryId` at `insertAt`.
   *
   * Both lists are rebuilt and renumbered from 1, which quietly repairs the
   * gaps and duplicate positions that years of hand-typed order numbers leave
   * behind.
   */
  const moveProduct = (
    productId: string,
    targetCategoryId: string | null,
    insertAt: number
  ) => {
    const moved = products.find((product) => product.id === productId);
    if (!moved) return;

    const sourceCategoryId = moved.category_id ?? null;
    const target = productsInCategory(targetCategoryId).filter(
      (product) => product.id !== productId
    );
    target.splice(Math.max(0, Math.min(insertAt, target.length)), 0, moved);

    const updates: { id: string; order: number; category_id?: string }[] =
      renumber(target);

    if (sourceCategoryId !== targetCategoryId) {
      // Close the gap the product left behind, and record its new category.
      const source = productsInCategory(sourceCategoryId).filter(
        (product) => product.id !== productId
      );
      updates.push(...renumber(source));

      const movedUpdate = updates.find((u) => u.id === productId);
      if (movedUpdate) {
        movedUpdate.category_id = targetCategoryId ?? undefined;
      } else {
        // Its number happened not to change, but its category did.
        updates.push({
          id: productId,
          order: target.indexOf(moved) + 1,
          category_id: targetCategoryId ?? undefined,
        });
      }
    }

    persistProductOrder(updates);
  };

  /** Reorders the categories themselves, which reorders every printed list. */
  const moveCategory = async (categoryId: string, insertAt: number) => {
    const ordered = byOrder(categories, (category) => category.name).filter(
      (category) => category.id !== categoryId
    );
    const moved = categories.find((category) => category.id === categoryId);
    if (!moved) return;
    ordered.splice(Math.max(0, Math.min(insertAt, ordered.length)), 0, moved);

    const updates = renumber(ordered);
    if (!updates.length) return;

    const previous = categories;
    setCategories((prev) =>
      prev.map((category) => {
        const update = updates.find((u) => u.id === category.id);
        return update ? { ...category, order: update.order } : category;
      })
    );

    setSavingOrder(true);
    try {
      await Promise.all(
        updates.map(async (update) => {
          const { error } = await supabase
            .from("categories")
            .update({ order: update.order })
            .eq("id", update.id);
          if (error) throw error;
        })
      );
    } catch (err) {
      setCategories(previous);
      alert(
        err instanceof Error
          ? err.message
          : "Failed to save the new category order"
      );
      fetchCategories();
    } finally {
      setSavingOrder(false);
    }
  };

  /** Which half of a row the pointer is over — insert above it, or below. */
  const edgeFromPointer = (
    e: React.DragEvent<HTMLElement>
  ): "before" | "after" => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };

  const handleDropOnProduct = (over: Product) => {
    if (!dragging || dragging.kind !== "product" || dragging.id === over.id) {
      setDropTarget(null);
      setDragging(null);
      return;
    }

    const edge = dropTarget?.id === over.id ? dropTarget.edge : "before";
    const targetCategoryId = over.category_id ?? null;
    const list = productsInCategory(targetCategoryId).filter(
      (product) => product.id !== dragging.id
    );
    const index = list.findIndex((product) => product.id === over.id);
    moveProduct(
      dragging.id,
      targetCategoryId,
      edge === "before" ? index : index + 1
    );
    setDropTarget(null);
    setDragging(null);
  };

  /** Dropping on a group header: a product joins the end, a category moves. */
  const handleDropOnGroup = (categoryId: string | null) => {
    if (!dragging) return;

    if (dragging.kind === "product") {
      const list = productsInCategory(categoryId).filter(
        (product) => product.id !== dragging.id
      );
      moveProduct(dragging.id, categoryId, list.length);
    } else if (categoryId && dragging.id !== categoryId) {
      const edge =
        dropTarget?.id === categoryId ? dropTarget.edge : "before";
      const ordered = byOrder(categories, (category) => category.name).filter(
        (category) => category.id !== dragging.id
      );
      const index = ordered.findIndex((category) => category.id === categoryId);
      moveCategory(dragging.id, edge === "before" ? index : index + 1);
    }

    setDropTarget(null);
    setDragging(null);
  };

  /**
   * The next free SWC-P code.
   *
   * Generated from the codes already loaded for this season, and unique in
   * the database too: products.product_code carries a unique index, so two
   * people adding products at the same moment get a clean error rather than a
   * duplicate code printed on a box.
   */
  const generateProductCode = () =>
    nextProductCode(products.map((product) => product.product_code));

  /** Position a new product takes: the end of the category it is going into. */
  const nextOrderFor = (categoryId: string | undefined) =>
    nextOrderInCategory(products, categoryId ?? null);

  /** Opens the single-product form with its code and position pre-filled. */
  const openAddModal = () => {
    const categoryId = categories[0]?.id;
    setAddForm({
      product_code: generateProductCode(),
      category_id: categoryId,
      order: nextOrderFor(categoryId),
      is_active: true,
    });
    setAddOrderTouched(false);
    setAddAutoActual(true);
    setShowAddModal(true);
  };

  /**
   * Shared look for every in-table editor, so rows stay on one baseline.
   * `no-spinner` removes the stepper arrows and, with the onWheel blur on each
   * number input, stops the mouse wheel from silently editing prices.
   */
  const cellInputClass =
    "w-full px-2 py-1 rounded border border-card-border/20 bg-card focus:outline-none focus:border-primary-orange no-spinner";

  /** Bulk edit trades whitespace for columns so a whole row fits the screen. */
  const cellPad = bulkEditMode ? "py-2 px-2" : "py-4 px-6";

  /**
   * Category names in catalog order.
   *
   * Every print and export path routes through this so a rearranged catalog
   * reaches the PDF, the Excel export and the screen as one order rather than
   * three that drift apart.
   */
  const orderedCategoryNames = (names: string[]): string[] => {
    const position = new Map(
      byOrder(categories, (category) => category.name).map((category, index) => [
        category.name,
        index,
      ])
    );
    // A name with no category row behind it (deleted category, stale row)
    // sorts to the end instead of jumping to the front on a missing 0.
    return [...names].sort(
      (a, b) =>
        (position.get(a) ?? Number.MAX_SAFE_INTEGER) -
        (position.get(b) ?? Number.MAX_SAFE_INTEGER)
    );
  };

  const getPriceListExportRows = () => {
    const grouped: { [cat: string]: Product[] } = {};

    filteredProducts
      .filter((product) => product.is_active !== false)
      .forEach((product) => {
        const catName = product.categories?.name || "Uncategorized";
        if (!grouped[catName]) grouped[catName] = [];
        grouped[catName].push(product);
      });

    // The printed list is the arrangement made on screen, not a re-sort:
    // same category sequence, same product sequence inside each one.
    Object.keys(grouped).forEach((cat) => {
      grouped[cat] = byOrder(grouped[cat], (product) => product.name);
    });

    const sortedCategoryNames = orderedCategoryNames(Object.keys(grouped));

    const rows: Record<string, string | number>[] = [];
    let serial = 1;

    sortedCategoryNames.forEach((catName) => {
      grouped[catName].forEach((product) => {
        rows.push({
          "S.No": serial++,
          Category: catName,
          Product: product.name,
          "Actual Price": product.actual_price,
          "Offer Price": product.offer_price,
          Content: product.content || "-",
          Stock: product.stock ?? 0,
          APR: product.apr || "-",
          Requirement: "",
          Amount: "",
        });
      });
    });

    return rows;
  };

  // Archived seasons export under their own name so old price lists stay
  // distinguishable from the current one.
  const seasonSlug = (selectedSeason?.name || "current").replace(/\s+/g, "-");

  const handleExportPriceList = (format: "excel" | "csv") => {
    const rows = getPriceListExportRows();

    if (!rows.length) return;

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Price List");

    if (format === "csv") {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `soundwave_price_list_${seasonSlug}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return;
    }

    XLSX.writeFile(workbook, `soundwave_price_list_${seasonSlug}.xlsx`);
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    // Group products by category and sort products by order inside each category
    const grouped: { [cat: string]: Product[] } = {};
    filteredProducts.forEach((product) => {
      const catName = product.categories?.name || "Uncategorized";
      if (!grouped[catName]) grouped[catName] = [];
      grouped[catName].push(product);
    });

    // The printed list is the arrangement made on screen, not a re-sort:
    // same category sequence, same product sequence inside each one.
    Object.keys(grouped).forEach((cat) => {
      grouped[cat] = byOrder(grouped[cat], (product) => product.name);
    });

    const sortedCategoryNames = orderedCategoryNames(Object.keys(grouped));

    // Generate table rows
    let tableRows = "";
    let serial = 1;
    sortedCategoryNames.forEach((catName) => {
      const products = grouped[catName];
      // Category row
      tableRows += `
      <tr>
        <td colspan="7" style="text-align:center; font-weight:bold; background:#f5f5f5; font-size:1.1rem;">
          ${catName}
        </td>
      </tr>
    `;
      // Product rows
      products.forEach((product) => {
        tableRows += `
        <tr class="${product.is_active ? "" : "text-red-500 font-bold"}">
          <td>${serial++}</td>
          <td>${product.name}</td>
          <td>${product.content || "-"}</td>
          <td class="${product.stock <= 20 ? "text-red-500 font-bold" : ""}">${
          product.stock
        }</td>
          <td><del>₹${product.actual_price}</del></td>
          <td>₹${product.offer_price}</td>
          <td>${product.apr || "-"}</td>
        </tr>
      `;
      });
    });

    const content = `
    <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Soundwave Crackers - Stock Report ${seasonSlug}</title>
  <style>
    body {
      margin: 0;
      font-family: sans-serif, "Segoe UI";
      background-color: #fff0f5;
      color: #333;
    }
    .table-section {
      padding: 20px;
    }
    .table-overlay {
      background-color: rgba(255, 255, 255, 0.88);
      padding: 30px;
      border-radius: 12px;
      margin: auto;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    }
    table.product-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95rem;
    }
    table.product-table th,
    table.product-table td {
      border: 1px solid #999;
      padding: 12px 15px;
      text-align: center;
    }
    table.product-table th {
      background-color: brown;
      font-weight: bold;
      color: wheat;
    }
    .text-red-500 {
      color: #FF0000 !important;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <section class="table-section">
    <div class="table-overlay">
      <table class="product-table">
        <thead>
          <tr>
            <th>S.No</th>
            <th>Product</th>
            <th>Content</th>
            <th>Stock</th>
            <th>Actual Price</th>
            <th>Offer Price</th>
            <th>APR</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
  </section>
  <footer style="text-align: center; padding: 20px; font-size: 0.9rem; color: #666;">
    <p><strong>Soundwave Crackers</strong> - Your premier destination for premium-quality crackers and fireworks, making your celebrations brighter and more memorable.</p>
    <p>Thank you for choosing Soundwave Crackers! For inquiries, contact us</p>
  </footer>
  <script>
    // Wait for DOM to be loaded before printing
    function readyToPrint() {
      setTimeout(function() {
        window.print();
        window.close();
      }, 300);
    }
    if (document.readyState === "complete") {
      readyToPrint();
    } else {
      window.onload = readyToPrint;
    }
  </script>
</body>
</html>
  `;

    printWindow.document.write(content);
    printWindow.document.close();
  };

  const handlePriceListDownload1 = async () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const content = `
      <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Soundwave Crackers - Price List ${seasonSlug}</title>
  <style>
    body {
      margin: 0;
      font-family: sans-serif, "Segoe UI";
      background-color: #fff0f5;
      color: #333;
    }

    header {
      text-align: center;
      padding: 20px 20px 0px 20px;
      // background: url("/assets/img/banners/CTA-banner.png") center center / cover no-repeat;
      color: white;
      
    }

    header img {
      height: 100px;
      margin-bottom: 10px;
    }

    header h1 {
      margin: 10px 0 5px;
      font-size: 2.5rem;
      font-weight: bold;
    }

    header p.slogan {
      font-style: italic;
      font-size: 1rem;
      margin: 0px 10px;
    }

    header .contact {
      font-size: 0.95rem;
      line-height: 1.6;
      text-align: end;
    }

    header .content {
      background: brown;
      padding: 20px;
      border-radius: 12px;
    }

    header .company-info {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
     
    }
    header .company-header-section {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    }

    .table-section {
      // background: url("/assets/img/banners/CTA-banner.png") center center / cover no-repeat;
      padding: 20px;
    }

    .table-overlay {
      background-color: rgba(255, 255, 255, 0.88);
      padding: 30px;
      border-radius: 12px;

      margin: auto;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    }

    table.product-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95rem;
    }

    table.product-table th,
    table.product-table td {
      border: 1px solid #999;
      padding: 12px 15px;
      text-align: center;
    }

    table.product-table th {
      background-color: brown;
      font-weight: bold;
      color: wheat;
    }
  </style>
</head>

<body>
  <header>
    <div class="content">
      <div class="company-info">
        <img src="/assets/img/logo/logo_2.png" alt="Soundwave Crackers Logo" />
        <div class="contact">
          <p>📍 Kananjampatti, Sattur-Sivakasi-Kalugumalai Road,<br />Vembakottai, Sivakasi, Tamil Nadu, 626131</p>
          <p>
            📞 +91 9363515184 | 💬
            <a href="https://wa.me/919363515184" target="_blank" style="color: white">WhatsApp Us</a>
            | 📞 +91 9789794518
          </p>
          <p>
            🌐
            <a href="https://soundwavecrackers.com" target="_blank" style="color: white">www.soundwavecrackers.com</a>
          </p>
        </div>
      </div>
      <div class="company-header-section">
        <!-- <div> <img src="gift-box-new.png" alt="upto 80% off" /></div> -->
        <div class="brand-info">
          <h1>Soundwave Crackers</h1>
          <p class="slogan">"The Rhythm Of Celebration"</p>
          <p>📅 Price List - 2025</p>
          <p><strong>Upto 80% Off</strong></p>
        </div>
        <!-- <div> <img src="gift-box-new.png" alt="upto 80% off" /></div> -->
      </div>
  </header>

  <section class="table-section">
    <div class="table-overlay">
      <table class="product-table">
        <thead>
          <tr>
            <th>S.No</th>
            <th>Category</th>
            <th>Product</th>
            <th>Actual Price</th>
            <th>Offer Price</th>
            <th>Quantity</th>
            <th>Requirement</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${filteredProducts
            .map(
              (product, index) => `
              <tr>
              <td>${index + 1}</td>
              <td>${product.categories?.name || "-"}</td>
                <td class="text-left">${product.name}</td>
                <td>₹${product.actual_price}</td>
                <td>₹${product.offer_price}</td>
                <td>${product.content || "-"}</td>
                <td></td>
                <td></td>
              </tr>
            `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  </section>
  <footer style="text-align: center; padding: 20px; font-size: 0.9rem; color: #666;">
  <p><strong>Soundwave Crackers</strong> - Your premier destination for premium-quality crackers and fireworks, making your celebrations brighter and more memorable.</p>
    <p>Thank you for choosing Soundwave Crackers! For inquiries, contact us</p>
  </footer>
</body>
</html>
  `;

    printWindow.document.write(content);
    printWindow.document.close();
  };

  /**
   * The printed arrangement: categories in their order, products in theirs.
   * The search box does not narrow a printed price list.
   */
  const priceListGroups = () => {
    const grouped: { [cat: string]: Product[] } = {};
    products
      .filter((product) => product.is_active)
      .forEach((product) => {
        const catName = product.categories?.name || "Uncategorized";
        if (!grouped[catName]) grouped[catName] = [];
        grouped[catName].push(product);
      });

    Object.keys(grouped).forEach((cat) => {
      grouped[cat] = byOrder(grouped[cat], (product) => product.name);
    });

    return orderedCategoryNames(Object.keys(grouped)).map((category) => ({
      category,
      products: grouped[category].map((product) => ({
        name: product.name,
        actual_price: product.actual_price ?? null,
        offer_price: product.offer_price ?? null,
        content: product.content ?? null,
      })),
    }));
  };

  /**
   * Opens the price list as a PDF in the browser's own viewer, which brings
   * print, zoom and save with it. It used to print straight to the dialog and
   * close, so nobody could check the list before it went to paper.
   */
  const handlePriceListDownload = async () => {
    // Opened before the await: a window created after one is a popup.
    const viewer = window.open("", "_blank");
    if (viewer) {
      viewer.document.write(
        `<!doctype html><title>Price List ${seasonSlug}</title>` +
          `<body style="font:14px sans-serif;padding:24px;color:#555">` +
          `Preparing the price list…</body>`
      );
      viewer.document.close();
    }

    try {
      const groups = priceListGroups();

      if (!groups.length) {
        viewer?.close();
        toast.error("There are no active products to print");
        return;
      }

      await openPriceListPdf(
        {
          groups,
          seasonName: seasonSlug,
          discountPercent: discountUsable ? seasonDiscount : null,
        },
        viewer
      );
    } catch (err) {
      viewer?.close();
      toast.error(
        err instanceof Error ? err.message : "Could not build the price list"
      );
    }
  };

  /**
   * The same list, drawn to the settings a superadmin just chose.
   *
   * No viewer window is opened ahead of this one: the click that reaches here
   * is the modal's button, several awaits after the file dialog, so a popup
   * would be blocked anyway. This one saves straight to the device.
   */
  const handleCustomPriceList = async (settings: CustomPriceListSettings) => {
    try {
      const groups = priceListGroups();
      if (!groups.length) {
        toast.error("There are no active products to print");
        return;
      }

      const { buildPriceListPdf, repriceGroups } = await import(
        "../lib/priceListPdf"
      );
      const doc = await buildPriceListPdf({
        // The struck-out price follows the discount chosen in the modal, so
        // the saving the heading claims is the saving the two columns show.
        // In memory, for this file only — nothing is written back.
        groups: repriceGroups(groups, settings.discountPercent),
        seasonName: seasonSlug,
        // A banner the superadmin uploaded travels as a data URL and is never
        // stored: this sheet is the only thing it was for.
        ...(settings.bannerDataUrl
          ? { headerImageUrl: settings.bannerDataUrl }
          : {}),
        discountPercent: settings.discountPercent,
        columns: settings.columns,
        strikePrice: settings.strikePrice,
      });
      doc.save(`soundwave_price_list_${seasonSlug}_custom.pdf`);
      setShowCustomPriceList(false);
      toast.success("Custom price list downloaded");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not build the price list"
      );
    }
  };

  /**
   * Search and category first, on their own: the stock and status counts on
   * the filter buttons describe this slice, so switching between them does
   * not change the numbers underneath.
   */
  const searchedProducts = products.filter((product) => {
    const matchesSearch = product.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesCategory =
      categoryFilter === "all" || product.category_id === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  /** A blank or nonsensical threshold filters nothing rather than everything. */
  const lowStockLimit = Number(lowStockThreshold);
  const lowStockUsable =
    lowStockThreshold.trim() !== "" &&
    Number.isFinite(lowStockLimit) &&
    lowStockLimit > 0;

  const stockOf = (product: Product) => Number(product.stock ?? 0);
  /** Only an explicit false is inactive; a row with nothing set is live. */
  const isInactive = (product: Product) => product.is_active === false;
  const isUnpriced = (product: Product) => Number(product.offer_price ?? 0) <= 0;

  const matchesStock = (product: Product) => {
    const stock = stockOf(product);
    switch (stockFilter) {
      case "zero":
        return stock <= 0;
      case "inStock":
        return stock > 0;
      case "low":
        return lowStockUsable ? stock < lowStockLimit : true;
      default:
        return true;
    }
  };

  const matchesStatus = (product: Product) => {
    if (statusFilter === "active") return !isInactive(product);
    if (statusFilter === "inactive") return isInactive(product);
    return true;
  };

  const filteredProducts = searchedProducts.filter(
    (product) =>
      matchesStock(product) &&
      matchesStatus(product) &&
      (!needsPricing || isUnpriced(product))
  );

  /** Counts shown on the filter buttons, against the searched slice. */
  const counts = {
    total: searchedProducts.length,
    zero: searchedProducts.filter((p) => stockOf(p) <= 0).length,
    inStock: searchedProducts.filter((p) => stockOf(p) > 0).length,
    low: lowStockUsable
      ? searchedProducts.filter((p) => stockOf(p) < lowStockLimit).length
      : 0,
    inactive: searchedProducts.filter(isInactive).length,
    unpriced: searchedProducts.filter(isUnpriced).length,
  };

  const filtersActive =
    searchTerm.trim() !== "" ||
    categoryFilter !== "all" ||
    stockFilter !== "all" ||
    statusFilter !== "all" ||
    needsPricing;

  const clearFilters = () => {
    setSearchTerm("");
    setCategoryFilter("all");
    setStockFilter("all");
    setStatusFilter("all");
    setNeedsPricing(false);
  };

  // count of active products within current filtered list
  const activeCount = filteredProducts.filter((p) => p.is_active).length;

  /**
   * Rows edited in bulk and then filtered out of sight. They are still part
   * of the save — silently dropping typed-in values would be worse — so the
   * bulk bar says how many there are.
   */
  const hiddenChangedIds = bulkEditMode
    ? bulkChangedIds.filter(
        (id) => !filteredProducts.some((product) => product.id === id)
      )
    : [];

  // Add sorting handler
  const handleSort = (field: string) => {
    // Grouped mode shows the arranged order; a column sort there would
    // contradict what the drag handles just did.
    if (groupByCategory) return;
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Helper to safely get the value for sorting
  const getSortValue = (
    product: Product,
    field: string
  ): string | number | boolean => {
    switch (field) {
      case "order":
        return product.order ?? 0;
      case "product_code":
        // @ts-ignore
        return (product as any).product_code ?? "";
      case "name":
        return product.name ?? "";
      case "categories.name":
        return product.categories?.name ?? "";
      case "content":
        return product.content ?? "";
      case "stock":
        return product.stock ?? 0;
      case "actual_price":
        return product.actual_price ?? 0;
      case "offer_price":
        return product.offer_price ?? 0;
      case "apr":
        return product.apr ?? "";
      case "is_active":
        return product.is_active ?? false;
      default:
        // fallback for any other field
        // @ts-ignore
        return (product as any)[field] ?? "";
    }
  };

  // Sort products based on selected field and direction
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    const aValue = getSortValue(a, sortField);
    const bValue = getSortValue(b, sortField);

    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    }
    if (typeof aValue === "boolean" && typeof bValue === "boolean") {
      return sortDirection === "asc"
        ? Number(aValue) - Number(bValue)
        : Number(bValue) - Number(aValue);
    }
    return sortDirection === "asc"
      ? String(aValue).localeCompare(String(bValue))
      : String(bValue).localeCompare(String(aValue));
  });


  /**
   * One product row. Shared by the grouped view and the flat sorted view, so
   * bulk edit, inline edit and drag-to-reorder behave identically in both.
   */
  const renderProductRow = (product: Product) => {
    // Two ways into edit mode: one row via inline edit, or
    // every row via bulk edit. Bulk covers every column the
    // table displays; inline stays on the price-pass fields.
    const editingInline = inlineEditId === product.id;
    const draft = bulkEditMode
      ? bulkDraftFor(product)
      : inlineForm;
    const editingPrices = bulkEditMode || editingInline;
    const rowDirty =
      bulkEditMode && bulkChangedIds.includes(product.id);
    const autoActual = bulkEditMode
      ? bulkAutoActual
      : inlineAutoActual;

    /** Routes a cell edit to whichever draft is in play. */
    const patch = (fields: Partial<Product>) =>
      bulkEditMode
        ? patchBulkDraft(product, fields)
        : setInlineForm((f) => ({ ...f, ...fields }));

    const onOfferChange = (raw: string) =>
      bulkEditMode
        ? handleBulkOfferChange(product, raw)
        : handleInlineOfferChange(raw);

    /** Re-derives the actual price when auto is switched on. */
    const syncActual = (auto: boolean) => {
      if (bulkEditMode) setBulkAutoActual(auto);
      else setInlineAutoActual(auto);
      if (!auto) return;
      const derived = deriveActual(draft.offer_price);
      if (derived !== null) patch({ actual_price: derived });
    };

    const isDragged =
      dragging?.kind === "product" && dragging.id === product.id;
    const dropEdge =
      dropTarget?.kind === "product" && dropTarget.id === product.id
        ? dropTarget.edge
        : null;

    return (
    <tr
      key={product.id}
      draggable={dndEnabled}
      onDragStart={() => {
        if (!dndEnabled) return;
        setDragging({ kind: "product", id: product.id });
      }}
      onDragOver={(e) => {
        if (!dndEnabled || dragging?.kind !== "product") return;
        e.preventDefault();
        setDropTarget({
          kind: "product",
          id: product.id,
          edge: edgeFromPointer(e),
        });
      }}
      onDragLeave={() =>
        setDropTarget((current) =>
          current?.id === product.id ? null : current
        )
      }
      onDrop={(e) => {
        if (!dndEnabled) return;
        e.preventDefault();
        handleDropOnProduct(product);
      }}
      onDragEnd={() => {
        setDragging(null);
        setDropTarget(null);
      }}
      className={`border-t border-card-border/10 ${
        isDragged ? "opacity-40" : ""
      } ${
        dropEdge === "before"
          ? "shadow-[inset_0_3px_0_0_rgb(var(--primary-orange))]"
          : dropEdge === "after"
          ? "shadow-[inset_0_-3px_0_0_rgb(var(--primary-orange))]"
          : ""
      } ${
        rowDirty
          ? "bg-amber-500/10"
          : editingPrices
          ? "bg-primary-orange/5"
          : ""
      }`}
    >
      {dndEnabled && (
        <td className={`${cellPad} cursor-grab text-text/40`}>
          <GripVertical className="w-4 h-4" />
        </td>
      )}
      <td className={cellPad}>
        {bulkEditMode ? (
          <NumberInput
            min={0}
            value={draft.order ?? ""}
            onValueChange={(n) => patch({ order: n })}
            // Empty means "no position set", as it did before.
            onClear={() => patch({ order: undefined })}
            aria-label={`Display order for ${product.name}`}
            className={cellInputClass}
          />
        ) : (
          product.order ?? "-"
        )}
      </td>
      <td className={cellPad}>
        {bulkEditMode ? (
          <input
            type="text"
            value={draft.product_code ?? ""}
            onChange={(e) =>
              patch({ product_code: e.target.value })
            }
            aria-label={`Product code for ${product.name}`}
            className={cellInputClass}
          />
        ) : (
          product.product_code || "-"
        )}
      </td>
      <td className={cellPad}>
        {bulkEditMode ? (
          <input
            type="text"
            value={draft.name ?? ""}
            onChange={(e) => patch({ name: e.target.value })}
            aria-label="Product name"
            className={cellInputClass}
          />
        ) : (
          <span className="inline-flex items-center gap-1.5">
            {product.name}
            {/* A family pack is a packed box with its own stock, edited
                here like any product's. */}
            {product.combo_pack_id && (
              <span
                title="Family pack — a packed box with its own stock"
                className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary-orange/10 text-primary-orange"
              >
                PACK
              </span>
            )}
          </span>
        )}
      </td>
      <td className={cellPad}>
        {bulkEditMode ? (
          <select
            value={draft.category_id ?? ""}
            onChange={(e) =>
              patch({ category_id: e.target.value })
            }
            aria-label={`Category for ${product.name}`}
            className={cellInputClass}
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        ) : (
          product.categories?.name
        )}
      </td>
      <td className={cellPad}>
        {bulkEditMode ? (
          <input
            type="text"
            value={draft.content ?? ""}
            onChange={(e) => patch({ content: e.target.value })}
            aria-label={`Content for ${product.name}`}
            className={cellInputClass}
          />
        ) : (
          product.content
        )}
      </td>
      <td
        className={`${cellPad} ${
          !editingPrices && product.stock <= 20
            ? "text-red-500 font-bold"
            : ""
        }`}
      >
        {editingPrices ? (
          <NumberInput
            min={0}
            value={draft.stock ?? ""}
            onValueChange={(n) =>
              patch({ stock: n })
            }
            onKeyDown={
              bulkEditMode ? undefined : handleInlineKeyDown
            }
            aria-label={`Stock for ${product.name}`}
            autoFocus={editingInline}
            className={cellInputClass}
          />
        ) : (
          product.stock
        )}
      </td>
      <td className={cellPad}>
        {editingPrices ? (
          <div className="flex flex-col gap-1">
            <NumberInput
              min={0}
              step="0.01"
              value={draft.actual_price ?? ""}
              onValueChange={(n) =>
                patch({ actual_price: n })
              }
              onKeyDown={
                bulkEditMode ? undefined : handleInlineKeyDown
              }
              readOnly={autoActual && discountUsable}
              aria-label={`Actual price for ${product.name}`}
              title={
                autoActual && discountUsable
                  ? `Calculated from the offer price at ${formatPrice(
                      seasonDiscount
                    )}%`
                  : undefined
              }
              className={`${cellInputClass} ${
                autoActual && discountUsable
                  ? "bg-card/40 text-text/70 cursor-not-allowed"
                  : ""
              }`}
            />
            {/* Bulk edit has one auto switch in the toolbar;
                inline edit carries its own, per row. */}
            {discountUsable && !bulkEditMode && (
              <label className="flex items-center gap-1 text-xs text-text/60 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={autoActual}
                  onChange={(e) => syncActual(e.target.checked)}
                />
                auto
              </label>
            )}
          </div>
        ) : (
          `₹${formatPrice(product.actual_price)}`
        )}
      </td>
      <td className={cellPad}>
        {editingPrices ? (
          <NumberInput
            min={0}
            step="0.01"
            value={draft.offer_price ?? ""}
            onValueChange={(n) => onOfferChange(String(n))}
            onKeyDown={
              bulkEditMode ? undefined : handleInlineKeyDown
            }
            aria-label={`Offer price for ${product.name}`}
            className={cellInputClass}
          />
        ) : (
          `₹${formatPrice(product.offer_price)}`
        )}
      </td>
      {userRole?.name === "superadmin" && (
        <td className={cellPad}>
          {editingPrices ? (
            <input
              type="number"
              onWheel={(e) => e.currentTarget.blur()}
              min={0}
              step="0.01"
              value={draft.apr ?? ""}
              onChange={(e) => patch({ apr: e.target.value })}
              onKeyDown={
                bulkEditMode ? undefined : handleInlineKeyDown
              }
              aria-label={`APR for ${product.name}`}
              className={cellInputClass}
            />
          ) : (
            product.apr || "-"
          )}
        </td>
      )}
      <td className={cellPad}>
        {bulkEditMode ? (
          <select
            value={draft.is_active ? "true" : "false"}
            onChange={(e) =>
              patch({ is_active: e.target.value === "true" })
            }
            aria-label={`Active status for ${product.name}`}
            className={cellInputClass}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        ) : (
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold ${
              product.is_active
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {product.is_active ? "Active" : "Inactive"}
          </span>
        )}
      </td>
      {userRole?.name === "superadmin" && (
        <td className={cellPad}>
          <div className="flex items-center justify-center space-x-2">
            {bulkEditMode ? (
              // Saving is one action for the whole table, so
              // the only per-row control is undoing this row.
              <button
                onClick={() => revertBulkRow(product.id)}
                disabled={!rowDirty || savingBulk}
                title={
                  rowDirty
                    ? "Revert this row"
                    : "No changes on this row"
                }
                className="p-2 text-text/60 hover:bg-card/70 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            ) : editingInline ? (
              <>
                <button
                  onClick={saveInlineEdit}
                  disabled={savingInline}
                  title="Save row"
                  className="p-2 text-green-600 hover:bg-card/70 rounded-lg transition-colors disabled:opacity-40"
                >
                  {savingInline ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={cancelInlineEdit}
                  disabled={savingInline}
                  title="Cancel"
                  className="p-2 text-red-500 hover:bg-card/70 rounded-lg transition-colors disabled:opacity-40"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleEdit(product)}
                  disabled={isSelectedReadOnly}
                  title={
                    isSelectedReadOnly
                      ? "This season is closed and read-only"
                      : "Edit product"
                  }
                  className="p-2 text-primary-orange hover:bg-card/70 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => startInlineEdit(product)}
                  disabled={isSelectedReadOnly}
                  title={
                    isSelectedReadOnly
                      ? "This season is closed and read-only"
                      : "Inline edit — stock, prices and APR"
                  }
                  className="p-2 text-blue-600 hover:bg-card/70 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <PencilLine className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </td>
      )}
    </tr>
    );
  };

  /**
   * The table's columns in one place: the header renders from this, and the
   * percentages are what let bulk edit lay the row out inside the screen
   * instead of scrolling sideways. Product name gets the most room — it is
   * the only column you navigate by.
   */
  const TABLE_COLUMNS: {
    key: string;
    label: string;
    sortable: boolean;
    width: string;
  }[] = [
    { key: "order", label: "Order", sortable: true, width: "5%" },
    { key: "product_code", label: "Code", sortable: true, width: "8%" },
    { key: "name", label: "Product Name", sortable: true, width: "24%" },
    { key: "categories.name", label: "Category", sortable: true, width: "12%" },
    { key: "content", label: "Content", sortable: true, width: "10%" },
    { key: "stock", label: "Stock", sortable: true, width: "7%" },
    { key: "actual_price", label: "Actual Price", sortable: true, width: "9%" },
    { key: "offer_price", label: "Offer Price", sortable: true, width: "9%" },
    ...(userRole?.name === "superadmin"
      ? [{ key: "apr", label: "APR", sortable: true, width: "7%" }]
      : []),
    { key: "is_active", label: "Active", sortable: true, width: "9%" },
  ];

  /**
   * Dragging is only offered when it can do what it looks like it does: in the
   * grouped view, with nothing else holding the row, on a season that is not
   * frozen.
   */
  const dndEnabled =
    groupByCategory &&
    !bulkEditMode &&
    !inlineEditId &&
    !isSelectedReadOnly &&
    !savingOrder &&
    userRole?.name === "superadmin";

  // Column sorting and a hand-arranged order are different answers to the
  // same question, so only one of them is live at a time.
  const sortingEnabled = !groupByCategory;

  const columnCount =
    TABLE_COLUMNS.length +
    (dndEnabled ? 1 : 0) +
    (userRole?.name === "superadmin" ? 1 : 0);

  /**
   * The catalog as it prints: categories in their stored order, each holding
   * its products in theirs. Products whose category has gone missing are
   * collected at the end rather than dropped from the page.
   */
  const categoryGroups: {
    id: string | null;
    name: string;
    products: Product[];
  }[] = [
    ...byOrder(categories, (category) => category.name).map((category) => ({
      id: category.id as string | null,
      name: category.name,
      products: byOrder(
        filteredProducts.filter(
          (product) => product.category_id === category.id
        ),
        (product) => product.name
      ),
    })),
    {
      id: null,
      name: "Uncategorized",
      products: byOrder(
        filteredProducts.filter(
          (product) =>
            !categories.some((category) => category.id === product.category_id)
        ),
        (product) => product.name
      ),
    },
  ].filter((group) => {
    if (group.products.length > 0) return true;
    // An empty category is still worth a band in the full view — it is the
    // only place to drop the first product into it. While searching or
    // filtering it is just noise, and so is an empty catch-all.
    return group.id !== null && !filtersActive;
  });

  if (!userRole) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  if (!["admin", "superadmin"].includes(userRole?.name || "")) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="container mx-auto px-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
            <p>You don't have permission to access this page.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-8 pb-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="font-heading text-4xl">Stock Management</h1>
            <div className="flex gap-2 items-center">
              <span className="bg-primary-orange/10 text-primary-orange px-3 py-1 rounded-full">
                {filteredProducts.length} products
              </span>
              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full">
                {activeCount} active
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 w-full md:w-auto">
            {/* Which season's prices and stock are being viewed/edited. */}
            <select
              value={selectedSeasonId ?? ""}
              onChange={(e) => {
                // Changing season discards bulk drafts, so say so first
                // rather than losing a screenful of typed prices.
                if (
                  bulkChangedIds.length > 0 &&
                  !confirm(
                    `Switching season will discard unsaved changes to ${bulkChangedIds.length} product${
                      bulkChangedIds.length === 1 ? "" : "s"
                    }. Continue?`
                  )
                )
                  return;
                setSelectedSeasonId(e.target.value);
              }}
              disabled={seasonsLoading || seasons.length === 0}
              aria-label="Season"
              className="px-4 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange w-full sm:w-auto"
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
            <div className="relative w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text/60" />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange w-full sm:w-auto"
            >
              <option value="all">All Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Stock filters. Narrowing the table narrows what bulk edit touches,
            which is how a season is worked through: filter to the slice that
            needs attention, switch on bulk edit, type down the column. */}
        <div className="mb-6 rounded-xl border border-card-border/10 bg-card/50 px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-text/70 shrink-0">
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["all", "All", counts.total],
                ["inStock", "In stock", counts.inStock],
                ["zero", "Zero stock", counts.zero],
                ["low", "Low stock", lowStockUsable ? counts.low : null],
              ] as [StockFilter, string, number | null][]
            ).map(([value, label, count]) => (
              <button
                key={value}
                onClick={() => setStockFilter(value)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${
                  stockFilter === value
                    ? "bg-primary-orange/10 text-primary-orange border-primary-orange/40 font-semibold"
                    : "bg-card border-card-border/10 hover:bg-card/70"
                }`}
              >
                {label}
                {count !== null && (
                  <span className="ml-1.5 text-text/50">{count}</span>
                )}
              </button>
            ))}

            {/* The threshold only means anything while Low stock is on, but
                it stays visible so the number can be set before switching. */}
            <label
              className={`flex items-center gap-1.5 text-sm rounded-lg border px-2 py-1 ${
                stockFilter === "low"
                  ? "border-primary-orange/40 bg-primary-orange/5"
                  : "border-card-border/10 text-text/60"
              }`}
            >
              <span>below</span>
              <input
                type="number"
                min={1}
                value={lowStockThreshold}
                onChange={(e) => {
                  setLowStockThreshold(e.target.value);
                  if (e.target.value.trim() !== "") setStockFilter("low");
                }}
                onWheel={(e) => e.currentTarget.blur()}
                aria-label="Low stock threshold"
                className="w-16 px-2 py-0.5 rounded bg-card border border-card-border/20 focus:outline-none focus:border-primary-orange no-spinner"
              />
            </label>
          </div>

          <div className="hidden lg:block w-px h-6 bg-card-border/20" />

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["all", "Any status", null],
                ["active", "Active", counts.total - counts.inactive],
                ["inactive", "Inactive", counts.inactive],
              ] as [StatusFilter, string, number | null][]
            ).map(([value, label, count]) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${
                  statusFilter === value
                    ? "bg-primary-orange/10 text-primary-orange border-primary-orange/40 font-semibold"
                    : "bg-card border-card-border/10 hover:bg-card/70"
                }`}
              >
                {label}
                {count !== null && (
                  <span className="ml-1.5 text-text/50">{count}</span>
                )}
              </button>
            ))}

            <button
              onClick={() => setNeedsPricing((on) => !on)}
              title="Products with no offer price set"
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${
                needsPricing
                  ? "bg-primary-orange/10 text-primary-orange border-primary-orange/40 font-semibold"
                  : "bg-card border-card-border/10 hover:bg-card/70"
              }`}
            >
              Needs pricing
              <span className="ml-1.5 text-text/50">{counts.unpriced}</span>
            </button>
          </div>

          <div className="flex items-center gap-3 lg:ml-auto">
            <span className="text-sm text-text/60">
              {filtersActive
                ? `Showing ${filteredProducts.length} of ${products.length}`
                : `${products.length} products`}
            </span>
            {filtersActive && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-card border border-card-border/10 hover:bg-card/70 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Closed seasons are frozen. The database enforces this too — the
            banner just explains why the buttons are disabled. */}
        {isSelectedReadOnly && selectedSeason && (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-amber-700 dark:text-amber-400">
                Season {selectedSeason.name} is closed and read-only
              </p>
              <p className="text-sm text-text/70">
                Prices, stock and cost for this season are frozen as an archive.
                Switch to the live season to make changes.
              </p>
            </div>
            {userRole?.name === "superadmin" && (
              <button
                onClick={async () => {
                  if (
                    !confirm(
                      `Unlock season ${selectedSeason.name} for editing? This is recorded in the audit log.`
                    )
                  )
                    return;
                  try {
                    await setSeasonUnlocked(selectedSeason.id, true);
                  } catch (err) {
                    alert(
                      err instanceof Error ? err.message : "Failed to unlock"
                    );
                  }
                }}
                className="px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors whitespace-nowrap"
              >
                Unlock for editing
              </button>
            )}
          </div>
        )}

        {selectedSeason?.status === "closed" && selectedSeason.is_unlocked && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="font-semibold text-red-600">
              Season {selectedSeason.name} is unlocked — you are editing
              archived data.
            </p>
            {userRole?.name === "superadmin" && (
              <button
                onClick={() => setSeasonUnlocked(selectedSeason.id, false)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors whitespace-nowrap"
              >
                Re-lock season
              </button>
            )}
          </div>
        )}

        {selectedSeason?.status === "draft" && (
          <div className="mb-6 rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-3">
            <p className="font-semibold text-blue-700 dark:text-blue-400">
              Season {selectedSeason.name} is a draft
            </p>
            <p className="text-sm text-text/70">
              Edits here are not visible to customers. Activate the season on the
              Seasons page when you are ready to sell from it.
            </p>
          </div>
        )}

        {/* Price list configuration.
            The whole price list is printed at one discount, so it is set once
            here rather than product by product. Actual prices are derived:
            actual = offer / (1 - discount/100). */}
        {isSuperadmin && (
          <div className="mb-6 rounded-xl border border-card-border/10 bg-card/30">
            <button
              onClick={() => setPriceConfigOpen((on) => !on)}
              aria-expanded={priceConfigOpen}
              className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-card/40 transition-colors rounded-xl"
            >
              <Percent className="w-5 h-5 text-primary-orange shrink-0" />
              <h2 className="text-lg font-semibold">
                Price list configuration
              </h2>
              {/* The discount itself in the header, so the section does not
                  have to be opened just to check what it is set to. */}
              <span className="text-sm text-text/60">
                — season {selectedSeason?.name ?? "—"} ·{" "}
                {discountUsable
                  ? `${formatPrice(seasonDiscount)}% discount`
                  : "no discount set"}
              </span>
              <ChevronDown
                className={`w-5 h-5 ml-auto text-text/50 transition-transform ${
                  priceConfigOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {priceConfigOpen && (
            <div className="px-5 pb-5">
            <p className="text-sm text-text/70 mb-4">
              Enter the offer price for each product; the actual (struck-out)
              price is calculated from it at this discount. Each season keeps
              its own discount.
            </p>

            <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
              <div>
                <label className="block mb-1 text-sm font-medium">
                  Price list discount %
                </label>
                <input
                  type="number"
                  min={0}
                  max={99.99}
                  step="0.01"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  disabled={isSelectedReadOnly}
                  placeholder="80"
                  className="w-full sm:w-40 px-3 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange disabled:opacity-40"
                />
              </div>

              <button
                onClick={handleSaveDiscount}
                disabled={
                  savingDiscount ||
                  isSelectedReadOnly ||
                  Number(discountInput) === seasonDiscount
                }
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {savingDiscount ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Save discount</span>
              </button>

              <button
                onClick={() => handleReprice(false)}
                disabled={repricing || isSelectedReadOnly || !discountUsable}
                title={
                  discountUsable
                    ? "Recalculate every product's actual price from its offer price"
                    : "Set a discount above 0 first"
                }
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {repricing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Calculator className="w-4 h-4" />
                )}
                <span>Recalculate all actual prices</span>
              </button>

              <button
                onClick={() => handleReprice(true)}
                disabled={repricing || isSelectedReadOnly || !discountUsable}
                title="Only fill in products that have no actual price yet"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Calculator className="w-4 h-4" />
                <span>Fill missing only</span>
              </button>
            </div>

            <p className="text-sm text-text/70 mt-3">
              {discountUsable ? (
                <>
                  At{" "}
                  <span className="font-semibold">
                    {formatPrice(seasonDiscount)}%
                  </span>
                  , an offer price of ₹8 prints as{" "}
                  <span className="font-semibold">
                    ₹{formatPrice(deriveActual(8) ?? 0)}
                  </span>
                  .
                </>
              ) : (
                "No discount configured — actual prices must be entered by hand."
              )}
            </p>
            </div>
            )}
          </div>
        )}

        {/* Toolbar. Actions are grouped by what they do rather than laid
            out flat: the row used to be nine near-identical pills that
            wrapped onto two lines. The view toggle stays out on its own
            because it is a mode, not an action. */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-6 w-full">
          <button
            onClick={() => setGroupByCategory((on) => !on)}
            title={
              groupByCategory
                ? "Show one flat, sortable list"
                : "Group by category and arrange by dragging"
            }
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors w-full sm:w-auto ${
              groupByCategory
                ? "bg-primary-orange/10 text-primary-orange border border-primary-orange/30"
                : "bg-card hover:bg-card/70 border border-transparent"
            }`}
          >
            <LayoutList className="w-5 h-5" />
            <span>{groupByCategory ? "Grouped" : "Flat list"}</span>
          </button>

          {canManage && (
            <ToolbarMenu label="Bulk" icon={<TableProperties className="w-5 h-5" />}>
              <MenuSection label="Edit" />
              {isSuperadmin && (
                <MenuItem
                  icon={<TableProperties className="w-4 h-4" />}
                  label="Bulk edit rows"
                  hint={
                    filtersActive
                      ? `Edit every column on the ${filteredProducts.length} filtered rows`
                      : "Edit every column on every row in the table"
                  }
                  onClick={enterBulkEdit}
                  disabled={isSelectedReadOnly || bulkEditMode}
                  title={
                    isSelectedReadOnly
                      ? "This season is closed and read-only"
                      : bulkEditMode
                      ? "Already in bulk edit"
                      : undefined
                  }
                />
              )}
              <MenuSection label="Add" />
              <MenuItem
                icon={<Plus className="w-4 h-4" />}
                label="Add product"
                hint="One product, with every field"
                onClick={openAddModal}
                disabled={isSelectedReadOnly}
                title={
                  isSelectedReadOnly
                    ? "This season is closed and read-only"
                    : undefined
                }
              />
              <MenuItem
                icon={<ListPlus className="w-4 h-4" />}
                label="Bulk add products"
                hint="Several at once on one sheet"
                onClick={() => setShowBulkAddModal(true)}
                disabled={isSelectedReadOnly}
                title={
                  isSelectedReadOnly
                    ? "This season is closed and read-only"
                    : undefined
                }
              />
              <MenuItem
                icon={<Boxes className="w-4 h-4" />}
                label="Add family pack"
                hint="List a saved pack like any product"
                onClick={() => setShowAddPackModal(true)}
                disabled={isSelectedReadOnly}
                title={
                  isSelectedReadOnly
                    ? "This season is closed and read-only"
                    : undefined
                }
              />
              <MenuItem
                icon={<Upload className="w-4 h-4" />}
                label="Import from file"
                hint="Excel or CSV price list into this season"
                onClick={() => setShowImportModal(true)}
                disabled={isSelectedReadOnly}
                title={
                  isSelectedReadOnly
                    ? "This season is closed and read-only"
                    : undefined
                }
              />
            </ToolbarMenu>
          )}

          <ToolbarMenu label="Export" icon={<Download className="w-5 h-5" />}>
            <MenuSection label="Price list" />
            <MenuItem
              icon={<FileText className="w-4 h-4" />}
              label="Export Price list"
              hint="PDF — opens in the viewer, print or save from there"
              onClick={handlePriceListDownload}
            />
            {/* A one-off sheet, so only the superadmin who sets the season's
                prices can decide how a list going out differs from it. */}
            {isSuperadmin && (
              <MenuItem
                icon={<Settings2 className="w-4 h-4" />}
                label="Custom price list"
                hint="Choose the banner, columns and discount first"
                onClick={() => setShowCustomPriceList(true)}
              />
            )}
            <MenuItem
              icon={<Download className="w-4 h-4" />}
              label="Excel"
              hint="One row per product, in printed order"
              onClick={() => handleExportPriceList("excel")}
            />
            <MenuItem
              icon={<Download className="w-4 h-4" />}
              label="CSV"
              hint="Same rows, plain text"
              onClick={() => handleExportPriceList("csv")}
            />
            <MenuSection label="Catalog" />
            <MenuItem
              icon={<Download className="w-4 h-4" />}
              label="Products"
              hint="Full product export for this season"
              onClick={exportProductsToExcel}
            />
            <MenuItem
              icon={<Printer className="w-4 h-4" />}
              label="Stock report"
              hint="Printable stock sheet"
              onClick={handlePrint}
            />
          </ToolbarMenu>
        </div>

        {groupByCategory && userRole?.name === "superadmin" && (
          <p className="text-sm text-text/60 mb-3 flex items-center gap-2">
            <GripVertical className="w-4 h-4" />
            {isSelectedReadOnly
              ? "This season is frozen, so the catalog order cannot be rearranged."
              : bulkEditMode || inlineEditId
              ? "Finish the current edit to rearrange the catalog by dragging."
              : "Drag a row to reposition it, onto another category to move it there, or drag a category band to reorder the whole category. The printed price list follows this order."}
            {savingOrder && (
              <span className="flex items-center gap-1 text-primary-orange">
                <Loader2 className="w-3 h-3 animate-spin" />
                saving order…
              </span>
            )}
          </p>
        )}

        {/* Bulk edit control bar. Sticky so Save stays reachable part-way
            down a several-hundred-row price list. */}
        {bulkEditMode && (
          <div className="sticky top-[5.5rem] z-30 mb-4 rounded-xl border border-primary-orange/40 bg-card px-4 py-3 shadow-lg flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <TableProperties className="w-5 h-5 text-primary-orange" />
              <span className="font-semibold">Bulk edit</span>
              <span className="text-sm text-text/70">
                {bulkChangedIds.length === 0
                  ? `${sortedProducts.length} rows editable${
                      filtersActive ? " in this filter" : ""
                    } — nothing changed yet`
                  : `${bulkChangedIds.length} of ${sortedProducts.length} rows changed`}
              </span>
              {hiddenChangedIds.length > 0 && (
                <span
                  title="Changed earlier under a different filter. Save all still writes them."
                  className="text-sm text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-0.5"
                >
                  +{hiddenChangedIds.length} changed but hidden by the filter
                </span>
              )}
              {discountUsable && (
                <label className="flex items-center gap-2 text-sm text-text/70">
                  <input
                    type="checkbox"
                    checked={bulkAutoActual}
                    onChange={(e) => setBulkAutoActual(e.target.checked)}
                  />
                  Auto actual price at {formatPrice(seasonDiscount)}%
                </label>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exitBulkEdit()}
                disabled={savingBulk}
                className="px-4 py-2 rounded-lg bg-card hover:bg-card/70 border border-card-border/10 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={saveBulkEdit}
                disabled={savingBulk || bulkChangedIds.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {savingBulk ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>
                  {savingBulk
                    ? "Saving…"
                    : `Save all${
                        bulkChangedIds.length
                          ? ` (${bulkChangedIds.length})`
                          : ""
                      }`}
                </span>
              </button>
            </div>
          </div>
        )}

        <div className="bg-card/30 rounded-xl overflow-hidden">
          {/* One scroll container for both axes. The header sticks to its top
              edge, so it stays readable all the way down a several-hundred
              row price list, and the whole thing sits under the site nav. */}
          <div className="overflow-auto max-h-[calc(100vh-13rem)]">
            <table
              className={`w-full ${bulkEditMode ? "table-fixed" : ""}`}
            >
              <thead className="sticky top-0 z-20">
                <tr className="bg-card [&>th]:shadow-[inset_0_-1px_0_0_rgb(0_0_0/0.12)]">
                  {dndEnabled && (
                    <th
                      className="py-4 px-3 text-left"
                      style={bulkEditMode ? { width: "3%" } : undefined}
                    >
                      <span className="sr-only">Reorder</span>
                    </th>
                  )}
                  {TABLE_COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      onClick={
                        sortingEnabled && column.sortable
                          ? () => handleSort(column.key)
                          : undefined
                      }
                      style={bulkEditMode ? { width: column.width } : undefined}
                      className={`py-4 ${
                        bulkEditMode ? "px-2" : "px-6"
                      } text-left ${
                        sortingEnabled && column.sortable
                          ? "cursor-pointer"
                          : ""
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        {column.label}
                        {sortingEnabled &&
                          sortField === column.key &&
                          (sortDirection === "asc" ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          ))}
                      </span>
                    </th>
                  ))}
                  {userRole?.name === "superadmin" && (
                    <th
                      className="py-4 px-2 text-center"
                      style={bulkEditMode ? { width: "7%" } : undefined}
                    >
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={columnCount}
                      className="py-8 text-center text-text/60"
                    >
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : sortedProducts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columnCount}
                      className="py-8 text-center text-text/60"
                    >
                      {filtersActive ? (
                        <span className="flex flex-col items-center gap-2">
                          <span>No products match these filters</span>
                          <button
                            onClick={clearFilters}
                            className="px-3 py-1.5 rounded-lg text-sm bg-card border border-card-border/10 hover:bg-card/70 transition-colors"
                          >
                            Clear filters
                          </button>
                        </span>
                      ) : (
                        "No products found"
                      )}
                    </td>
                  </tr>
                ) : groupByCategory ? (
                  categoryGroups.map((group) => {
                    const categoryDragged =
                      dragging?.kind === "category" &&
                      dragging.id === group.id;
                    const groupEdge =
                      dropTarget?.kind === "group" && dropTarget.id === group.id
                        ? dropTarget.edge
                        : null;

                    return (
                      <Fragment key={group.id ?? "uncategorized"}>
                        {/* Category band. Drag it to reorder the whole
                            category; drop a product on it to move that
                            product to the end of this category. */}
                        <tr
                          draggable={dndEnabled && group.id !== null}
                          onDragStart={() => {
                            if (!dndEnabled || !group.id) return;
                            setDragging({ kind: "category", id: group.id });
                          }}
                          onDragOver={(e) => {
                            if (!dndEnabled || !dragging) return;
                            e.preventDefault();
                            setDropTarget({
                              kind: "group",
                              id: group.id ?? "uncategorized",
                              edge: edgeFromPointer(e),
                            });
                          }}
                          onDragLeave={() =>
                            setDropTarget((current) =>
                              current?.id === (group.id ?? "uncategorized")
                                ? null
                                : current
                            )
                          }
                          onDrop={(e) => {
                            if (!dndEnabled) return;
                            e.preventDefault();
                            handleDropOnGroup(group.id);
                          }}
                          onDragEnd={() => {
                            setDragging(null);
                            setDropTarget(null);
                          }}
                          className={`bg-card/70 border-t border-card-border/10 ${
                            categoryDragged ? "opacity-40" : ""
                          } ${
                            groupEdge
                              ? "shadow-[inset_0_3px_0_0_rgb(var(--primary-orange))]"
                              : ""
                          }`}
                        >
                          <td
                            colSpan={columnCount}
                            className={`${
                              bulkEditMode ? "py-2 px-2" : "py-3 px-4"
                            } font-semibold`}
                          >
                            <span className="flex items-center gap-2">
                              {dndEnabled && group.id && (
                                <GripVertical className="w-4 h-4 text-text/40 cursor-grab" />
                              )}
                              <span className="text-primary-orange">
                                {group.name}
                              </span>
                              <span className="text-xs font-normal text-text/60">
                                {group.products.length} product
                                {group.products.length === 1 ? "" : "s"}
                              </span>
                            </span>
                          </td>
                        </tr>
                        {group.products.map(renderProductRow)}
                      </Fragment>
                    );
                  })
                ) : (
                  sortedProducts.map(renderProductRow)
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editModalOpen && (
        <>
          {/* Prevent background scroll when modal is open */}
          <style>{`
            body { overflow: hidden !important; }
          `}</style>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div
              className="bg-white rounded-lg shadow-lg p-4 sm:p-6 w-full max-w-xl mx-2 relative overflow-y-auto"
              style={{ maxHeight: "90vh" }}
            >
              <button
                className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-2xl"
                onClick={handleEditModalClose}
                aria-label="Close"
              >
                ×
              </button>
              <h2 className="text-2xl font-bold mb-2 text-center">
                Edit Product
              </h2>
              <SeasonTargetNotice
                seasonName={selectedSeason?.name}
                isLive={selectedSeason?.status === "active"}
              />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleEditModalSave();
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1 font-medium">
                      Product Name
                    </label>
                    <input
                      type="text"
                      value={editForm.name || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, name: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      required
                    />
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">
                      Product Code
                    </label>
                    <input
                      type="text"
                      value={editForm.product_code || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          product_code: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Product Code"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Category</label>
                    <select
                      value={editForm.category_id || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          category_id: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      required
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Content</label>
                    <input
                      type="text"
                      value={editForm.content || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, content: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Stock</label>
                    <NumberInput
                      value={editForm.stock ?? ""}
                      onValueChange={(n) =>
                        setEditForm((f) => ({
                          ...f,
                          stock: n,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      min={0}
                    />
                  </div>
                  {/* Offer price is the input; actual price is derived from
                      it at the season's price-list discount. */}
                  <div>
                    <label className="block mb-1 font-medium">
                      Offer Price
                    </label>
                    <NumberInput
                      value={editForm.offer_price ?? ""}
                      onValueChange={(n) =>
                        setEditForm((f) => {
                          const next = {
                            ...f,
                            offer_price: n,
                          };
                          if (editAutoActual) {
                            const derived = deriveActual(String(n));
                            if (derived !== null) next.actual_price = derived;
                          }
                          return next;
                        })
                      }
                      className="w-full px-3 py-2 border rounded"
                      min={0}
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="mb-1 font-medium flex items-center justify-between gap-2">
                      <span>Actual Price</span>
                      {discountUsable && (
                        <span className="flex items-center gap-1 text-xs font-normal text-gray-600">
                          <input
                            type="checkbox"
                            checked={editAutoActual}
                            onChange={(e) => {
                              const auto = e.target.checked;
                              setEditAutoActual(auto);
                              if (!auto) return;
                              const derived = deriveActual(
                                editForm.offer_price
                              );
                              if (derived !== null)
                                setEditForm((f) => ({
                                  ...f,
                                  actual_price: derived,
                                }));
                            }}
                          />
                          auto at {formatPrice(seasonDiscount)}%
                        </span>
                      )}
                    </label>
                    <NumberInput
                      value={editForm.actual_price ?? ""}
                      onValueChange={(n) =>
                        setEditForm((f) => ({
                          ...f,
                          actual_price: n,
                        }))
                      }
                      readOnly={editAutoActual && discountUsable}
                      className={`w-full px-3 py-2 border rounded ${
                        editAutoActual && discountUsable
                          ? "bg-gray-100 text-gray-600 cursor-not-allowed"
                          : ""
                      }`}
                      min={0}
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">APR</label>
                    <input
                      type="text"
                      value={editForm.apr || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, apr: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="APR"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Image URL</label>
                    <input
                      type="text"
                      value={editForm.image_url || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          image_url: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Image URL"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Discount %</label>
                    <input
                      type="text"
                      value={editForm.discount_percentage || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          discount_percentage: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Discount %"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block mb-1 font-medium">
                      Description
                    </label>
                    <textarea
                      value={editForm.description || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Description"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Active</label>
                    <select
                      value={editForm.is_active ? "true" : "false"}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          is_active: e.target.value === "true",
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">
                      YouTube Video ID
                    </label>
                    <input
                      type="text"
                      value={editForm.yt_link || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, yt_link: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="YouTube Link"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Order</label>
                    <NumberInput
                      value={editForm.order ?? ""}
                      onValueChange={(n) =>
                        setEditForm((f) => ({
                          ...f,
                          order: n,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      min={0}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-4 mt-8">
                  <button
                    type="button"
                    onClick={handleEditModalClose}
                    className="px-6 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/90"
                  >
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <>
          {/* Prevent background scroll when modal is open */}
          <style>{`body { overflow: hidden !important; }`}</style>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div
              className="bg-white rounded-lg shadow-lg p-4 sm:p-6 w-full max-w-xl mx-2 relative overflow-y-auto"
              style={{ maxHeight: "90vh" }}
            >
              <button
                className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-2xl"
                onClick={() => setShowAddModal(false)}
                aria-label="Close"
              >
                ×
              </button>
              <h2 className="text-2xl font-bold mb-2 text-center">
                Add Product
              </h2>
              <SeasonTargetNotice
                seasonName={selectedSeason?.name}
                isLive={selectedSeason?.status === "active"}
              />
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!selectedSeasonId) return;
                  if (isSelectedReadOnly) {
                    alert(
                      "This season is closed and read-only. A superadmin must unlock it first."
                    );
                    return;
                  }
                  try {
                    // 1. Identity row, shared across seasons.
                    const { data: created, error } = await supabase
                      .from("products")
                      .insert({
                        name: addForm.name,
                        category_id: addForm.category_id,
                        image_url: addForm.image_url,
                        description: addForm.description,
                        product_code: addForm.product_code || "",
                        yt_link: addForm.yt_link || "",
                      })
                      .select("id")
                      .single();
                    if (error) throw error;

                    // 2. Commercials for the season being worked on.
                    const { error: seasonError } = await supabase
                      .from("product_seasons")
                      .insert({
                        season_id: selectedSeasonId,
                        product_id: created.id,
                        actual_price: Number(addForm.actual_price ?? 0),
                        offer_price: Number(addForm.offer_price ?? 0),
                        discount_percentage:
                          addAutoActual && discountUsable
                            ? seasonDiscount
                            : Number(addForm.discount_percentage ?? 0),
                        content: addForm.content,
                        opening_stock: Number(addForm.stock ?? 0),
                        stock: Number(addForm.stock ?? 0),
                        display_order: addForm.order,
                        is_active:
                          addForm.is_active !== undefined
                            ? addForm.is_active
                            : true,
                      });
                    if (seasonError) throw seasonError;

                    // 3. Cost price.
                    if (addForm.apr) {
                      const { error: costError } = await supabase
                        .from("product_season_costs")
                        .insert({
                          season_id: selectedSeasonId,
                          product_id: created.id,
                          apr: Number(Number(addForm.apr).toFixed(2)),
                        });
                      if (costError) throw costError;
                    }

                    setShowAddModal(false);
                    setAddForm({});
                    fetchProducts();
                  } catch (err) {
                    alert(
                      err instanceof Error
                        ? err.message
                        : "Failed to add product"
                    );
                  }
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1 font-medium">
                      Product Name
                    </label>
                    <input
                      type="text"
                      value={addForm.name || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({ ...f, name: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">
                      Product Code{" "}
                      <span className="text-xs font-normal text-gray-500">
                        (generated — editable)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={addForm.product_code || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          product_code: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Product Code"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Category</label>
                    <select
                      value={addForm.category_id || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          category_id: e.target.value,
                          // Position is per category, so a category change
                          // re-points it at the end of the new one — unless a
                          // position was typed by hand.
                          order: addOrderTouched
                            ? f.order
                            : nextOrderFor(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      required
                    >
                      <option value="">Select</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Content</label>
                    <input
                      type="text"
                      value={addForm.content || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({ ...f, content: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Stock</label>
                    <NumberInput
                      value={addForm.stock ?? ""}
                      onValueChange={(n) =>
                        setAddForm((f) => ({
                          ...f,
                          stock: n,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">
                      Offer Price
                    </label>
                    <NumberInput
                      value={addForm.offer_price ?? ""}
                      onValueChange={(n) =>
                        setAddForm((f) => {
                          const next = {
                            ...f,
                            offer_price: n,
                          };
                          if (addAutoActual) {
                            const derived = deriveActual(String(n));
                            if (derived !== null) next.actual_price = derived;
                          }
                          return next;
                        })
                      }
                      className="w-full px-3 py-2 border rounded"
                      min={0}
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="mb-1 font-medium flex items-center justify-between gap-2">
                      <span>Actual Price</span>
                      {discountUsable && (
                        <span className="flex items-center gap-1 text-xs font-normal text-gray-600">
                          <input
                            type="checkbox"
                            checked={addAutoActual}
                            onChange={(e) => {
                              const auto = e.target.checked;
                              setAddAutoActual(auto);
                              if (!auto) return;
                              const derived = deriveActual(addForm.offer_price);
                              if (derived !== null)
                                setAddForm((f) => ({
                                  ...f,
                                  actual_price: derived,
                                }));
                            }}
                          />
                          auto at {formatPrice(seasonDiscount)}%
                        </span>
                      )}
                    </label>
                    <NumberInput
                      value={addForm.actual_price ?? ""}
                      onValueChange={(n) =>
                        setAddForm((f) => ({
                          ...f,
                          actual_price: n,
                        }))
                      }
                      readOnly={addAutoActual && discountUsable}
                      className={`w-full px-3 py-2 border rounded ${
                        addAutoActual && discountUsable
                          ? "bg-gray-100 text-gray-600 cursor-not-allowed"
                          : ""
                      }`}
                      min={0}
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">APR</label>
                    <input
                      type="text"
                      value={addForm.apr || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({ ...f, apr: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="APR"
                      disabled={userRole?.name !== "superadmin"}
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">
                      Order{" "}
                      <span className="text-xs font-normal text-gray-500">
                        (position in its category)
                      </span>
                    </label>
                    <NumberInput
                      value={addForm.order ?? ""}
                      onValueChange={(n) => {
                        setAddOrderTouched(true);
                        setAddForm((f) => ({
                          ...f,
                          order: n,
                        }));
                      }}
                      className="w-full px-3 py-2 border rounded no-spinner"
                      min={0}
                      placeholder="Order"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Image URL</label>
                    <input
                      type="text"
                      value={addForm.image_url || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({ ...f, image_url: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Image URL"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Discount %</label>
                    <input
                      type="text"
                      value={addForm.discount_percentage || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          discount_percentage: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Discount %"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block mb-1 font-medium">
                      Description
                    </label>
                    <textarea
                      value={addForm.description || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Description"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Active</label>
                    <select
                      value={
                        addForm.is_active !== undefined
                          ? String(addForm.is_active)
                          : "true"
                      }
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          is_active: e.target.value === "true",
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">
                      YouTube Video ID
                    </label>
                    <input
                      type="text"
                      value={addForm.yt_link || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({ ...f, yt_link: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="YouTube Link"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-4 mt-8">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-6 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/90"
                  >
                    Add
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {isSuperadmin && (
        <CustomPriceListModal
          isOpen={showCustomPriceList}
          onClose={() => setShowCustomPriceList(false)}
          onGenerate={handleCustomPriceList}
          seasonDiscount={discountUsable ? seasonDiscount : null}
          seasonName={selectedSeason?.name || "this season"}
        />
      )}

      <AddPackProductModal
        isOpen={showAddPackModal}
        onClose={() => setShowAddPackModal(false)}
        onSuccess={fetchProducts}
        seasonId={selectedSeasonId}
        seasonName={selectedSeason?.name}
        categories={categories}
        existingProducts={products}
        seasonDiscount={seasonDiscount}
      />

      <BulkAddProductsModal
        isOpen={showBulkAddModal}
        onClose={() => setShowBulkAddModal(false)}
        onSuccess={fetchProducts}
        seasonId={selectedSeasonId}
        seasonName={selectedSeason?.name}
        isLive={selectedSeason?.status === "active"}
        categories={categories}
        existingProducts={products}
        seasonDiscount={seasonDiscount}
        canEditCost={userRole?.name === "superadmin"}
      />

      <BulkImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={fetchProducts}
        seasonId={selectedSeasonId}
        seasonName={selectedSeason?.name}
      />
    </div>
  );
}
