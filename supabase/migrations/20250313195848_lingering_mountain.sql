/*
  # Fix Products Table RLS Policies

  1. Changes
    - Add policies for admin and superadmin to manage products
    - Allow admins to insert, update, and delete products
    - Maintain existing select policy for public access

  2. Security
    - Only admins and superadmins can manage products
    - Everyone can view products
*/

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Products are viewable by everyone" ON products;
DROP POLICY IF EXISTS "Admin and superadmin can update products" ON products;

-- Create comprehensive policies for products table
CREATE POLICY "Products are viewable by everyone"
  ON products
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Admins can manage products"
  ON products
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN roles r ON up.role_id = r.id
      WHERE up.user_id = auth.uid()
      AND r.name IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN roles r ON up.role_id = r.id
      WHERE up.user_id = auth.uid()
      AND r.name IN ('admin', 'superadmin')
    )
  );