/*
  # FIX: products disappeared again, this time on tamil_name

  Same trap as 20260915050000_fix_products_combo_pack_grant, one column
  later. 20260809020000_revoke_public_cost_price swapped the table-wide
  SELECT on products for an explicit column list, so a column added after
  that date is readable by nobody until it is granted by name.

  20261001000000_product_tamil_name added products.tamil_name and put it in
  season_catalog. season_catalog is security_invoker, so it reads products
  as whoever called it: every catalog read -- storefront, Cart, Quick
  Purchase, Stock Management, Analytics, signed in or not -- failed with
  "permission denied for table products" and every product list came back
  empty.

  Granting the one column restores them. It is not private: it is the
  product's name in Tamil, printed on the price list customers are handed.

  When the next column goes on products, grant it here too -- or finish the
  phase 3 drop of products.apr and put the table-wide grant back.
*/

GRANT SELECT (tamil_name) ON public.products TO anon, authenticated;
