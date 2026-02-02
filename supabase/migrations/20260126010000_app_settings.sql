-- Create app_settings table
CREATE TABLE app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Branding
  site_title text DEFAULT 'SoundWave Crackers',
  logo_url text,
  favicon_url text,
  
  -- Colors (Hex codes)
  primary_color text DEFAULT '#FF5722',
  secondary_color text DEFAULT '#6B46C1',
  accent_color text DEFAULT '#FFC107',
  background_color text DEFAULT '#FFFFFF',
  text_color text DEFAULT '#1E1E1E',
  
  -- Typography
  font_family text DEFAULT 'Montserrat',
  base_font_size text DEFAULT '16px',
  
  -- Styles
  button_style text DEFAULT 'rounded', -- rounded, pill, sharp
  card_style text DEFAULT 'shadow', -- shadow, border, flat
  
  -- Banners (Array of URLs for slider)
  hero_banners text[],
  
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Policies
-- Everyone can read settings (public)
CREATE POLICY "Public read access to settings" ON app_settings
  FOR SELECT TO public
  USING (true);

-- Only Admins can update
CREATE POLICY "Admins can update settings" ON app_settings
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()) OR is_superadmin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR is_superadmin(auth.uid()));

-- Only Admins can insert (initially)
CREATE POLICY "Admins can insert settings" ON app_settings
  FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()) OR is_superadmin(auth.uid()));

-- Insert default row if not exists
INSERT INTO app_settings (id, primary_color, secondary_color, font_family)
VALUES ('00000000-0000-0000-0000-000000000001', '#FF5722', '#6B46C1', 'Montserrat')
ON CONFLICT DO NOTHING;
