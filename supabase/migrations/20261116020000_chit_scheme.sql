/*
  # Chit scheme: plans, enrolments and monthly payments

  ## What it is

  A customer joins a plan (for example Rs. 500 a month for 10 months, with a
  Rs. 500 bonus, worth Rs. 5,500 in crackers), pays each month by UPI or bank
  transfer outside the site, and uploads the screenshot with the transaction
  reference. A superadmin approves the enrolment and every payment. Approved
  money is what counts: the months it covers are worked out from it
  (lib/chit.ts), so a two-month payment, or the difference paid after moving
  from a Rs. 500 plan to a Rs. 1,000 one, settles the right months without
  anyone allocating them by hand.

  ## Why new tables rather than the old `schemes` ones

  `schemes` / `scheme_selections` / `payments` were created by hand from
  scheme_query.sql, never by a migration. Their amounts are text ("5,000"),
  there is no approval, no screenshot and no reference, and no enrolment was
  ever made through them. They are left exactly as they are; their active
  plans are copied into chit_plans below so the plans already set up are not
  lost.

  ## Rules kept in the database, not the screen

  * Customers and superadmins read through RLS; nobody writes these tables
    directly. Every write is a SECURITY DEFINER function that checks who is
    calling -- a customer can only enrol themselves and pay into their own
    active enrolment; only a superadmin approves, rejects, switches a plan or
    records a payment.
  * An enrolment copies its plan's terms when made and when switched, so
    editing a plan later does not quietly change a running member's chit.
  * A transaction reference can be used once (outside rejected payments), so
    one screenshot cannot be submitted twice.
  * Screenshots live in a private bucket, under the member's own folder. Only
    the member and superadmins can open them.
*/

-- ---------------------------------------------------------------------------
-- 1. Plans
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chit_plans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  description    text,
  monthly_amount numeric(12, 2) NOT NULL CHECK (monthly_amount > 0),
  months         integer NOT NULL CHECK (months BETWEEN 1 AND 60),
  bonus_amount   numeric(12, 2) NOT NULL DEFAULT 0 CHECK (bonus_amount >= 0),
  total_paid     numeric(12, 2) GENERATED ALWAYS AS (monthly_amount * months) STORED,
  total_value    numeric(12, 2) GENERATED ALWAYS AS (monthly_amount * months + bonus_amount) STORED,
  -- Each month's installment is due by this day of the month.
  due_day        integer NOT NULL DEFAULT 10 CHECK (due_day BETWEEN 1 AND 28),
  features       text[] NOT NULL DEFAULT '{}',
  max_members    integer CHECK (max_members IS NULL OR max_members > 0),
  is_active      boolean NOT NULL DEFAULT true,
  display_order  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Enrolments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chit_enrollments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id        uuid NOT NULL REFERENCES public.chit_plans(id),
  -- The plan's terms as agreed; see the header.
  plan_name      text NOT NULL,
  monthly_amount numeric(12, 2) NOT NULL CHECK (monthly_amount > 0),
  months         integer NOT NULL CHECK (months > 0),
  bonus_amount   numeric(12, 2) NOT NULL DEFAULT 0,
  due_day        integer NOT NULL DEFAULT 10,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'active', 'completed', 'cancelled', 'rejected')),
  member_name    text NOT NULL,
  phone          text NOT NULL,
  email          text,
  -- First installment's month (the 1st of it); set when approved.
  start_month    date,
  user_note      text,
  admin_note     text,
  -- [{at, by, from: {...}, to: {...}, note}] for every plan switch.
  plan_history   jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_at    timestamptz,
  approved_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chit_enrollments_user_idx ON public.chit_enrollments (user_id);
CREATE INDEX IF NOT EXISTS chit_enrollments_status_idx ON public.chit_enrollments (status);
-- One open enrolment per person per plan; joining two different plans is fine.
CREATE UNIQUE INDEX IF NOT EXISTS chit_enrollments_one_open_per_plan
  ON public.chit_enrollments (user_id, plan_id)
  WHERE status IN ('pending', 'active');

