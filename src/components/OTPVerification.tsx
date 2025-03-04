import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { generateOTP, sendOTP, verifyOTP } from '../lib/supabase';

interface OTPVerificationProps {
  phone: string;
  onVerified: () => void;
  onCancel: () => void;
}

export function OTPVerification({ phone, onVerified, onCancel }: OTPVerificationProps) {
  const [otp, setOtp] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'verifying' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [countdown, setCountdown] = useState(0);

  const handleSendOTP = async () => {
    try {
      setStatus('sending');
      const generatedOTP = generateOTP();
      const sent = await sendOTP(phone, generatedOTP);
      
      if (sent) {
        setStatus('sent');
        // Start countdown for resend
        setCountdown(60);
        const timer = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setStatus('error');
        setErrorMessage('Failed to send OTP. Please try again.');
      }
    } catch (error) {
      setStatus('error');
      setErrorMessage('An error occurred. Please try again.');
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      setStatus('error');
      setErrorMessage('Please enter a valid 6-digit OTP');
      return;
    }

    try {
      setStatus('verifying');
      const verified = await verifyOTP(phone, otp);
      
      if (verified) {
        setStatus('success');
        setTimeout(() => {
          onVerified();
        }, 1500);
      } else {
        setStatus('error');
        setErrorMessage('Invalid OTP. Please try again.');
      }
    } catch (error) {
      setStatus('error');
      setErrorMessage('Verification failed. Please try again.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
    >
      <div className="bg-background rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-montserrat font-bold text-xl">Phone Verification</h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-card/50 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-text/80 mb-2">
              We need to verify your phone number before placing the order.
            </p>
            <div className="bg-card/30 p-4 rounded-lg">
              <p className="font-mono text-center">{phone}</p>
            </div>
          </div>

          {status === 'idle' && (
            <button
              onClick={handleSendOTP}
              className="btn-primary w-full"
            >
              Send OTP
            </button>
          )}

          {status === 'sending' && (
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary-orange" />
              <span>Sending OTP...</span>
            </div>
          )}

          {(status === 'sent' || status === 'verifying' || status === 'error') && (
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
                {countdown > 0 && (
                  <p className="text-sm text-text/60 mt-2 text-center">
                    Resend OTP in {countdown} seconds
                  </p>
                )}
                {countdown === 0 && status !== 'idle' && (
                  <button
                    onClick={handleSendOTP}
                    className="text-primary-orange hover:text-primary-red text-sm mt-2 w-full text-center"
                  >
                    Resend OTP
                  </button>
                )}
              </div>

              {status === 'error' && (
                <div className="bg-red-500/10 text-red-500 p-3 rounded-lg flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5" />
                  <span>{errorMessage}</span>
                </div>
              )}

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

          {status === 'success' && (
            <div className="bg-green-500/10 text-green-500 p-4 rounded-lg flex items-center justify-center space-x-2">
              <CheckCircle className="w-5 h-5" />
              <span>Phone verified successfully!</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}