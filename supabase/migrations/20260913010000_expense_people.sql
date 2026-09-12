/*
  # People who spend money

  `expenses.spend_by` is free text. Every spelling of a name is a different
  person to a report -- "Selva", "selva", "Selvakumar" -- so expenses can be
  listed but never totalled per person, which is the one question worth asking
  of them.

  This adds the list of people to choose from, and points each expense at a
  row in it. The old text column stays and is kept populated, so existing
  rows, exports and anything reading `spend_by` keep working unchanged.
*/

-- ---------------------------------------------------------------------------
-- 1. The people
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  -- Who they are to the business, which is what expense reports group by.
  role       text NOT NULL DEFAULT 'employee'
             CHECK (role IN ('owner', 'partner', 'employee', 'contractor', 'other')),
  phone      text,
  note       text,
  -- Someone who has left must stay on their old expenses, so they are
  -- deactivated rather than deleted.
  is_active  boolean NOT NULL DEFAULT true,
  -- Optional link to a login, for staff who also use the admin panel.
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Two people cannot share a name here: the whole point is that a name
-- identifies one person. Case-insensitive, because "Selva" and "selva" being
-- separate rows is the problem this replaces.
CREATE UNIQUE INDEX IF NOT EXISTS staff_members_name_unique
  ON public.staff_members (lower(name));

CREATE INDEX IF NOT EXISTS staff_members_active_idx
  ON public.staff_members (is_active);

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage staff members" ON public.staff_members;
CREATE POLICY "Admins manage staff members"
  ON public.staff_members FOR ALL TO authenticated
  USING (public.season_is_admin())
  WITH CHECK (public.season_is_admin());

-- ---------------------------------------------------------------------------
-- 2. Point expenses at them
-- ---------------------------------------------------------------------------

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS spend_by_id uuid REFERENCES public.staff_members(id),
  -- "screenshot or any reference file": a bill photo, a UPI screenshot, a PDF.
  ADD COLUMN IF NOT EXISTS reference_no text;

CREATE INDEX IF NOT EXISTS expenses_spend_by_idx
  ON public.expenses (spend_by_id);

COMMENT ON COLUMN public.expenses.spend_by IS
  'Display name, kept in step with spend_by_id. Retained so older rows and '
  'existing exports still read.';

-- ---------------------------------------------------------------------------
-- 3. Seed the list from what has already been typed
--
-- Everyone who appears in the expense history becomes a person, so the
-- dropdown is useful on day one instead of empty. Role is left at the default
-- for someone to correct -- guessing who is an owner would be worse than
-- leaving it plain.
-- ---------------------------------------------------------------------------

INSERT INTO public.staff_members (name, role, note)
SELECT DISTINCT ON (lower(trim(e.spend_by)))
  trim(e.spend_by),
  'employee',
  'Created automatically from existing expense records'
FROM public.expenses e
WHERE COALESCE(trim(e.spend_by), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE lower(sm.name) = lower(trim(e.spend_by))
  )
ORDER BY lower(trim(e.spend_by)), e.created_at;

UPDATE public.expenses e
SET spend_by_id = sm.id
FROM public.staff_members sm
WHERE e.spend_by_id IS NULL
  AND lower(trim(e.spend_by)) = lower(sm.name);

-- ---------------------------------------------------------------------------
-- 4. Keep the label in step
--
-- The name is stored twice on purpose: once as the link, once as the text an
-- export prints. A trigger means the copy can never go stale, which is the
-- usual failure of denormalising a name.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_expense_spender_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.spend_by_id IS NOT NULL THEN
    SELECT name INTO NEW.spend_by
    FROM public.staff_members WHERE id = NEW.spend_by_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expenses_spender_name ON public.expenses;
CREATE TRIGGER expenses_spender_name
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.sync_expense_spender_name();

-- Renaming a person updates every expense that names them.
CREATE OR REPLACE FUNCTION public.propagate_staff_rename()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.expenses SET spend_by = NEW.name WHERE spend_by_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_members_rename ON public.staff_members;
CREATE TRIGGER staff_members_rename
  AFTER UPDATE ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.propagate_staff_rename();
