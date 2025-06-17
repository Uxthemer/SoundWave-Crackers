import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';
import toast from 'react-hot-toast';
// import { serve } from "std/server";
// import { Resend } from "resend";

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

// const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

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

/**
 * Fetch orders by order ID or phone number.
 * Returns an array of orders (can be empty).
 */
export const fetchOrders = async (input: string) => {
  try {
    // Check if input is a phone number (10+ digits)
    const isPhone = /^\d{10,}$/.test(input.trim());
    let query = supabase.from("orders").select("*");

    if (isPhone) {
      query = query.eq("phone", input.trim());
    } else {
      query = query.eq("id", input.trim());
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching orders:", error);
    return [];
  }
};

// serve(async (req) => {
//   const { order_id } = await req.json();
//   const supabase = createClient(
//     Deno.env.get("SUPABASE_URL")!,
//     Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
//   );

//   // Wait for 1 minute
//   await new Promise((resolve) => setTimeout(resolve, 60000));

//   // Fetch order and user profile
//   const { data: order } = await supabase.from("orders").select("*").eq("id", order_id).single();
//   if (!order) return new Response("Order not found", { status: 404 });

//   const { data: user } = await supabase.from("user_profiles").select("*").eq("user_id", order.user_id).single();
//   if (!user) return new Response("User not found", { status: 404 });

//   // Compose email
//   await resend.emails.send({
//     from: "orders@yourdomain.com",
//     to: user.email,
//     subject: `Order Status Updated: ${order.id}`,
//     html: `<p>Your order status has changed to: <b>${order.status}</b></p>
//            <p>Order ID: ${order.id}</p>`
//   });

//   return new Response("OK");
// });