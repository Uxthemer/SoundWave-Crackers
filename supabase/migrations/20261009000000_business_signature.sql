/*
  # Authorised signature, for the dummy GST invoice

  Global Settings → Business & GST can now take a picture of the authorised
  signatory's signature, and "Generate dummy invoice" prints it above
  "Authorised Signatory".

  ## Private, unlike everything else in app_settings

  app_settings is readable by everyone (the storefront reads its theme from
  it), so the image itself does not go there and does not go in a public
  bucket: a signature anyone can download is a signature anyone can paste
  onto a document. The column holds only the file's path in a private
  bucket, and only admins and superadmins -- the people who can generate the
  invoice -- may read the file. Knowing the path gives nobody else anything.
*/

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS signature_path text;

COMMENT ON COLUMN public.app_settings.signature_path IS
  'Path of the authorised signature in the private business-assets bucket.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-assets',
  'business-assets',
  false,
  -- A cropped signature is tens of kilobytes; 2 MB covers a phone photo.
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = false;

DROP POLICY IF EXISTS "Admins upload business assets" ON storage.objects;
CREATE POLICY "Admins upload business assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'business-assets' AND public.season_is_admin());

DROP POLICY IF EXISTS "Admins read business assets" ON storage.objects;
CREATE POLICY "Admins read business assets"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'business-assets' AND public.season_is_admin());

DROP POLICY IF EXISTS "Admins delete business assets" ON storage.objects;
CREATE POLICY "Admins delete business assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'business-assets' AND public.season_is_admin());
