import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { ExtractedRow } from '../lib/priceListExtractor';

export interface Vendor {
  id: string;
  name: string;
  phone?: string | null;
  gstin?: string | null;
  discount_percent: number;
  gst_percent: number;
  packing_percent: number;
  other_charges_percent: number;
  rating: number;
  lead_time_days?: number | null;
  is_preferred: boolean;
}

export interface PriceListRow {
  id: string;
  price_list_id: string;
  vendor_id: string;
  season_id: string;
  raw_label: string;
  product_id: string | null;
  match_confidence: number | null;
  match_method: string | null;
  list_price: number;
  rate_qty: number;
  rate_unit: string;
  pack_qty: number | null;
  /** Retail packs yielded by one vendor unit — confirmed by a human. */
  retail_units_per_rate_unit: number | null;
  case_qty: number | null;
  raw_pack_text: string | null;
  raw_case_text: string | null;
  raw_rate_text: string | null;
  discount_percent: number;
  packing_percent: number;
  gst_percent: number;
  other_charges_percent: number;
  landed_unit_cost: number | null;
  landed_case_cost: number | null;
  landed_retail_cost: number | null;
  retail_units_per_case: number | null;
  needs_unit_review: boolean;
}

export interface PriceList {
  id: string;
  vendor_id: string;
  season_id: string;
  source_name: string | null;
  source_type: string | null;
  quoted_on: string;
  status: string;
  row_count: number;
  matched_count: number;
  created_at: string;
}

export interface VendorSuggestion {
  vendor_id: string;
  vendor_name: string;
  price_item_id: string;
  rating: number;
  list_price: number;
  landed_retail_cost: number;
  landed_case_cost: number;
  packs_per_case: number;
  needs_unit_review: boolean;
  adjusted_retail_cost: number;
  vendor_rank: number;
}

export interface PlanLine {
  id: string;
  plan_id: string;
  product_id: string;
  required_qty: number;
  vendor_id: string | null;
  price_item_id: string | null;
  unit_landed_cost: number | null;
  order_cases: number;
  pieces_ordered: number;
  line_total: number;
  selection_reason: string;
  notes: string | null;
  product?: { name: string; product_code: string | null } | null;
  vendor?: { name: string } | null;
}

export interface PriceListPreviewRow {
  product_id: string;
  product_name: string;
  category_name: string | null;
  piece_cost: number | null;
  margin_percent: number | null;
  new_offer: number | null;
  new_actual: number | null;
  old_offer: number | null;
}

