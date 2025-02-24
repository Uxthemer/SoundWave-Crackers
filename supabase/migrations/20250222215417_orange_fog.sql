/*
  # Initial Schema Setup for Cracker Store

  1. New Tables
    - `categories`
      - `id` (uuid, primary key)
      - `name` (text)
      - `description` (text)
      - `image_url` (text)
      - `created_at` (timestamp)

    - `products`
      - `id` (uuid, primary key)
      - `category_id` (uuid, foreign key)
      - `name` (text)
      - `description` (text)
      - `image_url` (text)
      - `actual_price` (numeric)
      - `discount_percentage` (numeric)
      - `offer_price` (numeric)
      - `content` (text)
      - `stock` (integer)
      - `created_at` (timestamp)

    - `orders`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key)
      - `total_amount` (numeric)
      - `status` (text)
      - `payment_method` (text)
      - `created_at` (timestamp)

    - `order_items`
      - `id` (uuid, primary key)
      - `order_id` (uuid, foreign key)
      - `product_id` (uuid, foreign key)
      - `quantity` (integer)
      - `price` (numeric)
      - `total_price` (numeric)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Create categories table
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  image_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories are viewable by everyone"
  ON categories
  FOR SELECT
  TO public
  USING (true);

-- Create products table
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  image_url text,
  actual_price numeric NOT NULL,
  discount_percentage numeric DEFAULT 0,
  offer_price numeric NOT NULL,
  content text,
  stock integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Products are viewable by everyone"
  ON products
  FOR SELECT
  TO public
  USING (true);

-- Create orders table
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  total_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payment_method text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own orders"
  ON orders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own orders"
  ON orders
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create order_items table
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL,
  price numeric NOT NULL,
  total_price numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own order items"
  ON order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND orders.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own order items"
  ON order_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND orders.user_id = auth.uid()
    )
  );

-- Insert sample data
INSERT INTO categories (name, description, image_url) VALUES
  ('Aerial Fireworks', 'Spectacular sky-high displays with colorful bursts and patterns', 'https://images.unsplash.com/photo-1498931299472-f7a63a5a1cfa?w=800&auto=format&fit=crop'),
  ('Ground Spinners', 'Exciting ground-level effects with spinning lights and colors', 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=800&auto=format&fit=crop'),
  ('Sparklers', 'Classic handheld sparklers for all ages', 'https://images.unsplash.com/photo-1533230408708-8f9f91d1235a?w=800&auto=format&fit=crop');

DO $$
DECLARE
  aerial_id uuid;
  spinner_id uuid;
  sparkler_id uuid;
BEGIN
  SELECT id INTO aerial_id FROM categories WHERE name = 'Aerial Fireworks' LIMIT 1;
  SELECT id INTO spinner_id FROM categories WHERE name = 'Ground Spinners' LIMIT 1;
  SELECT id INTO sparkler_id FROM categories WHERE name = 'Sparklers' LIMIT 1;

  INSERT INTO products (category_id, name, description, image_url, actual_price, discount_percentage, offer_price, content, stock) VALUES
    (aerial_id, 'Sparkle Supreme', 'Amazing aerial display', 'https://images.unsplash.com/photo-1498931299472-f7a63a5a1cfa?w=800&auto=format&fit=crop', 499, 20, 399, '1 Box - 10 Pieces', 100),
    (spinner_id, 'Thunder King', 'Spectacular ground effects', 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=800&auto=format&fit=crop', 299, 15, 254, '1 Box - 5 Pieces', 150),
    (sparkler_id, 'Rainbow Burst', 'Colorful handheld sparklers', 'https://images.unsplash.com/photo-1533230408708-8f9f91d1235a?w=800&auto=format&fit=crop', 199, 25, 149, '1 Box - 20 Pieces', 200);
END $$;