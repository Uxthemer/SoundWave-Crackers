-- ============================================================================
-- Close the cost-price leak now, without dropping anything.
--
-- products is world-readable ("Products are viewable by everyone"), so
-- products.apr — the cost price — is readable by anyone hitting the API,
-- signed in or not.
--
-- Phase 1 moved cost into product_season_costs (admin-only) but deliberately
-- left products.apr in place as a rollback path, which means the exposure stays
-- open until the phase 3 cleanup drops that column. This migration closes it in
-- the meantime.
--
-- HOW: a table-wide GRANT SELECT covers every column, and a column-level REVOKE
-- against it is silently a no-op (verified). The only thing that works is to
-- drop the table-wide grant and re-grant an explicit column list that omits apr.
--
-- CONSEQUENCE: `SELECT *` on products stops working for anon and authenticated.
-- Named-column selects are unaffected. No current code does `select('*')` on
-- products — the storefront reads the season_catalog view, Stock Management and
-- Analytics read product_season_costs, and BulkImportModal selects only
-- id/product_code. If you later add a `select('*')` against products, grant the
-- new column here or finish the phase 3 drop instead.
--
-- Run AFTER 20260809000000_seasons_phase1.sql.
-- ============================================================================

DO $$
DECLARE
  v_cols        text;
  v_missing     integer;
  v_total       integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'apr'
  ) THEN
    RAISE NOTICE 'products.apr no longer exists — nothing to do.';
    RETURN;
  END IF;

  -- Refuse to hide the column if the phase 1 backfill did not actually copy the
  -- cost data across; otherwise cost would become unreachable from the app.
  SELECT count(*) INTO v_total FROM public.products WHERE apr IS NOT NULL;
  SELECT count(*) INTO v_missing
  FROM public.products p
  WHERE p.apr IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.product_season_costs c
      WHERE c.product_id = p.id AND c.apr IS NOT NULL
    );

  IF v_missing > 0 THEN
    RAISE EXCEPTION
      'Aborting: % of % products with a cost price have no row in product_season_costs. Run the phase 1 backfill first.',
      v_missing, v_total;
  END IF;

  -- Replace the table-wide grant with an explicit column list omitting apr.
  REVOKE SELECT ON public.products FROM anon;
  REVOKE SELECT ON public.products FROM authenticated;

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'products'
    AND column_name <> 'apr';

  EXECUTE format('GRANT SELECT (%s) ON public.products TO anon', v_cols);
  EXECUTE format('GRANT SELECT (%s) ON public.products TO authenticated', v_cols);

  RAISE NOTICE
    'products.apr is no longer readable by anon or authenticated (% products verified as migrated).',
    v_total;
END $$;
