/*
  # One person, however their name is typed

  20260913010000_expense_people matched names case-insensitively only, so
  "Sankar Raj", "Sankarraj" and "sankarraj" became two people: one seeded
  from each spelling in the expense history, and the unique index let a third
  be added by hand. Totals per person -- the reason that list exists -- split
  across them.

  A name now identifies a person by its letters alone: case and every space
  are ignored. This migration

    1. adds person_name_key(), the one definition of "same name";
    2. merges people who already collide under it, moving their expenses onto
       one survivor;
    3. links older expenses that were typed before the list existed;
    4. replaces the unique index so a collision cannot be created again.

  It is safe whether or not 20260913010000 found duplicates, and safe to run
  twice.
*/

-- ---------------------------------------------------------------------------
-- 1. What makes two names the same
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.person_name_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(regexp_replace(COALESCE(p_name, ''), '\s+', '', 'g'));
$$;

COMMENT ON FUNCTION public.person_name_key(text) IS
  'Identity of a typed name: lower case, all whitespace removed. '
  '"Sankar Raj", "Sankarraj" and "sankarraj" share one key.';

-- ---------------------------------------------------------------------------
-- 2. Merge people who are already the same person
--
-- The survivor is whoever the expense history uses most, so the spelling that
-- ends up on screen is the one people actually typed; ties go to the earliest
-- record. Anyone can rename the survivor afterwards in one place.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_group record;
BEGIN
  IF to_regclass('public.staff_members') IS NULL THEN
    RETURN;
  END IF;

  FOR v_group IN
    WITH usage AS (
      SELECT
        sm.id,
        public.person_name_key(sm.name) AS name_key,
        sm.is_active,
        sm.created_at,
        (SELECT count(*) FROM public.expenses e WHERE e.spend_by_id = sm.id) AS uses
      FROM public.staff_members sm
    ),
    ranked AS (
      SELECT
        usage.*,
        first_value(id) OVER (
          PARTITION BY name_key
          ORDER BY uses DESC, created_at, id
        ) AS survivor_id,
        count(*) OVER (PARTITION BY name_key) AS group_size
      FROM usage
    )
    SELECT survivor_id,
           array_agg(id) FILTER (WHERE id <> survivor_id) AS duplicate_ids,
           bool_or(is_active) AS any_active
    FROM ranked
    WHERE group_size > 1
    GROUP BY survivor_id
  LOOP
    -- The BEFORE UPDATE trigger on expenses rewrites spend_by from the new
    -- spend_by_id, so the printed name follows the move automatically.
    UPDATE public.expenses
    SET spend_by_id = v_group.survivor_id
    WHERE spend_by_id = ANY (v_group.duplicate_ids);

    -- If any copy was still in use, the merged person is too.
    UPDATE public.staff_members
    SET is_active = is_active OR v_group.any_active
    WHERE id = v_group.survivor_id;

    DELETE FROM public.staff_members
    WHERE id = ANY (v_group.duplicate_ids);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Link expenses typed before the people list existed
--
-- The first seeding only linked exact case-insensitive matches; a row saying
-- "sankarraj" next to a person called "Sankar Raj" was left unlinked.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.staff_members') IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.expenses e
  SET spend_by_id = sm.id
  FROM public.staff_members sm
  WHERE e.spend_by_id IS NULL
    AND COALESCE(trim(e.spend_by), '') <> ''
    AND public.person_name_key(e.spend_by) = public.person_name_key(sm.name);
END $$;

-- ---------------------------------------------------------------------------
-- 4. Stop it happening again
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.staff_members_name_unique;

DO $$
BEGIN
  IF to_regclass('public.staff_members') IS NULL THEN
    RETURN;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS staff_members_name_key_unique
    ON public.staff_members (public.person_name_key(name));
END $$;
