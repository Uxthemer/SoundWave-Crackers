import { supabase } from "./supabase";

/**
 * Guest checkout.
 *
 * A customer without an account places an order through one SECURITY DEFINER
 * function rather than by inserting rows. The browser sends the delivery
 * details and the quantities it wants; the database decides the prices, the
 * total, the season and the order number. Nothing here is trusted with money.
 *
 * The signed-in path is untouched and still goes through `createOrder`.
 */

export interface GuestDeliveryDetails {
  customerName: string;
  email: string;
  phone: string;
  alternatePhone: string;
  referralPhone: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  country: string;
}

export interface GuestOrderResult {
  id: string;
  short_id: string;
  total_amount: number;
  item_count: number;
}

/** Where a guest's own reference is kept so they can look the order up later. */
const LAST_ORDER_KEY = "swc.lastGuestOrder";

export interface GuestOrderReference {
  short_id: string;
  phone: string;
  placed_at: string;
}

export async function createGuestOrder(input: {
  delivery: GuestDeliveryDetails;
  items: { product_id: string; quantity: number }[];
  paymentMethod: string;
}): Promise<GuestOrderResult> {
  const { data, error } = await supabase.rpc("create_guest_order", {
    p_delivery: input.delivery,
    // Only ids and quantities travel. Prices sent from a browser would be a
    // suggestion, so they are not sent at all.
    p_items: input.items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
    })),
    p_payment_method: input.paymentMethod,
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Order could not be placed. Please try again.");

  const result = data as unknown as GuestOrderResult;
  rememberGuestOrder({
    short_id: result.short_id,
    phone: input.delivery.phone,
    placed_at: new Date().toISOString(),
  });
  return result;
}

/**
 * Keeps the order number and phone on this device.
 *
 * A guest has no account to look the order up from, so without this the only
 * record is the confirmation screen they are about to close. Storage is
 * best-effort: a private window or blocked site data just means they type the
 * number in themselves.
 */
export function rememberGuestOrder(reference: GuestOrderReference) {
  try {
    localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(reference));
  } catch {
    // Nothing to do — tracking by hand still works.
  }
}

export function getRememberedGuestOrder(): GuestOrderReference | null {
  try {
    const raw = localStorage.getItem(LAST_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.short_id || !parsed?.phone) return null;
    return parsed as GuestOrderReference;
  } catch {
    return null;
  }
}

export interface TrackedOrder {
  id: string;
  short_id: string;
  status: string;
  created_at: string;
  total_amount: number;
  full_name: string;
  phone: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
}

/**
 * Looks up a guest's order. Both the reference and the phone number are
 * required — order numbers run in sequence, so one on its own would let
 * anybody page through every order ever placed.
 */
export async function trackGuestOrder(
  reference: string,
  phone: string
): Promise<TrackedOrder[]> {
  const { data, error } = await supabase.rpc("track_guest_order", {
    p_reference: reference.trim(),
    p_phone: phone.trim(),
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as TrackedOrder[];
}
