/**
 * Catalog ordering and product-code generation.
 *
 * The printed price list is read top to bottom, so the order categories and
 * products appear in is real business data, not a display preference. It is
 * arranged by dragging rows in Stock Management and stored as
 * `categories."order"` and `product_seasons.display_order`.
 *
 * These are pure functions so the drag interaction stays a thin shell over
 * them: work out the new sequence, diff it, write only what moved.
 */

export const PRODUCT_CODE_PREFIX = "SWC-P";

/** Anything a list here needs: an id and a position that may not be set yet. */
export interface Orderable {
  id: string;
  order?: number | null;
}

/**
 * Sorts by stored position, falling back to a tiebreaker so rows that have
 * never been ordered do not shuffle between renders.
 *
 * Unpositioned rows sort last: a NULL means "nobody has placed this yet",
 * which belongs at the end of a list, not silently at the top where 0 would
 * put it.
 */
export function byOrder<T extends Orderable>(
  items: T[],
  tiebreak: (item: T) => string = (item) => item.id
): T[] {
  return [...items].sort((a, b) => {
    const aPos = a.order ?? Number.MAX_SAFE_INTEGER;
    const bPos = b.order ?? Number.MAX_SAFE_INTEGER;
    if (aPos !== bPos) return aPos - bPos;
    return tiebreak(a).localeCompare(tiebreak(b));
  });
}

/**
 * Moves the item at `from` to sit at `to` within one list.
 * Returns a new array; the input is untouched.
 */
export function moveWithin<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/**
 * Renumbers a list 1..n and returns only the items whose position actually
 * changed. Dragging one row usually shifts a handful of neighbours, not the
 * whole category, so writing the diff keeps a drag to a few small updates.
 */
export function renumber<T extends Orderable>(
  items: T[]
): { id: string; order: number }[] {
  const changed: { id: string; order: number }[] = [];
  items.forEach((item, index) => {
    const position = index + 1;
    if (item.order !== position) changed.push({ id: item.id, order: position });
  });
  return changed;
}

/**
 * Highest SWC-P number already in use, ignoring codes in any other format so
 * a hand-typed code never blocks generation.
 */
export function highestProductCodeNumber(codes: (string | null | undefined)[]): number {
  const pattern = new RegExp(`^${PRODUCT_CODE_PREFIX}(\\d+)$`, "i");
  return codes.reduce<number>((highest, code) => {
    const match = pattern.exec(String(code ?? "").trim());
    if (!match) return highest;
    return Math.max(highest, Number(match[1]));
  }, 0);
}

/**
 * The next `count` product codes, continuing from the highest already in use.
 *
 * Numbering continues past the highest rather than counting rows, so deleting
 * a product never causes the next one to reuse a retired code — codes end up
 * printed on boxes and quoted back over the phone.
 */
export function nextProductCodes(
  existingCodes: (string | null | undefined)[],
  count: number
): string[] {
  const start = highestProductCodeNumber(existingCodes);
  return Array.from(
    { length: count },
    (_, index) => `${PRODUCT_CODE_PREFIX}${start + index + 1}`
  );
}

/** Convenience for the single-product Add form. */
export function nextProductCode(
  existingCodes: (string | null | undefined)[]
): string {
  return nextProductCodes(existingCodes, 1)[0];
}

/** The position a new product takes at the end of its category. */
export function nextOrderInCategory(
  items: { category_id?: string | null; order?: number | null }[],
  categoryId: string | null | undefined
): number {
  const positions = items
    .filter((item) => item.category_id === categoryId)
    .map((item) => item.order ?? 0);
  return positions.length ? Math.max(...positions) + 1 : 1;
}
