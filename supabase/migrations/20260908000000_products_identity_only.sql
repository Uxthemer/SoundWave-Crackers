/*
  # products becomes identity-only

  Seasons phase 1 moved every commercial field — price, stock, content,
  display order — onto product_seasons, so an archived season reproduces the
  price list exactly as it was printed. The legacy columns on products were
  left in place for the backfill, but actual_price and offer_price are still
  NOT NULL with no default, so any INSERT that omits them fails:

      null value in column "actual_price" of relation "products"
      violates not-null constraint

  Every write path in the app (add product, bulk add, bulk import, excel
  import) now sends identity only, so the constraints are what is wrong, not
  the callers. This drops NOT NULL and gives the leftovers a default so the
  rows that still carry backfilled values keep them and new rows stop failing.

  The columns are kept rather than dropped: order_items and older reports
  still join against them, and dropping is a one-way door.
*/

DO $$
DECLARE
  col text;
BEGIN
  -- Legacy commercial columns; only touch the ones that actually exist,
  -- since several were added through the dashboard rather than a migration.
  FOREACH col IN ARRAY ARRAY[
    'actual_price',
    'offer_price',
    'discount_percentage',
    'stock',
    'content',
    'reorder_level',
    'order',
    'is_active',
    'apr'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'products'
        AND column_name  = col
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.products ALTER COLUMN %I DROP NOT NULL', col
      );
    END IF;
  END LOOP;
END $$;

-- Numeric leftovers default to 0 so a partially-migrated caller that still
-- writes them is not surprised by NULL arithmetic.
DO $$
DECLARE
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'actual_price', 'offer_price', 'discount_percentage', 'stock'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'products'
        AND column_name  = col
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.products ALTER COLUMN %I SET DEFAULT 0', col
      );
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE public.products IS
  'Product identity, shared across seasons. Price, stock, content and display '
  'order live on product_seasons; the like-named columns here are legacy '
  'leftovers from before the season split and are no longer written.';
