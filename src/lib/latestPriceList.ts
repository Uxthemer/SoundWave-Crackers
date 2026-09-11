import { supabase } from "./supabase";
import type { PriceListGroup } from "./priceListPdf";

/**
 * The current price list, generated on demand for the storefront.
 *
 * The header link used to point at a signed URL for a PDF uploaded by hand,
 * so every price change meant re-exporting and re-uploading, and the link went
 * stale the moment someone forgot. Building it from the active season means
 * the customer's copy is whatever the stock page says right now.
 */

interface ActiveSeason {
  id: string;
  name: string;
  discount: number;
}

async function loadActiveSeason(): Promise<ActiveSeason | null> {
  const { data, error } = await supabase
    .from("seasons")
    .select("id, name, price_list_discount_percentage")
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const season = data as {
    id: string;
    name: string;
    price_list_discount_percentage: number | null;
  };
  return {
    id: season.id,
    name: season.name,
    discount: Number(season.price_list_discount_percentage ?? 0),
  };
}

/**
 * Active products of the active season, in the sequence the price list is
 * arranged in: categories by their order, products by theirs. RLS already
 * limits anonymous visitors to the active season, so this is safe to run
 * without a login.
 */
async function loadGroups(seasonId: string): Promise<PriceListGroup[]> {
  const [catalogRes, categoryRes] = await Promise.all([
    supabase
      .from("season_catalog")
      .select("name, content, actual_price, offer_price, order, category_id, categories")
      .eq("season_id", seasonId)
      .eq("is_active", true)
      .order("order", { nullsFirst: false })
      .order("name"),
    supabase.from("categories").select("id, name, order"),
  ]);
  if (catalogRes.error) throw catalogRes.error;
  if (categoryRes.error) throw categoryRes.error;

  const categoryOrder = new Map<string, number>();
  ((categoryRes.data ?? []) as { id: string; order: number | null }[]).forEach(
    (category) =>
      categoryOrder.set(category.id, category.order ?? Number.MAX_SAFE_INTEGER)
  );

  const groups = new Map<string, PriceListGroup & { position: number }>();
  ((catalogRes.data ?? []) as any[]).forEach((product) => {
    const name = product.categories?.name ?? "Uncategorised";
    if (!groups.has(name)) {
      groups.set(name, {
        category: name,
        position:
          categoryOrder.get(product.category_id) ?? Number.MAX_SAFE_INTEGER,
        products: [],
      });
    }
    groups.get(name)!.products.push({
      name: product.name,
      actual_price: product.actual_price == null ? null : Number(product.actual_price),
      offer_price: product.offer_price == null ? null : Number(product.offer_price),
      content: product.content ?? null,
    });
  });

  return [...groups.values()]
    .sort((a, b) => a.position - b.position)
    .map(({ category, products }) => ({ category, products }));
}

/**
 * Builds the current price list and saves it to the visitor's downloads.
 *
 * jsPDF is pulled in dynamically: it is around a third of a megabyte and
 * nobody who never clicks the link should pay for it on first paint.
 */
export async function downloadLatestPriceListPdf(): Promise<void> {
  const season = await loadActiveSeason();
  if (!season) throw new Error("No price list is published at the moment");

  const groups = await loadGroups(season.id);
  if (!groups.length) throw new Error("The price list is empty at the moment");

  const { buildPriceListPdf } = await import("./priceListPdf");
  const doc = await buildPriceListPdf({
    groups,
    seasonName: season.name,
    discountPercent: season.discount,
  });

  doc.save(
    `Soundwave_Crackers_Price_List_${season.name.replace(/\s+/g, "_")}.pdf`
  );
}
