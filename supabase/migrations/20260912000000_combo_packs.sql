/*
  # Combo / family packs

  A family pack is a named bundle sold at one rate: "Family Pack 1" might be a
  packet of kuruvi, one 30-shot and one 60-shot, for a single price. The
  customer buys the pack; the godown hands over the individual items, so the
  stock that has to move is the stock of the components.

  Packs belong to a SEASON, the same way prices and stock do. Last year's pack
  had last year's contents at last year's rate, and an archived season has to
  reproduce both.

  Nothing here changes how an ordinary product is ordered. order_items gains a
  nullable combo_pack_id, and a row is now either a product line or a pack
  line -- never both, never neither.
*/

-- ---------------------------------------------------------------------------
-- 1. The pack, and what is in it
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.combo_packs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id     uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  name          text NOT NULL,
  pack_code     text,
  description   text,
  image_url     text,
  -- What the customer pays for the whole pack. The components' total is shown
  -- beside it in the admin screen so the margin is visible, but the rate is
  -- set by hand: a pack is priced to be attractive, not summed.
  pack_price    numeric NOT NULL DEFAULT 0 CHECK (pack_price >= 0),
  is_active     boolean NOT NULL DEFAULT true,
  display_order integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id),
  UNIQUE (season_id, name)
);

CREATE INDEX IF NOT EXISTS combo_packs_season_active_idx
  ON public.combo_packs (season_id, is_active);

CREATE TABLE IF NOT EXISTS public.combo_pack_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_pack_id uuid NOT NULL REFERENCES public.combo_packs(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity      integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- One line per product: two entries for the same item would make the pack
  -- contents ambiguous both to read and to edit.
  UNIQUE (combo_pack_id, product_id)
);

CREATE INDEX IF NOT EXISTS combo_pack_items_pack_idx
  ON public.combo_pack_items (combo_pack_id);
CREATE INDEX IF NOT EXISTS combo_pack_items_product_idx
  ON public.combo_pack_items (product_id);

DROP TRIGGER IF EXISTS combo_packs_touch ON public.combo_packs;
CREATE TRIGGER combo_packs_touch
  BEFORE UPDATE ON public.combo_packs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. An order line may be a product or a pack
-- ---------------------------------------------------------------------------

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS combo_pack_id uuid REFERENCES public.combo_packs(id);

