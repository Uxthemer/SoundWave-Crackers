-- ---------------------------------------------------------------------------
-- Guest checkout
--
-- Until now an order could only exist against an auth user. Most customers
-- arrive from a WhatsApp link days before Diwali and will not create an
-- account to buy one box of sparklers, so orders are now allowed to stand on
-- their own: user_id becomes optional and a guest order is identified by the
-- phone number and short id printed on its confirmation.
--
-- Nothing about the signed-in flow changes. Existing orders keep their
-- user_id, existing RLS policies are untouched, and My Orders keeps working
-- exactly as it did.
--
-- The guest path deliberately does NOT get an open INSERT policy on orders.
-- An anonymous client that can insert rows can insert any rows — any price,
-- any total, any status. Instead it goes through one SECURITY DEFINER
-- function that re-derives every price from the active season's catalog and
-- ignores what the browser claimed.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. An order no longer needs an account behind it.
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN public.orders.user_id IS
  'The account that placed the order, or NULL for a guest checkout. Guest orders are identified by short_id + phone.';

-- Guests are looked up by exactly these two columns, together.
CREATE INDEX IF NOT EXISTS orders_short_id_idx ON public.orders (short_id);
CREATE INDEX IF NOT EXISTS orders_phone_idx ON public.orders (phone);

