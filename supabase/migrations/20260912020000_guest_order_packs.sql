/*
  # Guest checkout understands packs

  create_guest_order() priced every line by joining product_seasons, so a
  family pack in a guest's cart had nowhere to land. This replaces it with a
  version where a requested line is either a product or a pack:

      [{ "product_id": uuid, "quantity": int },
       { "combo_pack_id": uuid, "quantity": int }]

  A payload with no combo_pack_id key behaves exactly as before --
  jsonb_to_recordset yields NULL for a column the object does not have -- so
  the signed-out checkout keeps working untouched while it is being rolled out.

  Everything else about the function is unchanged and deliberately so: prices
  still come from the season and never from the request body, the same
  validations run in the same order, and the same abuse ceiling applies. The
  stock for a pack's contents is moved by the order_items trigger, not here.
*/

CREATE OR REPLACE FUNCTION public.create_guest_order(
  p_delivery jsonb,
  p_items    jsonb,
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
  -- Prices come from the active season, never from the request body: a
  -- product line from product_seasons, a pack line from the pack's own rate.
  --
  -- The resolution is repeated below when the rows are written. Repeating it
  -- is deliberate, as it was before: a temp table would outlive the statement
  -- and a second call in the same transaction would inherit it.
  SELECT count(*), COALESCE(sum(resolved.price * resolved.quantity), 0)
    INTO v_item_count, v_total
  FROM (
    SELECT ps.offer_price AS price, requested.quantity
    FROM jsonb_to_recordset(p_items)
      AS requested(product_id uuid, combo_pack_id uuid, quantity integer)
    JOIN public.product_seasons ps
      ON ps.product_id = requested.product_id
     AND ps.season_id = v_season_id
     AND ps.is_active
    WHERE requested.quantity > 0 AND requested.product_id IS NOT NULL

    UNION ALL

    SELECT cp.pack_price AS price, requested.quantity
    FROM jsonb_to_recordset(p_items)
      AS requested(product_id uuid, combo_pack_id uuid, quantity integer)
    JOIN public.combo_packs cp
      ON cp.id = requested.combo_pack_id
     AND cp.season_id = v_season_id
     AND cp.is_active
    WHERE requested.quantity > 0 AND requested.combo_pack_id IS NOT NULL
  ) resolved;

  SELECT count(*) INTO v_requested_count
  FROM jsonb_to_recordset(p_items)
    AS requested(product_id uuid, combo_pack_id uuid, quantity integer)
  WHERE requested.quantity > 0
    AND (requested.product_id IS NOT NULL OR requested.combo_pack_id IS NOT NULL);

  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'Your cart is empty';
  END IF;

  -- Silently dropping a line would ship an order the customer never agreed to
  -- the price of, so a withdrawn product or pack stops the whole checkout.
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
    COALESCE(NULLIF(trim(COALESCE(p_delivery->>'email', '')), ''), '-'),
    trim(p_delivery->>'address'),
    trim(p_delivery->>'city'),
    trim(p_delivery->>'district'),
    trim(p_delivery->>'state'),
    v_pincode,
    COALESCE(NULLIF(trim(COALESCE(p_delivery->>'country', '')), ''), 'India')
  )
  RETURNING id INTO v_order_id;

  -- apr_snapshot is left to stamp_order_item_cost(), which knows how to total
  -- a pack's contents; passing NULL here lets that trigger do its work.
  INSERT INTO public.order_items (
    order_id, product_id, combo_pack_id, quantity, price, total_price
  )
  SELECT
    v_order_id,
    resolved.product_id,
    resolved.combo_pack_id,
    resolved.quantity,
    resolved.price,
    resolved.price * resolved.quantity
  FROM (
    SELECT
      ps.product_id,
      NULL::uuid AS combo_pack_id,
      requested.quantity,
      ps.offer_price AS price
    FROM jsonb_to_recordset(p_items)
      AS requested(product_id uuid, combo_pack_id uuid, quantity integer)
    JOIN public.product_seasons ps
      ON ps.product_id = requested.product_id
     AND ps.season_id = v_season_id
     AND ps.is_active
    WHERE requested.quantity > 0 AND requested.product_id IS NOT NULL

    UNION ALL

    SELECT
      NULL::uuid AS product_id,
      cp.id AS combo_pack_id,
      requested.quantity,
      cp.pack_price AS price
    FROM jsonb_to_recordset(p_items)
      AS requested(product_id uuid, combo_pack_id uuid, quantity integer)
    JOIN public.combo_packs cp
      ON cp.id = requested.combo_pack_id
     AND cp.season_id = v_season_id
     AND cp.is_active
    WHERE requested.quantity > 0 AND requested.combo_pack_id IS NOT NULL
  ) resolved;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'short_id', v_short_id,
    'total_amount', v_total,
    'item_count', v_item_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_guest_order(jsonb, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_guest_order(jsonb, jsonb, text)
  TO anon, authenticated;
