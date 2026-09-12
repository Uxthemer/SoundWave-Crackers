/**
 * Where a product image lives.
 *
 * Product photos have always been files shipped with the site, stored in the
 * database by name ("flower-pot.png") under /assets/img/crackers/. Images
 * uploaded in the admin panel are stored as a full link instead. Both kinds
 * go through here, so a card never has to know which one it has.
 */
export function crackerImage(value: string | null | undefined): string {
  const name = String(value ?? "").trim();
  if (!name) return "/assets/img/logo/logo-product.png";
  if (/^(https?:)?\/\//i.test(name) || name.startsWith("/")) return name;
  return `/assets/img/crackers/${name}`;
}
