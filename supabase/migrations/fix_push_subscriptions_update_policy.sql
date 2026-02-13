-- Add missing UPDATE policy for admin_push_subscriptions to allow UPSERT
CREATE POLICY "Users can update own subscription" ON admin_push_subscriptions
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
