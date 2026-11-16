import { supabase } from "./supabase";

/**
 * The district an order was delivered to, for the District-wise Sales chart.
 *
 * Many orders carry no district: everything placed before the cart asked for
 * one, guest orders from the same time, and orders corrected in the edit popup
 * before it saved the field. They all fell into one "Unknown" bar that was
 * taller than any real district. Nothing is written back -- the orders stay as
 * they were -- but the chart can usually say where they went, because the rest
 * of the order does:
 *
 *  1. the district on the order, spelled as the districts table spells it;
 *  2. the district other orders with the same PIN code were given (a PIN code
 *     sits in one district, so this is close to certain);
 *  3. the city, when it is itself a district of the order's state -- "Madurai",
 *     "Salem", "Chennai" are both;
 *  4. the district other orders from the same city were given, the most
 *     common one if they disagree.
 *
 * What is left has nothing to go on and is reported as NOT_RECORDED.
 */

export const NOT_RECORDED = "Not recorded";

/**
 * Collapses the spellings of one place into a single bucket, for the city and
 * state charts (Analytics, the season report).
 *
 * Addresses are typed by customers, so "chennai", "Chennai " and "CHENNAI"
 * arrive as three separate places and split one town's sales three ways.
 */
export function normalisePlace(value: unknown): string {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return NOT_RECORDED;
  return text
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

interface OrderPlace {
  id: string;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

/** Lower case, punctuation dropped, spaces collapsed: "Tiruchirappalli." = "tiruchirappalli". */
const key = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[.,\-_/()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const pinKey = (value: unknown) => String(value ?? "").replace(/\D/g, "").slice(0, 6);

/** The most common value in a tally, or undefined for an empty one. */
function mostCommon(tally: Map<string, number> | undefined) {
  if (!tally) return undefined;
  let best: string | undefined;
  let bestCount = 0;
  tally.forEach((count, value) => {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  });
  return best;
}

function addTo(index: Map<string, Map<string, number>>, k: string, district: string) {
  if (!k) return;
  const tally = index.get(k) ?? new Map<string, number>();
  tally.set(district, (tally.get(district) || 0) + 1);
  index.set(k, tally);
}

/**
 * Each order's district, by order id. Reads the districts and states tables
 * once; a failure there still resolves from the orders themselves.
 */
export async function resolveOrderDistricts(
  orders: OrderPlace[]
): Promise<Map<string, string>> {
  // The official spelling of every district, and which state it is in.
  const official = new Map<string, string>(); // key(name) -> name
  const officialInState = new Map<string, string>(); // key(state)|key(name) -> name
  try {
    const [statesRes, districtsRes] = await Promise.all([
      supabase.from("states").select("id, name"),
      supabase.from("districts").select("name, state_id"),
    ]);
    const stateName = new Map(
      ((statesRes.data || []) as { id: number; name: string }[]).map((s) => [s.id, s.name])
    );
    ((districtsRes.data || []) as { name: string; state_id: number }[]).forEach((d) => {
      if (!official.has(key(d.name))) official.set(key(d.name), d.name);
      officialInState.set(`${key(stateName.get(d.state_id))}|${key(d.name)}`, d.name);
    });
  } catch (error) {
    console.error("Districts list unavailable; resolving from orders only:", error);
  }

  // The table's own spelling ("YSR Kadapa") where it knows the district;
  // otherwise title case, so "TRICHY" and "trichy " are one bar.
  const spell = (district: string) =>
    official.get(key(district)) ??
    key(district)
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

  // What the orders that do have a district say about PIN codes and cities.
  const byPin = new Map<string, Map<string, number>>();
  const byCity = new Map<string, Map<string, number>>();
  orders.forEach((order) => {
    if (!key(order.district)) return;
    const district = spell(String(order.district));
    addTo(byPin, pinKey(order.pincode), district);
    addTo(byCity, `${key(order.state)}|${key(order.city)}`, district);
  });

  const resolved = new Map<string, string>();
  orders.forEach((order) => {
    const cityKey = `${key(order.state)}|${key(order.city)}`;
    const district =
      (key(order.district) ? spell(String(order.district)) : undefined) ??
      (pinKey(order.pincode).length === 6
        ? mostCommon(byPin.get(pinKey(order.pincode)))
        : undefined) ??
      (key(order.city) ? officialInState.get(cityKey) : undefined) ??
      (key(order.city) ? mostCommon(byCity.get(cityKey)) : undefined);
    resolved.set(order.id, district || NOT_RECORDED);
  });
  return resolved;
}
