/*
  # Missing districts for the states we deliver to

  The State and District pickers (cart, edit-order popup) read the `states`
  and `districts` tables. Checked on 2026-11-16 against the states asked for --
  Tamil Nadu, Kerala, Karnataka, Telangana, Andhra Pradesh, Puducherry and
  Maharashtra (for Mumbai) -- every state was already present and active, and
  these districts were missing:

    Tamil Nadu      Cuddalore
    Karnataka       Vijayanagara
    Andhra Pradesh  Eluru
    Telangana       Mulugu

  Kerala (14), Puducherry (4) and Maharashtra (36, Mumbai City and Mumbai
  Suburban among them) were complete.

  Nothing existing is changed: no row is renamed, deactivated or removed. A
  district is added only when its state has no district of that name in any
  case, so running this twice, or after someone has added one by hand, adds
  nothing. The table holds a few names twice already (Coimbatore, Madurai,
  Mysuru, Bengaluru Urban); those are left in place and the pickers show each
  name once (hooks/useStatesAndDistricts.ts).

  Neither table was created by a migration, so its shape is known only from
  the app: `districts (id, state_id, name, is_active)`. Whether `id` fills
  itself in is checked rather than assumed.
*/

DO $$
DECLARE
  v_has_default boolean;
  v_row record;
  v_state_id bigint;
BEGIN
  SELECT column_default IS NOT NULL OR is_identity = 'YES'
    INTO v_has_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'districts' AND column_name = 'id';

  FOR v_row IN
    SELECT * FROM (VALUES
      ('Tamil Nadu',     'Cuddalore'),
      ('Karnataka',      'Vijayanagara'),
      ('Andhra Pradesh', 'Eluru'),
      ('Telangana',      'Mulugu')
    ) AS t(state_name, district_name)
  LOOP
    SELECT id INTO v_state_id
    FROM public.states
    WHERE lower(trim(name)) = lower(v_row.state_name)
    ORDER BY id
    LIMIT 1;

    IF v_state_id IS NULL THEN
      RAISE NOTICE 'State % not found; % not added', v_row.state_name, v_row.district_name;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.districts
      WHERE state_id = v_state_id
        AND lower(trim(name)) = lower(v_row.district_name)
    ) THEN
      CONTINUE;
    END IF;

    IF v_has_default THEN
      INSERT INTO public.districts (state_id, name, is_active)
      VALUES (v_state_id, v_row.district_name, true);
    ELSE
      INSERT INTO public.districts (id, state_id, name, is_active)
      SELECT COALESCE(max(id), 0) + 1, v_state_id, v_row.district_name, true
      FROM public.districts;
    END IF;
  END LOOP;
END $$;
