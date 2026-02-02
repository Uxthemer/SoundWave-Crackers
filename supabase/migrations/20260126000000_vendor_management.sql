-- Create vendors table
CREATE TABLE vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  address text,
  gstin text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create vendor_transactions table
CREATE TABLE vendor_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
  amount numeric NOT NULL,
  description text,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for vendors (Admin only)
CREATE POLICY "Admins can view vendors" ON vendors
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_superadmin(auth.uid()));

CREATE POLICY "Admins can manage vendors" ON vendors
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR is_superadmin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR is_superadmin(auth.uid()));

-- Policies for vendor_transactions (Admin only)
CREATE POLICY "Admins can view vendor transactions" ON vendor_transactions
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_superadmin(auth.uid()));

CREATE POLICY "Admins can manage vendor transactions" ON vendor_transactions
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR is_superadmin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR is_superadmin(auth.uid()));
