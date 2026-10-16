/*
  # Quotation lines carry their cost, family packs included

  The Quotations tab now shows each quotation's profit, worked out from the
  cost frozen on each line (quotation_items.apr_snapshot) -- the same way an
  order's profit reads order_items.apr_snapshot.

  stamp_quotation_item_cost() was written before family packs and never
  caught up with stamp_order_item_cost() (20260915040000_pack_products.sql):
  a pack line has no product_id, so it was stamped with nothing, and a quote
  full of packs would have shown its whole value as profit. It now costs a
  pack as the sum of its contents, exactly as an order line is costed.

  Lines already saved without a cost are filled in once, from their
  quotation's season (or the live one when the quotation has none), so old
  quotations show a profit too. A line whose product has no cost recorded
  stays null, and the screen says so rather than counting it as free.
*/

CREATE OR REPLACE FUNCTION public.stamp_quotation_item_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season uuid;
  v_pack   uuid;
BEGIN
  IF NEW.apr_snapshot IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT season_id INTO v_season FROM public.quotations WHERE id = NEW.quotation_id;
  IF v_season IS NULL THEN
    v_season := public.current_season_id();
  END IF;

  v_pack := NEW.combo_pack_id;
  IF v_pack IS NULL AND NEW.product_id IS NOT NULL THEN
    SELECT combo_pack_id INTO v_pack FROM public.products WHERE id = NEW.product_id;
  END IF;

  IF v_pack IS NOT NULL THEN
    SELECT COALESCE(sum(cpi.quantity * COALESCE(psc.apr, 0)), 0)
      INTO NEW.apr_snapshot
    FROM public.combo_pack_items cpi
    LEFT JOIN public.product_season_costs psc
      ON psc.product_id = cpi.product_id AND psc.season_id = v_season
    WHERE cpi.combo_pack_id = v_pack;
  ELSE
    SELECT apr INTO NEW.apr_snapshot
    FROM public.product_season_costs
    WHERE season_id = v_season AND product_id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Fill in lines saved before this, one season lookup per line.
WITH lines AS (
  SELECT
    qi.id,
    COALESCE(q.season_id, public.current_season_id()) AS season_id,
    COALESCE(qi.combo_pack_id, p.combo_pack_id) AS pack_id,
    qi.product_id
  FROM public.quotation_items qi
  JOIN public.quotations q ON q.id = qi.quotation_id
  LEFT JOIN public.products p ON p.id = qi.product_id
  WHERE qi.apr_snapshot IS NULL
),
costed AS (
  SELECT
    l.id,
    CASE
      WHEN l.pack_id IS NOT NULL THEN (
        SELECT COALESCE(sum(cpi.quantity * COALESCE(psc.apr, 0)), 0)
        FROM public.combo_pack_items cpi
        LEFT JOIN public.product_season_costs psc
          ON psc.product_id = cpi.product_id AND psc.season_id = l.season_id
        WHERE cpi.combo_pack_id = l.pack_id
      )
      ELSE (
        SELECT psc.apr
        FROM public.product_season_costs psc
        WHERE psc.product_id = l.product_id AND psc.season_id = l.season_id
      )
    END AS apr
  FROM lines l
)
UPDATE public.quotation_items qi
SET apr_snapshot = c.apr
FROM costed c
WHERE qi.id = c.id
  AND c.apr IS NOT NULL;
