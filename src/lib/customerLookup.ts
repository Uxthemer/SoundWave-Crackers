import { supabase } from "./supabase";

/**
 * Finding an existing customer, for staff placing an order on someone's
 * behalf -- by phone, or by name, place or pincode.
 *
 * Staff only. Both sources are read under the caller's own RLS: an admin sees
 * every order and profile, anyone else would get back only their own rows, so
 * nothing here widens what a browser can read.
 */

export interface CustomerMatch {
  /** Digits only -- the identity customer_summary groups on. */
  key: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  /** Orders already on file for this number; 0 for an account with none. */
  totalOrders: number;
  hasAccount: boolean;
}

export type LookupMode = "phone" | "any";

/** Fewer digits than this match half the customer list, which helps nobody. */
export const MIN_LOOKUP_DIGITS = 4;
/** The same for a name or a place. */
export const MIN_LOOKUP_LETTERS = 2;

/**
 * The part of a phone worth matching on: digits only, and the last ten of
 * them, so "+91 97897 94518" and "9789794518" look up the same person.
 */
export function phoneLookupDigits(value: string): string {
  return value.replace(/\D/g, "").slice(-10);
}

/**
 * The words of a free-text search. PostgREST's or() filter is a comma
 * separated list with brackets, so those characters cannot go through as
 * part of a value -- and nobody's name or town needs them.
 */
function searchTerms(value: string): string[] {
  return value
    .replace(/[,()*%\\]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Whether there is enough typed to be worth a lookup. */
export function isLookupReady(value: string, mode: LookupMode): boolean {
  if (mode === "phone") return phoneLookupDigits(value).length >= MIN_LOOKUP_DIGITS;
  const terms = searchTerms(value);
  if (terms.length === 0) return false;
  // A number on its own is a phone or a pincode; a word, a name or a place.
  return terms.every((t) => /^\d+$/.test(t))
    ? terms.join("").length >= MIN_LOOKUP_DIGITS
    : terms.join("").length >= MIN_LOOKUP_LETTERS;
}

const text = (v: unknown) => (v == null ? "" : String(v));

/**
 * One or() group per word, so every word has to match somewhere but each may
 * match a different field: "ravi chennai" is Ravi, in Chennai.
 */
function orFilters(terms: string[], columns: string[], phoneColumn: string): string[] {
  return terms.map((term) => {
    const parts = columns.map((c) => `${c}.ilike.%${term}%`);
    if (/^\d+$/.test(term)) parts.push(`${phoneColumn}.ilike.%${term}%`);
    return parts.join(",");
  });
}

/**
 * Customers matching what was typed, most orders first.
 *
 * Past orders come from customer_summary, which already collapses every way
 * a number has been typed into one row and carries the latest address. An
 * account that has never ordered is not in that view, so profiles are read as
 * well and added where their number is not already listed.
 */
export async function searchCustomers(value: string, mode: LookupMode): Promise<CustomerMatch[]> {
  if (!isLookupReady(value, mode)) return [];

  let summaryQuery = supabase
    .from("customer_summary")
    .select("id, phone, name, email, address, city, district, state, pincode, total_orders, has_account");
  let profileQuery = supabase
    .from("user_profiles")
    .select("full_name, email, phone, address, city, state, pincode");

  if (mode === "phone") {
    const digits = phoneLookupDigits(value);
    summaryQuery = summaryQuery.ilike("id", `%${digits}%`);
    profileQuery = profileQuery.ilike("phone", `%${digits}%`);
  } else {
    const terms = searchTerms(value);
    for (const f of orFilters(terms, ["name", "city", "district", "state", "address", "pincode"], "id")) {
      summaryQuery = summaryQuery.or(f);
    }
    for (const f of orFilters(terms, ["full_name", "city", "state", "address", "pincode"], "phone")) {
      profileQuery = profileQuery.or(f);
    }
  }

  const [summaryRes, profilesRes] = await Promise.all([
    summaryQuery.order("total_orders", { ascending: false }).limit(10),
    profileQuery.limit(10),
  ]);

  // A failed lookup should never stop an order being typed in by hand.
  if (summaryRes.error) console.error("Customer lookup failed:", summaryRes.error);
  if (profilesRes.error) console.error("Profile lookup failed:", profilesRes.error);

  const matches: CustomerMatch[] = (summaryRes.data || []).map((c: any) => ({
    key: text(c.id),
    name: text(c.name),
    email: text(c.email),
    phone: text(c.phone),
    address: text(c.address),
    city: text(c.city),
    district: text(c.district),
    state: text(c.state),
    pincode: text(c.pincode),
    totalOrders: Number(c.total_orders || 0),
    hasAccount: !!c.has_account,
  }));

  const seen = new Set(matches.map((m) => m.key.slice(-10)));
  for (const p of profilesRes.data || []) {
    const key = text(p.phone).replace(/\D/g, "");
    if (!key || seen.has(key.slice(-10))) continue;
    seen.add(key.slice(-10));
    matches.push({
      key,
      name: text(p.full_name),
      email: text(p.email),
      phone: text(p.phone),
      address: text(p.address),
      city: text(p.city),
      district: "",
      state: text(p.state),
      pincode: text(p.pincode),
      totalOrders: 0,
      hasAccount: true,
    });
  }

  return matches;
}

/**
 * What customer_summary leaves out or may have blank, from the customer's
 * order history: the alternate number, and the district.
 *
 * The summary takes the address from the latest order only, and an order
 * keyed in through New Order has no district at all -- so a customer whose
 * last order came in that way showed a blank district even though every
 * earlier order had one. Each field is taken from the latest order that has
 * it.
 */
export async function customerOrderExtras(
  phone: string
): Promise<{ alternatePhone: string; district: string }> {
  const digits = phoneLookupDigits(phone);
  if (!digits) return { alternatePhone: "", district: "" };
  const { data, error } = await supabase
    .from("orders")
    .select("alternate_phone, district")
    .ilike("phone", `%${digits}%`)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error || !data) return { alternatePhone: "", district: "" };
  const firstSet = (field: "alternate_phone" | "district") =>
    text(data.find((o: any) => text(o[field]).trim())?.[field]).trim();
  return { alternatePhone: firstSet("alternate_phone"), district: firstSet("district") };
}
