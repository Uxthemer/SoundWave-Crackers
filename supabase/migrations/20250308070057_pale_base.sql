/*
  # Create roles and initial data

  1. Changes
    - Insert default roles (superadmin, admin, customer)
    - Add policies for role access

  2. Security
    - Enable RLS
    - Add policies for role access
*/

-- Insert default roles if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE name = 'superadmin') THEN
    INSERT INTO roles (name, description) VALUES ('superadmin', 'Super Administrator with full access');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM roles WHERE name = 'admin') THEN
    INSERT INTO roles (name, description) VALUES ('admin', 'Administrator with stock and order management access');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM roles WHERE name = 'customer') THEN
    INSERT INTO roles (name, description) VALUES ('customer', 'Regular customer');
  END IF;
END $$;

-- Enable RLS on roles table if not already enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = 'roles'
      AND rowsecurity = true
  ) THEN
    ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Drop existing policies to avoid conflicts
DO $$
BEGIN
  DROP POLICY IF EXISTS "Roles are viewable by everyone" ON roles;
  DROP POLICY IF EXISTS "Only superadmin can manage roles" ON roles;
END $$;

-- Create new policies
CREATE POLICY "Roles are viewable by everyone" 
ON roles FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Only superadmin can manage roles" 
ON roles 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN roles r ON up.role_id = r.id
    WHERE up.user_id = auth.uid() 
    AND r.name = 'superadmin'
  )
);