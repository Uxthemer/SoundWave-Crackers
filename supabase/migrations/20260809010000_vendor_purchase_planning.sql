-- ============================================================================
-- Vendor economics, season-scoped vendor price lists, and purchase planning
--
-- Foundation for automatic purchase-plan and price-list generation:
--   vendors.*                  -> commercial terms (discount, GST, packing, rating)
--   vendor_price_lists         -> one upload of a vendor's price list, per season
--   vendor_price_items         -> extracted rows, terms SNAPSHOTTED, landed cost computed
--   purchase_plans / _items    -> what to buy, from whom, at what cost
--
-- Vendor prices are season-scoped because a vendor quotes new rates each
-- season. Without that, last season's quotes would be overwritten and a plan
-- could never be reproduced.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Vendor commercial terms
--
-- These are the defaults applied when a price list is imported. Each imported
-- row keeps its own copy (see vendor_price_items), so later changing a
-- vendor's terms never rewrites the cost of an existing quote or plan.
-- ---------------------------------------------------------------------------

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS discount_percent      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_percent           numeric NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS packing_percent       numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_charges_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating                numeric NOT NULL DEFAULT 3
    CHECK (rating >= 0 AND rating <= 5),
  ADD COLUMN IF NOT EXISTS lead_time_days        integer,
  ADD COLUMN IF NOT EXISTS min_order_value       numeric,
  ADD COLUMN IF NOT EXISTS is_preferred          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes                 text;

COMMENT ON COLUMN public.vendors.discount_percent IS
  'Trade discount off list price, applied before GST.';
COMMENT ON COLUMN public.vendors.packing_percent IS
  'Packing/forwarding as a percentage of list price, added to the taxable value.';
COMMENT ON COLUMN public.vendors.other_charges_percent IS
  'Transport and sundry charges as a percentage of list price, added after GST.';
COMMENT ON COLUMN public.vendors.rating IS
  '0-5. Used to break ties between vendors on near-equal price.';

-- ---------------------------------------------------------------------------
-- 2. Vendor price lists (one upload)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vendor_price_lists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  season_id   uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  source_name text,                       -- original filename
  source_type text CHECK (source_type IN ('pdf', 'excel', 'manual')),
  quoted_on   date NOT NULL DEFAULT CURRENT_DATE,
  status      text NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'confirmed', 'superseded')),
  row_count   integer NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_price_lists_season_idx
  ON public.vendor_price_lists (season_id, vendor_id);

-- ---------------------------------------------------------------------------
-- 3. Extracted price rows
--
-- product_id is nullable on purpose: extraction from a vendor PDF often cannot
-- resolve a product on the first pass. Unmatched rows stay visible so someone
-- can map them by hand rather than silently disappearing.
--
-- landed_cost is GENERATED so every comparison, plan and report computes cost
-- identically. The formula mirrors a real invoice:
--     taxable = list x (1 - discount%) + packing%  of list
--     landed  = taxable x (1 + gst%) + other% of list
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vendor_price_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id   uuid NOT NULL REFERENCES public.vendor_price_lists(id) ON DELETE CASCADE,
  vendor_id       uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  season_id       uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,

  -- What the extractor read
  raw_label       text NOT NULL,
  raw_content     text,
  product_id      uuid REFERENCES public.products(id) ON DELETE SET NULL,
  match_confidence numeric,               -- 0-1, from the matcher
  match_method    text CHECK (match_method IN ('exact_code', 'exact_name', 'fuzzy', 'manual')),

  list_price      numeric NOT NULL,

  -- Terms snapshotted from the vendor at import time; editable per row for
  -- one-off deals.
  discount_percent      numeric NOT NULL DEFAULT 0,
  packing_percent       numeric NOT NULL DEFAULT 0,
  gst_percent           numeric NOT NULL DEFAULT 0,
  other_charges_percent numeric NOT NULL DEFAULT 0,

  landed_cost numeric GENERATED ALWAYS AS (
    ROUND(
      (
        (list_price * (1 - discount_percent / 100.0))
        + (list_price * packing_percent / 100.0)
      ) * (1 + gst_percent / 100.0)
      + (list_price * other_charges_percent / 100.0)
    , 2)
  ) STORED,

  moq        integer,                     -- vendor's minimum order quantity
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_price_items_lookup_idx
  ON public.vendor_price_items (season_id, product_id, landed_cost);
