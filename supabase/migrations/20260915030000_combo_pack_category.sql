/*
  # Family packs sit in a category, like every other product

  The storefront lists products by category, and there is already a Family
  Pack category. A pack now belongs to one, so it is listed there on Quick
  Purchase and Explore Crackers exactly as a product is, and opens on the
  product page like one.

  combo_pack_catalog gains what a product card needs and a pack did not have:

    * category_id / categories      -- where it is listed, in the same shape
                                       season_catalog uses;
    * components_actual_total       -- the struck-out price, from the
                                       contents' actual prices, so "90% OFF"
                                       reads the same as on any product;
    * available_packs               -- how many whole packs the stock of the
                                       contents can make. A pack is out of
                                       stock when any one thing in it is.
*/

ALTER TABLE public.combo_packs
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS combo_packs_category_idx ON public.combo_packs (category_id);

-- Existing packs go to the family / combo category, if there is one. The
-- earliest-ordered match wins, so "Family Pack" beats a later "Family Gift".
UPDATE public.combo_packs cp
SET category_id = (
  SELECT c.id
  FROM public.categories c
  WHERE c.name ILIKE '%family%' OR c.name ILIKE '%combo%'
  ORDER BY c."order" NULLS LAST, c.name
  LIMIT 1
)
WHERE cp.category_id IS NULL;

-- New columns are appended at the end: CREATE OR REPLACE VIEW cannot move or
-- rename the ones already there.
CREATE OR REPLACE VIEW public.combo_pack_catalog
WITH (security_invoker = true) AS
SELECT
  cp.id,
  cp.season_id,
  cp.name,
  cp.pack_code,
  cp.description,
  cp.image_url,
  cp.pack_price,
  cp.is_active,
  cp.display_order,
  COALESCE(parts.item_count, 0)       AS item_count,
  COALESCE(parts.total_quantity, 0)   AS total_quantity,
  COALESCE(parts.components_total, 0) AS components_total,
  COALESCE(parts.components, '[]'::jsonb) AS components,
  cp.category_id,
  CASE WHEN c.id IS NULL THEN NULL ELSE
    jsonb_build_object(
      'id', c.id, 'name', c.name,
      'description', c.description, 'image_url', c.image_url
    )
  END AS categories,
  COALESCE(parts.components_actual_total, 0) AS components_actual_total,
  COALESCE(parts.available_packs, 0)         AS available_packs
FROM public.combo_packs cp
LEFT JOIN public.categories c ON c.id = cp.category_id
LEFT JOIN LATERAL (
  SELECT
    count(*)                       AS item_count,
    COALESCE(sum(cpi.quantity), 0) AS total_quantity,
    COALESCE(sum(cpi.quantity * COALESCE(ps.offer_price, 0)), 0)  AS components_total,
    COALESCE(sum(cpi.quantity * COALESCE(ps.actual_price, 0)), 0) AS components_actual_total,
    -- Whole packs the shelf can make: the scarcest component decides.
    GREATEST(
      COALESCE(min(floor(GREATEST(COALESCE(ps.stock, 0), 0)::numeric / cpi.quantity)), 0),
      0
    )::integer AS available_packs,
    jsonb_agg(
      jsonb_build_object(
        'product_id',   p.id,
        'name',         p.name,
        'product_code', p.product_code,
        'content',      ps.content,
        'quantity',     cpi.quantity,
        'offer_price',  COALESCE(ps.offer_price, 0),
        'actual_price', COALESCE(ps.actual_price, 0),
        'stock',        COALESCE(ps.stock, 0),
        'image_url',    p.image_url
      )
      ORDER BY ps.display_order NULLS LAST, p.name
    ) AS components
  FROM public.combo_pack_items cpi
  JOIN public.products p ON p.id = cpi.product_id
  LEFT JOIN public.product_seasons ps
    ON ps.product_id = cpi.product_id AND ps.season_id = cp.season_id
  WHERE cpi.combo_pack_id = cp.id
) parts ON true;

GRANT SELECT ON public.combo_pack_catalog TO anon, authenticated;
