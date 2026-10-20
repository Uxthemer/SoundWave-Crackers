import toast from "react-hot-toast";
import { supabase } from "./supabase";
import { useCartStore } from "../store/cartStore";
import type { CartItem } from "../types";

/**
 * Brings the prices in a saved cart up to the live season's.
 *
 * The cart now lasts in localStorage with no expiry, and each line carries
 * the price it was added at. A signed-in order is placed at the cart's own
 * prices (Cart.tsx sends item.offer_price), so a cart left from last season
 * would otherwise be ordered at last season's rates. A guest order was always
 * priced by the database, but the cart would still have shown the wrong total
 * and checked the minimum order against it.
 *
 * What it leaves alone, on purpose:
 *   - A cart holding a quotation (editingQuotationId). Quoted prices are the
 *     point of a quotation; converting one keeps them.
 *   - Any line it cannot look up because the request failed. A network
 *     error must never empty or reprice a cart -- it simply tries again the
 *     next time the cart opens.
 *
 * A line that is no longer on sale this season is taken out and named, rather
 * than left to fail at checkout.
 */
export async function refreshCartPrices(seasonId: string): Promise<void> {
  const start = useCartStore.getState();
  if (start.editingQuotationId || start.items.length === 0) return;

  const productIds = start.items.filter((i) => !i.is_pack).map((i) => i.id);
  const packIds = start.items.filter((i) => i.is_pack).map((i) => i.id);

  const [catalogue, packs] = await Promise.all([
    productIds.length
      ? supabase
          .from("season_catalog")
          .select("id, offer_price, actual_price, discount_percentage, is_active")
          .eq("season_id", seasonId)
          .in("id", productIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    // Pack lines only come from a quotation or a copied order -- staff work --
    // and combo_packs may not be readable by a customer. A refused lookup is
    // treated as "unknown", which leaves those lines as they are.
    packIds.length
      ? supabase
          .from("combo_packs")
          .select("id, pack_price, is_active")
          .eq("season_id", seasonId)
          .in("id", packIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const productsKnown = !catalogue.error;
  const packsKnown = !packs.error;
  if (!productsKnown && !packsKnown) return;

  const productById = new Map((catalogue.data || []).map((row: any) => [row.id, row]));
  const packById = new Map((packs.data || []).map((row: any) => [row.id, row]));

  // Applied to the cart as it is NOW, not as it was when the lookup started:
  // someone may have added or removed a line while it was in flight.
  const now = useCartStore.getState();
  if (now.editingQuotationId) return;

  const removed: string[] = [];
  let repriced = 0;

  const next: CartItem[] = [];
  for (const item of now.items) {
    if (item.is_pack) {
      if (!packsKnown || !packIds.includes(item.id)) {
        next.push(item);
        continue;
      }
      const pack = packById.get(item.id);
      if (!pack || pack.is_active === false) {
        removed.push(item.name);
        continue;
      }
      const price = Number(pack.pack_price) || 0;
      if (price <= 0 || Math.abs(price - item.offer_price) < 0.005) {
        next.push(item);
        continue;
      }
      repriced++;
      next.push({
        ...item,
        offer_price: price,
        actual_price: price,
        totalPrice: price * item.quantity,
      });
      continue;
    }

    if (!productsKnown || !productIds.includes(item.id)) {
      next.push(item);
      continue;
    }
    const row = productById.get(item.id);
    if (!row || row.is_active === false) {
      removed.push(item.name);
      continue;
    }
    const price = Number(row.offer_price) || 0;
    const actual = Number(row.actual_price) || price;
    if (price <= 0) {
      next.push(item);
      continue;
    }
    const changed =
      Math.abs(price - item.offer_price) >= 0.005 ||
      Math.abs(actual - Number(item.actual_price ?? price)) >= 0.005;
    if (!changed) {
      next.push(item);
      continue;
    }
    if (Math.abs(price - item.offer_price) >= 0.005) repriced++;
    next.push({
      ...item,
      offer_price: price,
      actual_price: actual,
      discount_percentage: row.discount_percentage ?? item.discount_percentage,
      totalPrice: price * item.quantity,
    });
  }

  if (removed.length === 0 && next.every((item, i) => item === now.items[i])) return;

  useCartStore.getState().replaceItems(next);

  if (repriced > 0) {
    toast(
      `${repriced} item${repriced === 1 ? "'s price was" : "s' prices were"} updated to today's price in your cart.`,
      { icon: "ℹ️", duration: 6000 }
    );
  }
  if (removed.length > 0) {
    toast(
      `Removed from your cart (no longer available): ${removed.join(", ")}`,
      { icon: "⚠️", duration: 8000 }
    );
  }
}