-- ---------------------------------------------------------------------------
-- 3. Payments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chit_payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id     uuid NOT NULL REFERENCES public.chit_enrollments(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- As the member entered it.
  amount            numeric(12, 2) NOT NULL CHECK (amount > 0),
  -- What the superadmin accepted, which is what counts. Usually the same.
  approved_amount   numeric(12, 2) CHECK (approved_amount IS NULL OR approved_amount > 0),
  method            text,
  transaction_ref   text,
  screenshot_path   text,
  paid_on           date NOT NULL DEFAULT current_date,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  user_note         text,
  admin_note        text,
  -- Entered by a superadmin (cash at the counter, a difference after a plan
  -- switch) rather than submitted by the member.
  recorded_by_admin boolean NOT NULL DEFAULT false,
  reviewed_at       timestamptz,
  reviewed_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chit_payments_enrollment_idx ON public.chit_payments (enrollment_id);
CREATE INDEX IF NOT EXISTS chit_payments_status_idx ON public.chit_payments (status);
CREATE UNIQUE INDEX IF NOT EXISTS chit_payments_ref_once
  ON public.chit_payments (lower(btrim(transaction_ref)))
  WHERE status IN ('pending', 'approved') AND btrim(coalesce(transaction_ref, '')) <> '';

-- ---------------------------------------------------------------------------
-- 4. updated_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chit_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chit_plans_touch ON public.chit_plans;
CREATE TRIGGER chit_plans_touch BEFORE UPDATE ON public.chit_plans
  FOR EACH ROW EXECUTE FUNCTION public.chit_touch_updated_at();
DROP TRIGGER IF EXISTS chit_enrollments_touch ON public.chit_enrollments;
CREATE TRIGGER chit_enrollments_touch BEFORE UPDATE ON public.chit_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.chit_touch_updated_at();
DROP TRIGGER IF EXISTS chit_payments_touch ON public.chit_payments;
CREATE TRIGGER chit_payments_touch BEFORE UPDATE ON public.chit_payments
  FOR EACH ROW EXECUTE FUNCTION public.chit_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Who can read what
-- ---------------------------------------------------------------------------

ALTER TABLE public.chit_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chit_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chit_payments ENABLE ROW LEVEL SECURITY;

-- Plans are the storefront's: anyone may see the ones on offer.
DROP POLICY IF EXISTS "Anyone reads active chit plans" ON public.chit_plans;
CREATE POLICY "Anyone reads active chit plans"
  ON public.chit_plans FOR SELECT TO anon, authenticated
  USING (is_active OR public.season_is_superadmin());

DROP POLICY IF EXISTS "Superadmins manage chit plans" ON public.chit_plans;
CREATE POLICY "Superadmins manage chit plans"
  ON public.chit_plans FOR ALL TO authenticated
  USING (public.season_is_superadmin())
  WITH CHECK (public.season_is_superadmin());

DROP POLICY IF EXISTS "Members and superadmins read enrolments" ON public.chit_enrollments;
CREATE POLICY "Members and superadmins read enrolments"
  ON public.chit_enrollments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.season_is_superadmin());

DROP POLICY IF EXISTS "Members and superadmins read chit payments" ON public.chit_payments;
CREATE POLICY "Members and superadmins read chit payments"
  ON public.chit_payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.season_is_superadmin());

-- ---------------------------------------------------------------------------
-- 6. Screenshots: private, one folder per member
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chit-payments',
  'chit-payments',
  false,
  -- The app shrinks a phone screenshot well under this; it is the backstop.
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Members upload their chit screenshots" ON storage.objects;
CREATE POLICY "Members upload their chit screenshots"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chit-payments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Members and superadmins read chit screenshots" ON storage.objects;
CREATE POLICY "Members and superadmins read chit screenshots"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chit-payments'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.season_is_superadmin())
  );

-- A submission that fails after its upload removes the orphaned file.
DROP POLICY IF EXISTS "Members remove their chit screenshots" ON storage.objects;
CREATE POLICY "Members remove their chit screenshots"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chit-payments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 7. Customer actions
-- ---------------------------------------------------------------------------

