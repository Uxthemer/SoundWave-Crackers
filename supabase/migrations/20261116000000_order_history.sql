/*
  # Order history: who did what to an order, and when

  ## Why

  Staff asked for the whole life of an order on one screen -- placed,
  confirmed, packed, shipped with which LR number, address corrected, items
  changed, money received -- each with a time and the person logged in.

  The edit popup already tried to write an `order_audits` row, but no
  migration ever created that table, so the insert failed quietly and nothing
  was kept. Status changes, LR numbers and discounts were never recorded at
  all, and those are most of what happens to an order.

  ## How

  * `order_history` is append-only: there is no UPDATE or DELETE policy, so a
    row, once written, stays as written.
  * Changes to `orders` are recorded by trigger, not by the screens. Every
    route that touches an order -- the status column, bulk status change,
    confirm_order, the edit popup, the discount dialog, guest checkout --
    lands in the same table without any of them having to remember to.
    `auth.uid()` is the caller's even inside SECURITY DEFINER functions, so
    the actor is the person who pressed the button (NULL for a guest).
  * Item changes are the one thing written by the app. The edit popup
    replaces an order's lines by deleting and reinserting them, so a trigger
    on `order_items` would log every line as removed and re-added; the popup
    knows the real difference and writes that, as one 'items' row.
  * Payments are not copied here. `order_payments` is already a ledger with
    who and when, so `order_history_for` reads it directly.
  * Orders older than this migration get what can honestly be reconstructed:
    when they were placed, when they were confirmed and by whom
    (`confirmed_at`/`confirmed_by`), and their payments. Anything the old
    `order_audits` table did keep, if it exists in this database, is copied in.
*/

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  -- created | status | updated | items | edited (copied from order_audits)
  event      text NOT NULL,
  -- { field: { from, to } } for created/status/updated; { items: [...] } for items
  changes    jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id   uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_history_order_idx
  ON public.order_history (order_id, created_at);

ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read order history" ON public.order_history;
CREATE POLICY "Admins read order history"
  ON public.order_history FOR SELECT TO authenticated
  USING (public.season_is_admin());

