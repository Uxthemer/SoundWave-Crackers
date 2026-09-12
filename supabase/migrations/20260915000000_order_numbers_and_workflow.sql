/*
  # Order numbers, and the order workflow enforced

  ## 1. Order numbers: SWC-O-<year>-<8 random>-<sequence>

      SWC-O-2026-K7P2QX9A-0001

  The old numbers ran SWC-001, SWC-002, ... Guest tracking accepts an order
  number together with a phone number, and a number that only counts up can
  be guessed from your own: the random block makes that useless. The year and
  the sequence stay readable, so the counter still says how many orders the
  year has taken, and restarts at 0001 each January.

  The random block avoids 0/O, 1/I/L, because these numbers get read out over
  the phone.

  Numbers are now issued by the DATABASE for every path. The signed-in
  checkout used to work its own out in the browser by reading the latest
  order and adding one; two customers checking out together could be given
  the same number. A trigger now fills short_id on insert, under the same
  lock the guest checkout already used.

  Existing orders keep their SWC-### numbers; both formats are looked up.

  ## 2. The workflow, enforced

      Enquiry Received --confirm--> Order Confirmed -> Packing -> Shipped -> Delivered
             |                              |  (any of these)
             +----------> Cancelled <-------+
                              |
                              +--reopen--> Enquiry Received

  Confirming is the step that checks stock and takes it (confirm_order, from
  20260913000000). Nothing stopped an order being set straight to Packing
  from Enquiry Received, which committed stock through the trigger without
  that check ever running. A trigger now refuses:

    * Packing / Shipped / Delivered for an order that was never confirmed;
    * a confirmed order going back to Enquiry Received (that is a Cancel);
    * a cancelled order going anywhere but back to Enquiry Received.

  Moves among the confirmed statuses stay free, so a slip can be corrected;
  they all hold stock, so none of them moves any.
*/

-- ---------------------------------------------------------------------------
-- 1. The number generator
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.next_order_short_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- 31 characters: A-Z and 2-9, without the ones people misread.
  c_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_year   text := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY');
  v_next   integer;
  v_bytes  bytea;
  v_random text := '';
  v_id     text;
  i        integer;
BEGIN
  -- Same lock as before: every caller queues here, so no two orders read the
  -- same "highest so far".
  PERFORM pg_advisory_xact_lock(hashtext('orders.short_id'));

  SELECT COALESCE(
           MAX((regexp_match(short_id, '^SWC-O-' || v_year || '-[A-Z0-9]{8}-(\d+)$'))[1]::integer),
           0
         ) + 1
    INTO v_next
  FROM public.orders
  WHERE short_id LIKE 'SWC-O-' || v_year || '-%';

  -- gen_random_uuid() is in core Postgres and draws from the system's secure
  -- random source; its bytes are used rather than random(), which is
  -- predictable.
  LOOP
    v_bytes  := uuid_send(gen_random_uuid());
    v_random := '';
    FOR i IN 0..7 LOOP
      v_random := v_random ||
        substr(c_alphabet, (get_byte(v_bytes, i) % length(c_alphabet)) + 1, 1);
    END LOOP;

    v_id := 'SWC-O-' || v_year || '-' || v_random || '-' || lpad(v_next::text, 4, '0');

    -- The sequence alone already makes it unique; this guards the impossible.
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE short_id = v_id);
  END LOOP;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.next_order_short_id() FROM public;
GRANT EXECUTE ON FUNCTION public.next_order_short_id() TO anon, authenticated;

-- Every insert gets a number, whichever path it came through.
CREATE OR REPLACE FUNCTION public.assign_order_short_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Replaces anything in the old SWC-### format too: a browser still running
  -- the previous code must not keep issuing numbers the new scheme skips.
  IF NEW.short_id IS NULL
     OR trim(NEW.short_id) = ''
     OR NEW.short_id !~ '^SWC-O-' THEN
    NEW.short_id := public.next_order_short_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_assign_short_id ON public.orders;
CREATE TRIGGER orders_assign_short_id
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_order_short_id();

-- New-format numbers are unique. Old ones are left alone: the browser-side
-- generator may already have issued duplicates, and failing this migration
-- over history would help nobody.
CREATE UNIQUE INDEX IF NOT EXISTS orders_short_id_unique_new
  ON public.orders (short_id)
  WHERE short_id LIKE 'SWC-O-%';

-- ---------------------------------------------------------------------------
-- 2. Status transitions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_committed constant text[] :=
    ARRAY['Order Confirmed', 'Packing', 'Shipped', 'Delivered'];
  c_known constant text[] :=
    ARRAY['Enquiry Received', 'Order Confirmed', 'Packing', 'Shipped',
          'Delivered', 'Cancelled'];
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Rows still carrying a status from before the workflow existed are let
  -- through once, into any known status, so they can be tidied up.
  IF NOT (OLD.status = ANY (c_known)) THEN
    RETURN NEW;
  END IF;

  -- Cancelled is a stop. The only way on is back to the start, where the
  -- order has to be confirmed -- and its stock checked -- all over again.
  IF OLD.status = 'Cancelled' AND NEW.status <> 'Enquiry Received' THEN
    RAISE EXCEPTION
      'This order is cancelled. Reopen it first, then confirm it again.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Fulfilment starts at confirmation. Going straight to Packing would take
  -- the stock without the availability check confirm_order does.
  IF NEW.status = ANY (ARRAY['Packing', 'Shipped', 'Delivered'])
     AND NOT (OLD.status = ANY (c_committed)) THEN
    RAISE EXCEPTION
      'Confirm this order before moving it to %.', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- A confirmed order that is not going ahead is cancelled, which releases
  -- its stock; quietly turning it back into an enquiry would hide that.
  IF OLD.status = ANY (c_committed) AND NEW.status = 'Enquiry Received' THEN
    RAISE EXCEPTION
      'A confirmed order cannot go back to Enquiry Received. Cancel it instead.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- BEFORE, so a refused move never reaches orders_stock_sync (AFTER UPDATE)
-- and never touches stock.
DROP TRIGGER IF EXISTS orders_status_transition ON public.orders;
CREATE TRIGGER orders_status_transition
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_status_transition();