/** Members per plan, for "seats left" on the plan cards. Counts only. */
CREATE OR REPLACE FUNCTION public.chit_plan_members()
RETURNS TABLE (plan_id uuid, members integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.plan_id, count(*)::integer
  FROM public.chit_enrollments e
  WHERE e.status IN ('pending', 'active')
  GROUP BY e.plan_id;
$$;

CREATE OR REPLACE FUNCTION public.chit_enroll(
  p_plan_id     uuid,
  p_member_name text,
  p_phone       text,
  p_note        text DEFAULT NULL
)
RETURNS public.chit_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan    public.chit_plans;
  v_members integer;
  v_row     public.chit_enrollments;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please log in to join a chit scheme.';
  END IF;

  SELECT * INTO v_plan FROM public.chit_plans WHERE id = p_plan_id;
  IF v_plan.id IS NULL OR NOT v_plan.is_active THEN
    RAISE EXCEPTION 'This plan is not open for joining.';
  END IF;

  IF btrim(coalesce(p_member_name, '')) = '' THEN
    RAISE EXCEPTION 'Please enter your name.';
  END IF;
  IF length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'Please enter a valid 10-digit phone number.';
  END IF;

  IF v_plan.max_members IS NOT NULL THEN
    SELECT count(*) INTO v_members
    FROM public.chit_enrollments
    WHERE plan_id = v_plan.id AND status IN ('pending', 'active');
    IF v_members >= v_plan.max_members THEN
      RAISE EXCEPTION 'This plan is full.';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.chit_enrollments (
      user_id, plan_id, plan_name, monthly_amount, months, bonus_amount, due_day,
      member_name, phone, email, user_note
    )
    VALUES (
      auth.uid(), v_plan.id, v_plan.name, v_plan.monthly_amount, v_plan.months,
      v_plan.bonus_amount, v_plan.due_day,
      btrim(p_member_name), btrim(p_phone),
      (SELECT email FROM auth.users WHERE id = auth.uid()),
      NULLIF(btrim(coalesce(p_note, '')), '')
    )
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'You have already joined this plan.';
  END;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.chit_submit_payment(
  p_enrollment_id   uuid,
  p_amount          numeric,
  p_method          text,
  p_transaction_ref text,
  p_screenshot_path text,
  p_paid_on         date DEFAULT current_date,
  p_note            text DEFAULT NULL
)
RETURNS public.chit_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment public.chit_enrollments;
  v_row        public.chit_payments;
BEGIN
  SELECT * INTO v_enrollment FROM public.chit_enrollments WHERE id = p_enrollment_id;
  IF v_enrollment.id IS NULL OR v_enrollment.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Chit not found.';
  END IF;
  IF v_enrollment.status <> 'active' THEN
    RAISE EXCEPTION 'Payments can be made once your enrolment is approved.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Enter the amount you paid.';
  END IF;
  IF btrim(coalesce(p_transaction_ref, '')) = '' THEN
    RAISE EXCEPTION 'Enter the transaction ID from your payment app.';
  END IF;
  -- The screenshot must be one this member uploaded, in their own folder.
  IF coalesce(p_screenshot_path, '') NOT LIKE auth.uid()::text || '/%' THEN
    RAISE EXCEPTION 'Please attach the payment screenshot.';
  END IF;

  BEGIN
    INSERT INTO public.chit_payments (
      enrollment_id, user_id, amount, method, transaction_ref, screenshot_path,
      paid_on, user_note
    )
    VALUES (
      v_enrollment.id, auth.uid(), round(p_amount, 2),
      NULLIF(btrim(coalesce(p_method, '')), ''), btrim(p_transaction_ref),
      p_screenshot_path, coalesce(p_paid_on, current_date),
      NULLIF(btrim(coalesce(p_note, '')), '')
    )
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This transaction ID has already been submitted.';
  END;

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Superadmin actions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chit_review_enrollment(
  p_enrollment_id uuid,
  p_approve       boolean,
  p_start_month   date DEFAULT NULL,
  p_note          text DEFAULT NULL
)
RETURNS public.chit_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.chit_enrollments;
BEGIN
  IF NOT public.season_is_superadmin() THEN
    RAISE EXCEPTION 'Only a superadmin may approve enrolments.';
  END IF;

  UPDATE public.chit_enrollments
  SET status      = CASE WHEN p_approve THEN 'active' ELSE 'rejected' END,
      start_month = CASE WHEN p_approve
                         THEN date_trunc('month', coalesce(p_start_month, current_date))::date
                         ELSE start_month END,
      approved_at = CASE WHEN p_approve THEN now() ELSE approved_at END,
      approved_by = CASE WHEN p_approve THEN auth.uid() ELSE approved_by END,
      admin_note  = coalesce(NULLIF(btrim(coalesce(p_note, '')), ''), admin_note)
  WHERE id = p_enrollment_id AND status = 'pending'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'This enrolment is no longer waiting for approval.';
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.chit_review_payment(
  p_payment_id      uuid,
  p_approve         boolean,
  p_approved_amount numeric DEFAULT NULL,
  p_note            text DEFAULT NULL
)
RETURNS public.chit_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.chit_payments;
BEGIN
  IF NOT public.season_is_superadmin() THEN
    RAISE EXCEPTION 'Only a superadmin may approve payments.';
  END IF;
  IF p_approve AND p_approved_amount IS NOT NULL AND p_approved_amount <= 0 THEN
    RAISE EXCEPTION 'The approved amount must be more than zero.';
  END IF;

  UPDATE public.chit_payments
  SET status          = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      approved_amount = CASE WHEN p_approve THEN round(coalesce(p_approved_amount, amount), 2) ELSE NULL END,
      reviewed_at     = now(),
      reviewed_by     = auth.uid(),
      admin_note      = coalesce(NULLIF(btrim(coalesce(p_note, '')), ''), admin_note)
  WHERE id = p_payment_id AND status = 'pending'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'This payment is no longer waiting for approval.';
  END IF;
  RETURN v_row;
END;
$$;

/** A payment taken by the shop (cash, a difference after a switch): approved as entered. */
CREATE OR REPLACE FUNCTION public.chit_record_payment(
  p_enrollment_id   uuid,
  p_amount          numeric,
  p_method          text DEFAULT NULL,
  p_transaction_ref text DEFAULT NULL,
  p_paid_on         date DEFAULT current_date,
  p_note            text DEFAULT NULL
)
RETURNS public.chit_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment public.chit_enrollments;
  v_row        public.chit_payments;
BEGIN
  IF NOT public.season_is_superadmin() THEN
    RAISE EXCEPTION 'Only a superadmin may record payments.';
  END IF;
  SELECT * INTO v_enrollment FROM public.chit_enrollments WHERE id = p_enrollment_id;
  IF v_enrollment.id IS NULL OR v_enrollment.status NOT IN ('active', 'completed') THEN
    RAISE EXCEPTION 'Payments can only be recorded on an approved chit.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Enter the amount received.';
  END IF;

  BEGIN
    INSERT INTO public.chit_payments (
      enrollment_id, user_id, amount, approved_amount, method, transaction_ref,
      paid_on, status, admin_note, recorded_by_admin, reviewed_at, reviewed_by
    )
    VALUES (
      v_enrollment.id, v_enrollment.user_id, round(p_amount, 2), round(p_amount, 2),
      NULLIF(btrim(coalesce(p_method, '')), ''),
      NULLIF(btrim(coalesce(p_transaction_ref, '')), ''),
      coalesce(p_paid_on, current_date), 'approved',
      NULLIF(btrim(coalesce(p_note, '')), ''), true, now(), auth.uid()
    )
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This transaction ID has already been used.';
  END;

  RETURN v_row;
END;
$$;

/**
 * Moves a member to another plan -- Rs. 500 a month to Rs. 1,000, say. The
 * money already approved stays; it now counts against the new monthly
 * amount, so the months it covers are recalculated and any difference shows
 * as due. The old and new terms are kept in plan_history.
 */
CREATE OR REPLACE FUNCTION public.chit_change_plan(
  p_enrollment_id uuid,
  p_plan_id       uuid,
  p_note          text DEFAULT NULL
)
RETURNS public.chit_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old  public.chit_enrollments;
  v_plan public.chit_plans;
  v_row  public.chit_enrollments;
BEGIN
  IF NOT public.season_is_superadmin() THEN
    RAISE EXCEPTION 'Only a superadmin may change a member''s plan.';
  END IF;
  SELECT * INTO v_old FROM public.chit_enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF v_old.id IS NULL OR v_old.status NOT IN ('pending', 'active') THEN
    RAISE EXCEPTION 'Only a pending or active chit can change plan.';
  END IF;
  SELECT * INTO v_plan FROM public.chit_plans WHERE id = p_plan_id;
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'Plan not found.';
  END IF;
  IF v_plan.id = v_old.plan_id THEN
    RAISE EXCEPTION 'The member is already on this plan.';
  END IF;

  BEGIN
    UPDATE public.chit_enrollments
    SET plan_id        = v_plan.id,
        plan_name      = v_plan.name,
        monthly_amount = v_plan.monthly_amount,
        months         = v_plan.months,
        bonus_amount   = v_plan.bonus_amount,
        due_day        = v_plan.due_day,
        plan_history   = plan_history || jsonb_build_array(jsonb_build_object(
          'at', now(),
          'by', auth.uid(),
          'note', NULLIF(btrim(coalesce(p_note, '')), ''),
          'from', jsonb_build_object('plan_id', v_old.plan_id, 'name', v_old.plan_name,
                                     'monthly_amount', v_old.monthly_amount, 'months', v_old.months,
                                     'bonus_amount', v_old.bonus_amount),
          'to', jsonb_build_object('plan_id', v_plan.id, 'name', v_plan.name,
                                   'monthly_amount', v_plan.monthly_amount, 'months', v_plan.months,
                                   'bonus_amount', v_plan.bonus_amount)
        ))
    WHERE id = v_old.id
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'The member already has an open chit on that plan.';
  END;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.chit_set_enrollment_status(
  p_enrollment_id uuid,
  p_status        text,
  p_note          text DEFAULT NULL
)
RETURNS public.chit_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.chit_enrollments;
BEGIN
  IF NOT public.season_is_superadmin() THEN
    RAISE EXCEPTION 'Only a superadmin may change a chit''s status.';
  END IF;
  IF p_status NOT IN ('active', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Unknown status %.', p_status;
  END IF;

  UPDATE public.chit_enrollments
  SET status      = p_status,
      start_month = coalesce(start_month, date_trunc('month', current_date)::date),
      admin_note  = coalesce(NULLIF(btrim(coalesce(p_note, '')), ''), admin_note)
  WHERE id = p_enrollment_id AND status IN ('active', 'completed', 'cancelled')
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Approve or reject a pending enrolment first.';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.chit_plan_members() FROM public;
REVOKE ALL ON FUNCTION public.chit_enroll(uuid, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.chit_submit_payment(uuid, numeric, text, text, text, date, text) FROM public;
REVOKE ALL ON FUNCTION public.chit_review_enrollment(uuid, boolean, date, text) FROM public;
REVOKE ALL ON FUNCTION public.chit_review_payment(uuid, boolean, numeric, text) FROM public;
REVOKE ALL ON FUNCTION public.chit_record_payment(uuid, numeric, text, text, date, text) FROM public;
REVOKE ALL ON FUNCTION public.chit_change_plan(uuid, uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.chit_set_enrollment_status(uuid, text, text) FROM public;

GRANT EXECUTE ON FUNCTION public.chit_plan_members() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chit_enroll(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chit_submit_payment(uuid, numeric, text, text, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chit_review_enrollment(uuid, boolean, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chit_review_payment(uuid, boolean, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chit_record_payment(uuid, numeric, text, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chit_change_plan(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chit_set_enrollment_status(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. The plans already set up in the old `schemes` table
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.schemes') IS NULL
     OR EXISTS (SELECT 1 FROM public.chit_plans) THEN
    RETURN;
  END IF;

  INSERT INTO public.chit_plans (
    name, monthly_amount, months, bonus_amount, features, max_members, is_active, display_order
  )
  SELECT
    'Rs. ' || to_char(m.monthly, 'FM99,99,999') || ' a month',
    m.monthly, m.months, m.bonus, coalesce(s.features, '{}'), s.max_participants, true,
    coalesce((to_jsonb(s) ->> 'disp_order')::integer, 0)
  FROM public.schemes s
  CROSS JOIN LATERAL (
    SELECT
      NULLIF(regexp_replace(s.installment::text, '[^0-9.]', '', 'g'), '')::numeric AS monthly,
      coalesce(NULLIF(regexp_replace(s.duration::text, '[^0-9]', '', 'g'), '')::integer, 10) AS months,
      coalesce(NULLIF(regexp_replace(s.bonus_amount::text, '[^0-9.]', '', 'g'), '')::numeric, 0) AS bonus
  ) m
  WHERE s.is_active AND m.monthly > 0;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Old schemes not copied into chit_plans: %', SQLERRM;
END $$;
