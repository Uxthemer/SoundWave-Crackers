-- Fix RLS policies to allow Admins/Superadmins to manage orders and order_items

-- Orders: Update
CREATE POLICY "Admins can update any order" ON orders
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()) OR is_superadmin(auth.uid()));

-- Order Items: Select
CREATE POLICY "Admins can view any order_items" ON order_items
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_superadmin(auth.uid()));

-- Order Items: Insert
CREATE POLICY "Admins can insert order_items" ON order_items
  FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()) OR is_superadmin(auth.uid()));

-- Order Items: Update
CREATE POLICY "Admins can update order_items" ON order_items
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()) OR is_superadmin(auth.uid()));

-- Order Items: Delete
CREATE POLICY "Admins can delete order_items" ON order_items
  FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) OR is_superadmin(auth.uid()));
