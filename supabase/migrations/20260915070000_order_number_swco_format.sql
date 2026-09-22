/*
  # Order numbers: SWCO<year><4 random>-<sequence>

      SWCO2026K7P2-0005

  Shorter than SWC-O-2026-K7P2QX9A-0005 (20260915000000), which was too long
  to read out over the phone or fit in the orders table. The parts keep their
  jobs:

    * SWCO      -- SoundWave Crackers, Order
    * 2026      -- the year the order was placed (India time)
    * K7P2      -- 4 random characters, so a number cannot be guessed from
                   your own; same alphabet as before, without 0/O, 1/I/L
    * -0005     -- the order's place in the year, restarting each January

  The sequence carries on from the SWC-O- numbers already issued this year,
  so switching format mid-season does not start the count again at 0001.

  Existing orders keep the numbers they were given -- customers already have
  them. SWC-###, SWC-O-... and SWCO... are all looked up the same way.
*/

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
  v_random text;
  v_id     text;
  i        integer;
BEGIN
  -- Every caller queues here, so no two orders read the same "highest so far".
  PERFORM pg_advisory_xact_lock(hashtext('orders.short_id'));

  SELECT COALESCE(MAX(seq), 0) + 1
    INTO v_next
  FROM (
    SELECT (regexp_match(short_id, '^SWCO' || v_year || '[A-Z0-9]{4}-(\d+)$'))[1]::integer AS seq
    FROM public.orders
    WHERE short_id LIKE 'SWCO' || v_year || '%'
    UNION ALL
    SELECT (regexp_match(short_id, '^SWC-O-' || v_year || '-[A-Z0-9]{8}-(\d+)$'))[1]::integer
    FROM public.orders
    WHERE short_id LIKE 'SWC-O-' || v_year || '-%'
  ) issued;

  LOOP
    -- gen_random_uuid() draws from the system's secure random source;
    -- random() is predictable.
    v_bytes  := uuid_send(gen_random_uuid());
    v_random := '';
    FOR i IN 0..3 LOOP
      v_random := v_random ||
        substr(c_alphabet, (get_byte(v_bytes, i) % length(c_alphabet)) + 1, 1);
    END LOOP;

    -- lpad cuts a longer string down, so order 10000 keeps all its digits.
    v_id := 'SWCO' || v_year || v_random || '-' ||
            lpad(v_next::text, greatest(4, length(v_next::text)), '0');

    -- The sequence alone already makes it unique; this guards the impossible.
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE short_id = v_id);
  END LOOP;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.next_order_short_id() FROM public;
GRANT EXECUTE ON FUNCTION public.next_order_short_id() TO anon, authenticated;

-- Every insert gets a number, whichever path it came through. The guest
-- checkout issues its number first and inserts it, so a number in the current
-- format is kept -- replacing it would give the customer one number and the
-- database another. Anything else (blank, or an older format sent by a
-- browser still running old code) is replaced.
CREATE OR REPLACE FUNCTION public.assign_order_short_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.short_id IS NULL
     OR NEW.short_id !~ '^SWCO\d{4}[A-Z0-9]{4}-\d{4,}$' THEN
    NEW.short_id := public.next_order_short_id();
  END IF;
  RETURN NEW;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS orders_short_id_unique_swco
  ON public.orders (short_id)
  WHERE short_id LIKE 'SWCO%';
