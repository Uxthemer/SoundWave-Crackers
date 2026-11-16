/*
  # Chit plans: the season they belong to, and the Diwali 2027 plans

  ## Dates on a plan

  A chit runs to a calendar, not from whenever someone joins: the Diwali
  2027 scheme starts on 1 December 2026, the last installment is in August,
  the shop pays the 10th month, and crackers go out in September 2027 to
  those who completed it. Those dates were only on the printed banner. They
  are now on the plan, so the chit page can show them, the superadmin's
  approval can default the first month to the scheme's start, and next
  season's plans carry their own.

    season_label  "Diwali 2027"
    starts_on     first installment month
    ends_on       the month the scheme closes (the 10th month)
    dispatch_on   when crackers are sent to members who completed it

  ## The Diwali 2027 plans (as on the banner)

  Rs. 500, 1,000, 2,000, 3,000, 4,000 and 5,000 a month, paid for 9 months;
  the shop pays the 10th month, so the crackers are worth 10 months: Rs.
  5,000 ... 50,000. In this schema that is months = 9 and bonus = one
  month's amount.

  A plan already at that monthly amount is brought to these terms only if
  nobody has enrolled in it -- members keep the terms they joined with, and
  a plan with history is not rewritten under them. Otherwise a new plan is
  added beside it. Every other open plan (the old Rs. 300 one, or an old plan
  that had members) is closed to new members -- its members are unaffected --
  not deleted; the superadmin can reopen or delete it from the dashboard.
*/

ALTER TABLE public.chit_plans
  ADD COLUMN IF NOT EXISTS season_label text,
  ADD COLUMN IF NOT EXISTS starts_on    date,
  ADD COLUMN IF NOT EXISTS ends_on      date,
  ADD COLUMN IF NOT EXISTS dispatch_on  date;

COMMENT ON COLUMN public.chit_plans.starts_on IS 'First installment month (the 1st of it).';
COMMENT ON COLUMN public.chit_plans.ends_on IS 'The month the scheme closes.';
COMMENT ON COLUMN public.chit_plans.dispatch_on IS 'When crackers are sent to members who completed the scheme.';

DO $$
DECLARE
  v_monthly numeric;
  v_order   integer := 0;
  v_plan    uuid;
  v_kept    uuid[] := '{}';
BEGIN
  FOREACH v_monthly IN ARRAY ARRAY[500, 1000, 2000, 3000, 4000, 5000]::numeric[]
  LOOP
    v_order := v_order + 1;

    SELECT p.id INTO v_plan
    FROM public.chit_plans p
    WHERE p.monthly_amount = v_monthly
      AND NOT EXISTS (SELECT 1 FROM public.chit_enrollments e WHERE e.plan_id = p.id)
    ORDER BY p.created_at
    LIMIT 1;

    IF v_plan IS NOT NULL THEN
      UPDATE public.chit_plans
      SET name          = 'Rs. ' || to_char(v_monthly, 'FM99,999') || ' a month',
          months        = 9,
          bonus_amount  = v_monthly,
          due_day       = 10,
          features      = ARRAY['Pay for 9 months, we pay the 10th',
                                'Crackers worth 10 months',
                                'Dispatched in September 2027'],
          season_label  = 'Diwali 2027',
          starts_on     = DATE '2026-12-01',
          ends_on       = DATE '2027-09-01',
          dispatch_on   = DATE '2027-09-01',
          is_active     = true,
          display_order = v_order
      WHERE id = v_plan;
    ELSE
      INSERT INTO public.chit_plans (
        name, monthly_amount, months, bonus_amount, due_day, features,
        season_label, starts_on, ends_on, dispatch_on, is_active, display_order
      )
      VALUES (
        'Rs. ' || to_char(v_monthly, 'FM99,999') || ' a month', v_monthly, 9, v_monthly, 10,
        ARRAY['Pay for 9 months, we pay the 10th',
              'Crackers worth 10 months',
              'Dispatched in September 2027'],
        'Diwali 2027', DATE '2026-12-01', DATE '2027-09-01', DATE '2027-09-01', true, v_order
      )
      RETURNING id INTO v_plan;
    END IF;

    v_kept := v_kept || v_plan;
  END LOOP;

  -- Closing a plan only stops new joiners; its members carry on as before.
  UPDATE public.chit_plans p
  SET is_active = false
  WHERE p.is_active
    AND NOT (p.id = ANY (v_kept));
END $$;
