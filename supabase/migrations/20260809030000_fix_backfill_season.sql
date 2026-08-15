-- ============================================================================
-- Corrective: the phase 1 backfill put the existing catalog in the WRONG season.
--
-- Phase 1 seeded three seasons and marked 2026-27 active purely because that is
-- the season today's date falls in. It then backfilled every existing product
-- into the active season.
--
-- That was wrong. The existing products, prices, cost and stock are the
-- 2025-26 season's data. The consequence:
--   * season 2025-26 is empty, so "Copy from" shows nothing for it
--   * reporting defaults to 2026-27, which holds a catalog that never sold
--
-- This migration moves the backfilled catalog to 2025-26, makes 2025-26 the
-- active season, and leaves 2026-27 as an EMPTY DRAFT — ready to be built by
-- copying 2025-26 forward, which is the intended workflow.
--
-- Orders are NOT re-stamped: phase 1 assigned orders.season_id from
-- created_at against each season's date range, which is already correct
-- (an order placed in Oct 2025 belongs to 2025-26). Counts are reported below.
--
-- Guarded and idempotent: it only acts if 2025-26 is empty and 2026-27 holds a
-- catalog, so re-running after the fix does nothing.
-- ============================================================================

DO $$
DECLARE
  v_2025        uuid;
  v_2026        uuid;
  v_2025_count  integer;
  v_2026_count  integer;
  v_moved       integer;
  r             record;
BEGIN
  SELECT id INTO v_2025 FROM public.seasons WHERE code = '2025';
  SELECT id INTO v_2026 FROM public.seasons WHERE code = '2026';

  IF v_2025 IS NULL OR v_2026 IS NULL THEN
    RAISE NOTICE 'Seasons 2025/2026 not found — nothing to correct.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_2025_count FROM public.product_seasons WHERE season_id = v_2025;
  SELECT count(*) INTO v_2026_count FROM public.product_seasons WHERE season_id = v_2026;

  IF v_2025_count > 0 THEN
    RAISE NOTICE 'Season 2025-26 already has % products — already corrected, skipping.', v_2025_count;
    RETURN;
  END IF;

  IF v_2026_count = 0 THEN
    RAISE NOTICE 'Season 2026-27 has no catalog — nothing to move.';
    RETURN;
  END IF;

  -- Both seasons must be unfrozen before rows can move between them; the
  -- freeze trigger checks the TARGET season's status. Clearing 'active' here
  -- also keeps the one-active-season index satisfied while we shuffle.
  UPDATE public.seasons SET status = 'draft', closed_at = NULL, closed_by = NULL
  WHERE id IN (v_2025, v_2026);

  UPDATE public.product_seasons      SET season_id = v_2025 WHERE season_id = v_2026;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  UPDATE public.product_season_costs SET season_id = v_2025 WHERE season_id = v_2026;

  -- 2025-26 becomes the live season; 2026-27 is left as an empty draft for the
  -- copy-forward wizard to populate.
  UPDATE public.seasons SET status = 'active' WHERE id = v_2025;
  UPDATE public.seasons SET status = 'draft'  WHERE id = v_2026;

  RAISE NOTICE 'Moved % products from 2026-27 to 2025-26. 2025-26 is now the live season.', v_moved;

  FOR r IN
    SELECT s.name, count(o.id) AS orders
    FROM public.seasons s
    LEFT JOIN public.orders o ON o.season_id = s.id
    GROUP BY s.name ORDER BY s.name
  LOOP
    RAISE NOTICE '  orders in season %: %', r.name, r.orders;
  END LOOP;
END $$;
