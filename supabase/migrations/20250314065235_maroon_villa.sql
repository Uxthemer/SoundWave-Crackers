/*
  # Mobile Authentication Implementation

  1. New Tables
    - `phone_auth`
      - `id` (uuid, primary key)
      - `phone` (text, not null)
      - `otp` (text, not null)
      - `verified` (boolean, default false)
      - `expires_at` (timestamptz, not null)
      - `created_at` (timestamptz, default now())

  2. Security
    - Enable RLS
    - Add policies for phone verification
*/

-- Create phone_auth table
CREATE TABLE IF NOT EXISTS phone_auth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  otp text NOT NULL,
  verified boolean DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add index for faster phone lookups
CREATE INDEX IF NOT EXISTS idx_phone_auth_phone ON phone_auth(phone);

-- Enable RLS
ALTER TABLE phone_auth ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can create phone verification"
  ON phone_auth
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Users can verify their own phone"
  ON phone_auth
  FOR SELECT
  TO public
  USING (
    phone = current_setting('request.jwt.claims')::json->>'phone'
    OR verified = false
  );

CREATE POLICY "Users can update their own verification"
  ON phone_auth
  FOR UPDATE
  TO public
  USING (
    phone = current_setting('request.jwt.claims')::json->>'phone'
    OR verified = false
  );

-- Function to generate OTP
CREATE OR REPLACE FUNCTION generate_otp()
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN floor(random() * (999999 - 100000 + 1) + 100000)::text;
END;
$$;

-- Function to create phone verification
CREATE OR REPLACE FUNCTION create_phone_verification(phone_number text)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  new_otp text;
  result json;
BEGIN
  -- Generate new OTP
  new_otp := generate_otp();
  
  -- Insert new verification record
  INSERT INTO phone_auth (phone, otp, expires_at)
  VALUES (
    phone_number,
    new_otp,
    now() + interval '10 minutes'
  )
  RETURNING json_build_object(
    'id', id,
    'phone', phone,
    'otp', otp,
    'expires_at', expires_at
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Function to verify OTP
CREATE OR REPLACE FUNCTION verify_phone_otp(phone_number text, otp_code text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  valid boolean;
BEGIN
  UPDATE phone_auth
  SET verified = true
  WHERE phone = phone_number
    AND otp = otp_code
    AND expires_at > now()
    AND NOT verified
  RETURNING true INTO valid;
  
  RETURN COALESCE(valid, false);
END;
$$;