/*
  # Stock movements for orders

  ## What was wrong

  Stock was being moved in three different places, none of which agreed:

  * `update_stock_on_order`, a trigger from before the season split, still
    wrote `products.stock` -- the legacy column nothing reads any more. The
    stock the Stock Management page shows lives on `product_seasons.stock`.
  * Placing an order therefore did not reduce the stock anyone can see. The
    client-side decrement in `createOrder` and the check in the cart had both
    been commented out, and the guest checkout function never had one.
  * Cancelling an order DID add stock back, from the browser, to
    `product_seasons`. So a sale-then-cancel cycle INVENTED stock, and an
    order that was simply placed consumed none.

  Editing an order adjusted the difference from the browser too, which worked
  only for orders edited through that one screen while signed in as an admin.

  ## What this does instead

  One place, in the database, for every path -- signed-in checkout, guest
  checkout, admin edit, cancellation, deletion:

  * `stock_movements` records every unit taken out of a season's stock, keyed
    to the order line that took it. It is the ledger: stock can always be
    explained, and applying twice is impossible because the row is already
    there.
  * A pack line explodes into its components. Ordering "120 shot + Family Pack
    1" moves stock for the 120 shot AND for the kuruvi, 30 shot and 60 shot
    inside the pack.
  * Cancelling reverses exactly what was taken. Un-cancelling takes it again.

  ## Deliberately not backfilled

  Existing orders have no movement rows, so nothing is reversed for them and
  no historical stock is rewritten. Cancelling an order placed before this
  migration will not add stock back -- there is no record that any was taken,
  and inventing one would corrupt the very counts this is meant to fix.
*/