CREATE INDEX IF NOT EXISTS vendor_price_items_list_idx
  ON public.vendor_price_items (price_list_id);
CREATE INDEX IF NOT EXISTS vendor_price_items_unmatched_idx
  ON public.vendor_price_items (season_id) WHERE product_id IS NULL;

-- Apply the vendor's current terms when a row arrives without explicit ones.
CREATE OR REPLACE FUNCTION public.apply_vendor_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v vendors%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.vendors WHERE id = NEW.vendor_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.discount_percent      = 0 THEN NEW.discount_percent      := v.discount_percent;      END IF;
  IF NEW.packing_percent       = 0 THEN NEW.packing_percent       := v.packing_percent;       END IF;
  IF NEW.gst_percent           = 0 THEN NEW.gst_percent           := v.gst_percent;           END IF;
  IF NEW.other_charges_percent = 0 THEN NEW.other_charges_percent := v.other_charges_percent; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_price_items_apply_terms ON public.vendor_price_items;
CREATE TRIGGER vendor_price_items_apply_terms
  BEFORE INSERT ON public.vendor_price_items
  FOR EACH ROW EXECUTE FUNCTION public.apply_vendor_terms();

-- ---------------------------------------------------------------------------
-- 4. Best-vendor ranking
--
-- Rank 1 is the recommendation. Price dominates; rating only separates vendors
-- whose landed cost is close, which is what "cheapest, but weighted by how
-- reliable they are" means in practice.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.vendor_offer_ranking
WITH (security_invoker = true) AS
SELECT
  vpi.season_id,
  vpi.product_id,
  vpi.vendor_id,
  v.name          AS vendor_name,
  v.rating,
  v.lead_time_days,
  v.is_preferred,
  vpi.id          AS price_item_id,
  vpi.list_price,
  vpi.landed_cost,
  vpi.moq,
  -- Each rating point above 3 discounts the effective price by 3%.
  ROUND(vpi.landed_cost * (1 - (v.rating - 3) * 0.03), 2) AS adjusted_cost,
  RANK() OVER (
    PARTITION BY vpi.season_id, vpi.product_id
    ORDER BY vpi.landed_cost * (1 - (v.rating - 3) * 0.03) ASC,
             v.is_preferred DESC,
             v.rating DESC
  ) AS vendor_rank
FROM public.vendor_price_items vpi
JOIN public.vendors v ON v.id = vpi.vendor_id
JOIN public.vendor_price_lists pl ON pl.id = vpi.price_list_id
WHERE vpi.product_id IS NOT NULL
  AND pl.status <> 'superseded';

-- ---------------------------------------------------------------------------
-- 5. Purchase plans
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.purchase_plans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id  uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  name       text NOT NULL,
  status     text NOT NULL DEFAULT 'draft'
             CHECK (status IN ('draft', 'approved', 'ordered', 'cancelled')),
  notes      text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_plan_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        uuid NOT NULL REFERENCES public.purchase_plans(id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  required_qty   integer NOT NULL DEFAULT 0,

  -- Chosen vendor. selection_reason records whether the system picked it or a
  -- person overrode the recommendation, so a plan can be explained later.
  vendor_id        uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  price_item_id    uuid REFERENCES public.vendor_price_items(id) ON DELETE SET NULL,
  unit_landed_cost numeric,
  selection_reason text NOT NULL DEFAULT 'auto_best_price'
                   CHECK (selection_reason IN
                     ('auto_best_price', 'manual_override', 'only_vendor', 'no_offer')),

  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, product_id)
);

CREATE INDEX IF NOT EXISTS purchase_plan_items_plan_idx
  ON public.purchase_plan_items (plan_id);

