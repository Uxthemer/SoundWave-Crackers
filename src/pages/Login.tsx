import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, LogIn, User, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isSignUp) {
        // Sign up
        const { error } = await signUp(email, password, fullName);
        if (error) throw error;
        
        // Show success message
        alert('Registration successful! Please check your email to confirm your account.');
        setIsSignUp(false);
      } else {
        // Sign in
        const { error } = await signIn(email, password);
        if (error) throw error;
        
        // Redirect to home page
        navigate('/');
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred during authentication');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error: any) {
      setError(error.message || 'An error occurred during Google authentication');
    }
  };

  const toggleForm = () => {
    setIsSignUp(!isSignUp);
    setError(null);
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
              <h1 className="font-heading text-4xl mb-2">
                {isSignUp ? 'Create Account' : 'Welcome Back'}
              </h1>
              <p className="text-text/60">
                {isSignUp 
                  ? 'Sign up to start shopping for premium crackers' 
                  : 'Sign in to continue your shopping experience'}
              </p>
            </div>

            {error && (
              <div className="bg-primary-red/10 text-primary-red p-4 rounded-lg mb-6">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {isSignUp && (
                <div>
                  <label className="block text-sm font-medium mb-2">Full Name</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required={isSignUp}
                      className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                      placeholder="Enter your full name"
                    />
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text/40" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                    placeholder="Enter your email"
                  />
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text/40" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full pl-10 pr-10 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                    placeholder="Enter your password"
                  />
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text/40" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5 text-text/40" />
                    ) : (
                      <Eye className="w-5 h-5 text-text/40" />
                    )}
                  </button>
                </div>
              </div>

              {!isSignUp && (
                <div className="flex justify-end">
                  <Link to="/forgot-password" className="text-sm text-primary-orange hover:text-primary-red">
                    Forgot password?
                  </Link>
                </div>
              )}

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
                    <span>{isSignUp ? 'Sign Up' : 'Sign In'}</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-card-border/10"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-card text-text/60">Or continue with</span>
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full py-2 px-4 border border-card-border/10 rounded-lg bg-background hover:bg-card/70 flex items-center justify-center"
                >
                  <img
                    src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                    alt="Google"
                    className="w-5 h-5 mr-2"
                  />
                  <span>Sign {isSignUp ? 'up' : 'in'} with Google</span>
                </button>
              </div>
            </div>

            <div className="mt-8 text-center">
              <p className="text-text/60">
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                <button
                  type="button"
                  onClick={toggleForm}
                  className="ml-2 text-primary-orange hover:text-primary-red"
                >
                  {isSignUp ? 'Sign In' : 'Sign Up'}
                </button>
              </p>
            </div>
          </motion.div>

          <div className="mt-8 text-center">
            <Link to="/" className="text-primary-orange hover:text-primary-red flex items-center justify-center">
              <ArrowRight className="w-4 h-4 mr-2" />
              <span>Back to Home</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}