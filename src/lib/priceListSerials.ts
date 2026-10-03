/**
 * The catalogue as the customer sees it numbered on the printed price list.
 *
 * Customers write their order against our own price list, copying the S.No
 * from it: "12", "13", "21". That number is worth more than any amount of
 * handwriting recognition, because it is exact -- it identifies a product
 * outright instead of guessing at a scrawled name. So the scan resolves it
 * first and uses the written name only to confirm the answer.
 *
 * For that to work the numbering here has to be the SAME numbering the PDF
 * prints. It is not stored anywhere: `priceListPdf.ts` counts it out as it
 * lays the table (`let serial = 1`), running down the categories in their
 * order and the products in theirs, with the category bands not consuming a
 * number. This file reproduces that walk exactly.
 *
 * If you change how the price list is ordered or numbered, change it here
 * too, or the scan will quietly resolve every serial to the wrong product.
 */

import { supabase } from "./supabase";

export interface CatalogueEntry {
  id: string;
  name: string;
  productCode: string | null;
  content: string | null;
  actualPrice: number | null;
  offerPrice: number | null;
  category: string;
  /** Its S.No on the price list, 1-based. */
  serial: number;
  /**
   * The whole season_catalog row. The review screen puts the chosen product
   * into the cart, and the cart wants the image, stock and discount that
   * matching has no use for.
   */
  raw: any;
}

export interface Catalogue {
  entries: CatalogueEntry[];
  bySerial: Map<number, CatalogueEntry>;
  /** Upper-cased product_code to entry, for sheets that quote our codes. */
  byCode: Map<string, CatalogueEntry>;
}

export async function loadCatalogue(seasonId: string): Promise<Catalogue> {
  const [catalogRes, categoryRes] = await Promise.all([
    supabase
      .from("season_catalog")
      // Every column: matching needs a handful, but the chosen product goes
      // straight into the cart afterwards and that wants the image, stock and
      // discount too. `season_catalog` is the view the storefront already
      // reads with a star select, so no cost column is exposed by doing it.
      .select("*")
      .eq("season_id", seasonId)
      .eq("is_active", true)
      .order("order", { nullsFirst: false })
      .order("name"),
    supabase.from("categories").select("id, name, order"),
  ]);
  if (catalogRes.error) throw catalogRes.error;
  if (categoryRes.error) throw categoryRes.error;

  const categoryOrder = new Map<string, number>();
  ((categoryRes.data ?? []) as { id: string; order: number | null }[]).forEach((category) =>
    categoryOrder.set(category.id, category.order ?? Number.MAX_SAFE_INTEGER)
  );

  // Grouped by category name and first-seen, which is what the price list
  // does -- two categories sharing a name print as one band there, so they
  // have to share one here or every serial after them is off by the size of
  // the duplicate.
  interface Group {
    name: string;
    position: number;
    rows: any[];
  }
  const groups = new Map<string, Group>();
  ((catalogRes.data ?? []) as any[]).forEach((row) => {
    const name = row.categories?.name ?? "Uncategorised";
    if (!groups.has(name)) {
      groups.set(name, {
        name,
        position: categoryOrder.get(row.category_id) ?? Number.MAX_SAFE_INTEGER,
        rows: [],
      });
    }
    groups.get(name)!.rows.push(row);
  });

  const entries: CatalogueEntry[] = [];
  let serial = 1;
  [...groups.values()]
    .sort((a, b) => a.position - b.position)
    .forEach((group) => {
      group.rows.forEach((row) => {
        entries.push({
          id: row.id,
          name: row.name,
          productCode: row.product_code ?? null,
          content: row.content ?? null,
          actualPrice: row.actual_price == null ? null : Number(row.actual_price),
          offerPrice: row.offer_price == null ? null : Number(row.offer_price),
          category: group.name,
          serial: serial,
          raw: row,
        });
        serial += 1;
      });
    });

  return {
    entries,
    bySerial: new Map(entries.map((entry) => [entry.serial, entry])),
    byCode: new Map(
      entries
        .filter((entry) => entry.productCode)
        .map((entry) => [entry.productCode!.toUpperCase(), entry])
    ),
  };
}
