import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Mail, Phone, Lock, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { OTPVerification } from '../components/OTPVerification';
import toast from 'react-hot-toast';
import { z } from 'zod';

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email format'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid phone number'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

export function Signup() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showOTPVerification, setShowOTPVerification] = useState(false);
  const [verificationId, setVerificationId] = useState('');
  const navigate = useNavigate();
  const { signUp, signInWithPhone, checkExistingUser } = useAuth();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate form data
      signupSchema.parse(formData);

       // Check if user exists
       const existingUser = await checkExistingUser(formData.email, formData.phone);
       if (existingUser.exists) {
         throw new Error(existingUser.message);
       }

      // Send OTP for verification
      const { verificationId: vId, error: verificationError } = await signInWithPhone(formData.phone);
      
      if (verificationError) throw verificationError;
      if (!vId) throw new Error('Failed to send verification code');

      setVerificationId(vId);
      setShowOTPVerification(true);
      toast.success('Verification code sent successfully!');

    } catch (error: any) {
      toast.error(error.message || 'Failed to sign up');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerified = async () => {
    try {
      setIsLoading(true);

      // Create user account
      const { error: signUpError } = await signUp({
        email: formData.email,
        password: formData.password,
        phone: formData.phone,
        name: formData.name
      });

      if (signUpError) throw signUpError;

      toast.success('Account created successfully! Please login to continue');
      navigate('/login');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create account');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
      <div className="container mx-auto px-4">
        <div className="max-w-md mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="card"
          >
            <div className="text-center mb-8">
              <h1 className="font-heading text-4xl mb-2">Create Account</h1>
              <p className="text-text/60">Sign up to get started</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Full Name</label>
                <div className="relative">
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                    placeholder="Enter your full name"
                    disabled={isLoading}
                  />
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text/40" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <div className="relative">
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                    placeholder="Enter your email"
                    disabled={isLoading}
                  />
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text/40" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Phone Number</label>
                <div className="relative">
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    pattern="[6-9]\d{9}"
                    className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                    placeholder="Enter 10-digit mobile number"
                    disabled={isLoading}
                  />
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text/40" />
                </div>
                <p className="text-sm text-text/60 mt-1">
                  A verification code will be sent to this number
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <div className="relative">
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                    placeholder="Create a password"
                    disabled={isLoading}
                  />
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text/40" />
                </div>
                <p className="text-sm text-text/60 mt-1">
                  Must be at least 6 characters
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full flex items-center justify-center"
              >
                {isLoading ? (
                  <span className="animate-pulse">Processing...</span>
                ) : (
                  <>
                    <LogIn className="w-5 h-5 mr-2" />
                    <span>Sign Up</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-text/60">
                Already have an account?{' '}
                <Link to="/login" className="text-primary-orange hover:text-primary-red">
                  Sign In
                </Link>
              </p>
            </div>
          </motion.div>

          <div className="mt-8 text-center">
            <Link to="/" className="text-primary-orange hover:text-primary-red">
              Back to Home
            </Link>
          </div>
        </div>
      </div>

      {showOTPVerification && (
        <OTPVerification
          phone={formData.phone}
          verificationId={verificationId}
          onVerified={handleVerified}
          onCancel={() => setShowOTPVerification(false)}
        />
      )}
    </div>
  );
}