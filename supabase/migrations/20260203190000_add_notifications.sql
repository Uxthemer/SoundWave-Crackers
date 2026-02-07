-- Add notification settings to app_settings
ALTER TABLE app_settings 
ADD COLUMN IF NOT EXISTS enable_email_notifications BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS enable_whatsapp_notifications BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS enable_push_notifications BOOLEAN DEFAULT FALSE;

-- Create admin_push_subscriptions table
CREATE TABLE IF NOT EXISTS admin_push_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    fcm_token TEXT NOT NULL UNIQUE,
    device_info TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies for admin_push_subscriptions
ALTER TABLE admin_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Admins can view all subscriptions (to manage or just debug)
CREATE POLICY "Admins can view all subscriptions" ON admin_push_subscriptions
    FOR SELECT
    USING (
        auth.uid() IN (
            SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin' OR raw_user_meta_data->>'role' = 'superadmin'
        )
    );

-- Users can insert their own subscription (mainly for admins logging in)
CREATE POLICY "Users can insert own subscription" ON admin_push_subscriptions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own subscription (logout)
CREATE POLICY "Users can delete own subscription" ON admin_push_subscriptions
    FOR DELETE
    USING (auth.uid() = user_id);
