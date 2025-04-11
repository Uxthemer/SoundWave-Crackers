/*
  # Create users and roles tables

  1. New Tables
    - `roles`
      - `id` (uuid, primary key)
      - `name` (text, unique)
      - `description` (text)
      - `created_at` (timestamp)
    - `user_profiles`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `role_id` (uuid, references roles)
      - `full_name` (text)
      - `phone` (text)
      - `address` (text)
      - `created_at` (timestamp)
  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users
*/

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Roles are viewable by everyone"
  ON roles
  FOR SELECT
  TO public
  USING (true);

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
  full_name text,
  phone text,
  address text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION is_superadmin(user_uuid uuid) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN roles r ON up.role_id = r.id
    WHERE up.user_id = user_uuid AND r.name = 'superadmin'
  );
$$;

CREATE FUNCTION is_admin(user_uuid uuid) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN roles r ON up.role_id = r.id
    WHERE up.user_id = user_uuid AND r.name = 'admin'
  );
$$;


CREATE POLICY "Users can view their own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Superadmin can view all profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (is_superadmin(auth.uid()));

CREATE POLICY "Admin can view all profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

-- Insert default roles
INSERT INTO roles (name, description) VALUES
  ('superadmin', 'Administrator with full access to all features'),
  ('admin', 'Administrator with full access to certain features'),
  ('customer', 'Regular customer with standard access');


CREATE POLICY "Superadmin can view all Orders"
  ON orders
  FOR SELECT
  TO authenticated
  USING (is_superadmin(auth.uid()));

CREATE POLICY "Admin can view all Orders"
  ON orders
  FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

  CREATE POLICY "Superadmin can update all Orders"
  ON orders
  FOR UPDATE
  TO authenticated
  USING (is_superadmin(auth.uid()));

CREATE POLICY "Admin can view update Orders"
  ON orders
  FOR UPDATE
  TO authenticated
  USING (is_admin(auth.uid()));