/*
  # Customer summary counts what customers actually paid for

  `total_spent`, `average_order_value` and `largest_order` summed
  `total_amount`, the gross before discount, while `total_received` is real
  money. A customer given a discount and paid up in full therefore showed an
  "Outstanding" balance equal to their discount, and every lifetime value was
  overstated by the discounts given.

  All three now use the payable amount, `total_amount - discount_amt` (never
  below zero) -- the same figure payment_status is measured against since
  20261003000000_payment_status_after_discount. The view's columns and their
  order are unchanged, so CREATE OR REPLACE is enough.
*/

CREATE OR REPLACE VIEW public.customer_summary
WITH (security_invoker = true) AS
WITH normalised AS (
  SELECT
    -- Phone is the identity. Everything else about a person can be typed
    -- differently on different orders; the number they answer on cannot.
    regexp_replace(COALESCE(o.phone, ''), '[^0-9]', '', 'g') AS phone_key,
    o.*,
    GREATEST(COALESCE(o.total_amount, 0) - COALESCE(o.discount_amt, 0), 0)
      AS payable_amount,
    o.status IN ('Order Confirmed', 'Packing', 'Shipped', 'Delivered',
                 'Payment Completed') AS is_sale,
    o.status = 'Cancelled' AS is_cancelled
  FROM public.orders o
  WHERE COALESCE(o.phone, '') <> ''
),
ranked AS (
  -- The most recent order is the best guess at a customer's current name and
  -- address: people move, and an old order should not overwrite that.
  SELECT DISTINCT ON (phone_key)
    phone_key, full_name, email, address, city, district, state, pincode,
    user_id, created_at
  FROM normalised
  ORDER BY phone_key, created_at DESC
)
SELECT
  n.phone_key                                        AS id,
  max(n.phone)                                       AS phone,
  r.full_name                                        AS name,
  r.email,
  r.address,
  r.city,
  r.district,
  r.state,
  r.pincode,
  -- True once they have ever signed in; a guest may later create an account.
  bool_or(n.user_id IS NOT NULL)                     AS has_account,

  count(*)                                           AS total_orders,
  count(*) FILTER (WHERE n.is_sale)                  AS confirmed_orders,
  count(*) FILTER (WHERE n.is_cancelled)             AS cancelled_orders,
  count(*) FILTER (WHERE NOT n.is_sale AND NOT n.is_cancelled) AS open_enquiries,

  COALESCE(sum(n.payable_amount) FILTER (WHERE n.is_sale), 0)   AS total_spent,
  COALESCE(sum(n.amount_received) FILTER (WHERE n.is_sale), 0)  AS total_received,
  COALESCE(avg(n.payable_amount) FILTER (WHERE n.is_sale), 0)   AS average_order_value,
  COALESCE(max(n.payable_amount) FILTER (WHERE n.is_sale), 0)   AS largest_order,

  min(n.created_at)                                  AS first_order_at,
  max(n.created_at)                                  AS last_order_at,
  max(n.created_at) FILTER (WHERE n.is_sale)         AS last_purchase_at,
  -- Buying in more than one season is what separates a customer from a
  -- one-off: it survived a whole year and they came back.
  count(DISTINCT n.season_id) FILTER (WHERE n.is_sale AND n.season_id IS NOT NULL)
                                                     AS seasons_bought,

  CASE
    WHEN count(*) FILTER (WHERE n.is_sale) = 0 THEN 'enquiry_only'
    WHEN count(DISTINCT n.season_id)
         FILTER (WHERE n.is_sale AND n.season_id IS NOT NULL) > 1 THEN 'returning'
    WHEN count(*) FILTER (WHERE n.is_sale) >= 4 THEN 'loyal'
    WHEN count(*) FILTER (WHERE n.is_sale) >= 2 THEN 'repeat'
    ELSE 'new'
  END                                                AS segment,

  -- Somebody who used to buy and has not for a year is the list worth
  -- calling; it is not the same as somebody who never bought.
  (max(n.created_at) FILTER (WHERE n.is_sale) < now() - interval '365 days')
                                                     AS is_dormant
FROM normalised n
JOIN ranked r ON r.phone_key = n.phone_key
GROUP BY
  n.phone_key, r.full_name, r.email, r.address,
  r.city, r.district, r.state, r.pincode;

COMMENT ON VIEW public.customer_summary IS
  'One row per customer, keyed by phone number so guest and signed-in orders '
  'for the same person are counted together. Values count confirmed orders '
  'only, at the amount payable after discount.';

GRANT SELECT ON public.customer_summary TO authenticated;
