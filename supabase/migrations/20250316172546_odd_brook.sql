/*
  # Add phone verification to user profiles

  1. Changes
    - Add phone_verified column to user_profiles table
    - Add email column to user_profiles table
    - Add indexes for faster lookups

  2. Security
    - Maintain existing RLS policies
*/

-- Add phone verification and email columns to user_profiles
ALTER TABLE user_profiles
ADD COLUMN phone_verified boolean DEFAULT false,
ADD COLUMN email text;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_phone ON user_profiles(phone);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);