-- Staff may add an item-change row, as themselves. Everything else is written
-- by the trigger below, which runs as the table owner and is not bound by this.
DROP POLICY IF EXISTS "Admins record item changes" ON public.order_history;
CREATE POLICY "Admins record item changes"
  ON public.order_history FOR INSERT TO authenticated
  WITH CHECK (
    public.season_is_admin()
    AND event = 'items'
    AND actor_id IS NOT DISTINCT FROM auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 2. Recording changes to orders
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_order_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- What a person changes. amount_received, payment_status and the like are
  -- left out: they are derived from order_payments, which is its own record,
  -- and logging them here would show every payment twice.
  c_tracked constant text[] := ARRAY[
    'status', 'lr_number',
    'full_name', 'email', 'phone', 'alternate_phone',
    'address', 'city', 'district', 'state', 'pincode', 'referred_by',
    'total_amount', 'discount_amt', 'discount_percentage', 'payment_method'
  ];
  v_changes jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_history (order_id, event, changes, actor_id)
    VALUES (
      NEW.id,
      'created',
      jsonb_build_object(
        'status', jsonb_build_object('to', NEW.status),
        'total_amount', jsonb_build_object('to', NEW.total_amount)
      ),
      auth.uid()
    );
    RETURN NEW;
  END IF;

  SELECT jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
    INTO v_changes
  FROM jsonb_each(to_jsonb(NEW)) n
  JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
  WHERE n.key = ANY (c_tracked)
    AND n.value IS DISTINCT FROM o.value;

  -- Payment totals, stock bookkeeping and the like update the row without
  -- touching anything above. Nothing to say about those.
  IF v_changes IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.order_history (order_id, event, changes, actor_id)
  VALUES (
    NEW.id,
    CASE WHEN v_changes ? 'status' THEN 'status' ELSE 'updated' END,
    v_changes,
    auth.uid()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_record_history ON public.orders;
CREATE TRIGGER orders_record_history
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.record_order_history();

-- ---------------------------------------------------------------------------
-- 3. Whatever the old order_audits table kept
--
-- It may not exist (nothing ever created it in a migration), and if it does
-- its shape is only known from the code that wrote to it. A failure here must
-- not cost the rest of the migration, so it is caught and reported.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.order_audits') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO public.order_history (order_id, event, changes, actor_id, created_at)
      SELECT a.order_id, 'edited', COALESCE(a.changes::jsonb, '{}'::jsonb),
             u.id, COALESCE(a.created_at, now())
      FROM public.order_audits a
      JOIN public.orders o ON o.id = a.order_id
      LEFT JOIN auth.users u ON u.id = a.changed_by
    $q$;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'order_audits not copied into order_history: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Reading it back
--
-- One list, oldest first, with the person behind each entry named. Staff
-- cannot read auth.users, and user_profiles may hold no name, so the email
-- comes from here.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.order_history_for(p_order_id uuid)
RETURNS TABLE (
  id          text,
  happened_at timestamptz,
  event       text,
  changes     jsonb,
  actor_id    uuid,
  actor_name  text,
  actor_email text,
  actor_role  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.season_is_admin() THEN
    RAISE EXCEPTION 'Only admins may view order history';
  END IF;

  RETURN QUERY
  WITH entries AS (
    SELECT h.id::text AS id, h.created_at AS happened_at, h.event, h.changes, h.actor_id
    FROM public.order_history h
    WHERE h.order_id = p_order_id

    UNION ALL

    -- Placed before history was kept. The account on the order is the best
    -- available answer to who placed it; for a guest there is none.
    SELECT 'placed:' || o.id, o.created_at, 'created',
           jsonb_build_object(
             'status', jsonb_build_object('to', 'Enquiry Received'),
             'total_amount', jsonb_build_object('to', o.total_amount),
             'reconstructed', true
           ),
           o.user_id
    FROM public.orders o
    WHERE o.id = p_order_id
      AND NOT EXISTS (
        SELECT 1 FROM public.order_history h
        WHERE h.order_id = o.id AND h.event = 'created'
      )

    UNION ALL

    -- Confirmed before history was kept: confirm_order stamped who and when.
    SELECT 'confirmed:' || o.id, o.confirmed_at, 'status',
           jsonb_build_object(
             'status', jsonb_build_object('to', 'Order Confirmed'),
             'reconstructed', true
           ),
           o.confirmed_by
    FROM public.orders o
    WHERE o.id = p_order_id
      AND o.confirmed_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.order_history h
        WHERE h.order_id = o.id
          AND h.event = 'status'
          AND h.changes -> 'status' ->> 'to' = 'Order Confirmed'
      )

    UNION ALL

    SELECT 'payment:' || p.id, p.created_at, 'payment',
           jsonb_build_object(
             'amount', p.amount,
             'method', p.method,
             'reference', p.reference,
             'note', p.note,
             'received_at', p.received_at
           ),
           p.recorded_by
    FROM public.order_payments p
    WHERE p.order_id = p_order_id
  )
  SELECT e.id, e.happened_at, e.event, e.changes, e.actor_id,
         prof.full_name, u.email::text, prof.role_name
  FROM entries e
  LEFT JOIN auth.users u ON u.id = e.actor_id
  LEFT JOIN LATERAL (
    SELECT up.full_name, r.name AS role_name
    FROM public.user_profiles up
    LEFT JOIN public.roles r ON r.id = up.role_id
    WHERE up.user_id = e.actor_id
    LIMIT 1
  ) prof ON true
  ORDER BY e.happened_at, e.id;
END;
$$;

REVOKE ALL ON FUNCTION public.order_history_for(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.order_history_for(uuid) TO authenticated;
