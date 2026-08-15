-- ============================================================================
-- Season-scoped catalog — Phase 1 (ADDITIVE ONLY)
--
-- Splits the single-state product catalog into:
--   products              -> stable identity (name, code, category, media)
--   product_seasons       -> commercials per season (price, stock, content, order)
--   product_season_costs  -> cost price (APR) per season, ADMIN ONLY
--
-- Nothing is dropped here. products keeps its existing columns as a rollback
-- path; they are removed in the phase 3 cleanup migration once a season has
-- run clean.
--
-- Safe to re-run: every statement is guarded.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Admin helper
--
-- The live DB has is_admin()/is_superadmin(), but they are not defined in this
-- repo, so we ship a self-contained equivalent (same shape as the inline EXISTS
-- used by the quotations migration).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.season_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    JOIN public.roles r ON r.id = up.role_id
    WHERE up.user_id = auth.uid()
      AND r.name IN ('admin', 'superadmin')
  );
$$;

CREATE OR REPLACE FUNCTION public.season_is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    JOIN public.roles r ON r.id = up.role_id
    WHERE up.user_id = auth.uid()
      AND r.name = 'superadmin'
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. seasons
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.seasons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,          -- '2025'    (matches legacy season-YYYY)
  name        text NOT NULL,                 -- '2025-26'
  start_date  date NOT NULL,                 -- 2025-04-01
  end_date    date NOT NULL,                 -- 2026-03-31
  status      text NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'active', 'closed')),
  is_unlocked boolean NOT NULL DEFAULT false,  -- superadmin override on a closed season
  unlocked_by uuid REFERENCES auth.users(id),
  unlocked_at timestamptz,
  copied_from uuid REFERENCES public.seasons(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  closed_at   timestamptz,
  closed_by   uuid REFERENCES auth.users(id),
  CHECK (end_date > start_date)
);

-- At most one active season, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS seasons_one_active
  ON public.seasons (status) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS seasons_date_range_idx
  ON public.seasons (start_date, end_date);

-- Audit trail for unlocking closed seasons.
CREATE TABLE IF NOT EXISTS public.season_unlock_log (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  action    text NOT NULL CHECK (action IN ('unlock', 'relock')),
  actor     uuid REFERENCES auth.users(id),
  acted_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. product_seasons — the commercial row
--
-- content and reorder_level live here (not on products) so an archived season's
-- price list reproduces exactly as it was printed.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_seasons (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id           uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  actual_price        numeric NOT NULL DEFAULT 0,
  offer_price         numeric NOT NULL DEFAULT 0,
  discount_percentage numeric DEFAULT 0,
  content             text,
  opening_stock       integer NOT NULL DEFAULT 0,
  stock               integer NOT NULL DEFAULT 0,
  closing_stock       integer,                 -- frozen by close_season()
  reorder_level       integer DEFAULT 5,
  is_active           boolean NOT NULL DEFAULT true,
  display_order       integer,                 -- was products."order"
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, product_id)
);

CREATE INDEX IF NOT EXISTS product_seasons_season_active_idx
  ON public.product_seasons (season_id, is_active);
CREATE INDEX IF NOT EXISTS product_seasons_product_idx
  ON public.product_seasons (product_id);

-- ---------------------------------------------------------------------------
-- 3. product_season_costs — APR, admin only
--
-- Deliberately a separate table: products is world-readable, and RLS restricts
-- rows but not columns. Keeping cost here is the only way to publish the
-- catalog without publishing the cost price.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_season_costs (
  season_id  uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  apr        numeric,                          -- Actual Purchase Rate
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, product_id)
);

-- ---------------------------------------------------------------------------
-- 4. Snapshot columns on orders / quotations
--
-- order_items.price already snapshots the sale price. apr_snapshot does the
-- same for cost, so historical profit stops being re-derived from the live
-- catalog every time it is displayed.
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS apr_snapshot numeric;