-- ---------------------------------------------------------------------------
-- 1. The ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  season_id     uuid NOT NULL REFERENCES public.seasons(id),
  product_id    uuid NOT NULL REFERENCES public.products(id),
  -- Units taken OUT of stock. Always positive; reversing deletes the row.
  quantity      integer NOT NULL CHECK (quantity > 0),
  -- Set when the line was a pack, so the ledger says why this product moved.
  combo_pack_id uuid REFERENCES public.combo_packs(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_movements_item_idx
  ON public.stock_movements (order_item_id);
CREATE INDEX IF NOT EXISTS stock_movements_order_idx
  ON public.stock_movements (order_id);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx
  ON public.stock_movements (season_id, product_id);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read stock movements" ON public.stock_movements;
CREATE POLICY "Admins can read stock movements"
  ON public.stock_movements FOR SELECT TO authenticated
  USING (public.season_is_admin());

-- Only the triggers below write here, and they are SECURITY DEFINER.
REVOKE ALL ON public.stock_movements FROM anon, authenticated;
GRANT SELECT ON public.stock_movements TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. What one order line actually consumes
--
-- A product line consumes itself. A pack line consumes each component,
-- multiplied out by how many packs were ordered.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.order_item_components(p_item_id uuid)
RETURNS TABLE (product_id uuid, quantity integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT oi.product_id, oi.quantity
  FROM public.order_items oi
  WHERE oi.id = p_item_id AND oi.product_id IS NOT NULL

  UNION ALL

  SELECT cpi.product_id, cpi.quantity * oi.quantity
  FROM public.order_items oi
  JOIN public.combo_pack_items cpi ON cpi.combo_pack_id = oi.combo_pack_id
  WHERE oi.id = p_item_id AND oi.combo_pack_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.order_item_components(uuid) IS
  'The products and quantities one order line takes out of stock. A pack line '
  'expands to its contents.';

-- ---------------------------------------------------------------------------
-- 3. Is this order's stock supposed to be committed right now?
--
-- Everything except a cancelled order holds its stock. An order with no
-- season cannot move any: there is no per-season row to move it on.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.order_holds_stock(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.season_id IS NOT NULL
     AND COALESCE(o.status, '') <> 'Cancelled'
  FROM public.orders o
  WHERE o.id = p_order_id;
$$;

-- ---------------------------------------------------------------------------
-- 4. Apply and reverse
--
-- SECURITY DEFINER because the people who trigger these -- a signed-out
-- shopper, a customer cancelling -- have no write access to product_seasons,
-- and must not be given any.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_order_item_stock(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id  uuid;
  v_season_id uuid;
  v_pack_id   uuid;
  v_frozen    boolean;
  v_part      record;
BEGIN
  SELECT oi.order_id, o.season_id, oi.combo_pack_id
    INTO v_order_id, v_season_id, v_pack_id
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_item_id;

  IF v_season_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.order_holds_stock(v_order_id) THEN
    RETURN;
  END IF;

  -- Already applied. This is what makes the whole thing safe to re-run.
  IF EXISTS (
    SELECT 1 FROM public.stock_movements WHERE order_item_id = p_item_id
  ) THEN
    RETURN;
  END IF;

  -- A closed season's numbers are an archive. Refusing the write here would
  -- block the order itself, so the movement is simply not recorded -- and
  -- because nothing is recorded, nothing is reversed later either.
  SELECT s.status = 'closed' AND NOT COALESCE(s.is_unlocked, false)
    INTO v_frozen
  FROM public.seasons s WHERE s.id = v_season_id;

  IF COALESCE(v_frozen, false) THEN
    RETURN;
  END IF;

  FOR v_part IN
    SELECT c.product_id, c.quantity
    FROM public.order_item_components(p_item_id) c
    WHERE c.quantity > 0
  LOOP
    UPDATE public.product_seasons
    SET stock = COALESCE(stock, 0) - v_part.quantity
    WHERE season_id = v_season_id AND product_id = v_part.product_id;

    -- No row for this product in this season means nothing to move. The
    -- order still stands; the ledger simply has nothing to say about it.
    IF FOUND THEN
      INSERT INTO public.stock_movements (
        order_item_id, order_id, season_id, product_id, quantity, combo_pack_id
      )
      VALUES (
        p_item_id, v_order_id, v_season_id,
        v_part.product_id, v_part.quantity, v_pack_id
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_order_item_stock(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_move record;
  v_frozen boolean;
BEGIN
  FOR v_move IN
    SELECT * FROM public.stock_movements WHERE order_item_id = p_item_id
  LOOP
    SELECT s.status = 'closed' AND NOT COALESCE(s.is_unlocked, false)
      INTO v_frozen
    FROM public.seasons s WHERE s.id = v_move.season_id;

    -- A frozen season keeps both the stock and the ledger row, so the debt is
    -- still on record and unlocking the season can settle it.
    CONTINUE WHEN COALESCE(v_frozen, false);

    UPDATE public.product_seasons
    SET stock = COALESCE(stock, 0) + v_move.quantity
    WHERE season_id = v_move.season_id AND product_id = v_move.product_id;

    DELETE FROM public.stock_movements WHERE id = v_move.id;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Triggers on the order line
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_order_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.apply_order_item_stock(NEW.id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Only what the line consumes matters. Editing a price or a total moves
    -- no goods, so it must not churn the ledger.
    IF NEW.quantity IS DISTINCT FROM OLD.quantity
       OR NEW.product_id IS DISTINCT FROM OLD.product_id
       OR NEW.combo_pack_id IS DISTINCT FROM OLD.combo_pack_id THEN
      PERFORM public.reverse_order_item_stock(NEW.id);
      PERFORM public.apply_order_item_stock(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  -- BEFORE DELETE: the movements cascade away with the row, so they have to
  -- be put back first.
  PERFORM public.reverse_order_item_stock(OLD.id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS order_items_stock_apply ON public.order_items;
CREATE TRIGGER order_items_stock_apply
  AFTER INSERT OR UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_item_stock();

DROP TRIGGER IF EXISTS order_items_stock_reverse ON public.order_items;
CREATE TRIGGER order_items_stock_reverse
  BEFORE DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_item_stock();

-- ---------------------------------------------------------------------------
-- 6. Trigger on the order
--
-- Cancelling gives the stock back; taking an order out of Cancelled takes it
-- again. Attaching a season to an order that had none commits it for the
-- first time.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_order_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.season_id IS NOT DISTINCT FROM OLD.season_id THEN
    RETURN NEW;
  END IF;

  IF public.order_holds_stock(NEW.id) THEN
    FOR v_item IN
      SELECT id FROM public.order_items WHERE order_id = NEW.id
    LOOP
      PERFORM public.apply_order_item_stock(v_item);
    END LOOP;
  ELSE
    FOR v_item IN
      SELECT id FROM public.order_items WHERE order_id = NEW.id
    LOOP
      PERFORM public.reverse_order_item_stock(v_item);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_stock_sync ON public.orders;
CREATE TRIGGER orders_stock_sync
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_stock();

-- Deleting an order cascades to its items, whose BEFORE DELETE trigger gives
-- the stock back, so no separate handling is needed.

-- ---------------------------------------------------------------------------
-- 7. Retire the legacy trigger
--
-- It wrote products.stock, which the season split left behind. Leaving it
-- armed would keep a second, invisible set of numbers drifting.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS update_stock_on_order ON public.order_items;
DROP FUNCTION IF EXISTS public.update_product_stock();

-- ---------------------------------------------------------------------------
-- 8. Cost snapshot for a pack line
--
-- stamp_order_item_cost() looks up one product's APR and so stamps NULL for a
-- pack. A pack's cost is the sum of what is inside it.
-- ---------------------------------------------------------------------------

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

  IF NEW.combo_pack_id IS NOT NULL THEN
    SELECT COALESCE(sum(cpi.quantity * COALESCE(psc.apr, 0)), 0)
      INTO NEW.apr_snapshot
    FROM public.combo_pack_items cpi
    LEFT JOIN public.product_season_costs psc
      ON psc.product_id = cpi.product_id AND psc.season_id = v_season
    WHERE cpi.combo_pack_id = NEW.combo_pack_id;
  ELSE
    SELECT apr INTO NEW.apr_snapshot
    FROM public.product_season_costs
    WHERE season_id = v_season AND product_id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.apply_order_item_stock(uuid)   FROM public;
REVOKE ALL ON FUNCTION public.reverse_order_item_stock(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.order_item_components(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_holds_stock(uuid)     TO authenticated;
