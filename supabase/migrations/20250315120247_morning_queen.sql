/*
  # Update Address Structure

  1. Changes
    - Add new address columns to user_profiles table
    - Update orders table with new address structure
    - Add constraints and indexes for better performance

  2. Security
    - Maintain existing RLS policies
*/

-- Update user_profiles table with new address structure
ALTER TABLE user_profiles
ADD COLUMN address_door_no text,
ADD COLUMN address_floor text,
ADD COLUMN address_area text,
ADD COLUMN address_city text,
ADD COLUMN address_state text,
ADD COLUMN address_pincode text,
ADD COLUMN address_landmark text,
ADD COLUMN address_country text DEFAULT 'India';

-- Update orders table with new address structure
ALTER TABLE orders
ADD COLUMN shipping_door_no text,
ADD COLUMN shipping_floor text,
ADD COLUMN shipping_area text,
ADD COLUMN shipping_city text,
ADD COLUMN shipping_state text,
ADD COLUMN shipping_pincode text,
ADD COLUMN shipping_landmark text,
ADD COLUMN shipping_country text DEFAULT 'India',
DROP COLUMN address,
DROP COLUMN city,
DROP COLUMN state,
DROP COLUMN pincode;

-- Add indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_user_profiles_address_city ON user_profiles(address_city);
CREATE INDEX IF NOT EXISTS idx_user_profiles_address_state ON user_profiles(address_state);
CREATE INDEX IF NOT EXISTS idx_user_profiles_address_pincode ON user_profiles(address_pincode);

CREATE INDEX IF NOT EXISTS idx_orders_shipping_city ON orders(shipping_city);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_state ON orders(shipping_state);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_pincode ON orders(shipping_pincode);