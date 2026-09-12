/**
 * Order lines that are family packs.
 *
 * A pack line has no product_id, so every screen that reads
 * `item.product.name` — the orders table, the invoice, the exports, My Orders
 * — would show a blank where the pack should be. Rather than teach two dozen
 * call sites about packs, the pack is presented AS a product once, here,
 * right after the rows are fetched. Everything downstream keeps working
 * unchanged.
 *
 * The embed this expects is `pack:combo_packs ( id, name, pack_code )`
 * alongside the usual `product:products ( ... )`.
 */

/** The category name shown against a pack line, where a product would show its own. */
export const PACK_CATEGORY = "Family Pack";

/**
 * Packs sort to the top of a printed order. They are the headline of what was
 * bought, and a negative position puts them ahead of any catalog order.
 */
const PACK_DISPLAY_ORDER = -1;

export function isPackLine(item: any): boolean {
  return Boolean(item?.combo_pack_id);
}

/**
 * Fills in `item.product` for pack lines, in place.
 *
 * Safe to call twice and safe on rows that were fetched without the pack
 * embed — a pack line with nothing to describe it falls back to a readable
 * placeholder rather than an empty cell.
 */
export function attachPackDetails<T extends { items?: any[] }>(orders: T[]): T[] {
  (orders || []).forEach((order) => {
    (order.items || []).forEach((item: any) => {
      if (!isPackLine(item) || item.product) return;
      const pack = item.pack ?? null;
      item.product = {
        id: pack?.id ?? item.combo_pack_id,
        name: pack?.name ?? "Family pack",
        product_code: pack?.pack_code ?? null,
        categories: { name: PACK_CATEGORY },
        order: PACK_DISPLAY_ORDER,
        is_pack: true,
      };
    });
  });
  return orders;
}

/** The embed string to add to an order_items select so the above has data. */
export const PACK_EMBED = "pack:combo_packs ( id, name, pack_code )";
