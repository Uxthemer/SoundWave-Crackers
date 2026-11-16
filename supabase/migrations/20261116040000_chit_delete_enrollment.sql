/*
  # Deleting a member's chit (superadmin)

  For an enrolment made by mistake, a duplicate, or a test. It removes the
  enrolment and, by the existing ON DELETE CASCADE, every payment on it --
  approved ones included, so the money they recorded leaves every total. The
  dashboard asks twice before calling this, and says what will go.

  Cancelling (chit_set_enrollment_status) remains the way to end a real
  member's chit: it keeps the history. Deleting is for rows that should never
  have existed.

  The payment screenshots are files in the chit-payments bucket, not rows
  here, so they are not removed by the cascade. The function returns their
  paths and the app deletes the files -- removing storage objects from SQL
  would leave the files themselves behind in the object store. Superadmins are
  given permission to delete in that bucket for exactly this.
*/

CREATE OR REPLACE FUNCTION public.chit_delete_enrollment(p_enrollment_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paths text[];
BEGIN
  IF NOT public.season_is_superadmin() THEN
    RAISE EXCEPTION 'Only a superadmin may delete a chit.';
  END IF;

  SELECT coalesce(array_agg(screenshot_path) FILTER (WHERE screenshot_path IS NOT NULL), '{}')
    INTO v_paths
  FROM public.chit_payments
  WHERE enrollment_id = p_enrollment_id;

  DELETE FROM public.chit_enrollments WHERE id = p_enrollment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This chit no longer exists.';
  END IF;

  RETURN v_paths;
END;
$$;

REVOKE ALL ON FUNCTION public.chit_delete_enrollment(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.chit_delete_enrollment(uuid) TO authenticated;

DROP POLICY IF EXISTS "Superadmins remove chit screenshots" ON storage.objects;
CREATE POLICY "Superadmins remove chit screenshots"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chit-payments' AND public.season_is_superadmin());