-- ---------------------------------------------------------------------------
-- 6. Plan generation
--
-- Required quantity defaults to (reorder level - stock on hand) for the
-- season, i.e. what must be bought to get back to target. Each line is then
-- assigned the top-ranked vendor offer.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_purchase_plan(
  p_season_id uuid,
  p_name      text DEFAULT NULL,
  p_coverage_multiplier numeric DEFAULT 1.0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
BEGIN
  IF NOT public.season_is_admin() THEN
    RAISE EXCEPTION 'Only admins may generate a purchase plan.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.purchase_plans (season_id, name, created_by)
  VALUES (
    p_season_id,
    COALESCE(p_name, 'Plan ' || to_char(now(), 'YYYY-MM-DD HH24:MI')),
    auth.uid()
  )
  RETURNING id INTO v_plan_id;

  WITH needs AS (
    SELECT
      ps.product_id,
      GREATEST(
        0,
        CEIL((COALESCE(ps.reorder_level, 5) * p_coverage_multiplier) - ps.stock)
      )::integer AS required_qty
    FROM public.product_seasons ps
    WHERE ps.season_id = p_season_id
      AND ps.is_active
  ),
  best AS (
    SELECT DISTINCT ON (r.product_id)
      r.product_id, r.vendor_id, r.price_item_id, r.landed_cost
    FROM public.vendor_offer_ranking r
    WHERE r.season_id = p_season_id AND r.vendor_rank = 1
    ORDER BY r.product_id, r.adjusted_cost
  )
  INSERT INTO public.purchase_plan_items (
    plan_id, product_id, required_qty, vendor_id, price_item_id,
    unit_landed_cost, selection_reason
  )
  SELECT
    v_plan_id,
    n.product_id,
    n.required_qty,
    b.vendor_id,
    b.price_item_id,
    b.landed_cost,
    CASE WHEN b.vendor_id IS NULL THEN 'no_offer' ELSE 'auto_best_price' END
  FROM needs n
  LEFT JOIN best b ON b.product_id = n.product_id
  WHERE n.required_qty > 0;

  RETURN v_plan_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS — vendor pricing is commercially sensitive, admin only throughout
-- ---------------------------------------------------------------------------

ALTER TABLE public.vendor_price_lists   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_price_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_plan_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage vendor price lists" ON public.vendor_price_lists;
CREATE POLICY "Admins manage vendor price lists"
  ON public.vendor_price_lists FOR ALL TO authenticated
  USING (public.season_is_admin()) WITH CHECK (public.season_is_admin());

DROP POLICY IF EXISTS "Admins manage vendor price items" ON public.vendor_price_items;
CREATE POLICY "Admins manage vendor price items"
  ON public.vendor_price_items FOR ALL TO authenticated
  USING (public.season_is_admin()) WITH CHECK (public.season_is_admin());

DROP POLICY IF EXISTS "Admins manage purchase plans" ON public.purchase_plans;
CREATE POLICY "Admins manage purchase plans"
  ON public.purchase_plans FOR ALL TO authenticated
  USING (public.season_is_admin()) WITH CHECK (public.season_is_admin());

DROP POLICY IF EXISTS "Admins manage purchase plan items" ON public.purchase_plan_items;
CREATE POLICY "Admins manage purchase plan items"
  ON public.purchase_plan_items FOR ALL TO authenticated
  USING (public.season_is_admin()) WITH CHECK (public.season_is_admin());

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------

-- Vendor pricing never reaches an anonymous visitor.
REVOKE ALL ON public.vendor_price_lists  FROM anon;
REVOKE ALL ON public.vendor_price_items  FROM anon;
REVOKE ALL ON public.purchase_plans      FROM anon;
REVOKE ALL ON public.purchase_plan_items FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_price_lists  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_price_items  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_plans      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_plan_items TO authenticated;

GRANT SELECT ON public.vendor_offer_ranking TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_purchase_plan(uuid, text, numeric) TO authenticated;
