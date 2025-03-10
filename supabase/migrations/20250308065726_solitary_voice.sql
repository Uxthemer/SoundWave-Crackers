/*
  # Update stock management functionality

  1. Changes
    - Add trigger for updating stock on order creation
    - Add function for updating stock
    - Add policies for stock management

  2. Security
    - Add policies for admin and superadmin access
*/

-- Create function to update stock
CREATE OR REPLACE FUNCTION update_product_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Decrease stock when order is created
  IF (TG_OP = 'INSERT') THEN
    UPDATE products
    SET stock = stock - NEW.quantity
    WHERE id = NEW.product_id;
  -- Increase stock when order is cancelled/deleted
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE products
    SET stock = stock + OLD.quantity
    WHERE id = OLD.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for stock updates
DROP TRIGGER IF EXISTS update_stock_on_order ON order_items;
CREATE TRIGGER update_stock_on_order
AFTER INSERT OR DELETE ON order_items
FOR EACH ROW
EXECUTE FUNCTION update_product_stock();

-- Update policies for products table
CREATE POLICY "Admin and superadmin can update products"
ON products
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN roles r ON up.role_id = r.id
    WHERE up.user_id = auth.uid()
    AND r.name IN ('admin', 'superadmin')
  )
);