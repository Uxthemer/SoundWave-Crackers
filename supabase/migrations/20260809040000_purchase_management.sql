-- ============================================================================
-- Fireworks Purchase Management
--
-- Completes the vendor foundation into a working purchase system:
--   vendor price list  ->  purchase plan  ->  purchase orders  ->  price list
--
-- THE CENTRAL MODELLING PROBLEM: vendors quote on different bases.
--
--   Sangamithra  7300  per 1000 Pkt   case = 1600 Pkts
--   Sangamithra   140  per 1 Box      box  = 3 Pcs,   case = 60 Boxes
--   AK            120  per Box        box  = 1 Piece, case = 60 Box
--   Karpagaraja   270  per Box        box  = 30 pcs,  case = 96 Box
--
-- So a quoted rate needs THREE numbers, not one: the amount, how many units
-- that amount covers (rate_qty — the "1000" above), and what a unit is. Storing
-- only the amount would make Sangamithra's crackers 1000x too expensive.
--
-- A SECOND, SUBTLER PROBLEM: a vendor "unit" is not our retail pack.
-- Sangamithra quote Ground Chakkar Big (10 Pcs) at 280 per unit, while we
-- retail a box of 10 for Rs41. One vendor unit is therefore several retail
-- boxes. That ratio is trade knowledge, not something in the PDF, so it is
-- captured as retail_units_per_rate_unit and confirmed by a human on review.
-- Everything downstream — vendor comparison, APR, retail price — is computed
-- per RETAIL PACK, which is the only unit that is comparable across vendors
-- and meaningful against the selling price.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Pack and case structure on vendor price rows
-- ---------------------------------------------------------------------------

ALTER TABLE public.vendor_price_items
  -- The quoted rate covers rate_qty x rate_unit. "7300 per 1000 Pkt" is
  -- list_price=7300, rate_qty=1000, rate_unit='pkt'.
  ADD COLUMN IF NOT EXISTS rate_qty      integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rate_unit     text    NOT NULL DEFAULT 'box',
  -- How many pieces the vendor says are inside one rate_unit ("3 Pcs").
  ADD COLUMN IF NOT EXISTS pack_qty      integer,
  -- How many of OUR retail packs one vendor rate_unit yields.
  --
  -- This cannot be derived from the vendor sheet and must be confirmed by a
  -- human on the review screen. Sangamithra quote "Ground Chakkar Big (10 Pcs)
  -- at 280 per unit" while we retail a box of 10 at Rs41 — so one vendor unit
  -- is plainly several retail boxes, not one. Getting this wrong makes every
  -- downstream cost, margin and retail price wrong, so it is stored explicitly
  -- rather than assumed.
  ADD COLUMN IF NOT EXISTS retail_units_per_rate_unit numeric,
  -- How many rate_units make up one case (the minimum order quantity).
  ADD COLUMN IF NOT EXISTS case_qty      integer,
  -- Kept verbatim from the vendor's sheet so a human can audit the parse.
  ADD COLUMN IF NOT EXISTS raw_pack_text text,
  ADD COLUMN IF NOT EXISTS raw_case_text text,
  ADD COLUMN IF NOT EXISTS raw_rate_text text;

COMMENT ON COLUMN public.vendor_price_items.rate_qty IS
  'How many rate_units the quoted list_price covers. "7300 per 1000 Pkt" => 1000.';
COMMENT ON COLUMN public.vendor_price_items.pack_qty IS
  'Sellable pieces inside one rate_unit. Box Contents "3 Pcs" => 3.';
COMMENT ON COLUMN public.vendor_price_items.case_qty IS
  'rate_units per case. "60 Boxes" => 60. Orders are placed in whole cases.';

-- Rebuild landed cost on the new basis. The old column only knew list_price.
-- The ranking view reads it, so that has to go first; it is recreated in
-- section 5 against the new per-retail-pack columns.
DROP VIEW IF EXISTS public.vendor_offer_ranking;
ALTER TABLE public.vendor_price_items DROP COLUMN IF EXISTS landed_cost;

