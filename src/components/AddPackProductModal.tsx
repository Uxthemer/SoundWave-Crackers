import { useEffect, useMemo, useState } from "react";
import { Boxes, ImagePlus, Loader2, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { actualFromOffer, formatPrice, isUsableDiscount } from "../lib/pricing";
import { nextOrderInCategory, nextProductCode } from "../lib/ordering";
import { NumberInput } from "./NumberInput";

/**
 * Puts a saved family pack on the product list.
 *
 * The pack itself -- what is in it, its name and rate -- is built on the
 * Family Packs page. What is decided here is how it is sold: which category
 * it sits in, its photo, its struck-out price and its position. After this
 * it is an ordinary product row, linked to the pack by products.combo_pack_id,
 * with its own stock: the number of packs already packed.
 */

interface Category {
  id: string;
  name: string;
}

interface PackOption {
  id: string;
  name: string;
  pack_code: string | null;
  description: string | null;
  pack_price: number;
  category_id: string | null;
  item_count: number;
  total_quantity: number;
  components_actual_total: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  seasonId: string | null;
  seasonName?: string;
  categories: Category[];
  /** Everything already listed this season: codes, positions, linked packs. */
  existingProducts: {
    id: string;
    product_code?: string | null;
    category_id: string;
    order?: number | null;
    combo_pack_id?: string | null;
  }[];
  seasonDiscount: number;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function AddPackProductModal({
  isOpen,
  onClose,
  onSuccess,
  seasonId,
  seasonName,
  categories,
  existingProducts,
  seasonDiscount,
}: Props) {
  const [packs, setPacks] = useState<PackOption[]>([]);
  const [listedPackIds, setListedPackIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [packId, setPackId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [actualPrice, setActualPrice] = useState<number | null>(null);
  // Packs already made up. Blank means none yet: the listing starts out of
  // stock until packs are packed and the number is entered.
  const [packsInStock, setPacksInStock] = useState<number | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const familyCategoryId =
    categories.find((category) => /family|combo/i.test(category.name))?.id ?? "";

  // Load the season's active packs, and which of them are already on sale.
  useEffect(() => {
    if (!isOpen || !seasonId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPackId("");
    setPacksInStock(null);
    setImageFile(null);
    setImagePreview(null);

    (async () => {
      const [packRes, statsRes, listedRes] = await Promise.all([
        supabase
          .from("combo_packs")
          .select("id, name, pack_code, description, pack_price, category_id")
          .eq("season_id", seasonId)
          .eq("is_active", true)
          .order("display_order", { nullsFirst: false })
          .order("name"),
        supabase
          .from("combo_pack_catalog")
          .select("id, item_count, total_quantity, components_actual_total")
          .eq("season_id", seasonId),
        supabase.from("products").select("combo_pack_id").not("combo_pack_id", "is", null),
      ]);
      if (cancelled) return;

      if (packRes.error) {
        setError(packRes.error.message);
        setLoading(false);
        return;
      }

      const stats = new Map(
        ((statsRes.data ?? []) as any[]).map((row) => [row.id, row])
      );
      setPacks(
        ((packRes.data ?? []) as any[]).map((pack) => {
          const stat = stats.get(pack.id) ?? {};
          return {
            ...pack,
            pack_price: Number(pack.pack_price ?? 0),
            item_count: Number(stat.item_count ?? 0),
            total_quantity: Number(stat.total_quantity ?? 0),
            components_actual_total: Number(stat.components_actual_total ?? 0),
          };
        })
      );
      setListedPackIds(
        new Set(((listedRes.data ?? []) as any[]).map((row) => row.combo_pack_id))
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, seasonId]);

  const available = useMemo(
    () => packs.filter((pack) => !listedPackIds.has(pack.id) && pack.item_count > 0),
    [packs, listedPackIds]
  );
  const selected = packs.find((pack) => pack.id === packId) ?? null;

  // Choosing a pack fills in what can be worked out; all of it can be changed.
  const choosePack = (id: string) => {
    setPackId(id);
    const pack = packs.find((item) => item.id === id);
    if (!pack) return;
    setCategoryId(pack.category_id || familyCategoryId);
    // Struck-out price: the season's headline discount if one is set, as on
    // every other product; otherwise what the contents list at.
    const derived = actualFromOffer(pack.pack_price, seasonDiscount);
    setActualPrice(
      isUsableDiscount(seasonDiscount) && derived !== null
        ? derived
        : pack.components_actual_total || pack.pack_price
    );
  };

  const chooseImage = (file: File | null) => {
    setError(null);
    if (file && file.size > MAX_IMAGE_BYTES) {
      setError("That image is larger than 5 MB. Please choose a smaller one.");
      return;
    }
    setImageFile(file);
    setImagePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const uploadImage = async (file: File): Promise<string> => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}`;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `packs/${id}_${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (uploadError) throw new Error(`The image could not be uploaded: ${uploadError.message}`);
    return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  };

  const handleSave = async () => {
    if (!seasonId || !selected) return;
    if (!categoryId) {
      setError("Choose the category this pack is listed under");
      return;
    }

    setSaving(true);
    setError(null);
    let createdProductId: string | null = null;
    try {
      const imageUrl = imageFile ? await uploadImage(imageFile) : null;

      // The pack code is used when it is free; otherwise the next SWC-P code.
      const codes = existingProducts.map((product) => product.product_code ?? "");
      const taken = new Set(codes.map((code) => code.trim().toLowerCase()));
      const code =
        selected.pack_code && !taken.has(selected.pack_code.trim().toLowerCase())
          ? selected.pack_code.trim()
          : nextProductCode(codes);

      const { data: created, error: productError } = await supabase
        .from("products")
        .insert({
          name: selected.name,
          category_id: categoryId,
          product_code: code,
          description: selected.description,
          image_url: imageUrl,
          combo_pack_id: selected.id,
        } as any)
        .select("id")
        .single();
      if (productError) throw productError;
      createdProductId = (created as { id: string }).id;

      const { error: seasonError } = await supabase.from("product_seasons").insert({
        season_id: seasonId,
        product_id: createdProductId,
        offer_price: selected.pack_price,
        actual_price: Number(actualPrice ?? selected.pack_price),
        discount_percentage: isUsableDiscount(seasonDiscount) ? seasonDiscount : 0,
        content: `${selected.item_count} items · ${selected.total_quantity} pcs`,
        // Packs already made up, like any product's opening stock.
        opening_stock: Math.max(0, Math.floor(packsInStock ?? 0)),
        stock: Math.max(0, Math.floor(packsInStock ?? 0)),
        display_order: nextOrderInCategory(existingProducts, categoryId),
        is_active: true,
      });
      if (seasonError) throw seasonError;

      onSuccess();
      onClose();
    } catch (err) {
      // Nothing half-listed: a product row without its season row would sit
      // in the database, invisible, holding the pack's one listing.
      if (createdProductId) {
        await supabase.from("products").delete().eq("id", createdProductId);
      }
      setError(err instanceof Error ? err.message : "Could not add the pack");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const fieldClass =
    "w-full px-3 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-auto p-5 relative">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-lg text-text/60 hover:bg-card/70"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <Boxes className="w-5 h-5 text-primary-orange" />
          <h2 className="text-xl font-semibold">Add family pack to products</h2>
        </div>
        <p className="text-sm text-text/70 mb-4">
          Lists a saved pack in season {seasonName ?? "—"}, like any product.
          Stock is the number of packs already packed.
        </p>

        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-primary-orange" />
          </div>
        ) : available.length === 0 ? (
          <p className="text-sm text-text/70 bg-card/60 rounded-lg px-3 py-3">
            {packs.length === 0
              ? "There are no active family packs in this season. Create one on the Family Packs page first."
              : "Every active family pack in this season is already on the product list."}
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium">Family pack</label>
              <select
                value={packId}
                onChange={(e) => choosePack(e.target.value)}
                className={fieldClass}
              >
                <option value="">Choose a pack</option>
                {available.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.name} — ₹{formatPrice(pack.pack_price)} · {pack.item_count} items
                  </option>
                ))}
              </select>
            </div>

            {selected && (
              <>
                <div>
                  <label className="block mb-1 text-sm font-medium">Category</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Choose a category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-1 text-sm font-medium">Offer price ₹</label>
                    <input
                      value={formatPrice(selected.pack_price)}
                      readOnly
                      title="The pack rate is set on the Family Packs page"
                      className={`${fieldClass} bg-card/40 text-text/70 cursor-not-allowed`}
                    />
                    <p className="text-xs text-text/50 mt-1">Set on the Family Packs page</p>
                  </div>
                  <div>
                    <label className="block mb-1 text-sm font-medium">Actual price ₹</label>
                    <NumberInput
                      value={actualPrice}
                      onValueChange={setActualPrice}
                      min={0}
                      step="0.01"
                      className={fieldClass}
                    />
                    <p className="text-xs text-text/50 mt-1">The struck-out price</p>
                  </div>
                </div>

                <div>
                  <label className="block mb-1 text-sm font-medium">Packs in stock</label>
                  <NumberInput
                    value={packsInStock}
                    onValueChange={setPacksInStock}
                    onClear={() => setPacksInStock(null)}
                    min={0}
                    step="1"
                    placeholder="0"
                    className={fieldClass}
                  />
                  <p className="text-xs text-text/50 mt-1">
                    How many packs are packed and ready. Change it later in
                    Stock Management like any product.
                  </p>
                </div>

                <div>
                  <label className="block mb-1 text-sm font-medium">Image</label>
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-card-border/30 cursor-pointer hover:bg-card/50">
                    {imagePreview ? (
                      <img
                        src={imagePreview}
                        alt="Pack preview"
                        className="w-16 h-16 object-cover rounded-lg"
                      />
                    ) : (
                      <span className="w-16 h-16 rounded-lg bg-card flex items-center justify-center">
                        <ImagePlus className="w-6 h-6 text-text/40" />
                      </span>
                    )}
                    <span className="text-sm text-text/70">
                      {imageFile ? imageFile.name : "Choose a photo (JPG, PNG or WebP, up to 5 MB)"}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => chooseImage(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              </>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 mt-5">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-card hover:bg-card/70 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !selected}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{saving ? "Adding…" : "Add to product list"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
