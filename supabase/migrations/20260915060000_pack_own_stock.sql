/*
  # A family pack has its own stock

  Family packs are packed in advance: loose items are made up into boxes,
  and what is sold is the box. So a listed pack is stocked like any product
  -- "how many packs are packed" -- typed in Stock Management, and an order
  for one takes a pack off that count.

  20260915040000_pack_products did the opposite: season_catalog worked a
  pack's stock out from its contents, and ordering a pack took stock from the
  loose items inside it. That showed packs as out of stock whenever any one
  item inside ran low, and a stock figure typed in for the pack was ignored.
  Both are reversed here.

  Orders already confirmed keep their stock exactly as it was taken: reversal
  (on cancel) reads the stock_movements ledger, not this rule, so an order
  that took loose items gives back loose items.
*/

-- ---------------------------------------------------------------------------
-- 1. season_catalog reports the pack's own stock
--
-- Same columns in the same order as 20260915040000; only `stock` changes.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.season_catalog
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.product_code,
  p.name,
  p.category_id,
  p.description,
  p.image_url,
  p.yt_link,
  p.product_type,
  ps.id                  AS product_season_id,
  ps.season_id,
  ps.actual_price,
  ps.offer_price,
  ps.discount_percentage,
  ps.content,
  ps.stock,
  ps.opening_stock,
  ps.closing_stock,
  ps.reorder_level,
  ps.is_active,
  ps.display_order       AS "order",
  p.created_at,
  CASE WHEN c.id IS NULL THEN NULL ELSE
    jsonb_build_object(
      'id', c.id, 'name', c.name,
      'description', c.description, 'image_url', c.image_url
    )
  END AS categories,
  p.combo_pack_id
FROM public.products p
JOIN public.product_seasons ps ON ps.product_id = p.id
LEFT JOIN public.categories c ON c.id = p.category_id;

GRANT SELECT ON public.season_catalog TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Ordering a pack takes a pack
--
-- Every product line -- a pack product included -- consumes itself. Only the
-- earlier kind of line, which named a pack directly and has no product row of
-- its own to take stock from, still expands to the pack's contents.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.order_item_components(p_item_id uuid)
RETURNS TABLE (product_id uuid, quantity integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT oi.product_id, oi.quantity
  FROM public.order_items oi
  WHERE oi.id = p_item_id
    AND oi.product_id IS NOT NULL

  UNION ALL

  SELECT cpi.product_id, cpi.quantity * oi.quantity
  FROM public.order_items oi
  JOIN public.combo_pack_items cpi ON cpi.combo_pack_id = oi.combo_pack_id
  WHERE oi.id = p_item_id
    AND oi.combo_pack_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.order_item_components(uuid) IS
  'The products and quantities one order line takes out of stock. A product '
  'line, family pack products included, takes itself.';
