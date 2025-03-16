import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, Phone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

interface OTPVerificationProps {
  phone: string;
  verificationId: string;
  onVerified: () => void;
  onCancel: () => void;
}

export function OTPVerification({ phone, verificationId, onVerified, onCancel }: OTPVerificationProps) {
  const [otp, setOtp] = useState('');
  const [newPhone, setNewPhone] = useState(phone);
  const [isChangingPhone, setIsChangingPhone] = useState(false);
  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const { verifyOTP, signInWithPhone } = useAuth();

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }

    try {
      setStatus('verifying');
      const { error } = await verifyOTP(verificationId, otp);
      
      if (error) throw error;
      
      setStatus('success');
      onVerified();
    } catch (error) {
      setStatus('error');
      toast.error('Invalid OTP. Please try again.');
      setStatus('idle');
    }
  };

  const handleChangePhone = async () => {
    if (!newPhone || !/^[6-9]\d{9}$/.test(newPhone)) {
      toast.error('Please enter a valid 10-digit mobile number');
      return;
    }

    try {
      setStatus('verifying');
      
      // Check if phone number already exists
      const { data: existingPhone } = await supabase
        .from('user_profiles')
        .select('phone')
        .eq('phone', newPhone)
        .single();

      if (existingPhone) {
        throw new Error('Phone number already exists');
      }

      const { verificationId: newVerificationId, error } = await signInWithPhone(newPhone);
      
      if (error) throw error;
      if (!newVerificationId) throw new Error('Failed to send verification code');

      toast.success('Verification code sent to new number');
      setIsChangingPhone(false);
      setOtp('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to send verification code');
    } finally {
      setStatus('idle');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    >
      <div className="bg-background rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-montserrat font-bold text-xl">
            Phone Verification
          </h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-card/50 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Mobile Number</label>
              <button
                onClick={() => setIsChangingPhone(!isChangingPhone)}
                className="text-sm text-primary-orange hover:text-primary-orange/80"
              >
                {isChangingPhone ? 'Cancel' : 'Change'}
              </button>
            </div>

            {isChangingPhone ? (
              <div className="space-y-4">
                <div className="relative">
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    pattern="[6-9]\d{9}"
                    className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                    placeholder="Enter new mobile number"
                  />
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text/40" />
                </div>
                <button
                  onClick={handleChangePhone}
                  disabled={status === 'verifying'}
                  className="btn-primary w-full"
                >
                  {status === 'verifying' ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    'Send OTP'
                  )}
                </button>
              </div>
            ) : (
              <div className="bg-card/30 p-4 rounded-lg">
                <p className="font-mono text-center">{phone}</p>
              </div>
            )}
          </div>

          {!isChangingPhone && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">Enter OTP</label>
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-2 text-center font-mono text-2xl tracking-widest rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                  placeholder="------"
                />
                <p className="text-sm text-text/60 mt-2">
                  Enter the 6-digit code sent to your mobile number
                </p>
              </div>

              <button
                onClick={handleVerifyOTP}
                disabled={status === 'verifying'}
                className="btn-primary w-full flex items-center justify-center space-x-2"
              >
                {status === 'verifying' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Verify OTP</span>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}