-- ---------------------------------------------------------------------------
-- 2. Short id generation
--
-- The client used to read the most recent short_id and add one, which hands
-- the same number to two people who check out in the same second. Placing it
-- behind a transaction-scoped advisory lock makes concurrent checkouts queue
-- instead of collide, and max() ignores creation order entirely.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.next_order_short_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  -- Any constant works; it only has to be the same one for every caller.
  PERFORM pg_advisory_xact_lock(hashtext('orders.short_id'));

  SELECT COALESCE(
           MAX((regexp_match(short_id, '^SWC-(\d+)$'))[1]::integer),
           0
         ) + 1
    INTO v_next
  FROM public.orders
  WHERE short_id ~ '^SWC-\d+$';

  RETURN 'SWC-' || lpad(v_next::text, 3, '0');
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. create_guest_order
--
-- The whole public surface of guest checkout. Everything a browser sends is
-- treated as a request, not as data: prices, totals and the season all come
-- from the database, and only the delivery details and the chosen quantities
-- are taken from the caller.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_guest_order(
  p_delivery jsonb,
  p_items    jsonb,                      -- [{ "product_id": uuid, "quantity": int }]
  p_payment_method text DEFAULT 'offline'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id    uuid;
  v_phone        text;
  v_pincode      text;
  v_total        numeric;
  v_item_count      integer;
  v_requested_count integer;
  v_recent       integer;
  v_order_id     uuid;
  v_short_id     text;
  v_min_order    numeric := 3000;
BEGIN
  -- --- delivery details ---------------------------------------------------
  v_phone   := trim(COALESCE(p_delivery->>'phone', ''));
  v_pincode := trim(COALESCE(p_delivery->>'pincode', ''));

  IF COALESCE(trim(p_delivery->>'customerName'), '') = '' THEN
    RAISE EXCEPTION 'Please enter your name';
  END IF;
  IF v_phone !~ '^[6-9][0-9]{9}$' THEN
    RAISE EXCEPTION 'Please enter a valid 10-digit phone number';
  END IF;
  IF v_pincode !~ '^[1-9][0-9]{5}$' THEN
    RAISE EXCEPTION 'Please enter a valid 6-digit pincode';
  END IF;
  IF COALESCE(trim(p_delivery->>'address'), '') = ''
     OR COALESCE(trim(p_delivery->>'city'), '') = ''
     OR COALESCE(trim(p_delivery->>'district'), '') = ''
     OR COALESCE(trim(p_delivery->>'state'), '') = '' THEN
    RAISE EXCEPTION 'Please fill in the full delivery address';
  END IF;

  -- --- basic abuse control ------------------------------------------------
  -- An endpoint anyone can call needs a ceiling. Five orders an hour from one
  -- number is far above any real customer and far below a useful flood.
  SELECT count(*) INTO v_recent
  FROM public.orders
  WHERE phone = v_phone
    AND user_id IS NULL
    AND created_at > now() - interval '1 hour';

  IF v_recent >= 5 THEN
    RAISE EXCEPTION
      'Too many orders from this number in the last hour. Please call us instead.';
  END IF;

  -- --- the catalog this order is priced against ---------------------------
  v_season_id := public.current_season_id();
  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'Ordering is closed at the moment. Please try again later.';
  END IF;

  -- --- items ---------------------------------------------------------------
  -- Prices come from the active season, never from the request body. A client
  -- that asks for a ₹1 box gets charged the catalog price.
  --
  -- The same join appears again when the rows are written, a few statements
  -- below. Repeating it is deliberate: a temp table would outlive the
  -- statement and a second call in the same transaction would inherit it.
  SELECT count(*), COALESCE(sum(ps.offer_price * requested.quantity), 0)
    INTO v_item_count, v_total
  FROM jsonb_to_recordset(p_items) AS requested(product_id uuid, quantity integer)
  JOIN public.product_seasons ps
    ON ps.product_id = requested.product_id
   AND ps.season_id = v_season_id
   AND ps.is_active
  WHERE requested.quantity > 0;

  SELECT count(*) INTO v_requested_count
  FROM jsonb_to_recordset(p_items) AS requested(product_id uuid, quantity integer)
  WHERE requested.quantity > 0;

  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'Your cart is empty';
  END IF;

  -- Silently dropping an item would ship an order the customer never agreed
  -- to the price of, so a withdrawn product stops the whole checkout.
  IF v_item_count <> v_requested_count THEN
    RAISE EXCEPTION
      'Some items are no longer available. Please review your cart and try again.';
  END IF;

  IF v_total < v_min_order THEN
    RAISE EXCEPTION 'Minimum order amount is %', v_min_order;
  END IF;

  -- --- the order ------------------------------------------------------------
  v_short_id := public.next_order_short_id();

  INSERT INTO public.orders (
    user_id, season_id, short_id, total_amount, payment_method, status,
    discount_amt, discount_percentage, referred_by,
    full_name, phone, alternate_phone, email,
    address, city, district, state, pincode, country
  )
  VALUES (
    -- NULL for a true guest. If a signed-in customer ever reaches this path,
    -- the order is still attached to them rather than orphaned.
    auth.uid(),
    v_season_id,
    v_short_id,
    v_total,
    COALESCE(NULLIF(trim(p_payment_method), ''), 'offline'),
    'Enquiry Received',
    0,
    '',
    NULLIF(trim(COALESCE(p_delivery->>'referralPhone', '')), ''),
    trim(p_delivery->>'customerName'),
    v_phone,
    NULLIF(trim(COALESCE(p_delivery->>'alternatePhone', '')), ''),
    -- orders.email is NOT NULL DEFAULT '-'; keep that convention rather than
    -- making the column nullable for the sake of one path.
    COALESCE(NULLIF(trim(COALESCE(p_delivery->>'email', '')), ''), '-'),
    trim(p_delivery->>'address'),
    trim(p_delivery->>'city'),
    trim(p_delivery->>'district'),
    trim(p_delivery->>'state'),
    v_pincode,
    COALESCE(NULLIF(trim(COALESCE(p_delivery->>'country', '')), ''), 'India')
  )
  RETURNING id INTO v_order_id;

  -- apr_snapshot freezes the cost this order is measured against, so profit
  -- reporting never re-derives it from a catalog that has since moved.
  INSERT INTO public.order_items (
    order_id, product_id, quantity, price, total_price, apr_snapshot
  )
  SELECT
    v_order_id,
    ps.product_id,
    requested.quantity,
    ps.offer_price,
    ps.offer_price * requested.quantity,
    costs.apr
  FROM jsonb_to_recordset(p_items) AS requested(product_id uuid, quantity integer)
  JOIN public.product_seasons ps
    ON ps.product_id = requested.product_id
   AND ps.season_id = v_season_id
   AND ps.is_active
  LEFT JOIN public.product_season_costs costs
    ON costs.product_id = ps.product_id
   AND costs.season_id = v_season_id
  WHERE requested.quantity > 0;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'short_id', v_short_id,
    'total_amount', v_total,
    'item_count', v_item_count
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. track_guest_order
--
-- Lets someone without an account see the order they placed. Both halves are
-- required: the short id alone is guessable (they run in sequence), so it is
-- only accepted together with the phone number on the order.
--
-- Returns the delivery and status columns a customer already has on their
-- confirmation — never user_id, and never anything cost-related.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.track_guest_order(
  p_reference text,
  p_phone     text
)
RETURNS TABLE (
  id           uuid,
  short_id     text,
  status       text,
  created_at   timestamptz,
  total_amount numeric,
  full_name    text,
  phone        text,
  address      text,
  city         text,
  district     text,
  state        text,
  pincode      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id, o.short_id, o.status, o.created_at, o.total_amount,
    o.full_name, o.phone, o.address, o.city, o.district, o.state, o.pincode
  FROM public.orders o
  WHERE o.phone = trim(p_phone)
    AND (
      o.short_id = upper(trim(p_reference))
      OR o.id::text = trim(p_reference)
    )
  ORDER BY o.created_at DESC
  LIMIT 10;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants
--
-- `anon` is the whole point: these two functions are the only things an
-- unauthenticated visitor may do with orders.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.create_guest_order(jsonb, jsonb, text) FROM public;
REVOKE ALL ON FUNCTION public.track_guest_order(text, text) FROM public;
REVOKE ALL ON FUNCTION public.next_order_short_id() FROM public;

GRANT EXECUTE ON FUNCTION public.create_guest_order(jsonb, jsonb, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_guest_order(text, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_order_short_id()
  TO authenticated;
