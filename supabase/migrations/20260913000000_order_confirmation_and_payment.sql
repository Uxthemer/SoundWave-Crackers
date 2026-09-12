/*
  # Order confirmation, and payment as its own axis

  ## The two things that were tangled

  `orders.status` was carrying two unrelated facts at once. "Payment
  Completed" sat in the same list as "Packing" and "Shipped", so recording a
  payment meant moving the order backwards out of fulfilment, and packing an
  order meant forgetting whether it had been paid for. In practice money
  arrives whenever the customer sends it -- before packing, during, or after
  delivery -- so it cannot be a step in a sequence.

  Payment now lives in its own columns, with a ledger behind it, and `status`
  describes fulfilment only.

  ## Stock now moves on confirmation, not on enquiry

  Every non-cancelled order used to hold stock the moment it was placed. An
  enquiry is not a sale: stock was committed to orders that had never been
  agreed, and the numbers on the Stock Management page were short by however
  many enquiries happened to be open.

  Stock is now committed when an order reaches "Order Confirmed" -- the point
  where someone has checked that the goods and the transport actually exist --
  and released when it is cancelled. The ledger from
  20260912010000_order_stock_movements does the moving; only the definition of
  "holds stock" changes.

  ## Confirming is serialised

  Two admins confirming two orders for the same product at the same instant
  could each read the same stock figure and both succeed. `confirm_order`
  locks the product rows it is about to spend, in a fixed order, so
  simultaneous confirmations queue behind each other and the second one sees
  what the first one took.
*/

-- ---------------------------------------------------------------------------
-- 1. Payment columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS amount_received      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status       text    NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_received_at  timestamptz,
  ADD COLUMN IF NOT EXISTS payment_note         text,
  ADD COLUMN IF NOT EXISTS confirmed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by         uuid REFERENCES auth.users(id);

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'partial', 'received', 'refunded'));

COMMENT ON COLUMN public.orders.amount_received IS
  'Sum of order_payments for this order, maintained by trigger. Never written directly.';
COMMENT ON COLUMN public.orders.payment_status IS
  'Derived from amount_received against total_amount. Independent of fulfilment status.';

CREATE INDEX IF NOT EXISTS orders_payment_status_idx
  ON public.orders (payment_status);

-- ---------------------------------------------------------------------------
-- 2. The payment ledger
--
-- A single "paid" flag cannot describe an advance followed by a balance, and
-- cannot say who took the money or when. Each receipt is a row; the order's
-- total is derived from them, so the two can never disagree.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  -- Negative amounts are refunds, which is why this is not CHECK (> 0).
  amount      numeric NOT NULL CHECK (amount <> 0),
  method      text,
  reference   text,                        -- UPI ref, cheque number, screenshot id
  note        text,
  received_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_payments_order_idx
  ON public.order_payments (order_id);

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage order payments" ON public.order_payments;
CREATE POLICY "Admins manage order payments"
  ON public.order_payments FOR ALL TO authenticated
  USING (public.season_is_admin())
  WITH CHECK (public.season_is_admin());

-- Keep the order's summary in step with its ledger, whatever changed it.
CREATE OR REPLACE FUNCTION public.sync_order_payment_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid := COALESCE(NEW.order_id, OLD.order_id);
  v_total    numeric;
  v_received numeric;
  v_last     timestamptz;
BEGIN
  SELECT COALESCE(sum(amount), 0), max(received_at)
    INTO v_received, v_last
  FROM public.order_payments WHERE order_id = v_order_id;

  SELECT total_amount INTO v_total FROM public.orders WHERE id = v_order_id;

  UPDATE public.orders
  SET amount_received = v_received,
      payment_received_at = v_last,
      payment_status =
        CASE
          WHEN v_received <= 0 THEN 'pending'
          -- A rupee of rounding should not leave an order looking unpaid.
          WHEN v_received >= COALESCE(v_total, 0) - 0.01 THEN 'received'
          ELSE 'partial'
        END
  WHERE id = v_order_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS order_payments_sync ON public.order_payments;
CREATE TRIGGER order_payments_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.order_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_payment_totals();