-- product_id was NOT NULL by way of being the only thing a line could be.
ALTER TABLE public.order_items ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_product_or_pack;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_product_or_pack
  CHECK (
    (product_id IS NOT NULL AND combo_pack_id IS NULL) OR
    (product_id IS NULL AND combo_pack_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS order_items_combo_pack_idx
  ON public.order_items (combo_pack_id);

-- Quotations quote packs too, where that table exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'quotation_items') THEN
    ALTER TABLE public.quotation_items
      ADD COLUMN IF NOT EXISTS combo_pack_id uuid REFERENCES public.combo_packs(id);
    ALTER TABLE public.quotation_items ALTER COLUMN product_id DROP NOT NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. combo_pack_catalog -- what a shopper sees
--
-- Components ride along as jsonb rather than costing a second round trip: the
-- pack is useless on screen without the list of what is in it.
-- ---------------------------------------------------------------------------

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
  -- What the same goods would cost bought separately, for the "you save" line.
  COALESCE(parts.components_total, 0) AS components_total,
  COALESCE(parts.components, '[]'::jsonb) AS components
FROM public.combo_packs cp
LEFT JOIN LATERAL (
  SELECT
    count(*)                       AS item_count,
    COALESCE(sum(cpi.quantity), 0) AS total_quantity,
    COALESCE(sum(cpi.quantity * COALESCE(ps.offer_price, 0)), 0) AS components_total,
    jsonb_agg(
      jsonb_build_object(
        'product_id',   p.id,
        'name',         p.name,
        'product_code', p.product_code,
        'content',      ps.content,
        'quantity',     cpi.quantity,
        'offer_price',  COALESCE(ps.offer_price, 0),
        'actual_price', COALESCE(ps.actual_price, 0),
        'stock',        COALESCE(ps.stock, 0)
      )
      ORDER BY ps.display_order NULLS LAST, p.name
    ) AS components
  FROM public.combo_pack_items cpi
  JOIN public.products p ON p.id = cpi.product_id
  LEFT JOIN public.product_seasons ps
    ON ps.product_id = cpi.product_id AND ps.season_id = cp.season_id
  WHERE cpi.combo_pack_id = cp.id
) parts ON true;

-- ---------------------------------------------------------------------------
-- 4. combo_pack_economics -- the same pack with cost in it
--
-- Kept apart from the catalog view because APR is never public: RLS on
-- product_season_costs restricts the rows, and this view is granted only to
-- authenticated users so anon cannot reach it at all.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.combo_pack_economics
WITH (security_invoker = true) AS
SELECT
  cp.id,
  cp.season_id,
  cp.name,
  cp.pack_price,
  COALESCE(parts.components_total, 0) AS components_total,
  COALESCE(parts.apr_total, 0)        AS apr_total,
  -- Margin on the rate actually charged, not on the components' total.
  cp.pack_price - COALESCE(parts.apr_total, 0) AS profit,
  CASE
    WHEN cp.pack_price > 0
      THEN round(
        ((cp.pack_price - COALESCE(parts.apr_total, 0)) / cp.pack_price) * 100,
        2
      )
    ELSE 0
  END AS margin_percentage
FROM public.combo_packs cp
LEFT JOIN LATERAL (
  SELECT
    COALESCE(sum(cpi.quantity * COALESCE(ps.offer_price, 0)), 0) AS components_total,
    COALESCE(sum(cpi.quantity * COALESCE(psc.apr, 0)), 0)        AS apr_total
  FROM public.combo_pack_items cpi
  LEFT JOIN public.product_seasons ps
    ON ps.product_id = cpi.product_id AND ps.season_id = cp.season_id
  LEFT JOIN public.product_season_costs psc
    ON psc.product_id = cpi.product_id AND psc.season_id = cp.season_id
  WHERE cpi.combo_pack_id = cp.id
) parts ON true;

-- ---------------------------------------------------------------------------
-- 5. Closed seasons stay frozen
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS combo_packs_freeze ON public.combo_packs;
CREATE TRIGGER combo_packs_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.combo_packs
  FOR EACH ROW EXECUTE FUNCTION public.reject_closed_season_write();

-- ---------------------------------------------------------------------------
-- 6. RLS
--
-- Same shape as product_seasons: the active season's packs are public, every
-- season's packs are visible to admins, and only admins may write.
-- ---------------------------------------------------------------------------

ALTER TABLE public.combo_packs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combo_pack_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active season packs are public" ON public.combo_packs;
CREATE POLICY "Active season packs are public"
  ON public.combo_packs FOR SELECT TO public
  USING (season_id = public.current_season_id() AND is_active);

DROP POLICY IF EXISTS "Admins can view all packs" ON public.combo_packs;
CREATE POLICY "Admins can view all packs"
  ON public.combo_packs FOR SELECT TO authenticated
  USING (public.season_is_admin());

DROP POLICY IF EXISTS "Admins can manage packs" ON public.combo_packs;
CREATE POLICY "Admins can manage packs"
  ON public.combo_packs FOR ALL TO authenticated
  USING (public.season_is_admin())
  WITH CHECK (public.season_is_admin());

DROP POLICY IF EXISTS "Active season pack items are public" ON public.combo_pack_items;
CREATE POLICY "Active season pack items are public"
  ON public.combo_pack_items FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.combo_packs cp
    WHERE cp.id = combo_pack_id
      AND cp.season_id = public.current_season_id()
      AND cp.is_active
  ));

DROP POLICY IF EXISTS "Admins can view all pack items" ON public.combo_pack_items;
CREATE POLICY "Admins can view all pack items"
  ON public.combo_pack_items FOR SELECT TO authenticated
  USING (public.season_is_admin());

DROP POLICY IF EXISTS "Admins can manage pack items" ON public.combo_pack_items;
CREATE POLICY "Admins can manage pack items"
  ON public.combo_pack_items FOR ALL TO authenticated
  USING (public.season_is_admin())
  WITH CHECK (public.season_is_admin());

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.combo_packs        TO anon, authenticated;
GRANT SELECT ON public.combo_pack_items   TO anon, authenticated;
GRANT SELECT ON public.combo_pack_catalog TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.combo_packs      TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.combo_pack_items TO authenticated;

-- Cost never reaches an anonymous visitor.
REVOKE ALL ON public.combo_pack_economics FROM anon;
GRANT SELECT ON public.combo_pack_economics TO authenticated;

COMMENT ON TABLE public.combo_packs IS
  'Named bundles sold at one rate, per season. Stock moves on the components, '
  'not on the pack -- see order_item_components().';
