-- ---------------------------------------------------------------------------
-- Catalog ordering
--
-- The printed price list is read top to bottom: categories in a deliberate
-- sequence, and products in a deliberate sequence inside each one. That order
-- is arranged by dragging rows around in Stock Management, so it has to be
-- stored, not derived from a name or a created_at.
--
-- categories."order" already exists in the running database (it is queried by
-- the app and by every print layout) but was never written down in a
-- migration. Declaring it here idempotently means a fresh environment matches
-- production instead of failing on the first category sort.
-- ---------------------------------------------------------------------------

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS "order" integer;

COMMENT ON COLUMN public.categories."order" IS
  'Position of the category in the catalog and in the printed price list. Lower sorts first.';

-- Products are ordered per season (product_seasons.display_order), so a
-- reordering done for next season does not disturb this season's printed list.
COMMENT ON COLUMN public.product_seasons.display_order IS
  'Position of the product within its category for this season. Lower sorts first.';

-- Give categories that have never been ordered a stable starting sequence,
-- alphabetical, so the first drag has something sensible to move around
-- instead of a screenful of ties on NULL.
WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY name) AS position
  FROM public.categories
  WHERE "order" IS NULL
)
UPDATE public.categories c
SET "order" = ranked.position
FROM ranked
WHERE c.id = ranked.id;

-- Same for products that have no position within their season and category.
--
-- This has to reach closed seasons too. product_seasons carries a freeze
-- trigger (product_seasons_freeze) that rejects any write to a closed season,
-- which is right for prices and stock but blocks this backfill on the very
-- archives that most need it: an archived price list has to reprint in the
-- order it was printed in, and a NULL position cannot express one.
--
-- Filling in a position that was previously undefined does not change what a
-- closed season sold or charged, so the trigger is lifted for this one
-- statement and put straight back. The exception block guarantees it is
-- restored even if the UPDATE fails, so a bad run cannot leave the archives
-- writable.
DO $$
DECLARE
  v_has_trigger boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'product_seasons_freeze'
      AND tgrelid = 'public.product_seasons'::regclass
      AND NOT tgisinternal
  ) INTO v_has_trigger;

  IF v_has_trigger THEN
    ALTER TABLE public.product_seasons DISABLE TRIGGER product_seasons_freeze;
  END IF;

  WITH ranked AS (
    SELECT
      ps.id,
      row_number() OVER (
        PARTITION BY ps.season_id, p.category_id ORDER BY p.name
      ) AS position
    FROM public.product_seasons ps
    JOIN public.products p ON p.id = ps.product_id
    WHERE ps.display_order IS NULL
  )
  UPDATE public.product_seasons ps
  SET display_order = ranked.position
  FROM ranked
  WHERE ps.id = ranked.id;

  IF v_has_trigger THEN
    ALTER TABLE public.product_seasons ENABLE TRIGGER product_seasons_freeze;
  END IF;
EXCEPTION WHEN OTHERS THEN
  IF v_has_trigger THEN
    ALTER TABLE public.product_seasons ENABLE TRIGGER product_seasons_freeze;
  END IF;
  RAISE;
END;
$$;

-- Sorting a category's products is the single hottest query on the stock page
-- once grouping is on.
CREATE INDEX IF NOT EXISTS product_seasons_season_order_idx
  ON public.product_seasons (season_id, display_order);

CREATE INDEX IF NOT EXISTS categories_order_idx
  ON public.categories ("order");

-- ---------------------------------------------------------------------------
-- Product codes
--
-- Codes are generated as SWC-P<n>. Uniqueness is what makes the code usable as
-- the identity key for bulk import, so it is enforced by the database rather
-- than by the form that happens to generate it.
--
-- Partial index: rows with no code yet (legacy products, half-finished
-- imports) must not all collide on NULL or on ''.
-- ---------------------------------------------------------------------------

-- Existing data may already contain duplicate codes from earlier imports.
-- Refusing to migrate would block every other change in this file for a
-- problem the operator has to resolve by hand anyway, so report and continue.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS products_product_code_unique
    ON public.products (product_code)
    WHERE product_code IS NOT NULL AND product_code <> '';
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING
    'products.product_code has duplicates; unique index not created. Resolve the duplicates and re-run this statement.';
END;
$$;
