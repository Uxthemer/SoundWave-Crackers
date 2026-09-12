/*
  # Storage for expense attachments

  The Expenses page uploads receipts to a storage bucket called "expenses",
  but no migration ever created that bucket or gave anyone permission to
  write to it. Every upload was refused, and the page used to save the
  expense anyway, so the entry appeared with no attachment and no clear error.

  This creates the bucket if it is missing and lets admins manage its files.

  ## Public read, on purpose (for now)

  The page shows attachments with getPublicUrl(), which only works on a
  public bucket, so the bucket is public. Anyone holding the exact link can
  open a file, but the links contain a random UUID and cannot be listed or
  guessed. If receipts should need a login to view, the bucket can be made
  private and the page switched to signed URLs -- say the word.
*/

-- ---------------------------------------------------------------------------
-- 1. The bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expenses',
  'expenses',
  true,
  -- A phone photo of a bill is a few MB; 10 MB leaves room without letting
  -- the bucket become a dumping ground for video.
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
        'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = true;
-- An existing bucket keeps whatever size and type limits someone set by hand;
-- only `public` is forced, because the page cannot show attachments without it.

-- ---------------------------------------------------------------------------
-- 2. Who may do what
--
-- Admins and superadmins -- the same people who can open the Expenses page --
-- may add, replace, remove and list attachments. Nobody else may write.
-- Reading a file by its URL needs no policy on a public bucket.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins upload expense attachments" ON storage.objects;
CREATE POLICY "Admins upload expense attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expenses' AND public.season_is_admin());

DROP POLICY IF EXISTS "Admins read expense attachments" ON storage.objects;
CREATE POLICY "Admins read expense attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expenses' AND public.season_is_admin());

DROP POLICY IF EXISTS "Admins replace expense attachments" ON storage.objects;
CREATE POLICY "Admins replace expense attachments"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'expenses' AND public.season_is_admin())
  WITH CHECK (bucket_id = 'expenses' AND public.season_is_admin());

DROP POLICY IF EXISTS "Admins delete expense attachments" ON storage.objects;
CREATE POLICY "Admins delete expense attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'expenses' AND public.season_is_admin());
