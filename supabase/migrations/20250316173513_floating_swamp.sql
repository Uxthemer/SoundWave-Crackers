/*
  # Add Phone Verification Fields

  1. Changes
    - Add phone_verified column to user_profiles table
    - Add email column to user_profiles table
    - Add indexes for faster lookups

  2. Security
    - Maintain existing RLS policies
*/

-- Add phone verification and email columns to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS phone_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS email text;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_phone ON user_profiles(phone);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- Update existing records to have phone_verified true if they have a phone number
UPDATE user_profiles
SET phone_verified = true
WHERE phone IS NOT NULL AND phone != '';