CREATE INDEX IF NOT EXISTS orders_season_idx ON public.orders (season_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'quotations') THEN
    ALTER TABLE public.quotations
      ADD COLUMN IF NOT EXISTS season_id uuid REFERENCES public.seasons(id);
    ALTER TABLE public.quotation_items
      ADD COLUMN IF NOT EXISTS apr_snapshot numeric;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. current_season_id()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_season_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.seasons WHERE status = 'active' LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 6. updated_at maintenance
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_seasons_touch ON public.product_seasons;
CREATE TRIGGER product_seasons_touch
  BEFORE UPDATE ON public.product_seasons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS product_season_costs_touch ON public.product_season_costs;
CREATE TRIGGER product_season_costs_touch
  BEFORE UPDATE ON public.product_season_costs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7. season_catalog view — the compatibility layer
--
-- Exposes today's exact column names (including display_order AS "order") so
-- existing read queries only need the table name changed plus a season filter.
--
-- security_invoker = true is REQUIRED: without it the view runs as its owner
-- and silently bypasses RLS.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.season_catalog;
CREATE VIEW public.season_catalog
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
  -- Category embedded directly rather than left to PostgREST's relationship
  -- inference, which is unreliable through a view. Consumers keep reading
  -- product.categories.name exactly as before.
  CASE WHEN c.id IS NULL THEN NULL ELSE
    jsonb_build_object(
      'id', c.id, 'name', c.name,
      'description', c.description, 'image_url', c.image_url
    )
  END AS categories
FROM public.products p
JOIN public.product_seasons ps ON ps.product_id = p.id
LEFT JOIN public.categories c ON c.id = p.category_id;

-- ---------------------------------------------------------------------------
-- 8. Freeze enforcement
--
-- Closed seasons are read-only in the DATABASE, not just the UI. A superadmin
-- can set seasons.is_unlocked to make a correction; every toggle is logged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reject_closed_season_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id uuid;
  v_status    text;
  v_unlocked  boolean;
BEGIN
  v_season_id := COALESCE(NEW.season_id, OLD.season_id);

  SELECT status, is_unlocked INTO v_status, v_unlocked
  FROM public.seasons WHERE id = v_season_id;

  IF v_status = 'closed' AND NOT COALESCE(v_unlocked, false) THEN
    RAISE EXCEPTION
      'Season is closed and read-only. A superadmin must unlock it before making changes.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.seasons              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_seasons      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_season_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_unlock_log    ENABLE ROW LEVEL SECURITY;

-- seasons: readable by everyone (the storefront needs to resolve the active
-- season); only admins may write.
DROP POLICY IF EXISTS "Seasons are viewable by everyone" ON public.seasons;
CREATE POLICY "Seasons are viewable by everyone"
  ON public.seasons FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admins can manage seasons" ON public.seasons;
CREATE POLICY "Admins can manage seasons"
  ON public.seasons FOR ALL TO authenticated
  USING (public.season_is_admin())
  WITH CHECK (public.season_is_admin());

