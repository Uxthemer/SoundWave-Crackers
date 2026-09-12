/*
  # Business and GST details, for invoices

  The invoice's business details were typed into the template: the name,
  phone numbers and email were fixed in code, and there was nowhere to put a
  GSTIN at all. These columns hold them, and `gst_on_invoice` decides whether
  the GSTIN is printed -- a business registering part-way through a season, or
  selling some orders outside it, needs to switch it without a code change.

  app_settings is readable by everyone (the storefront reads its theme from
  it). Nothing here is private: a GSTIN is public by design, printed on every
  invoice and searchable on the GST portal.
*/

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS business_legal_name text,
  ADD COLUMN IF NOT EXISTS gstin               text,
  ADD COLUMN IF NOT EXISTS business_address    text,
  ADD COLUMN IF NOT EXISTS business_state      text,
  ADD COLUMN IF NOT EXISTS business_phone      text,
  ADD COLUMN IF NOT EXISTS business_email      text,
  ADD COLUMN IF NOT EXISTS gst_on_invoice      boolean NOT NULL DEFAULT false;

-- A GSTIN has a fixed shape: 2-digit state code, 10-character PAN, entity
-- number, a literal Z, and a check character. Checking the shape catches a
-- mistyped number before it is printed on a customer's invoice. Blank is
-- allowed, for a business that has not registered.
ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_gstin_format;
ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_gstin_format
  CHECK (
    gstin IS NULL
    OR gstin = ''
    OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
  );

-- Turning GST on with no number to print would produce invoices that claim
-- to be GST invoices and show nothing.
ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_gst_needs_number;
ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_gst_needs_number
  CHECK (NOT gst_on_invoice OR COALESCE(gstin, '') <> '');

-- Start from the details the invoice template had fixed in code, so turning
-- this on changes nothing a customer sees except the GST line.
UPDATE public.app_settings
SET business_legal_name = COALESCE(business_legal_name, 'SoundWave Crackers'),
    business_phone      = COALESCE(business_phone, '+91 9789794518, +91 9363515184'),
    business_email      = COALESCE(business_email, 'soundwavecrackers@gmail.com');

COMMENT ON COLUMN public.app_settings.gst_on_invoice IS
  'When true, the GSTIN and business details are printed on invoices.';