-- ---------------------------------------------------------------------------
-- 3. Recording a receipt
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_order_payment(
  p_order_id  uuid,
  p_amount    numeric,
  p_method    text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_note      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total    numeric;
  v_received numeric;
  v_status   text;
BEGIN
  IF NOT public.season_is_admin() THEN
    RAISE EXCEPTION 'Only admins may record a payment';
  END IF;

  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'Enter the amount received';
  END IF;

  SELECT total_amount INTO v_total FROM public.orders WHERE id = p_order_id;
  IF v_total IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  INSERT INTO public.order_payments (
    order_id, amount, method, reference, note, recorded_by
  )
  VALUES (
    p_order_id, p_amount,
    NULLIF(trim(COALESCE(p_method, '')), ''),
    NULLIF(trim(COALESCE(p_reference, '')), ''),
    NULLIF(trim(COALESCE(p_note, '')), ''),
    auth.uid()
  );

  SELECT amount_received, payment_status
    INTO v_received, v_status
  FROM public.orders WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'amount_received', v_received,
    'total_amount', v_total,
    'balance', v_total - v_received,
    'payment_status', v_status
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Stock is held from confirmation onwards
--
-- Replaces the definition from 20260912010000. The triggers that call it are
-- unchanged: moving an order into or out of this set applies or reverses its
-- movements automatically.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.order_holds_stock(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.season_id IS NOT NULL
     AND o.status IN ('Order Confirmed', 'Packing', 'Shipped', 'Delivered')
  FROM public.orders o
  WHERE o.id = p_order_id;
$$;

COMMENT ON FUNCTION public.order_holds_stock(uuid) IS
  'True while an order has goods committed to it. An enquiry has not been '
  'agreed yet and a cancelled order has been released, so neither holds any.';

-- ---------------------------------------------------------------------------
-- 5. What an order needs, aggregated
--
-- A pack line expands to its contents, and the same product can appear on
-- several lines, so the requirement has to be summed per product before it
-- can be compared with stock.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.order_stock_requirement(p_order_id uuid)
RETURNS TABLE (product_id uuid, required integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.product_id, sum(c.quantity)::integer AS required
  FROM public.order_items oi
  CROSS JOIN LATERAL public.order_item_components(oi.id) c
  WHERE oi.order_id = p_order_id
  GROUP BY c.product_id;
$$;

GRANT EXECUTE ON FUNCTION public.order_stock_requirement(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. confirm_order
--
-- The only supported way into "Order Confirmed", because it is the only path
-- that checks stock is actually there and stops two confirmations spending
-- the same units.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_order(
  p_order_id        uuid,
  p_allow_shortfall boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status    text;
  v_season    uuid;
  v_short     text[];
  v_shortfall boolean := false;
BEGIN
  IF NOT public.season_is_admin() THEN
    RAISE EXCEPTION 'Only admins may confirm an order';
  END IF;

  -- Lock the order first. Two people pressing Confirm on the same order at
  -- the same moment would otherwise both pass the checks below and the
  -- second would double-commit.
  SELECT status, season_id INTO v_status, v_season
  FROM public.orders WHERE id = p_order_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_status = 'Cancelled' THEN
    RAISE EXCEPTION 'This order is cancelled. Reopen it before confirming.';
  END IF;

  -- Already confirmed, or further along. Nothing to do, and re-running must
  -- not take the stock a second time.
  IF public.order_holds_stock(p_order_id) THEN
    RETURN jsonb_build_object('status', v_status, 'already_confirmed', true);
  END IF;

  IF v_season IS NULL THEN
    RAISE EXCEPTION
      'This order is not attached to a season, so its stock cannot be tracked.';
  END IF;

  -- Lock every product this order will spend, in a fixed order.
  --
  -- The ORDER BY is what prevents deadlock: two orders sharing two products
  -- would otherwise be able to take the locks in opposite orders and wait on
  -- each other forever. Taking them by product_id means they always queue.
  PERFORM 1
  FROM public.product_seasons ps
  JOIN public.order_stock_requirement(p_order_id) r ON r.product_id = ps.product_id
  WHERE ps.season_id = v_season
  ORDER BY ps.product_id
  FOR UPDATE OF ps;

  -- With the locks held, the figures cannot move under us.
  SELECT array_agg(
           p.name || ' (need ' || r.required || ', have ' ||
           GREATEST(COALESCE(ps.stock, 0), 0) || ')'
           ORDER BY p.name
         )
    INTO v_short
  FROM public.order_stock_requirement(p_order_id) r
  JOIN public.products p ON p.id = r.product_id
  LEFT JOIN public.product_seasons ps
    ON ps.product_id = r.product_id AND ps.season_id = v_season
  WHERE COALESCE(ps.stock, 0) < r.required;

  IF v_short IS NOT NULL AND array_length(v_short, 1) > 0 THEN
    IF NOT p_allow_shortfall THEN
      RAISE EXCEPTION 'Not enough stock: %', array_to_string(v_short, '; ');
    END IF;
    v_shortfall := true;
  END IF;

  -- The stock movements themselves are applied by orders_stock_sync, which
  -- fires on this update. Keeping it there means every route into a
  -- committed status behaves identically.
  UPDATE public.orders
  SET status = 'Order Confirmed',
      confirmed_at = now(),
      confirmed_by = auth.uid()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'status', 'Order Confirmed',
    'already_confirmed', false,
    'confirmed_with_shortfall', v_shortfall
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_order(uuid, boolean) FROM public;
REVOKE ALL ON FUNCTION public.record_order_payment(uuid, numeric, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_order(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_payment(uuid, numeric, text, text, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Migrate what is already there
--
-- Two things have to be reconciled, in this order:
--
--   a) "Payment Completed" was the only way to say an order had been paid.
--      That fact is preserved by recording a payment for the full amount and
--      moving the order to Order Confirmed -- which is what it meant.
--
--   b) Stock. Every non-cancelled order currently holds its stock under the
--      old rule. Under the new one, open enquiries do not. Their movements
--      are reversed so the stock figures start out telling the truth.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_order record;
  v_item  uuid;
BEGIN
  -- (a) Preserve the payment fact before the status is rewritten.
  INSERT INTO public.order_payments (order_id, amount, method, note, received_at)
  SELECT
    o.id,
    o.total_amount,
    o.payment_method,
    'Recorded from the legacy "Payment Completed" status',
    COALESCE(o.created_at, now())
  FROM public.orders o
  WHERE o.status = 'Payment Completed'
    AND o.total_amount > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.order_payments op WHERE op.order_id = o.id
    );

  UPDATE public.orders
  SET status = 'Order Confirmed',
      confirmed_at = COALESCE(confirmed_at, created_at)
  WHERE status = 'Payment Completed';

  -- (b) Bring the ledger into line with the new rule, both ways.
  FOR v_order IN
    SELECT id FROM public.orders
  LOOP
    IF public.order_holds_stock(v_order.id) THEN
      FOR v_item IN
        SELECT id FROM public.order_items WHERE order_id = v_order.id
      LOOP
        PERFORM public.apply_order_item_stock(v_item);
      END LOOP;
    ELSE
      FOR v_item IN
        SELECT id FROM public.order_items WHERE order_id = v_order.id
      LOOP
        PERFORM public.reverse_order_item_stock(v_item);
      END LOOP;
    END IF;
  END LOOP;
END $$;
