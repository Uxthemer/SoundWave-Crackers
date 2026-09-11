/**
 * Price-list arithmetic.
 *
 * The price list is entered offer-price-first: the selling price is what gets
 * negotiated per product, and the struck-out "actual" price shown next to it is
 * derived from a single discount percentage configured for the season.
 *
 *   actual = offer / (1 - discount/100)      offer 8 at 80% -> 40
 *
 * Kept in one place so the add form, the edit modal, inline editing and the
 * bulk re-price all round identically — a price list where two screens disagree
 * by a paisa is a price list nobody trusts.
 */

/** Highest discount that still leaves a finite actual price. */
const MAX_DISCOUNT = 99.99;

export function isUsableDiscount(discount: number | null | undefined): boolean {
  return (
    typeof discount === "number" &&
    Number.isFinite(discount) &&
    discount > 0 &&
    discount <= MAX_DISCOUNT
  );
}

/**
 * Actual (struck-out) price for an offer price at the given discount.
 * Returns null when either input cannot produce a meaningful price, so callers
 * can leave the field untouched rather than writing a 0 or an Infinity.
 */
export function actualFromOffer(
  offerPrice: number | null | undefined,
  discount: number | null | undefined
): number | null {
  if (!isUsableDiscount(discount)) return null;
  const offer = Number(offerPrice);
  if (!Number.isFinite(offer) || offer <= 0) return null;

  return round2(offer / (1 - (discount as number) / 100));
}

/** Round to paise. Prices are money, so never leave float noise in them. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Trims a trailing ".00" so whole-rupee prices print as "40", not "40.00". */
export function formatPrice(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
