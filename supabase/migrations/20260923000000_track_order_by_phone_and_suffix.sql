/*
  # Tracking an order from a phone

  Two things were awkward about `track_guest_order` on a small screen:

    * it wanted the whole order number, `SWCO2026K7P2-0001`, typed exactly.
      Customers read the last four digits off their confirmation and nothing
      else, so that is now enough — the phone number is what actually proves
      the order is theirs.
    * the phone had to match character for character. An order placed as
      "+91 97897 94518" could not be found by typing "9789794518".

  Both halves are still required. Four digits on their own would match one
  order per year per customer at most, and only for the phone that placed it.

  `track_guest_order_items` is new: the tracking screen can now hand the
  customer the same order summary PDF the checkout gave them, and a PDF with
  no lines on it is not worth downloading. It asks for the order id returned
  by the lookup above AND the phone again, so it can be called on its own
  without becoming a way to read any order's contents.
*/

-- The last 10 digits, which is what an Indian mobile number is once the
-- country code, spaces and dashes are taken off.
CREATE OR REPLACE FUNCTION public.normalise_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT right(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), 10);
$$;

GRANT EXECUTE ON FUNCTION public.normalise_phone(text) TO anon, authenticated;

-- Does this reference identify that order? Accepts the full number, the row's
-- uuid, or the tail of the number (the "-0001" a customer reads out).
CREATE OR REPLACE FUNCTION public.order_reference_matches(
  p_short_id  text,
  p_order_id  uuid,
  p_reference text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN v.ref = '' THEN false
    WHEN upper(COALESCE(p_short_id, '')) = v.ref THEN true
    WHEN p_order_id::text = lower(v.ref) THEN true
    -- A tail, e.g. "0001" or "1". Only short inputs are treated this way, so
    -- a mistyped full number does not quietly match some other order.
    WHEN length(v.ref) BETWEEN 1 AND 6
     AND right(COALESCE(p_short_id, ''), length(v.ref)) = v.ref THEN true
    -- "1" should find "-0001" as well: compare the numeric tails.
    WHEN v.ref ~ '^\d{1,6}$'
     AND (regexp_match(COALESCE(p_short_id, ''), '(\d+)$'))[1] IS NOT NULL
     AND (regexp_match(COALESCE(p_short_id, ''), '(\d+)$'))[1]::bigint = v.ref::bigint
     THEN true
    ELSE false
  END
  FROM (SELECT upper(trim(COALESCE(p_reference, '')))) AS v(ref);
$$;

GRANT EXECUTE ON FUNCTION public.order_reference_matches(text, uuid, text)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- track_guest_order, now tolerant about both halves.
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
  WHERE length(public.normalise_phone(p_phone)) = 10
    AND (
      public.normalise_phone(o.phone) = public.normalise_phone(p_phone)
      OR public.normalise_phone(o.alternate_phone) = public.normalise_phone(p_phone)
    )
    AND public.order_reference_matches(o.short_id, o.id, p_reference)
  ORDER BY o.created_at DESC
  LIMIT 10;
$$;

REVOKE ALL ON FUNCTION public.track_guest_order(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.track_guest_order(text, text)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- The lines on a tracked order, for the summary PDF.
--
-- Returns what the customer ordered and what they were charged. Never a cost,
-- a margin or a snapshot — those columns sit on the same rows and stay here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_guest_order_items(
  p_order_id uuid,
  p_phone    text
)
RETURNS TABLE (
  name        text,
  code        text,
  quantity    integer,
  price       numeric,
  total_price numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(p.name, cp.name, 'Item')       AS name,
    COALESCE(p.product_code, cp.pack_code)  AS code,
    oi.quantity,
    oi.price,
    oi.total_price
  FROM public.order_items oi
  JOIN public.orders o            ON o.id = oi.order_id
  LEFT JOIN public.products p     ON p.id = oi.product_id
  LEFT JOIN public.combo_packs cp ON cp.id = oi.combo_pack_id
  WHERE o.id = p_order_id
    AND length(public.normalise_phone(p_phone)) = 10
    AND (
      public.normalise_phone(o.phone) = public.normalise_phone(p_phone)
      OR public.normalise_phone(o.alternate_phone) = public.normalise_phone(p_phone)
    )
  -- By ordinal: a bare `name` here would collide with the output column of
  -- the same name. Packs first, as they are the headline of the order.
  ORDER BY oi.combo_pack_id NULLS LAST, 1;
$$;

REVOKE ALL ON FUNCTION public.track_guest_order_items(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.track_guest_order_items(uuid, text)
  TO anon, authenticated;
