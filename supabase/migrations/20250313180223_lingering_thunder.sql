/*
  # Add FAQ and Blog tables

  1. New Tables
    - `faqs`
      - `id` (uuid, primary key)
      - `question` (text)
      - `answer` (text)
      - `order` (integer)
      - `created_at` (timestamp)

    - `blogs`
      - `id` (uuid, primary key)
      - `title` (text)
      - `slug` (text, unique)
      - `content` (text)
      - `image_url` (text)
      - `published_at` (timestamp)
      - `created_at` (timestamp)
      - `author_id` (uuid, references user_profiles)

  2. Security
    - Enable RLS on both tables
    - Add policies for public read access
    - Add policies for admin write access
*/

-- Create FAQs table
CREATE TABLE faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  "order" integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "FAQs are viewable by everyone"
  ON faqs FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Only admins can manage FAQs"
  ON faqs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN roles r ON up.role_id = r.id
      WHERE up.user_id = auth.uid()
      AND r.name IN ('admin', 'superadmin')
    )
  );

-- Create blogs table
CREATE TABLE blogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  content text NOT NULL,
  image_url text,
  published_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  author_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL
);

ALTER TABLE blogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Blogs are viewable by everyone"
  ON blogs FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Only admins can manage blogs"
  ON blogs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN roles r ON up.role_id = r.id
      WHERE up.user_id = auth.uid()
      AND r.name IN ('admin', 'superadmin')
    )
  );

-- Insert sample FAQs
INSERT INTO faqs (question, answer, "order") VALUES
  ('What are the safety measures to follow while bursting crackers?', 'Always light crackers in open spaces, keep a bucket of water nearby, wear cotton clothes, never light crackers in hand, and supervise children at all times. Follow the instructions on the package carefully.', 1),
  ('What is your minimum order value?', 'Our minimum order value is ₹3000 for Tamil Nadu and ₹5000 for other states. This helps us ensure efficient delivery and quality service.', 2),
  ('Do you offer bulk discounts?', 'Yes, we offer special discounts for bulk orders. Contact our customer support team for customized quotes based on your requirements.', 3),
  ('What are your delivery areas?', 'We deliver to over 12,000 locations across India. However, international shipping is currently not available.', 4),
  ('How can I track my order?', 'Once your order is shipped, you will receive an LR number via SMS and email. You can use this number to track your order status.', 5);

-- Insert sample blogs
INSERT INTO blogs (title, slug, content, image_url, published_at) VALUES
  (
    'The Art of Sivakasi Firecracker Manufacturing',
    'sivakasi-firecracker-manufacturing',
    'Sivakasi, often called the firecracker capital of India, has a rich history dating back to the 1920s. This small town in Tamil Nadu accounts for nearly 90% of India''s firecracker production. The industry employs thousands of skilled workers who have perfected the art of manufacturing safe and high-quality fireworks...',
    'sivakasi-manufacturing.jpg',
    now() - interval '2 days'
  ),
  (
    'Essential Safety Tips for Diwali Celebrations',
    'diwali-safety-tips',
    'Diwali is a festival of lights and joy, but safety should always come first. Here are essential tips to ensure a safe celebration: Choose an open area for bursting crackers, keep water nearby, wear appropriate clothing, and follow all safety instructions...',
    'diwali-safety.jpg',
    now() - interval '1 day'
  ),
  (
    'The Science Behind Fireworks Colors',
    'fireworks-color-science',
    'Ever wondered how fireworks create such vibrant colors? The secret lies in the chemistry of metal salts. Different metals produce different colors when heated: Strontium creates red, Barium produces green, Copper yields blue, and Sodium generates yellow...',
    'firework-colors.jpg',
    now() - interval '12 hours'
  ),
  (
    'Eco-Friendly Crackers: The Future of Celebrations',
    'eco-friendly-crackers',
    'With growing environmental concerns, the firecracker industry is evolving. Green crackers are the latest innovation, producing 30% less emissions while maintaining the festive spirit. These crackers use alternative raw materials that reduce air and noise pollution...',
    'green-crackers.jpg',
    now() - interval '6 hours'
  ),
  (
    'Traditional Crackers of India',
    'traditional-indian-crackers',
    'India has a rich tradition of firecracker making, with each region having its unique specialties. From the famous Sivakasi sparklers to the colorful chakras of the north, discover the diverse world of traditional Indian crackers...',
    'traditional-crackers.jpg',
    now()
  );