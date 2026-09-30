import { supabase } from "./supabase";

/**
 * The family-pack pamphlet, as data.
 *
 * The counter hands this sheet to a walk-in customer: "what is in Family Pack
 * 2, and how much of it". So it is read fresh from the database at the moment
 * the option is clicked rather than off whatever the Stock Management screen
 * happens to be holding — a pack edited in the next room has to be on the
 * page that prints a second later.
 *
 * Only active packs appear, and only their contents. Cost never comes near
 * this file: it is a customer-facing sheet, and the cost columns are revoked
 * from the browser anyway.
 */

export interface PamphletItem {
  name: string;
  productCode: string | null;
  /** The pack content as the season records it, e.g. "10 pcs", "1 box". */
  content: string | null;
  quantity: number;
}

export interface PamphletPack {
  id: string;
  name: string;
  packCode: string | null;
  description: string | null;
  packPrice: number;
  items: PamphletItem[];
  /** Distinct products in the pack. */
  productCount: number;
  /** Every item's quantity added up — the number of pieces handed over. */
  totalQuantity: number;
}

/**
 * Reads the season's active family packs and what is in each of them.
 *
 * Three queries rather than the `combo_pack_catalog` view: the view's
 * components carry prices this sheet has no use for, and the catalog read
 * here is the same one the pack editor uses, so a name or a content string
 * reads identically in both places.
 *
 * A pack whose every line has been deleted is dropped — an empty table under
 * a pack name tells a customer nothing.
 */
export async function fetchFamilyPackPamphlet(
  seasonId: string
): Promise<PamphletPack[]> {
  const [packRes, itemRes, catalogRes] = await Promise.all([
    supabase
      .from("combo_packs")
      .select("id, name, pack_code, description, pack_price, is_active")
      .eq("season_id", seasonId)
      .eq("is_active", true)
      .order("display_order", { nullsFirst: false })
      .order("name"),
    supabase
      .from("combo_pack_items")
      .select("combo_pack_id, product_id, quantity"),
    supabase
      .from("season_catalog")
      .select('id, name, product_code, content, is_active, "order"')
      .eq("season_id", seasonId),
  ]);

  if (packRes.error) throw packRes.error;
  if (itemRes.error) throw itemRes.error;
  if (catalogRes.error) throw catalogRes.error;

  interface CatalogRow {
    name: string;
    productCode: string | null;
    content: string | null;
    order: number;
  }

  /**
   * The shapes these three reads come back in.
   *
   * Spelled out here because `combo_packs` and `combo_pack_items` are not in
   * the generated `Database` type, so the client hands them back untyped.
   */
  type PackRow = {
    id: string;
    name: string | null;
    pack_code: string | null;
    description: string | null;
    pack_price: number | string | null;
  };
  type ItemRow = {
    combo_pack_id: string;
    product_id: string;
    quantity: number | string | null;
  };
  type SeasonCatalogRow = {
    id: string;
    name: string | null;
    product_code: string | null;
    content: string | null;
    order: number | string | null;
  };

  const catalog = new Map<string, CatalogRow>(
    ((catalogRes.data ?? []) as unknown as SeasonCatalogRow[]).map((row) => [
      row.id,
      {
        name: String(row.name ?? ""),
        productCode: row.product_code ?? null,
        content: row.content ?? null,
        // Unpositioned products sort to the end rather than to the top.
        order: row.order == null ? Number.MAX_SAFE_INTEGER : Number(row.order),
      },
    ])
  );

  const itemsByPack = new Map<string, { row: CatalogRow; quantity: number }[]>();
  ((itemRes.data ?? []) as unknown as ItemRow[]).forEach((row) => {
    const product = catalog.get(row.product_id);
    // A line pointing at a product this season never listed has no name and
    // no content to print, so there is nothing to say about it.
    if (!product) return;
    const bucket = itemsByPack.get(row.combo_pack_id) ?? [];
    bucket.push({ row: product, quantity: Number(row.quantity ?? 1) });
    itemsByPack.set(row.combo_pack_id, bucket);
  });

  return ((packRes.data ?? []) as unknown as PackRow[])
    .map((pack) => {
      // Printed in catalog order, so the pamphlet lists the contents the same
      // way the price list beside it does.
      const lines = (itemsByPack.get(pack.id) ?? []).sort(
        (a, b) => a.row.order - b.row.order || a.row.name.localeCompare(b.row.name)
      );

      const items: PamphletItem[] = lines.map((line) => ({
        name: line.row.name,
        productCode: line.row.productCode,
        content: line.row.content,
        quantity: line.quantity,
      }));

      return {
        id: pack.id,
        name: String(pack.name ?? ""),
        packCode: pack.pack_code ?? null,
        description: pack.description ?? null,
        packPrice: Number(pack.pack_price ?? 0),
        items,
        productCount: items.length,
        totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      };
    })
    .filter((pack) => pack.items.length > 0);
}