-- product_seasons: the public may read the ACTIVE season only. Draft seasons
-- (next year's prices) and closed seasons stay internal.
DROP POLICY IF EXISTS "Active season catalog is public" ON public.product_seasons;
CREATE POLICY "Active season catalog is public"
  ON public.product_seasons FOR SELECT TO public
  USING (season_id = public.current_season_id());

DROP POLICY IF EXISTS "Admins can view all seasons catalog" ON public.product_seasons;
CREATE POLICY "Admins can view all seasons catalog"
  ON public.product_seasons FOR SELECT TO authenticated
  USING (public.season_is_admin());

DROP POLICY IF EXISTS "Admins can manage seasons catalog" ON public.product_seasons;
CREATE POLICY "Admins can manage seasons catalog"
  ON public.product_seasons FOR ALL TO authenticated
  USING (public.season_is_admin())
  WITH CHECK (public.season_is_admin());

-- product_season_costs: never public.
DROP POLICY IF EXISTS "Admins can manage season costs" ON public.product_season_costs;
CREATE POLICY "Admins can manage season costs"
  ON public.product_season_costs FOR ALL TO authenticated
  USING (public.season_is_admin())
  WITH CHECK (public.season_is_admin());

DROP POLICY IF EXISTS "Admins can read unlock log" ON public.season_unlock_log;
CREATE POLICY "Admins can read unlock log"
  ON public.season_unlock_log FOR SELECT TO authenticated
  USING (public.season_is_admin());

-- ---------------------------------------------------------------------------
-- 10. Season lifecycle functions
-- ---------------------------------------------------------------------------

-- Copy a season's catalog forward into a target season.
-- Prices, discount, content, is_active and display order are copied as-is;
-- stock carries only for the product ids passed in p_carry_stock_ids.
-- Idempotent: re-running skips rows that already exist in the target.
CREATE OR REPLACE FUNCTION public.copy_season_products(
  p_source_season   uuid,
  p_target_season   uuid,
  p_carry_stock_ids uuid[] DEFAULT '{}'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_status text;
  v_inserted      integer;
BEGIN
  IF NOT public.season_is_admin() THEN
    RAISE EXCEPTION 'Only admins may copy a season forward.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_source_season = p_target_season THEN
    RAISE EXCEPTION 'Source and target season must differ.';
  END IF;

  SELECT status INTO v_target_status FROM public.seasons WHERE id = p_target_season;
  IF v_target_status IS NULL THEN
    RAISE EXCEPTION 'Target season does not exist.';
  END IF;
  IF v_target_status = 'closed' THEN
    RAISE EXCEPTION 'Cannot copy into a closed season.';
  END IF;

  INSERT INTO public.product_seasons (
    season_id, product_id, actual_price, offer_price, discount_percentage,
    content, opening_stock, stock, reorder_level, is_active, display_order
  )
  SELECT
    p_target_season,
    src.product_id,
    src.actual_price,
    src.offer_price,
    src.discount_percentage,
    src.content,
    CASE WHEN src.product_id = ANY(p_carry_stock_ids)
         THEN COALESCE(src.closing_stock, src.stock) ELSE 0 END,
    CASE WHEN src.product_id = ANY(p_carry_stock_ids)
         THEN COALESCE(src.closing_stock, src.stock) ELSE 0 END,
    src.reorder_level,
    src.is_active,
    src.display_order
  FROM public.product_seasons src
  WHERE src.season_id = p_source_season
  ON CONFLICT (season_id, product_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Carry cost prices forward too.
  INSERT INTO public.product_season_costs (season_id, product_id, apr)
  SELECT p_target_season, c.product_id, c.apr
  FROM public.product_season_costs c
  WHERE c.season_id = p_source_season
  ON CONFLICT (season_id, product_id) DO NOTHING;

  UPDATE public.seasons
  SET copied_from = p_source_season
  WHERE id = p_target_season AND copied_from IS NULL;

  RETURN v_inserted;
END;
$$;

-- Freeze a season: stamp closing stock, mark closed.
CREATE OR REPLACE FUNCTION public.close_season(p_season uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.season_is_admin() THEN
    RAISE EXCEPTION 'Only admins may close a season.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.product_seasons
  SET closing_stock = stock
  WHERE season_id = p_season;

  UPDATE public.seasons
  SET status = 'closed', closed_at = now(), closed_by = auth.uid(), is_unlocked = false
  WHERE id = p_season;
END;
$$;

-- Promote a draft season to active, closing whichever season is active now.
CREATE OR REPLACE FUNCTION public.activate_season(p_season uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current uuid;
  v_status  text;
BEGIN
  IF NOT public.season_is_admin() THEN
    RAISE EXCEPTION 'Only admins may activate a season.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status INTO v_status FROM public.seasons WHERE id = p_season;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Season does not exist.';
  END IF;
  IF v_status = 'active' THEN
    RETURN;  -- already live, nothing to do
  END IF;
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'Cannot activate a closed season. Reopen it first.';
  END IF;

  SELECT id INTO v_current FROM public.seasons WHERE status = 'active';

  IF v_current IS NOT NULL THEN
    UPDATE public.product_seasons SET closing_stock = stock WHERE season_id = v_current;
    UPDATE public.seasons
    SET status = 'closed', closed_at = now(), closed_by = auth.uid()
    WHERE id = v_current;
  END IF;

  UPDATE public.seasons SET status = 'active' WHERE id = p_season;
END;
$$;

-- Superadmin-only unlock/relock of a closed season, with audit trail.
CREATE OR REPLACE FUNCTION public.set_season_unlocked(p_season uuid, p_unlocked boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.season_is_superadmin() THEN
    RAISE EXCEPTION 'Only a superadmin may unlock a closed season.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.seasons
  SET is_unlocked = p_unlocked,
      unlocked_by = CASE WHEN p_unlocked THEN auth.uid() ELSE NULL END,
      unlocked_at = CASE WHEN p_unlocked THEN now() ELSE NULL END
  WHERE id = p_season;

  INSERT INTO public.season_unlock_log (season_id, action, actor)
  VALUES (p_season, CASE WHEN p_unlocked THEN 'unlock' ELSE 'relock' END, auth.uid());
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Seed seasons
--
-- Mirrors the ranges previously hardcoded in config/dashboardConfig.ts and
-- useDateRange.ts: a season runs April 1 -> March 31.
-- ---------------------------------------------------------------------------

INSERT INTO public.seasons (code, name, start_date, end_date, status)
VALUES
  ('2024', '2024-25', DATE '2024-04-01', DATE '2025-03-31', 'closed'),
  ('2025', '2025-26', DATE '2025-04-01', DATE '2026-03-31', 'closed'),
  ('2026', '2026-27', DATE '2026-04-01', DATE '2027-03-31', 'active')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 12. Backfill
--
-- Everything currently in products becomes the ACTIVE season's catalog.
-- Column presence is probed first, because the live schema has drifted from
-- this repo's migration history.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_active     uuid;
  v_cols       text;
  v_has_apr    boolean;
  v_has_active boolean;
  v_has_order  boolean;
  v_has_reord  boolean;
  v_has_content boolean;
BEGIN
  SELECT id INTO v_active FROM public.seasons WHERE status = 'active';
  IF v_active IS NULL THEN
    RAISE NOTICE 'No active season; skipping backfill.';
    RETURN;
  END IF;

  -- Already backfilled? Leave it alone.
  IF EXISTS (SELECT 1 FROM public.product_seasons WHERE season_id = v_active) THEN
    RAISE NOTICE 'Active season already has a catalog; skipping backfill.';
    RETURN;
  END IF;

  SELECT
    bool_or(column_name = 'apr'),
    bool_or(column_name = 'is_active'),
    bool_or(column_name = 'order'),
    bool_or(column_name = 'reorder_level'),
    bool_or(column_name = 'content')
  INTO v_has_apr, v_has_active, v_has_order, v_has_reord, v_has_content
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'products';

  v_cols := format(
    'INSERT INTO public.product_seasons
       (season_id, product_id, actual_price, offer_price, discount_percentage,
        content, opening_stock, stock, reorder_level, is_active, display_order)
     SELECT %L::uuid, p.id,
            COALESCE(p.actual_price, 0),
            COALESCE(p.offer_price, 0),
            COALESCE(p.discount_percentage, 0),
            %s,
            COALESCE(p.stock, 0),
            COALESCE(p.stock, 0),
            %s,
            %s,
            %s
     FROM public.products p
     ON CONFLICT (season_id, product_id) DO NOTHING',
    v_active,
    CASE WHEN v_has_content THEN 'p.content'          ELSE 'NULL::text'    END,
    CASE WHEN v_has_reord   THEN 'COALESCE(p.reorder_level, 5)' ELSE '5'   END,
    CASE WHEN v_has_active  THEN 'COALESCE(p.is_active, true)'  ELSE 'true' END,
    CASE WHEN v_has_order   THEN 'p."order"'          ELSE 'NULL::integer' END
  );
  EXECUTE v_cols;

  IF v_has_apr THEN
    EXECUTE format(
      'INSERT INTO public.product_season_costs (season_id, product_id, apr)
       SELECT %L::uuid, p.id, p.apr FROM public.products p
       ON CONFLICT (season_id, product_id) DO NOTHING',
      v_active
    );
  END IF;

  RAISE NOTICE 'Backfilled active season catalog.';
END $$;

-- Stamp existing orders with the season their created_at falls into.
UPDATE public.orders o
SET season_id = s.id
FROM public.seasons s
WHERE o.season_id IS NULL
  AND o.created_at >= s.start_date
  AND o.created_at <  (s.end_date + 1);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'quotations'
               AND column_name = 'season_id') THEN
    UPDATE public.quotations q
    SET season_id = s.id
    FROM public.seasons s
    WHERE q.season_id IS NULL
      AND q.created_at >= s.start_date
      AND q.created_at <  (s.end_date + 1);
  END IF;
END $$;

-- Snapshot cost onto historical order items.
--
-- APPROXIMATE: the cost at the time of each historical sale was never
-- recorded, so today's APR is the best available value. From this point on the
-- snapshot is written at sale time and stops drifting. Reported profit for
-- periods before this migration should be read with that caveat.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'products'
               AND column_name = 'apr') THEN
    UPDATE public.order_items oi
    SET apr_snapshot = p.apr
    FROM public.products p
    WHERE oi.product_id = p.id
      AND oi.apr_snapshot IS NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 12b. Stamp season and cost snapshot automatically
--
-- Done in the database rather than the client for two reasons: the browser
-- cannot read product_season_costs (admin-only, by design), and doing it here
-- covers every insert path — customer checkout, admin order edits, quotations —
-- without each having to remember.
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ALTER COLUMN season_id SET DEFAULT public.current_season_id();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'quotations'
               AND column_name = 'season_id') THEN
    ALTER TABLE public.quotations
      ALTER COLUMN season_id SET DEFAULT public.current_season_id();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.stamp_order_item_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season uuid;
BEGIN
  IF NEW.apr_snapshot IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT season_id INTO v_season FROM public.orders WHERE id = NEW.order_id;
  IF v_season IS NULL THEN
    v_season := public.current_season_id();
  END IF;

  SELECT apr INTO NEW.apr_snapshot
  FROM public.product_season_costs
  WHERE season_id = v_season AND product_id = NEW.product_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_items_stamp_cost ON public.order_items;
CREATE TRIGGER order_items_stamp_cost
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.stamp_order_item_cost();

CREATE OR REPLACE FUNCTION public.stamp_quotation_item_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season uuid;
BEGIN
  IF NEW.apr_snapshot IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT season_id INTO v_season FROM public.quotations WHERE id = NEW.quotation_id;
  IF v_season IS NULL THEN
    v_season := public.current_season_id();
  END IF;

  SELECT apr INTO NEW.apr_snapshot
  FROM public.product_season_costs
  WHERE season_id = v_season AND product_id = NEW.product_id;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'quotation_items'
               AND column_name = 'apr_snapshot') THEN
    DROP TRIGGER IF EXISTS quotation_items_stamp_cost ON public.quotation_items;
    CREATE TRIGGER quotation_items_stamp_cost
      BEFORE INSERT ON public.quotation_items
      FOR EACH ROW EXECUTE FUNCTION public.stamp_quotation_item_cost();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 13. Arm the freeze triggers
--
-- Created last so the backfill above is not blocked by them.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS product_seasons_freeze ON public.product_seasons;
CREATE TRIGGER product_seasons_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.product_seasons
  FOR EACH ROW EXECUTE FUNCTION public.reject_closed_season_write();

DROP TRIGGER IF EXISTS product_season_costs_freeze ON public.product_season_costs;
CREATE TRIGGER product_season_costs_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.product_season_costs
  FOR EACH ROW EXECUTE FUNCTION public.reject_closed_season_write();

-- ---------------------------------------------------------------------------
-- 14. Grants
-- ---------------------------------------------------------------------------

-- Grants are stated explicitly rather than relying on Supabase's default
-- privileges. RLS restricts which ROWS are visible; grants control whether the
-- role may touch the table at all. season_catalog uses security_invoker, so
-- anon needs SELECT on the base tables too.
GRANT SELECT ON public.seasons         TO anon, authenticated;
GRANT SELECT ON public.product_seasons TO anon, authenticated;
GRANT SELECT ON public.season_catalog  TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.seasons         TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_seasons TO authenticated;

-- Cost price is never readable by anonymous visitors. RLS blocks it as well;
-- this makes the intent explicit at the privilege layer.
REVOKE ALL ON public.product_season_costs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_season_costs TO authenticated;

REVOKE ALL ON public.season_unlock_log FROM anon;
GRANT SELECT ON public.season_unlock_log TO authenticated;

GRANT EXECUTE ON FUNCTION public.current_season_id()               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.copy_season_products(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_season(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_season(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_season_unlocked(uuid, boolean) TO authenticated;
