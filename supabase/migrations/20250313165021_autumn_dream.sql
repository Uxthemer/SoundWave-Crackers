/*
  # Add indexes for better query performance

  1. Changes
    - Add indexes for faster lookups on frequently queried columns
    - Add index on phone for OTP verifications
    - Add indexes for foreign key relationships

  2. Security
    - No security changes needed
*/

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_phone ON otp_verifications(phone);