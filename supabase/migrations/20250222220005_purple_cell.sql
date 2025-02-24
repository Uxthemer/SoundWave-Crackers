/*
  # Add Delivery Details to Orders

  1. Changes
    - Add delivery details columns to orders table:
      - `customer_name` (text)
      - `email` (text)
      - `phone` (text)
      - `address` (text)
      - `city` (text)
      - `state` (text)
      - `pincode` (text)

  2. Security
    - Maintain existing RLS policies
*/

ALTER TABLE orders
ADD COLUMN customer_name text,
ADD COLUMN email text,
ADD COLUMN phone text,
ADD COLUMN address text,
ADD COLUMN city text,
ADD COLUMN state text,
ADD COLUMN pincode text;