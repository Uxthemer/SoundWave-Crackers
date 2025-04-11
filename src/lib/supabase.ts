import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';
import toast from 'react-hot-toast';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
});

const formatPhoneNumber = (phone: string) => {
  // Remove any non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Add India country code (+91) if not present
  return digits.startsWith('91') ? `+${digits}` : `+91${digits}`;
};

// Helper function to generate a random 6-digit OTP
export const generateOTP = async (phone: string): Promise<string | null> => {
  try {
    const formattedPhone = formatPhoneNumber(phone);
    
    const { data, error } = await supabase
      .rpc('create_phone_verification', { 
        phone_number: formattedPhone
      });

    if (error) {
      console.error('RPC Error:', error);
      throw error;
    }

    // In development, log the OTP
    if (process.env.NODE_ENV === 'development') {
      console.log('Generated OTP:', data?.otp);
    }

    return data?.otp || null;
  } catch (error) {
    console.error('Error generating OTP:', error);
    throw error;
  }
};

// Helper function to verify OTP
export const verifyOTP = async (phone: string, otp: string): Promise<boolean> => {
  try {
    const formattedPhone = formatPhoneNumber(phone);
    
    const { data, error } = await supabase
      .rpc('verify_phone_otp', { 
        phone_number: formattedPhone,
        otp_code: otp 
      });

    if (error) {
      console.error('RPC Error:', error);
      throw error;
    }

    return data || false;
  } catch (error) {
    console.error('Error verifying OTP:', error);
    throw error;
  }
};

// Helper function to create user profile
export const createUserProfile = async (userId: string, phone: string) => {
  try {
    // Get customer role
    const { data: customerRole, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('name', 'customer')
      .single();

    if (roleError) throw roleError;

    // Create user profile
    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        user_id: userId,
        role_id: customerRole.id,
        phone: phone
      });

    if (profileError) throw profileError;
    return true;
  } catch (error) {
    console.error('Error creating user profile:', error);
    toast.error('Failed to create user profile');
    return false;
  }
};