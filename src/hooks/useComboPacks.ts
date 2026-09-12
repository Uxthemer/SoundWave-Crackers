import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * Combo / family packs for one season.
 *
 * A pack is a named bundle sold at one rate. What it is worth is worked out
 * from its contents against that season's catalog, so the same pack read in a
 * different season shows that season's prices — which is why everything here
 * is scoped by season id rather than cached globally.
 */

/** A product as offered for inclusion in a pack. */
export interface PackCandidate {
  product_id: string;
  name: string;
  product_code: string | null;
  category: string | null;
  content: string | null;
  offer_price: number;
  actual_price: number;
  apr: number | null;
  stock: number;
  is_active: boolean;
}

export interface PackComponent {
  product_id: string;
  quantity: number;
}

export interface ComboPack {
  id: string;
  season_id: string;
  name: string;
  pack_code: string | null;
  description: string | null;
  pack_price: number;
  is_active: boolean;
  display_order: number | null;
  /** The storefront category it is listed under, normally Family Pack. */
  category_id: string | null;
  items: PackComponent[];
  /** Its product listing, once added to the product list in Stock Management. */
  listing: { product_id: string; category: string | null } | null;
}

/** Everything the editor shows about one line of a pack. */
export interface PackLine {
  product_id: string;
  name: string;
  product_code: string | null;
  content: string | null;
  quantity: number;
  offer_price: number;
  apr: number | null;
  stock: number;
  /** quantity × offer price */
  lineOffer: number;
  /** quantity × APR, or null where no cost is recorded */
  lineApr: number | null;
}

export interface PackTotals {
  lines: PackLine[];
  /** What the contents would sell for individually. */
  offerTotal: number;
  /** What the contents cost. Null when any line has no APR recorded. */
  aprTotal: number | null;
  /** Lines with no APR — the reason aprTotal cannot be trusted. */
  missingApr: number;
  packPrice: number;
  /** packPrice − aprTotal */
  profit: number | null;
  /** profit as a percentage of the pack price */
  marginPercentage: number | null;
  /** offerTotal − packPrice: what the customer is told they save. */
  customerSaving: number;
}

/**
 * Works out a pack's economics from its lines.
 *
 * Deliberately pure and exported: the editor recalculates on every quantity
 * keystroke, long before anything is saved, and the same numbers have to come
 * out afterwards from what was stored.
 */
export function calculatePackTotals(
  components: PackComponent[],
  catalog: Map<string, PackCandidate>,
  packPrice: number
): PackTotals {
  const lines: PackLine[] = components.map((component) => {
    const product = catalog.get(component.product_id);
    const quantity = Number(component.quantity) || 0;
    const offer = Number(product?.offer_price ?? 0);
    const apr = product?.apr == null ? null : Number(product.apr);
    return {
      product_id: component.product_id,
      name: product?.name ?? "Unknown product",
      product_code: product?.product_code ?? null,
      content: product?.content ?? null,
      quantity,
      offer_price: offer,
      apr,
      stock: Number(product?.stock ?? 0),
      lineOffer: offer * quantity,
      lineApr: apr == null ? null : apr * quantity,
    };
  });

  const offerTotal = lines.reduce((sum, line) => sum + line.lineOffer, 0);
  const missingApr = lines.filter((line) => line.lineApr == null).length;
  // A partial cost total reads as a real number and would overstate profit,
  // so it is withheld entirely until every line has a cost.
  const aprTotal =
    lines.length === 0 || missingApr > 0
      ? null
      : lines.reduce((sum, line) => sum + (line.lineApr ?? 0), 0);

  const profit = aprTotal == null ? null : packPrice - aprTotal;

  return {
    lines,
    offerTotal,
    aprTotal,
    missingApr,
    packPrice,
    profit,
    marginPercentage:
      profit == null || packPrice <= 0
        ? null
        : Number(((profit / packPrice) * 100).toFixed(2)),
    customerSaving: offerTotal - packPrice,
  };
}

