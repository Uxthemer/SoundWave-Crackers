import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Helper function to generate a random 6-digit OTP
export const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Helper function to send OTP via Supabase function
export const sendOTP = async (phone: string, otp: string): Promise<boolean> => {
  try {
    // In a real application, you would call a Supabase Edge Function to send SMS
    // For demo purposes, we'll simulate a successful OTP send
    console.log(`OTP ${otp} sent to ${phone}`);
    
    // Store OTP in the database with expiration
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // OTP valid for 10 minutes
    
    const { error } = await supabase
      .from('otp_verifications')
      .upsert({
        phone,
        otp,
        verified: false,
        expires_at: expiresAt.toISOString()
      });
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error sending OTP:', error);
    return false;
  }
};

// Helper function to verify OTP
export const verifyOTP = async (phone: string, otp: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('otp_verifications')
      .select('*')
      .eq('phone', phone)
      .eq('otp', otp)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (error || !data) return false;
    
    // Mark OTP as verified
    await supabase
      .from('otp_verifications')
      .update({ verified: true })
      .eq('phone', phone);
    
    return true;
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return false;
  }
};

// Helper function to check if a phone is verified
export const isPhoneVerified = async (phone: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('otp_verifications')
      .select('verified')
      .eq('phone', phone)
      .single();
    
    if (error || !data) return false;
    return data.verified;
  } catch (error) {
    console.error('Error checking phone verification:', error);
    return false;
  }
};