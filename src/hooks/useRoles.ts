import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export function useRoles() {
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUserRole() {
      if (!user) {
        setUserRole(null);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('role_id')
          .eq('id', user.id)
          .single();

        if (error) throw error;

        if (data?.role_id) {
          const { data: roleData, error: roleError } = await supabase
            .from('roles')
            .select('name')
            .eq('id', data.role_id)
            .single();

          if (roleError) throw roleError;
          setUserRole(roleData?.name || null);
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
        setUserRole(null);
      } finally {
        setLoading(false);
      }
    }

    fetchUserRole();
  }, [user]);

  return { userRole, loading };
}