export function useComboPacks(seasonId: string | null) {
  const [packs, setPacks] = useState<ComboPack[]>([]);
  const [catalog, setCatalog] = useState<Map<string, PackCandidate>>(new Map());
  const [candidates, setCandidates] = useState<PackCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!seasonId) {
      setPacks([]);
      setCandidates([]);
      setCatalog(new Map());
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [packRes, itemRes, catalogRes, costRes, listingRes] = await Promise.all([
        supabase
          .from("combo_packs")
          .select(
            "id, season_id, name, pack_code, description, pack_price, is_active, display_order, category_id"
          )
          .eq("season_id", seasonId)
          .order("display_order", { nullsFirst: false })
          .order("name"),
        supabase
          .from("combo_pack_items")
          .select("combo_pack_id, product_id, quantity"),
        supabase
          .from("season_catalog")
          .select(
            'id, name, product_code, content, offer_price, actual_price, stock, is_active, categories, "order"'
          )
          .eq("season_id", seasonId)
          .order("order", { nullsFirst: false })
          .order("name"),
        // Cost is admin-only; a role that cannot read it simply gets no rows
        // and the editor shows the APR columns as unknown rather than zero.
        supabase
          .from("product_season_costs")
          .select("product_id, apr")
          .eq("season_id", seasonId),
        // Which packs are on the product list. Fails harmlessly (no rows)
        // before the pack-products migration adds the column.
        supabase
          .from("products")
          .select("id, combo_pack_id, categories:categories ( name )")
          .not("combo_pack_id", "is", null),
      ]);

      if (packRes.error) throw packRes.error;
      if (itemRes.error) throw itemRes.error;
      if (catalogRes.error) throw catalogRes.error;

      const aprByProduct = new Map<string, number>(
        ((costRes.data ?? []) as { product_id: string; apr: number | null }[])
          .filter((row) => row.apr != null)
          .map((row) => [row.product_id, Number(row.apr)])
      );

      const list: PackCandidate[] = ((catalogRes.data ?? []) as any[]).map(
        (row) => ({
          product_id: row.id,
          name: row.name,
          product_code: row.product_code ?? null,
          category: row.categories?.name ?? null,
          content: row.content ?? null,
          offer_price: Number(row.offer_price ?? 0),
          actual_price: Number(row.actual_price ?? 0),
          apr: aprByProduct.has(row.id) ? aprByProduct.get(row.id)! : null,
          stock: Number(row.stock ?? 0),
          is_active: row.is_active !== false,
        })
      );

      const byId = new Map(list.map((product) => [product.product_id, product]));

      const itemsByPack = new Map<string, PackComponent[]>();
      ((itemRes.data ?? []) as any[]).forEach((row) => {
        const bucket = itemsByPack.get(row.combo_pack_id) ?? [];
        bucket.push({
          product_id: row.product_id,
          quantity: Number(row.quantity ?? 1),
        });
        itemsByPack.set(row.combo_pack_id, bucket);
      });

      const listingByPack = new Map<string, { product_id: string; category: string | null }>(
        ((listingRes.data ?? []) as any[]).map((row) => [
          row.combo_pack_id,
          { product_id: row.id, category: row.categories?.name ?? null },
        ])
      );

      setCandidates(list);
      setCatalog(byId);
      setPacks(
        ((packRes.data ?? []) as any[]).map((pack) => ({
          ...pack,
          pack_price: Number(pack.pack_price ?? 0),
          items: itemsByPack.get(pack.id) ?? [],
          listing: listingByPack.get(pack.id) ?? null,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load packs");
    } finally {
      setLoading(false);
    }
  }, [seasonId]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Writes a pack and its contents.
   *
   * The contents are replaced wholesale rather than diffed: a pack holds a
   * handful of lines, and "delete what is there, insert what is wanted" has
   * no half-applied state to reason about.
   */
  const savePack = async (
    pack: {
      id?: string;
      name: string;
      pack_code: string | null;
      description: string | null;
      pack_price: number;
      is_active: boolean;
      display_order: number | null;
      category_id: string | null;
    },
    components: PackComponent[]
  ): Promise<string> => {
    if (!seasonId) throw new Error("No season selected");

    let packId = pack.id;

    if (packId) {
      const { error: updateError } = await supabase
        .from("combo_packs")
        .update({
          name: pack.name,
          pack_code: pack.pack_code,
          description: pack.description,
          pack_price: pack.pack_price,
          is_active: pack.is_active,
          display_order: pack.display_order,
          category_id: pack.category_id,
        })
        .eq("id", packId);
      if (updateError) throw updateError;

      const { error: clearError } = await supabase
        .from("combo_pack_items")
        .delete()
        .eq("combo_pack_id", packId);
      if (clearError) throw clearError;
    } else {
      const { data: created, error: insertError } = await supabase
        .from("combo_packs")
        .insert({
          season_id: seasonId,
          name: pack.name,
          pack_code: pack.pack_code,
          description: pack.description,
          pack_price: pack.pack_price,
          is_active: pack.is_active,
          display_order: pack.display_order,
          category_id: pack.category_id,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      packId = (created as { id: string }).id;
    }

    const rows = components
      .filter((component) => Number(component.quantity) > 0)
      .map((component) => ({
        combo_pack_id: packId,
        product_id: component.product_id,
        quantity: Number(component.quantity),
      }));

    if (rows.length) {
      const { error: itemError } = await supabase
        .from("combo_pack_items")
        .insert(rows);
      if (itemError) throw itemError;
    }

    await load();
    return packId!;
  };

  const deletePack = async (packId: string) => {
    // On sale: the listing has to go first (the database refuses anyway).
    if (packs.find((pack) => pack.id === packId)?.listing) {
      throw new Error(
        "This pack is on the product list. Switch it off here, or remove it from Stock Management before deleting."
      );
    }

    // Ordered packs are kept: order_items still points at them, and an order
    // has to stay readable years later.
    const { count, error: usageError } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("combo_pack_id", packId);
    if (usageError) throw usageError;
    if ((count ?? 0) > 0) {
      throw new Error(
        `This pack is on ${count} order line${
          count === 1 ? "" : "s"
        }. Switch it off instead of deleting it.`
      );
    }

    const { error } = await supabase
      .from("combo_packs")
      .delete()
      .eq("id", packId);
    if (error) throw error;
    await load();
  };

  const setPackActive = async (packId: string, isActive: boolean) => {
    const { error } = await supabase
      .from("combo_packs")
      .update({ is_active: isActive })
      .eq("id", packId);
    if (error) throw error;
    await load();
  };

  return {
    packs,
    candidates,
    catalog,
    loading,
    error,
    reload: load,
    savePack,
    deletePack,
    setPackActive,
  };
}