/** Vendors with their commercial terms, for the purchasing screens. */
export function useVendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('vendors')
      .select('id,name,phone,gstin,discount_percent,gst_percent,packing_percent,other_charges_percent,rating,lead_time_days,is_preferred')
      .order('name');
    setVendors((data as Vendor[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { vendors, loading, refresh };
}

/** Vendor price lists and their extracted rows, for one season. */
export function usePriceLists(seasonId: string | null) {
  const [lists, setLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!seasonId) { setLists([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('vendor_price_lists')
      .select('*')
      .eq('season_id', seasonId)
      .order('created_at', { ascending: false });
    setLists((data as PriceList[]) || []);
    setLoading(false);
  }, [seasonId]);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * Persists an extraction. Vendor terms are copied onto every row by a
   * database trigger, so the quote's cost is frozen even if the vendor's
   * default terms change later.
   */
  const saveExtraction = async (params: {
    vendorId: string;
    seasonId: string;
    sourceName: string;
    sourceType: 'pdf' | 'excel' | 'manual';
    rows: ExtractedRow[];
  }) => {
    const { data: list, error } = await supabase
      .from('vendor_price_lists')
      .insert({
        vendor_id: params.vendorId,
        season_id: params.seasonId,
        source_name: params.sourceName,
        source_type: params.sourceType,
        row_count: params.rows.length,
      })
      .select()
      .single();
    if (error) throw error;

    if (params.rows.length > 0) {
      const payload = params.rows.map((r) => ({
        price_list_id: list.id,
        vendor_id: params.vendorId,
        season_id: params.seasonId,
        raw_label: r.label,
        list_price: r.listPrice,
        rate_qty: r.rateQty,
        rate_unit: r.rateUnit,
        pack_qty: r.packQty,
        case_qty: r.caseQty,
        raw_pack_text: r.rawPackText,
        raw_case_text: r.rawCaseText,
        raw_rate_text: r.rawRateText,
        match_confidence: r.confidence,
      }));
      const { error: itemsError } = await supabase
        .from('vendor_price_items')
        .insert(payload);
      if (itemsError) throw itemsError;
    }

    await refresh();
    return list.id as string;
  };

  const deleteList = async (id: string) => {
    const { error } = await supabase.from('vendor_price_lists').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  };

  return { lists, loading, refresh, saveExtraction, deleteList };
}

/** The rows of one price list, with their computed landed costs. */
export function usePriceListRows(priceListId: string | null) {
  const [rows, setRows] = useState<PriceListRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!priceListId) { setRows([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('vendor_price_items')
      .select('*, product:products(name)')
      .eq('price_list_id', priceListId);

    // Sequence by the catalog's display order where a product is mapped, so
    // the list reads like the price list. Unmapped rows sink to the bottom,
    // which is also where they need attention.
    const { data: catalog } = await supabase
      .from('season_catalog')
      .select('id, order')
      .eq('season_id', (data?.[0] as any)?.season_id ?? '')
      .order('order', { nullsFirst: false });

    const orderById = new Map<string, number>();
    (catalog || []).forEach((c: any, i: number) => orderById.set(c.id, c.order ?? i));

    const sorted = ((data as PriceListRow[]) || []).sort((a, b) => {
      const ao = a.product_id ? orderById.get(a.product_id) ?? 9e6 : 9e7;
      const bo = b.product_id ? orderById.get(b.product_id) ?? 9e6 : 9e7;
      if (ao !== bo) return ao - bo;
      return a.raw_label.localeCompare(b.raw_label);
    });

    setRows(sorted);
    setLoading(false);
  }, [priceListId]);

  useEffect(() => { refresh(); }, [refresh]);

  const updateRow = async (id: string, patch: Partial<PriceListRow>) => {
    const { error } = await supabase.from('vendor_price_items').update(patch).eq('id', id);
    if (error) throw error;
    await refresh();
  };

  const addRow = async (row: Partial<PriceListRow>) => {
    const { error } = await supabase.from('vendor_price_items').insert(row);
    if (error) throw error;
    await refresh();
  };

  const deleteRow = async (id: string) => {
    const { error } = await supabase.from('vendor_price_items').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  };

  return { rows, loading, refresh, updateRow, addRow, deleteRow };
}

/**
 * Matches extracted vendor labels to catalog products.
 *
 * Exact product_code first, then exact name, then a loose token overlap. The
 * loose pass deliberately does not auto-apply below a high bar — a wrong match
 * silently buys the wrong item, so unmatched is safer than mismatched.
 */
export async function matchRowsToProducts(
  seasonId: string,
  rows: { id: string; raw_label: string }[]
): Promise<{ matched: number; ambiguous: number }> {
  const { data: products } = await supabase
    .from('season_catalog')
    .select('id,name,product_code')
    .eq('season_id', seasonId)
    .order('order', { nullsFirst: false })
    .order('name');

  if (!products || products.length === 0) return { matched: 0, ambiguous: 0 };

  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  products.forEach((p: any) => {
    if (p.product_code) byCode.set(norm(p.product_code), p.id);
    byName.set(norm(p.name), p.id);
  });

  let matched = 0;
  let ambiguous = 0;

  for (const row of rows) {
    const label = norm(row.raw_label);
    let productId: string | null = byCode.get(label) ?? byName.get(label) ?? null;
    let method: string | null = productId ? 'exact_name' : null;
    let confidence = productId ? 1 : 0;

    if (!productId) {
      const labelTokens = new Set(label.split(' ').filter((t) => t.length > 2));
      let best: { id: string; score: number } | null = null as
        | { id: string; score: number }
        | null;
      let runnerUp = 0;

      products.forEach((p: any) => {
        const tokens = new Set(norm(p.name).split(' ').filter((t) => t.length > 2));
        if (tokens.size === 0 || labelTokens.size === 0) return;
        let overlap = 0;
        tokens.forEach((t) => { if (labelTokens.has(t)) overlap += 1; });
        const score = overlap / Math.max(tokens.size, labelTokens.size);
        if (!best || score > best.score) {
          runnerUp = best ? best.score : runnerUp;
          best = { id: p.id, score };
        } else if (score > runnerUp) {
          runnerUp = score;
        }
      });

      // Require both a strong score and a clear gap over the runner-up,
      // otherwise leave it for a human.
      if (best && best.score >= 0.6 && best.score - runnerUp >= 0.15) {
        productId = best.id;
        method = 'fuzzy';
        confidence = best.score;
      } else if (best && best.score >= 0.4) {
        ambiguous += 1;
      }
    }

    if (productId) {
      await supabase
        .from('vendor_price_items')
        .update({ product_id: productId, match_method: method, match_confidence: confidence })
        .eq('id', row.id);
      matched += 1;
    }
  }

  return { matched, ambiguous };
}

/** Who can supply a product, cheapest first after rating adjustment. */
export async function suggestVendors(
  seasonId: string,
  productId: string
): Promise<VendorSuggestion[]> {
  const { data, error } = await supabase.rpc('suggest_vendors_for_product', {
    p_season_id: seasonId,
    p_product_id: productId,
  });
  if (error) throw error;
  return (data as VendorSuggestion[]) || [];
}

/** Purchase plans and their lines. */
export function usePurchasePlans(seasonId: string | null) {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!seasonId) { setPlans([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('purchase_plans')
      .select('*')
      .eq('season_id', seasonId)
      .order('created_at', { ascending: false });
    setPlans(data || []);
    setLoading(false);
  }, [seasonId]);

  useEffect(() => { refresh(); }, [refresh]);

  const generate = async (opts: {
    seasonId: string;
    name: string;
    coverage: number;
    basisSeasonId: string | null;
  }) => {
    const { data, error } = await supabase.rpc('generate_purchase_plan', {
      p_season_id: opts.seasonId,
      p_name: opts.name,
      p_coverage_multiplier: opts.coverage,
      p_basis_season_id: opts.basisSeasonId,
    });
    if (error) throw error;
    await refresh();
    return data as string;
  };

  const createEmpty = async (seasonIdArg: string, name: string) => {
    const { data, error } = await supabase
      .from('purchase_plans')
      .insert({ season_id: seasonIdArg, name })
      .select()
      .single();
    if (error) throw error;
    await refresh();
    return data.id as string;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('purchase_plans').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  };

  return { plans, loading, refresh, generate, createEmpty, remove };
}

export function usePlanLines(planId: string | null) {
  const [lines, setLines] = useState<PlanLine[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!planId) { setLines([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('purchase_plan_items')
      .select('*, product:products(name,product_code), vendor:vendors(name)')
      .eq('plan_id', planId);
    setLines(((data as PlanLine[]) || []).sort((a, b) =>
      (a.product?.name || '').localeCompare(b.product?.name || '')
    ));
    setLoading(false);
  }, [planId]);

  useEffect(() => { refresh(); }, [refresh]);

  const upsertLine = async (line: Partial<PlanLine> & { plan_id: string; product_id: string }) => {
    const { error } = await supabase
      .from('purchase_plan_items')
      .upsert(line, { onConflict: 'plan_id,product_id' });
    if (error) throw error;
    await refresh();
  };

  const updateLine = async (id: string, patch: Partial<PlanLine>) => {
    const { error } = await supabase.from('purchase_plan_items').update(patch).eq('id', id);
    if (error) throw error;
    await refresh();
  };

  const deleteLine = async (id: string) => {
    const { error } = await supabase.from('purchase_plan_items').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  };

  return { lines, loading, refresh, upsertLine, updateLine, deleteLine };
}

/** Purchase orders for a season. */
export function usePurchaseOrders(seasonId: string | null) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!seasonId) { setOrders([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('purchase_orders')
      .select('*, vendor:vendors(name,phone,email,address,gstin), items:purchase_order_items(*)')
      .eq('season_id', seasonId)
      .order('created_at', { ascending: false });
    setOrders(data || []);
    setLoading(false);
  }, [seasonId]);

  useEffect(() => { refresh(); }, [refresh]);

  const createFromPlan = async (planId: string) => {
    const { data, error } = await supabase.rpc('create_purchase_orders_from_plan', {
      p_plan_id: planId,
    });
    if (error) throw error;
    await refresh();
    return data as number;
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('purchase_orders').update({ status }).eq('id', id);
    if (error) throw error;
    await refresh();
  };

  const confirm = async (id: string) => {
    const { error } = await supabase.rpc('confirm_purchase_order', { p_po_id: id });
    if (error) throw error;
    await refresh();
  };

  return { orders, loading, refresh, createFromPlan, setStatus, confirm };
}

export interface ComparisonOffer {
  vendor_id: string;
  vendor_name: string;
  rating: number;
  price_item_id: string;
  raw_label: string;
  list_price: number;
  landed_retail_cost: number;
  landed_case_cost: number;
  packs_per_case: number;
  vendor_rank: number;
  needs_unit_review: boolean;
}

export interface ComparisonRow {
  product_id: string;
  product_name: string;
  product_order: number | null;
  category_name: string | null;
  offers: ComparisonOffer[];
}

/**
 * Every vendor quote for the season, pivoted by product.
 *
 * Rows are ordered by the catalog's own `order` column so the comparison reads
 * in the same sequence as the printed price list.
 */
export async function loadComparison(seasonId: string): Promise<{
  rows: ComparisonRow[];
  unmatchedCount: number;
}> {
  const [offersRes, productsRes, unmatchedRes] = await Promise.all([
    supabase.from('vendor_offer_ranking').select('*').eq('season_id', seasonId),
    supabase
      .from('season_catalog')
      .select('id,name,order,categories')
      .eq('season_id', seasonId)
      .order('order', { nullsFirst: false })
      .order('name'),
    supabase
      .from('vendor_price_items')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', seasonId)
      .is('product_id', null),
  ]);

  const byProduct = new Map<string, ComparisonOffer[]>();
  (offersRes.data || []).forEach((o: any) => {
    if (!byProduct.has(o.product_id)) byProduct.set(o.product_id, []);
    byProduct.get(o.product_id)!.push({
      vendor_id: o.vendor_id,
      vendor_name: o.vendor_name,
      rating: Number(o.rating),
      price_item_id: o.price_item_id,
      raw_label: o.raw_label,
      list_price: Number(o.list_price),
      landed_retail_cost: Number(o.landed_retail_cost),
      landed_case_cost: Number(o.landed_case_cost),
      packs_per_case: Number(o.retail_units_per_case ?? 0),
      vendor_rank: Number(o.vendor_rank),
      needs_unit_review: !!o.needs_unit_review,
    });
  });

  const rows: ComparisonRow[] = (productsRes.data || [])
    .filter((p: any) => byProduct.has(p.id))
    .map((p: any) => ({
      product_id: p.id,
      product_name: p.name,
      product_order: p.order,
      category_name: p.categories?.name ?? null,
      offers: (byProduct.get(p.id) || []).sort((a, b) => a.vendor_rank - b.vendor_rank),
    }));

  return { rows, unmatchedCount: unmatchedRes.count ?? 0 };
}

/**
 * How much of each product sold last season, expressed in CASES using the
 * winning vendor's case size — which is the unit purchasing actually happens in.
 *
 * Mirrors how the business reasons about it: "we sold 180 boxes, a case is 18,
 * so that was 10 cases; allow for growth and buy 12."
 */
export interface CaseRecommendation {
  product_id: string;
  product_name: string;
  product_order: number | null;
  sold_last_season: number;
  stock_on_hand: number;
  packs_per_case: number | null;
  cases_sold_last_season: number | null;
  recommended_cases: number | null;
  vendor_name: string | null;
  landed_case_cost: number | null;
}

export async function loadCaseRecommendations(
  seasonId: string,
  basisSeasonId: string,
  growth: number
): Promise<CaseRecommendation[]> {
  const [catalogRes, offersRes, salesRes] = await Promise.all([
    supabase
      .from('season_catalog')
      .select('id,name,order,stock')
      .eq('season_id', seasonId)
      .eq('is_active', true)
      .order('order', { nullsFirst: false })
      .order('name'),
    supabase
      .from('vendor_offer_ranking')
      .select('product_id,vendor_name,retail_units_per_case,landed_case_cost,vendor_rank')
      .eq('season_id', seasonId)
      .eq('vendor_rank', 1),
    supabase
      .from('order_items')
      .select('product_id,quantity,orders!inner(season_id,status)')
      .eq('orders.season_id', basisSeasonId),
  ]);

  const sold = new Map<string, number>();
  (salesRes.data || []).forEach((r: any) => {
    if (String(r.orders?.status || '').toLowerCase() === 'cancelled') return;
    sold.set(r.product_id, (sold.get(r.product_id) || 0) + Number(r.quantity || 0));
  });

  const bestOffer = new Map<string, any>();
  (offersRes.data || []).forEach((o: any) => {
    if (!bestOffer.has(o.product_id)) bestOffer.set(o.product_id, o);
  });

  return (catalogRes.data || []).map((p: any) => {
    const soldQty = sold.get(p.id) || 0;
    const offer = bestOffer.get(p.id);
    const perCase = offer ? Number(offer.retail_units_per_case) : null;
    const casesSold = perCase && perCase > 0 ? Math.ceil(soldQty / perCase) : null;
    // Buy for expected demand less what is already on the shelf.
    const needPacks = Math.max(0, soldQty * growth - Number(p.stock || 0));
    const recommended =
      perCase && perCase > 0 ? Math.ceil(needPacks / perCase) : null;

    return {
      product_id: p.id,
      product_name: p.name,
      product_order: p.order,
      sold_last_season: soldQty,
      stock_on_hand: Number(p.stock || 0),
      packs_per_case: perCase,
      cases_sold_last_season: casesSold,
      recommended_cases: recommended,
      vendor_name: offer?.vendor_name ?? null,
      landed_case_cost: offer ? Number(offer.landed_case_cost) : null,
    };
  });
}

/**
 * The season's catalog laid out for printing/exporting, grouped by category and
 * sequenced by the category's own order then each product's order — the same
 * sequence as the published price list.
 */
export interface ExportGroup {
  category: string;
  categoryOrder: number;
  products: {
    name: string;
    content: string | null;
    actual_price: number;
    offer_price: number;
    stock: number;
  }[];
}

export async function loadPriceListForExport(seasonId: string): Promise<ExportGroup[]> {
  const [catalogRes, categoryRes] = await Promise.all([
    supabase
      .from('season_catalog')
      .select('id,name,content,actual_price,offer_price,stock,order,category_id,categories')
      .eq('season_id', seasonId)
      .eq('is_active', true)
      .order('order', { nullsFirst: false })
      .order('name'),
    supabase.from('categories').select('id,name,order'),
  ]);

  const catOrder = new Map<string, number>();
  (categoryRes.data || []).forEach((c: any) => catOrder.set(c.id, c.order ?? 0));

  const groups = new Map<string, ExportGroup>();
  (catalogRes.data || []).forEach((p: any) => {
    const name = p.categories?.name ?? 'Uncategorised';
    if (!groups.has(name)) {
      groups.set(name, {
        category: name,
        categoryOrder: catOrder.get(p.category_id) ?? 999,
        products: [],
      });
    }
    groups.get(name)!.products.push({
      name: p.name,
      content: p.content,
      actual_price: Number(p.actual_price || 0),
      offer_price: Number(p.offer_price || 0),
      stock: Number(p.stock || 0),
    });
  });

  return [...groups.values()].sort((a, b) => a.categoryOrder - b.categoryOrder);
}

/** Retail price list generation from recorded purchase costs. */
export async function previewPriceList(
  seasonId: string,
  marginOverride: number | null
): Promise<PriceListPreviewRow[]> {
  const { data, error } = await supabase.rpc('generate_season_price_list', {
    p_season_id: seasonId,
    p_margin_override: marginOverride,
    p_dry_run: true,
  });
  if (error) throw error;
  return (data as PriceListPreviewRow[]) || [];
}

export async function applyPriceList(
  seasonId: string,
  marginOverride: number | null
): Promise<number> {
  const { data, error } = await supabase.rpc('generate_season_price_list', {
    p_season_id: seasonId,
    p_margin_override: marginOverride,
    p_dry_run: false,
  });
  if (error) throw error;
  return ((data as unknown[]) || []).length;
}
