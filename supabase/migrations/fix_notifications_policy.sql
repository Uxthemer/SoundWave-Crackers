-- Drop the problematic policy
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON admin_push_subscriptions;

-- Re-create it using the secure helper functions (avoiding direct auth.users access)
CREATE POLICY "Admins can view all subscriptions" ON admin_push_subscriptions
    FOR SELECT
    USING (
        is_admin(auth.uid()) OR is_superadmin(auth.uid())
    );
