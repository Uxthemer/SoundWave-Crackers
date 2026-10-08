import { supabase } from "./supabase";
import { crackerImage } from "./productImage";
import { customerOrderExtras } from "./customerLookup";
import type { CartItem } from "../types";
import type { DeliveryDetailsState } from "../store/cartStore";

/**
 * "Copy as new order": an existing order's lines and shipping details, made
 * ready to go back through the cart.
 *
 * The copy goes through the cart rather than being written here because the
 * cart is the one path that already places an order properly -- the order
 * number, the season, the stock triggers and the summary PDF all happen
 * there. Doing it again in a second place would be a second set of rules to
 * keep in step.
 *
 * It is a new order, so it is priced from the active season today, not at
 * what the old order paid: the old one may be from last season, and its
 * products may since have been repriced or withdrawn. A line that is no
 * longer on sale is left out and named, rather than copied at a stale price.
 */

export interface CopyableOrder {
  full_name: string;
  email: string;
  phone: string;
  alternate_phone?: string | null;
  address: string;
  city: string;
  district?: string | null;
  state: string;
  pincode: string;
  items?: {
    product_id?: string | null;
    combo_pack_id?: string | null;
    quantity: number;
    price: number;
    product?: { name?: string } | null;
  }[];
}

export interface OrderCopy {
  items: CartItem[];
  delivery: DeliveryDetailsState;
  /** Names of lines that are not on sale this season and were left out. */
  skipped: string[];
  /** How many copied lines now cost something other than they did. */
  repriced: number;
}

export async function buildOrderCopy(
  order: CopyableOrder,
  seasonId: string
): Promise<OrderCopy> {
  const lines = (order.items || []).filter((line) => line.quantity > 0);
  const productIds = lines.flatMap((line) => (line.product_id ? [line.product_id] : []));
  const packIds = lines.flatMap((line) => (line.combo_pack_id ? [line.combo_pack_id] : []));

  const [catalogue, packs] = await Promise.all([
    productIds.length
      ? supabase
          .from("season_catalog")
          .select("*")
          .eq("season_id", seasonId)
          .eq("is_active", true)
          .in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    packIds.length
      ? supabase
          .from("combo_packs")
          .select("id,name,pack_price")
          .eq("season_id", seasonId)
          .eq("is_active", true)
          .in("id", packIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (catalogue.error) throw catalogue.error;
  if (packs.error) throw packs.error;

  const productById = new Map((catalogue.data || []).map((row: any) => [row.id, row]));
  const packById = new Map((packs.data || []).map((row: any) => [row.id, row]));

  const items: CartItem[] = [];
  const skipped: string[] = [];
  let repriced = 0;

  for (const line of lines) {
    const label = line.product?.name || "Unknown item";
    let item: CartItem | null = null;

    if (line.combo_pack_id) {
      const pack = packById.get(line.combo_pack_id);
      if (pack) {
        const price = Number(pack.pack_price) || 0;
        item = {
          id: pack.id,
          name: pack.name,
          content: "",
          actual_price: price,
          offer_price: price,
          discount_percentage: 0,
          quantity: line.quantity,
          totalPrice: line.quantity * price,
          is_pack: true,
        } as CartItem;
      }
    } else if (line.product_id) {
      const row = productById.get(line.product_id);
      if (row) {
        const price = Number(row.offer_price) || 0;
        // The same product shape Explore and the scan modal hand the cart.
        item = {
          id: row.id,
          name: row.name,
          product_code: row.product_code,
          category: row.categories?.name,
          image: row.image_url
            ? String(row.image_url).split(",").map((image: string) => crackerImage(image.trim()))
            : ["/assets/img/logo/logo-product.png"],
          actual_price: Number(row.actual_price) || price,
          offer_price: price,
          discount_percentage: row.discount_percentage ?? 0,
          content: row.content ?? "",
          stock: row.stock,
          quantity: line.quantity,
          totalPrice: line.quantity * price,
        } as unknown as CartItem;
      }
    }

    if (!item) {
      skipped.push(label);
      continue;
    }
    if (Math.abs(item.offer_price - Number(line.price)) > 0.005) repriced++;

    // The same product on two lines becomes one cart line, as the cart keeps it.
    const existing = items.find((it) => it.id === item!.id && !!it.is_pack === !!item!.is_pack);
    if (existing) {
      existing.quantity += item.quantity;
      existing.totalPrice = existing.quantity * existing.offer_price;
    } else {
      items.push(item);
    }
  }

  // Orders taken before District was asked for have none; the customer's
  // latest order that does is the next best, as the customer lookup does.
  let district = (order.district || "").trim();
  if (!district && order.phone) {
    district = (await customerOrderExtras(order.phone)).district;
  }

  return {
    items,
    skipped,
    repriced,
    delivery: {
      customerName: order.full_name || "",
      email: order.email || "",
      phone: order.phone || "",
      alternatePhone: order.alternate_phone || "",
      // Credit for a referral belongs to the order it was given on; a copy
      // for someone else should not inherit it unnoticed.
      referralPhone: "",
      address: order.address || "",
      city: order.city || "",
      state: order.state || "",
      district,
      pincode: order.pincode || "",
      country: "India",
    },
  };
}
