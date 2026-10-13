import { supabase } from "./supabase";
import { CANCELLED_STATUS, netAmount, statusOf } from "./revenueStages";

/**
 * Referral bonuses: every order placed with someone's phone in "Referred by",
 * grouped by that phone, with the referrer's name where the number belongs to
 * a known customer.
 *
 * The phone is grouped on its last ten digits, so "+91 97897 94518" and
 * "9789794518" are one referrer -- the same rule customer lookup and order
 * tracking use. A cancelled order earns nobody a bonus and is left out.
 */

/** 5% of what the referred customer pays, after discount. */
export const REFERRAL_RATE = 0.05;

export interface ReferredOrder {
  id: string;
  shortId: string | null;
  customer: string;
  createdAt: string;
  status: string;
  amount: number;
}

export interface Referrer {
  /** The last ten digits -- the key. */
  phone: string;
  /** As typed on the most recent order, for display. */
  phoneDisplay: string;
  /** Null when the number is not a customer's or an account's. */
  name: string | null;
  orders: ReferredOrder[];
  ordersCount: number;
  totalValue: number;
  bonus: number;
}

const lastTen = (value: unknown) => String(value ?? "").replace(/\D/g, "").slice(-10);

export async function buildReferrals(orders: any[]): Promise<Referrer[]> {
  const byPhone = new Map<string, Referrer>();

  [...orders]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .forEach((o) => {
      const phone = lastTen(o.referred_by);
      if (phone.length < 10 || statusOf(o) === CANCELLED_STATUS) return;
      const entry =
        byPhone.get(phone) ??
        {
          phone,
          phoneDisplay: String(o.referred_by).trim(),
          name: null,
          orders: [],
          ordersCount: 0,
          totalValue: 0,
          bonus: 0,
        };
      const amount = netAmount(o);
      entry.orders.push({
        id: o.id,
        shortId: o.short_id ?? null,
        customer: o.full_name ?? "",
        createdAt: o.created_at,
        status: o.status ?? "",
        amount,
      });
      entry.ordersCount += 1;
      entry.totalValue += amount;
      byPhone.set(phone, entry);
    });

  const referrers = [...byPhone.values()];
  referrers.forEach((r) => (r.bonus = r.totalValue * REFERRAL_RATE));
  if (!referrers.length) return referrers;

  // Names: a customer who has ordered (customer_summary, keyed on the phone's
  // digits as they were typed -- so with or without the 91), else an account.
  const phones = referrers.map((r) => r.phone);
  const keys = phones.flatMap((p) => [p, `91${p}`, `0${p}`]);
  const [summaryRes, profilesRes] = await Promise.all([
    supabase.from("customer_summary").select("id, name").in("id", keys),
    supabase
      .from("user_profiles")
      .select("full_name, phone")
      .in("phone", phones.flatMap((p) => [p, `91${p}`, `+91${p}`, `+91 ${p}`, `0${p}`])),
  ]);
  if (summaryRes.error) console.warn("Referrer names (orders) failed:", summaryRes.error);
  if (profilesRes.error) console.warn("Referrer names (accounts) failed:", profilesRes.error);

  const names = new Map<string, string>();
  (profilesRes.data || []).forEach((p: any) => {
    const name = String(p.full_name ?? "").trim();
    if (name) names.set(lastTen(p.phone), name);
  });
  // The name on their own orders wins: it is what staff know them by.
  (summaryRes.data || []).forEach((c: any) => {
    const name = String(c.name ?? "").trim();
    if (name) names.set(lastTen(c.id), name);
  });

  referrers.forEach((r) => (r.name = names.get(r.phone) ?? null));
  return referrers;
}
