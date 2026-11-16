/*
  # Wholesale enquiries

  The public Wholesale page (/wholesale) takes an enquiry -- a request for the
  wholesale price list, a bulk-order quote, a dealership, anything else -- and
  superadmins see every one in Dashboard → Wholesale, and are notified of each
  (push + email, supabase/functions/wholesale-notify).

  ## Anyone may enquire, so the door is narrow

  * Nobody inserts into the table directly. `submit_wholesale_enquiry` is the
    only way in: it checks the essentials (a name, a 10-digit phone, a known
    enquiry type, a plausible email), trims every field and caps its length,
    and records the account when the visitor is signed in.
  * It refuses a second enquiry from the same phone within two minutes (a
    double tap, a resubmit) and stops taking enquiries if more than 30 have
    arrived in ten minutes -- a cheap brake on a script filling the list.
  * Only superadmins can read the list or change an enquiry's status and
    notes. The visitor gets back the enquiry's id and nothing else.
  * `notified_at` is set by the notify function when it sends, once per
    enquiry, so calling it again for the same enquiry sends nothing.
*/

CREATE TABLE IF NOT EXISTS public.wholesale_enquiries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_type      text NOT NULL DEFAULT 'bulk_order'
                    CHECK (enquiry_type IN ('price_list', 'bulk_order', 'dealership', 'other')),
  business_name     text,
  contact_name      text NOT NULL,
  phone             text NOT NULL,
  alternate_phone   text,
  email             text,
  business_type     text,
  gstin             text,
  city              text,
  district          text,
  state             text,
  pincode           text,
  budget            text,
  products          text,
  message           text,
  preferred_contact text,
  status            text NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'contacted', 'quoted', 'converted', 'closed')),
  admin_note        text,
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notified_at       timestamptz,
  handled_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status_changed_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wholesale_enquiries_created_idx ON public.wholesale_enquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS wholesale_enquiries_status_idx ON public.wholesale_enquiries (status);
CREATE INDEX IF NOT EXISTS wholesale_enquiries_phone_idx
  ON public.wholesale_enquiries ((right(regexp_replace(phone, '\D', '', 'g'), 10)));

CREATE OR REPLACE FUNCTION public.wholesale_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
    NEW.handled_by := coalesce(auth.uid(), NEW.handled_by);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wholesale_enquiries_touch ON public.wholesale_enquiries;
CREATE TRIGGER wholesale_enquiries_touch BEFORE UPDATE ON public.wholesale_enquiries
  FOR EACH ROW EXECUTE FUNCTION public.wholesale_touch();

ALTER TABLE public.wholesale_enquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmins read wholesale enquiries" ON public.wholesale_enquiries;
CREATE POLICY "Superadmins read wholesale enquiries"
  ON public.wholesale_enquiries FOR SELECT TO authenticated
  USING (public.season_is_superadmin());

DROP POLICY IF EXISTS "Superadmins update wholesale enquiries" ON public.wholesale_enquiries;
CREATE POLICY "Superadmins update wholesale enquiries"
  ON public.wholesale_enquiries FOR UPDATE TO authenticated
  USING (public.season_is_superadmin())
  WITH CHECK (public.season_is_superadmin());

DROP POLICY IF EXISTS "Superadmins delete wholesale enquiries" ON public.wholesale_enquiries;
CREATE POLICY "Superadmins delete wholesale enquiries"
  ON public.wholesale_enquiries FOR DELETE TO authenticated
  USING (public.season_is_superadmin());

/**
 * The only way an enquiry gets in. Takes the form as JSON so a field added to
 * the form later is a change here, not a new function signature.
 */
CREATE OR REPLACE FUNCTION public.submit_wholesale_enquiry(p_enquiry jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Trimmed, empty as NULL, and capped: a form field is not a document.
  v_name   text := left(NULLIF(btrim(p_enquiry ->> 'contact_name'), ''), 120);
  v_phone  text := left(NULLIF(btrim(p_enquiry ->> 'phone'), ''), 20);
  v_email  text := lower(left(NULLIF(btrim(p_enquiry ->> 'email'), ''), 160));
  v_type   text := coalesce(NULLIF(btrim(p_enquiry ->> 'enquiry_type'), ''), 'bulk_order');
  v_digits text;
  v_id     uuid;
BEGIN
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Please enter your name.';
  END IF;
  v_digits := right(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), 10);
  IF length(v_digits) < 10 THEN
    RAISE EXCEPTION 'Please enter a valid 10-digit phone number.';
  END IF;
  IF v_type NOT IN ('price_list', 'bulk_order', 'dealership', 'other') THEN
    RAISE EXCEPTION 'Please choose what you are enquiring about.';
  END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Please enter a valid email address, or leave it empty.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.wholesale_enquiries
    WHERE right(regexp_replace(phone, '\D', '', 'g'), 10) = v_digits
      AND created_at > now() - interval '2 minutes'
  ) THEN
    RAISE EXCEPTION 'We have just received your enquiry. We will contact you soon.';
  END IF;
  IF (SELECT count(*) FROM public.wholesale_enquiries WHERE created_at > now() - interval '10 minutes') > 30 THEN
    RAISE EXCEPTION 'We are receiving a lot of enquiries right now. Please call us, or try again in a few minutes.';
  END IF;

  INSERT INTO public.wholesale_enquiries (
    enquiry_type, business_name, contact_name, phone, alternate_phone, email,
    business_type, gstin, city, district, state, pincode,
    budget, products, message, preferred_contact, user_id
  )
  VALUES (
    v_type,
    left(NULLIF(btrim(p_enquiry ->> 'business_name'), ''), 160),
    v_name,
    v_phone,
    left(NULLIF(btrim(p_enquiry ->> 'alternate_phone'), ''), 20),
    v_email,
    left(NULLIF(btrim(p_enquiry ->> 'business_type'), ''), 60),
    upper(left(NULLIF(btrim(p_enquiry ->> 'gstin'), ''), 20)),
    left(NULLIF(btrim(p_enquiry ->> 'city'), ''), 80),
    left(NULLIF(btrim(p_enquiry ->> 'district'), ''), 80),
    left(NULLIF(btrim(p_enquiry ->> 'state'), ''), 80),
    left(NULLIF(btrim(p_enquiry ->> 'pincode'), ''), 10),
    left(NULLIF(btrim(p_enquiry ->> 'budget'), ''), 60),
    left(NULLIF(btrim(p_enquiry ->> 'products'), ''), 2000),
    left(NULLIF(btrim(p_enquiry ->> 'message'), ''), 2000),
    left(NULLIF(btrim(p_enquiry ->> 'preferred_contact'), ''), 20),
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_wholesale_enquiry(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_wholesale_enquiry(jsonb) TO anon, authenticated;
