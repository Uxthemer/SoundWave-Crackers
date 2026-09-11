-- ---------------------------------------------------------------------------
-- Season price-list discount
--
-- The price list is built the other way round from how it is printed: the
-- selling ("offer") price is what is negotiated per product, and the struck-out
-- "actual" price is derived from it by a single discount percentage that holds
-- for the whole price list.
--
--     actual_price = offer_price / (1 - discount/100)
--
-- e.g. offer 8 at 80% -> 8 / 0.20 = 40.
--
-- The percentage belongs to the SEASON, not to the product: each year's price
-- list is printed at its own headline discount, and an archived season must
-- still reproduce the discount it was printed with.
-- ---------------------------------------------------------------------------

ALTER TABLE public.seasons
  ADD COLUMN IF NOT EXISTS price_list_discount_percentage numeric NOT NULL DEFAULT 0;

-- 100% would divide by zero; a negative discount would mark the price UP.
ALTER TABLE public.seasons
  DROP CONSTRAINT IF EXISTS seasons_price_list_discount_range;
ALTER TABLE public.seasons
  ADD CONSTRAINT seasons_price_list_discount_range
  CHECK (price_list_discount_percentage >= 0 AND price_list_discount_percentage < 100);

COMMENT ON COLUMN public.seasons.price_list_discount_percentage IS
  'Headline price-list discount for this season. actual_price is derived as offer_price / (1 - pct/100).';

-- ---------------------------------------------------------------------------
-- Carry the configured discount forward when a season is copied.
--
-- copy_season_products() already copies every commercial field; the season-level
-- discount is part of the same commercial setup, so a draft built from last
-- season starts on last season's discount rather than on 0.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.copy_season_discount(
  p_source_season uuid,
  p_target_season uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.season_is_admin() THEN
    RAISE EXCEPTION 'Only admins may configure a season';
  END IF;

  UPDATE public.seasons t
  SET price_list_discount_percentage = s.price_list_discount_percentage
  FROM public.seasons s
  WHERE s.id = p_source_season
    AND t.id = p_target_season
    AND t.status <> 'closed';
END;
$$;

-- ---------------------------------------------------------------------------
-- Bulk re-price: apply the season's discount to every product in it.
--
-- Used by the "recalculate actual prices" action in Stock Management, so that
-- changing the headline discount does not mean re-entering several hundred
-- products by hand. Offer prices are never touched — they are the input.
--
-- Runs as a single statement so a half-applied price list is not possible, and
-- re-checks the caller's role and the season's freeze state in the database.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_season_price_list_discount(
  p_season uuid,
  p_only_missing boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pct      numeric;
  v_status   text;
  v_unlocked boolean;
  v_count    integer;
BEGIN
  IF NOT public.season_is_admin() THEN
    RAISE EXCEPTION 'Only admins may re-price a season';
  END IF;

  SELECT price_list_discount_percentage, status, is_unlocked
    INTO v_pct, v_status, v_unlocked
  FROM public.seasons WHERE id = p_season;

  IF v_pct IS NULL THEN
    RAISE EXCEPTION 'Season not found';
  END IF;

  IF v_status = 'closed' AND NOT COALESCE(v_unlocked, false) THEN
    RAISE EXCEPTION
      'Season is closed and read-only. A superadmin must unlock it before making changes.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_pct <= 0 THEN
    RAISE EXCEPTION 'Set a price list discount for this season first';
  END IF;

  UPDATE public.product_seasons
  SET actual_price        = round(offer_price / (1 - v_pct / 100.0), 2),
      discount_percentage = v_pct
  WHERE season_id = p_season
    AND offer_price > 0
    -- "Fill in the blanks" mode leaves prices someone set by hand alone.
    AND (NOT p_only_missing OR COALESCE(actual_price, 0) <= 0);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.copy_season_discount(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.apply_season_price_list_discount(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.copy_season_discount(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_season_price_list_discount(uuid, boolean) TO authenticated;
