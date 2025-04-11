import { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { SchemeDetails as SchemeDetailsType } from '../types/scheme';
import { Database } from '../types/supabase';
import { toast } from 'react-hot-toast';

type SchemeSelection = Database['public']['Tables']['scheme_selections']['Row'];
type Scheme = Database['public']['Tables']['schemes']['Row'];

export function useScheme() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectScheme = useCallback(async (scheme: SchemeDetailsType) => {
    if (!user) {
      toast.error('Please login to select a scheme');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Check if user already has an active scheme
      const { data: existingSchemes, error: fetchError } = await supabase
        .from('scheme_selections')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (fetchError) throw fetchError;

      if (existingSchemes && existingSchemes.length > 0) {
        toast.error('You already have an active scheme');
        return;
      }

      // Get the scheme ID from the installment amount
      const { data: schemeData, error: schemeError } = await supabase
        .from('schemes')
        .select('id')
        .eq('installment', scheme.installment)
        .single();

      if (schemeError) throw schemeError;
      if (!schemeData) {
        toast.error('Scheme not found');
        return;
      }

      // Create new scheme selection
      const { data, error: insertError } = await supabase
        .from('scheme_selections')
        .insert([
          {
            user_id: user.id,
            scheme_id: schemeData.id,
            start_date: new Date().toISOString(),
            end_date: new Date(Date.now() + 10 * 30 * 24 * 60 * 60 * 1000).toISOString(), // 10 months
            status: 'active'
          }
        ])
        .select(`
          *,
          schemes (*)
        `)
        .single();

      if (insertError) throw insertError;

      // Update scheme participants count
      const { error: updateError } = await supabase
        .from('schemes')
        .update({
          current_participants: (scheme.currentParticipants || 0) + 1
        })
        .eq('id', schemeData.id);

      if (updateError) throw updateError;

      toast.success('Scheme selected successfully!');
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to select scheme';
      setError(errorMessage);
      toast.error(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const getActiveScheme = useCallback(async () => {
    if (!user) return null;

    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('scheme_selections')
        .select(`
          *,
          schemes (*)
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch active scheme';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  return {
    selectScheme,
    getActiveScheme,
    isLoading,
    error
  };
} 