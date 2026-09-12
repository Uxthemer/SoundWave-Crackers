/*
  # Storage for invoices and quotations sent on WhatsApp

  WhatsApp can be opened on a customer's chat with a message typed in, but a
  web page cannot attach a file to that chat. So the PDF is uploaded here and
  the message carries a link to it.

  ## Private, reached through expiring links

  Unlike the expense receipts bucket, this one is PRIVATE. An invoice carries
  the customer's name, phone number and address; a public bucket would leave
  every one of them readable forever by anyone who came across a link. The
  page instead creates a signed link that stops working after a set time --
  long enough for the customer to open it, not permanent.

  Only admins can upload, and only admins can read the files directly; the
  customer reaches their own PDF through the signed link alone.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  -- A long invoice is well under 1 MB; 5 MB is generous.
  5242880,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false;

DROP POLICY IF EXISTS "Admins upload shared documents" ON storage.objects;
CREATE POLICY "Admins upload shared documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND public.season_is_admin());

-- Needed to create the signed link, and to find a file again.
DROP POLICY IF EXISTS "Admins read shared documents" ON storage.objects;
CREATE POLICY "Admins read shared documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND public.season_is_admin());

DROP POLICY IF EXISTS "Admins delete shared documents" ON storage.objects;
CREATE POLICY "Admins delete shared documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND public.season_is_admin());