-- Landed cost of ONE rate_unit (typically one box), vendor terms applied:
--   taxable = rate x (1 - discount%) + packing% of rate
--   landed  = taxable x (1 + GST%)   + other% of rate
-- Generated columns cannot reference other generated columns, so the per-unit
-- rate is spelled out in each expression.
ALTER TABLE public.vendor_price_items
  ADD COLUMN IF NOT EXISTS landed_unit_cost numeric GENERATED ALWAYS AS (
    ROUND(
      (
        ((list_price / NULLIF(rate_qty, 0)) * (1 - discount_percent / 100.0))
        + ((list_price / NULLIF(rate_qty, 0)) * packing_percent / 100.0)
      ) * (1 + gst_percent / 100.0)
      + ((list_price / NULLIF(rate_qty, 0)) * other_charges_percent / 100.0)
    , 4)
  ) STORED;

-- Cost of one full case — what actually gets ordered.
ALTER TABLE public.vendor_price_items
  ADD COLUMN IF NOT EXISTS landed_case_cost numeric GENERATED ALWAYS AS (
    ROUND(
      (
        (
          ((list_price / NULLIF(rate_qty, 0)) * (1 - discount_percent / 100.0))
          + ((list_price / NULLIF(rate_qty, 0)) * packing_percent / 100.0)
        ) * (1 + gst_percent / 100.0)
        + ((list_price / NULLIF(rate_qty, 0)) * other_charges_percent / 100.0)
      ) * COALESCE(case_qty, 1)
    , 2)
  ) STORED;

-- Cost of ONE RETAIL PACK — the unit you actually sell.
--
-- This is the number that matters: it is the only fair basis for comparing
-- vendors who pack differently, it becomes the product's APR, and the retail
-- price is built from it. It divides by retail_units_per_rate_unit (confirmed
-- by a human), falling back to the vendor's own piece count, then to 1.
ALTER TABLE public.vendor_price_items
  ADD COLUMN IF NOT EXISTS landed_retail_cost numeric GENERATED ALWAYS AS (
    ROUND(
      (
        (
          ((list_price / NULLIF(rate_qty, 0)) * (1 - discount_percent / 100.0))
          + ((list_price / NULLIF(rate_qty, 0)) * packing_percent / 100.0)
        ) * (1 + gst_percent / 100.0)
        + ((list_price / NULLIF(rate_qty, 0)) * other_charges_percent / 100.0)
      ) / NULLIF(COALESCE(retail_units_per_rate_unit, pack_qty, 1), 0)
    , 4)
  ) STORED;

-- How many retail packs a whole case yields — what a case actually buys you.
ALTER TABLE public.vendor_price_items
  ADD COLUMN IF NOT EXISTS retail_units_per_case numeric GENERATED ALWAYS AS (
    COALESCE(retail_units_per_rate_unit, pack_qty, 1) * COALESCE(case_qty, 1)
  ) STORED;

-- Flags rows where nobody has confirmed the vendor-unit -> retail-pack ratio,
-- so the review screen can surface them instead of quietly trusting a guess.
ALTER TABLE public.vendor_price_items
  ADD COLUMN IF NOT EXISTS needs_unit_review boolean GENERATED ALWAYS AS (
    retail_units_per_rate_unit IS NULL
  ) STORED;

CREATE INDEX IF NOT EXISTS vendor_price_items_retail_cost_idx
  ON public.vendor_price_items (season_id, product_id, landed_retail_cost);

-- ---------------------------------------------------------------------------
-- 2. Retail pricing configuration
--
-- Offer price is derived from cost by TARGET MARGIN ON THE SALE:
--     offer = landed retail-pack cost / (1 - margin%)
-- Actual (struck-through) price is offer x a per-category display factor,
-- which is how the published list shows "80% off".
-- ---------------------------------------------------------------------------

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS margin_percent  numeric,
  ADD COLUMN IF NOT EXISTS display_factor  numeric;

COMMENT ON COLUMN public.categories.margin_percent IS
  'Target margin on the SALE for this category. Falls back to app_settings.';
COMMENT ON COLUMN public.categories.display_factor IS
  'Actual price = offer price x this. ~5.0 reproduces the usual "80% OFF".';

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS default_margin_percent numeric NOT NULL DEFAULT 32,
  ADD COLUMN IF NOT EXISTS default_display_factor numeric NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS price_rounding         integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.app_settings.price_rounding IS
  'Round generated prices to this nearest rupee value. 1 = whole rupees.';

