/*
  # Add OTP verification and update product schema

  1. New Tables
    - `otp_verifications`
      - `id` (uuid, primary key)
      - `phone` (text, not null)
      - `otp` (text, not null)
      - `verified` (boolean, default false)
      - `expires_at` (timestamptz, not null)
      - `created_at` (timestamptz, default now())

  2. Changes
    - Add `stock` column to `products` table if it doesn't exist already
    - Add indexes for better query performance
*/

-- Create OTP verifications table
CREATE TABLE IF NOT EXISTS otp_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  otp text NOT NULL,
  verified boolean DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add index on phone for faster lookups
CREATE INDEX IF NOT EXISTS idx_otp_verifications_phone ON otp_verifications(phone);

-- Add stock column to products table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'stock'
  ) THEN
    ALTER TABLE products ADD COLUMN stock integer DEFAULT 0;
  END IF;
END $$;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- Enable RLS on the new table
ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;

-- Create policies for OTP verifications
CREATE POLICY "OTP verifications are viewable by authenticated users only"
  ON otp_verifications
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "OTP verifications can be created by anyone"
  ON otp_verifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "OTP verifications can be updated by authenticated users only"
  ON otp_verifications
  FOR UPDATE
  TO authenticated
  USING (true);