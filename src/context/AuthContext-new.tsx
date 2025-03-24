import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Database } from '../types/supabase';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
type Role = Database['public']['Tables']['roles']['Row'];

interface SignUpData {
  email: string;
  password: string;
  phone: string;
  name: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  userProfile: UserProfile | null;
  userRole: Role | null;
  loading: boolean;
  signInWithPhone: (phone: string) => Promise<{ verificationId: string | null; error: any }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: any }>;
  checkExistingUser: (email: string, phone: string) => Promise<{ exists: boolean; message?: string }>;
  signUp: (data: SignUpData) => Promise<{ error: any }>;
  verifyOTP: (verificationId: string, otp: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Set up Supabase auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await fetchUserProfile(session.user.id);
      } else {
        setUserProfile(null);
        setUserRole(null);
      }
      
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select(`
          *,
          roles (
            id,
            name,
            description
          )
        `)
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;

      if (profileData) {
        setUserProfile(profileData);
        setUserRole(profileData.roles);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      toast.error('Error loading user profile');
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      if (data.user) {
        toast.success('Successfully signed in!');
        navigate('/');
      }

      return { error: null };
    } catch (error) {
      return { error };
    }
  };

  const signInWithPhone = async (phone: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithOtp({
        phone,
        options: {
          channel: 'sms'
        }
      });

      if (error) throw error;

      return { verificationId: data.session || null, error: null };
    } catch (error) {
      return { verificationId: null, error };
    }
  };

  const checkExistingUser = async (email: string, phone: string) => {
    try {
      const { data: emailUser } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (emailUser) {
        return { exists: true, message: 'Email already exists. Please login.' };
      }

      const { data: phoneUser } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();

      if (phoneUser) {
        return { exists: true, message: 'Phone number already exists. Please login.' };
      }

      return { exists: false };
    } catch (error) {
      console.error('Error checking existing user:', error);
      throw error;
    }
  };

  const signUp = async (data: SignUpData) => {
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        phone: data.phone
      });

      if (authError) throw authError;

      if (authData.user) {
        // Get customer role
        const { data: roleData } = await supabase
          .from('roles')
          .select('id')
          .eq('name', 'customer')
          .single();

        // Create user profile
        const { error: profileError } = await supabase
          .from('user_profiles')
          .insert({
            id: uuidv4(),
            user_id: authData.user.id,
            role_id: roleData?.id,
            full_name: data.name,
            email: data.email,
            phone: data.phone,
            phone_verified: true
          });

        if (profileError) throw profileError;
      }

      return { error: null };
    } catch (error) {
      return { error };
    }
  };

  const verifyOTP = async (verificationId: string, otp: string) => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: verificationId,
        token: otp,
        type: 'sms'
      });

      if (error) throw error;

      if (data.user) {
        toast.success('Successfully verified!');
        navigate('/');
      }

      return { error: null };
    } catch (error) {
      return { error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      navigate('/');
      toast.success('Signed out successfully');
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Error signing out');
    }
  };

  const value = {
    session,
    user,
    userProfile,
    userRole,
    loading,
    signInWithPhone,
    signInWithEmail,
    checkExistingUser,
    signUp,
    verifyOTP,
    signOut
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}