-- ---------------------------------------------------------------------------
-- 3. Purchase plan lines, restated in cases
-- ---------------------------------------------------------------------------

ALTER TABLE public.purchase_plan_items
  ADD COLUMN IF NOT EXISTS order_cases       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pieces_ordered    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total        numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes             text;

-- ---------------------------------------------------------------------------
-- 4. Purchase orders — one per vendor, cut from a finalised plan
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id   uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  plan_id     uuid REFERENCES public.purchase_plans(id) ON DELETE SET NULL,
  vendor_id   uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  po_number   text NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'sent', 'confirmed', 'received', 'cancelled')),
  order_date  date NOT NULL DEFAULT CURRENT_DATE,
  expected_on date,
  subtotal    numeric NOT NULL DEFAULT 0,
  total       numeric NOT NULL DEFAULT 0,
  notes       text,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_orders_season_idx
  ON public.purchase_orders (season_id, vendor_id);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id          uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id     uuid REFERENCES public.products(id) ON DELETE SET NULL,
  price_item_id  uuid REFERENCES public.vendor_price_items(id) ON DELETE SET NULL,
  -- Description is copied, not joined: a purchase order is a commercial
  -- document and must still read correctly if the catalog is later renamed.
  description    text NOT NULL,
  cases          integer NOT NULL DEFAULT 0,
  units_per_case integer,
  pieces_per_unit integer,
  unit_rate      numeric NOT NULL DEFAULT 0,
  landed_unit_cost numeric,
  line_total     numeric NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_order_items_po_idx
  ON public.purchase_order_items (po_id);

-- Sequential PO numbers, allocated by the database so concurrent users cannot
-- collide (the order/quotation short_id generators do this client-side and can).
CREATE SEQUENCE IF NOT EXISTS public.purchase_order_seq;

CREATE OR REPLACE FUNCTION public.next_po_number()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT 'PO-' || to_char(nextval('public.purchase_order_seq'), 'FM0000');
$$;

-- ---------------------------------------------------------------------------
-- 5. Vendor ranking, now on cost per piece
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.vendor_offer_ranking;
CREATE VIEW public.vendor_offer_ranking
WITH (security_invoker = true) AS
SELECT
  vpi.season_id,
  vpi.product_id,
  vpi.vendor_id,
  v.name              AS vendor_name,
  v.rating,
  v.lead_time_days,
  v.is_preferred,
  vpi.id              AS price_item_id,
  vpi.raw_label,
  vpi.list_price,
  vpi.rate_qty,
  vpi.rate_unit,
  vpi.pack_qty,
  vpi.case_qty,
  vpi.retail_units_per_rate_unit,
  vpi.retail_units_per_case,
  vpi.needs_unit_review,
  vpi.landed_unit_cost,
  vpi.landed_case_cost,
  vpi.landed_retail_cost,
  -- Each rating point above 3 discounts the effective price by 3%, so rating
  -- separates vendors whose cost is close without ever overriding a big
  -- genuine price difference.
  ROUND(vpi.landed_retail_cost * (1 - (v.rating - 3) * 0.03), 4) AS adjusted_retail_cost,
  RANK() OVER (
    PARTITION BY vpi.season_id, vpi.product_id
    ORDER BY vpi.landed_retail_cost * (1 - (v.rating - 3) * 0.03) ASC,
             v.is_preferred DESC,
             v.rating DESC
  ) AS vendor_rank
FROM public.vendor_price_items vpi
JOIN public.vendors v ON v.id = vpi.vendor_id
JOIN public.vendor_price_lists pl ON pl.id = vpi.price_list_id
WHERE vpi.product_id IS NOT NULL
  AND vpi.landed_retail_cost IS NOT NULL
  AND pl.status <> 'superseded';

-- ---------------------------------------------------------------------------
-- 6. Plan generation, in cases
--
-- Requirement per product = target cover - stock on hand, where target cover
-- defaults to last season's sales (the best predictor available) and falls back
-- to the reorder level when there is no history.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.generate_purchase_plan(uuid, text, numeric);

