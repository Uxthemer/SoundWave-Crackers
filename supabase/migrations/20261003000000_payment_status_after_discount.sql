/*
  # Payment status is measured against the amount actually payable

  `payment_status` was derived from `amount_received` against `total_amount`,
  which is the gross before any discount. An order of 10,000 with a 1,000
  discount is settled by 9,000, but it stayed "Part paid" with 1,000 "due"
  that nobody was ever going to send.

  The payable amount is now `total_amount - discount_amt` (never below zero),
  and the status is worked out from that.

  ## Why a trigger on orders as well

  The status used to change only when a payment was recorded. A discount is
  usually agreed after an advance has come in, and Edit Order can change the
  total too -- either one moves the goalposts without a payment row being
  touched. Deriving the status in a BEFORE trigger on `orders` itself means
  every write that changes the total, the discount or the amount received
  leaves the status right, whichever screen made it.

  'refunded' is left alone: nothing derives it, so if it has been set by
  hand it is a decision, not arithmetic.
*/

CREATE OR REPLACE FUNCTION public.order_payment_status(
  p_total    numeric,
  p_discount numeric,
  p_received numeric
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    -- Nothing received is unpaid even when nothing is owed: an order whose
    -- total is still 0 while it is being built must not read as paid and
    -- land on the Ready for packing list.
    WHEN COALESCE(p_received, 0) <= 0 THEN 'pending'
    -- A rupee of rounding should not leave an order looking unpaid.
    WHEN COALESCE(p_received, 0)
         >= GREATEST(COALESCE(p_total, 0) - COALESCE(p_discount, 0), 0) - 0.01
      THEN 'received'
    ELSE 'partial'
  END;
$$;

CREATE OR REPLACE FUNCTION public.orders_derive_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status IS DISTINCT FROM 'refunded' THEN
    NEW.payment_status := public.order_payment_status(
      NEW.total_amount, NEW.discount_amt, NEW.amount_received
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_payment_status_derive ON public.orders;
CREATE TRIGGER orders_payment_status_derive
  BEFORE INSERT OR UPDATE OF total_amount, discount_amt, amount_received, payment_status
  ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_derive_payment_status();

-- The ledger sync keeps writing amount_received; the trigger above now owns
-- the status, so it is computed in one place only.
CREATE OR REPLACE FUNCTION public.sync_order_payment_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid := COALESCE(NEW.order_id, OLD.order_id);
  v_received numeric;
  v_last     timestamptz;
BEGIN
  SELECT COALESCE(sum(amount), 0), max(received_at)
    INTO v_received, v_last
  FROM public.order_payments WHERE order_id = v_order_id;

  UPDATE public.orders
  SET amount_received = v_received,
      payment_received_at = v_last
  WHERE id = v_order_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- The balance handed back is what is still owed after the discount.
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
  v_discount numeric;
  v_payable  numeric;
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

  SELECT total_amount, COALESCE(discount_amt, 0), amount_received, payment_status
    INTO v_total, v_discount, v_received, v_status
  FROM public.orders WHERE id = p_order_id;

  v_payable := GREATEST(v_total - v_discount, 0);

  RETURN jsonb_build_object(
    'amount_received', v_received,
    'total_amount', v_total,
    'discount_amt', v_discount,
    'payable', v_payable,
    'balance', v_payable - v_received,
    'payment_status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_payment(uuid, numeric, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_order_payment(uuid, numeric, text, text, text)
  TO authenticated;

COMMENT ON COLUMN public.orders.payment_status IS
  'Derived from amount_received against total_amount - discount_amt. Independent of fulfilment status.';

-- Bring existing orders into line: every discounted order that was stuck on
-- "Part paid" for the discount it was given.
UPDATE public.orders
SET payment_status = public.order_payment_status(total_amount, discount_amt, amount_received)
WHERE payment_status IS DISTINCT FROM 'refunded'
  AND payment_status IS DISTINCT FROM
      public.order_payment_status(total_amount, discount_amt, amount_received);
