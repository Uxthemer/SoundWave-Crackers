/*
  # FIX: products disappeared from the shop and Stock Management

  20260809020000_revoke_public_cost_price replaced the table-wide SELECT on
  products with an explicit list of columns (every column but the cost
  price). A column added after that is readable by nobody until it is
  granted.

  20260915040000_pack_products added products.combo_pack_id and made
  season_catalog read it. season_catalog runs with the caller's rights
  (security_invoker), so every catalog read -- storefront, Quick Purchase,
  Stock Management, signed in or not -- failed with "permission denied for
  table products", and every product list came back empty.

  Granting the one column restores them. It holds nothing private: it only
  says which family pack a product is.
*/

GRANT SELECT (combo_pack_id) ON public.products TO anon, authenticated;