CREATE OR REPLACE FUNCTION public.generate_purchase_plan(
  p_season_id           uuid,
  p_name                text    DEFAULT NULL,
  p_coverage_multiplier numeric DEFAULT 1.0,
  p_basis_season_id     uuid    DEFAULT NULL
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

  WITH sold AS (
    -- Units sold in the basis season, used as the demand signal.
    SELECT oi.product_id, SUM(oi.quantity)::numeric AS qty
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE p_basis_season_id IS NOT NULL
      AND o.season_id = p_basis_season_id
      AND lower(COALESCE(o.status, '')) NOT IN ('cancelled')
    GROUP BY oi.product_id
  ),
  needs AS (
    SELECT
      ps.product_id,
      GREATEST(
        0,
        CEIL(
          COALESCE(s.qty, COALESCE(ps.reorder_level, 5)) * p_coverage_multiplier
          - ps.stock
        )
      )::integer AS required_pieces
    FROM public.product_seasons ps
    LEFT JOIN sold s ON s.product_id = ps.product_id
    WHERE ps.season_id = p_season_id
      AND ps.is_active
  ),
  best AS (
    SELECT DISTINCT ON (r.product_id)
      r.product_id, r.vendor_id, r.price_item_id,
      r.landed_retail_cost, r.landed_case_cost,
      r.retail_units_per_case AS packs_per_case
    FROM public.vendor_offer_ranking r
    WHERE r.season_id = p_season_id AND r.vendor_rank = 1
    ORDER BY r.product_id, r.adjusted_retail_cost
  )
  INSERT INTO public.purchase_plan_items (
    plan_id, product_id, required_qty, vendor_id, price_item_id,
    unit_landed_cost, order_cases, pieces_ordered, line_total, selection_reason
  )
  SELECT
    v_plan_id,
    n.product_id,
    n.required_pieces,
    b.vendor_id,
    b.price_item_id,
    b.landed_retail_cost,
    -- Vendors accept full cases only, so always round up.
    CASE WHEN COALESCE(b.packs_per_case, 0) = 0 THEN 0
         ELSE CEIL(n.required_pieces::numeric / b.packs_per_case)::integer END,
    CASE WHEN COALESCE(b.packs_per_case, 0) = 0 THEN 0
         ELSE (CEIL(n.required_pieces::numeric / b.packs_per_case) * b.packs_per_case)::integer END,
    CASE WHEN COALESCE(b.packs_per_case, 0) = 0 THEN 0
         ELSE CEIL(n.required_pieces::numeric / b.packs_per_case)::integer
              * COALESCE(b.landed_case_cost, 0) END,
    CASE WHEN b.vendor_id IS NULL THEN 'no_offer' ELSE 'auto_best_price' END
  FROM needs n
  LEFT JOIN best b ON b.product_id = n.product_id
  WHERE n.required_pieces > 0;

  RETURN v_plan_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Cut purchase orders from a plan — one per vendor
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_purchase_orders_from_plan(p_plan_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season uuid;
  v_vendor record;
  v_po_id  uuid;
  v_count  integer := 0;
BEGIN
  IF NOT public.season_is_admin() THEN
    RAISE EXCEPTION 'Only admins may create purchase orders.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT season_id INTO v_season FROM public.purchase_plans WHERE id = p_plan_id;
  IF v_season IS NULL THEN
    RAISE EXCEPTION 'Purchase plan not found.';
  END IF;

  FOR v_vendor IN
    SELECT DISTINCT vendor_id
    FROM public.purchase_plan_items
    WHERE plan_id = p_plan_id AND vendor_id IS NOT NULL AND order_cases > 0
  LOOP
    INSERT INTO public.purchase_orders (season_id, plan_id, vendor_id, po_number, created_by)
    VALUES (v_season, p_plan_id, v_vendor.vendor_id, public.next_po_number(), auth.uid())
    RETURNING id INTO v_po_id;

    INSERT INTO public.purchase_order_items (
      po_id, product_id, price_item_id, description, cases,
      units_per_case, pieces_per_unit, unit_rate, landed_unit_cost, line_total
    )
    SELECT
      v_po_id,
      ppi.product_id,
      ppi.price_item_id,
      -- Prefer the vendor's own wording so the PO reads the way they expect.
      COALESCE(vpi.raw_label, p.name, 'Item'),
      ppi.order_cases,
      vpi.case_qty,
      vpi.pack_qty,
      COALESCE(vpi.list_price / NULLIF(vpi.rate_qty, 0), 0),
      vpi.landed_unit_cost,
      ppi.line_total
    FROM public.purchase_plan_items ppi
    LEFT JOIN public.vendor_price_items vpi ON vpi.id = ppi.price_item_id
    LEFT JOIN public.products p ON p.id = ppi.product_id
    WHERE ppi.plan_id = p_plan_id
      AND ppi.vendor_id = v_vendor.vendor_id
      AND ppi.order_cases > 0;

    UPDATE public.purchase_orders po
    SET subtotal = COALESCE(t.total, 0), total = COALESCE(t.total, 0)
    FROM (
      SELECT SUM(line_total) AS total
      FROM public.purchase_order_items WHERE po_id = v_po_id
    ) t
    WHERE po.id = v_po_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.purchase_plans SET status = 'ordered', updated_at = now()
  WHERE id = p_plan_id;

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Confirm a PO — write its landed cost into the season's cost table
--
-- This is what makes the generated price list reflect what was actually paid
-- rather than a quote.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_purchase_order(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season uuid;
BEGIN
  IF NOT public.season_is_admin() THEN
    RAISE EXCEPTION 'Only admins may confirm a purchase order.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT season_id INTO v_season FROM public.purchase_orders WHERE id = p_po_id;
  IF v_season IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found.';
  END IF;

  -- APR is the landed cost of ONE RETAIL PACK, taken from the price row the
  -- order was cut against, so it lines up with how the product is sold.
  INSERT INTO public.product_season_costs (season_id, product_id, apr)
  SELECT
    v_season,
    poi.product_id,
    ROUND(COALESCE(vpi.landed_retail_cost, poi.landed_unit_cost), 2)
  FROM public.purchase_order_items poi
  LEFT JOIN public.vendor_price_items vpi ON vpi.id = poi.price_item_id
  WHERE poi.po_id = p_po_id AND poi.product_id IS NOT NULL
  ON CONFLICT (season_id, product_id) DO UPDATE
    SET apr = EXCLUDED.apr, updated_at = now();

  UPDATE public.purchase_orders
  SET status = 'confirmed', updated_at = now()
  WHERE id = p_po_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Generate the retail price list for a season
--
--   offer  = landed piece cost / (1 - margin%)     [margin ON THE SALE]
--   actual = offer x category display factor        [the struck-through price]
--
-- Category settings win over the global defaults. Products with no recorded
-- cost are skipped rather than priced at zero, and reported back.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_season_price_list(
  p_season_id       uuid,
  p_margin_override numeric DEFAULT NULL,
  p_dry_run         boolean DEFAULT true
)
RETURNS TABLE (
  product_id     uuid,
  product_name   text,
  category_name  text,
  piece_cost     numeric,
  margin_percent numeric,
  new_offer      numeric,
  new_actual     numeric,
  old_offer      numeric,
  applied        boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_margin numeric;
  v_default_factor numeric;
  v_rounding       integer;
BEGIN
  IF NOT public.season_is_admin() THEN
    RAISE EXCEPTION 'Only admins may generate a price list.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(default_margin_percent, 32),
         COALESCE(default_display_factor, 5),
         GREATEST(COALESCE(price_rounding, 1), 1)
  INTO v_default_margin, v_default_factor, v_rounding
  FROM public.app_settings LIMIT 1;

  v_default_margin := COALESCE(p_margin_override, v_default_margin, 32);
  v_default_factor := COALESCE(v_default_factor, 5);
  v_rounding       := COALESCE(v_rounding, 1);

  RETURN QUERY
  WITH priced AS (
    SELECT
      ps.product_id AS pid,
      p.name        AS pname,
      c.name        AS cname,
      psc.apr       AS cost,
      COALESCE(p_margin_override, c.margin_percent, v_default_margin) AS margin,
      COALESCE(c.display_factor, v_default_factor)                    AS factor,
      ps.offer_price AS current_offer
    FROM public.product_seasons ps
    JOIN public.products p ON p.id = ps.product_id
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN public.product_season_costs psc
           ON psc.season_id = ps.season_id AND psc.product_id = ps.product_id
    WHERE ps.season_id = p_season_id AND ps.is_active
  ),
  computed AS (
    SELECT
      pid, pname, cname, cost, margin, current_offer,
      CASE
        WHEN cost IS NULL OR cost <= 0 THEN NULL
        WHEN margin >= 100 THEN NULL
        ELSE ROUND((cost / (1 - margin / 100.0)) / v_rounding) * v_rounding
      END AS offer,
      factor
    FROM priced
  )
  SELECT
    cm.pid,
    cm.pname,
    cm.cname,
    cm.cost,
    cm.margin,
    cm.offer,
    CASE WHEN cm.offer IS NULL THEN NULL
         ELSE ROUND(cm.offer * cm.factor / v_rounding) * v_rounding END,
    cm.current_offer,
    (NOT p_dry_run AND cm.offer IS NOT NULL)
  FROM computed cm
  ORDER BY cm.cname NULLS LAST, cm.pname;

  IF NOT p_dry_run THEN
    UPDATE public.product_seasons ps
    SET offer_price  = sub.offer,
        actual_price = sub.actual,
        discount_percentage =
          CASE WHEN sub.actual > 0
               THEN ROUND((1 - sub.offer / sub.actual) * 100)
               ELSE 0 END,
        updated_at = now()
    FROM (
      SELECT
        ps2.product_id,
        ROUND((psc.apr / (1 - COALESCE(p_margin_override, c.margin_percent, v_default_margin) / 100.0)) / v_rounding) * v_rounding AS offer,
        ROUND(
          (ROUND((psc.apr / (1 - COALESCE(p_margin_override, c.margin_percent, v_default_margin) / 100.0)) / v_rounding) * v_rounding)
          * COALESCE(c.display_factor, v_default_factor) / v_rounding
        ) * v_rounding AS actual
      FROM public.product_seasons ps2
      JOIN public.products p ON p.id = ps2.product_id
      LEFT JOIN public.categories c ON c.id = p.category_id
      JOIN public.product_season_costs psc
        ON psc.season_id = ps2.season_id AND psc.product_id = ps2.product_id
      WHERE ps2.season_id = p_season_id
        AND ps2.is_active
        AND psc.apr IS NOT NULL AND psc.apr > 0
        AND COALESCE(p_margin_override, c.margin_percent, v_default_margin) < 100
    ) sub
    WHERE ps.season_id = p_season_id AND ps.product_id = sub.product_id;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Best-vendor suggestion for manual plan entry
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.suggest_vendors_for_product(
  p_season_id  uuid,
  p_product_id uuid
)
RETURNS TABLE (
  vendor_id           uuid,
  vendor_name         text,
  price_item_id       uuid,
  rating              numeric,
  list_price          numeric,
  landed_retail_cost  numeric,
  landed_case_cost    numeric,
  packs_per_case      numeric,
  needs_unit_review   boolean,
  adjusted_retail_cost numeric,
  vendor_rank         bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.vendor_id, r.vendor_name, r.price_item_id, r.rating,
    r.list_price, r.landed_retail_cost, r.landed_case_cost,
    r.retail_units_per_case, r.needs_unit_review,
    r.adjusted_retail_cost, r.vendor_rank
  FROM public.vendor_offer_ranking r
  WHERE r.season_id = p_season_id AND r.product_id = p_product_id
  ORDER BY r.vendor_rank;
$$;

-- ---------------------------------------------------------------------------
-- 11. RLS and grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.purchase_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage purchase orders" ON public.purchase_orders;
CREATE POLICY "Admins manage purchase orders"
  ON public.purchase_orders FOR ALL TO authenticated
  USING (public.season_is_admin()) WITH CHECK (public.season_is_admin());

DROP POLICY IF EXISTS "Admins manage purchase order items" ON public.purchase_order_items;
CREATE POLICY "Admins manage purchase order items"
  ON public.purchase_order_items FOR ALL TO authenticated
  USING (public.season_is_admin()) WITH CHECK (public.season_is_admin());

REVOKE ALL ON public.purchase_orders      FROM anon;
REVOKE ALL ON public.purchase_order_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.purchase_order_seq TO authenticated;

GRANT SELECT ON public.vendor_offer_ranking TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_purchase_plan(uuid, text, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_orders_from_plan(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_purchase_order(uuid)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_season_price_list(uuid, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_vendors_for_product(uuid, uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_po_number()                                  TO authenticated;
