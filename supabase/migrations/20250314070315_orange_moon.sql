/*
  # Fix Phone Authentication

  1. Changes
    - Drop existing phone_auth table and functions
    - Create new phone_auth table with improved structure
    - Add new functions for OTP management
    - Update policies for better security

  2. Security
    - Enable RLS
    - Add policies for phone verification
*/

-- Drop existing objects
DROP TABLE IF EXISTS phone_auth CASCADE;
DROP FUNCTION IF EXISTS generate_otp CASCADE;
DROP FUNCTION IF EXISTS create_phone_verification CASCADE;
DROP FUNCTION IF EXISTS verify_phone_otp CASCADE;

-- Create phone_auth table
CREATE TABLE phone_auth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  otp text NOT NULL,
  verified boolean DEFAULT false,
  attempts integer DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add indexes
CREATE INDEX idx_phone_auth_phone ON phone_auth(phone);
CREATE INDEX idx_phone_auth_expires ON phone_auth(expires_at);

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
SECURITY DEFINER
AS $$
BEGIN
  RETURN lpad(floor(random() * 999999)::text, 6, '0');
END;
$$;

-- Function to create phone verification
CREATE OR REPLACE FUNCTION create_phone_verification(phone_number text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_otp text;
  result json;
BEGIN
  -- Delete any existing unverified OTPs for this phone
  DELETE FROM phone_auth
  WHERE phone = phone_number
    AND NOT verified;

  -- Generate new OTP
  new_otp := generate_otp();
  
  -- Insert new verification record
  INSERT INTO phone_auth (
    phone,
    otp,
    expires_at
  )
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
  
  -- For development, log OTP
  RAISE NOTICE 'Generated OTP for %: %', phone_number, new_otp;
  
  RETURN result;
END;
$$;

-- Function to verify OTP
CREATE OR REPLACE FUNCTION verify_phone_otp(phone_number text, otp_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  auth_record phone_auth%ROWTYPE;
  max_attempts constant int := 3;
BEGIN
  -- Get the latest unverified OTP record
  SELECT *
  INTO auth_record
  FROM phone_auth
  WHERE phone = phone_number
    AND NOT verified
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  -- Check if record exists
  IF auth_record IS NULL THEN
    RETURN false;
  END IF;

  -- Check attempts
  IF auth_record.attempts >= max_attempts THEN
    RETURN false;
  END IF;

  -- Update attempts
  UPDATE phone_auth
  SET attempts = attempts + 1
  WHERE id = auth_record.id;

  -- Verify OTP
  IF auth_record.otp = otp_code THEN
    UPDATE phone_auth
    SET verified = true
    WHERE id = auth_record.id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;