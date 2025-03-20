import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Phone, Mail, LogIn, AlertCircle, Lock } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { OTPVerification } from "../components/OTPVerification";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import { z } from "zod";

const emailSchema = z.string().email("Invalid email format");
const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, "Invalid phone number");
const passwordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters");

type LoginMethod = "email" | "phone";

export function Login() {
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showOTPVerification, setShowOTPVerification] = useState(false);
  const [verificationId, setVerificationId] = useState("");
  const [retryDelay, setRetryDelay] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  const { signInWithEmail, signInWithPhone } = useAuth();
  const navigate = useNavigate();

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate email and password
      emailSchema.parse(email);
      passwordSchema.parse(password);

      const { error } = await signInWithEmail(email, password);
      if (error) throw error;

      toast.success("Successfully signed in!");
      navigate("/");
    } catch (error: any) {
      toast.error(error.message || "Failed to sign in");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (retryDelay > 0) {
      toast.error(`Please wait ${retryDelay} seconds before trying again`);
      return;
    }

    setIsLoading(true);

    try {
      // Validate phone number
      phoneSchema.parse(phone);

      const { verificationId, error } = await signInWithPhone(phone);

      if (error) {
        if (error.code === "auth/too-many-requests") {
          const delay = Math.min(Math.pow(2, retryCount) * 30, 300);
          setRetryDelay(delay);
          setRetryCount((prev) => prev + 1);

          const timer = setInterval(() => {
            setRetryDelay((prev) => {
              if (prev <= 1) {
                clearInterval(timer);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);

          throw new Error(
            `Too many attempts. Please try again in ${delay} seconds`
          );
        }
        throw error;
      }

      if (!verificationId) {
        throw new Error("Failed to send verification code");
      }

      setVerificationId(verificationId);
      setShowOTPVerification(true);
      toast.success("Verification code sent successfully!");

      setRetryCount(0);
    } catch (error: any) {
      toast.error(error.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerified = async () => {
    // handle email based login based on mobile number verification
    const { data: phoneUser, error: phoneUserError } = await supabase
      .from("user_profiles")
      .select("email, pwd")
      .eq("phone", phone)
      .single();
    if (phoneUserError) throw phoneUserError;

    if (phoneUser) {
      const { error } = await signInWithEmail(phoneUser.email, atob(phoneUser.pwd));
      if (error) throw error;
    }

    toast.success("Successfully signed in!");
    navigate("/");
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
              <h1 className="font-heading text-4xl mb-2">Welcome Back</h1>
              <p className="text-text/60">Sign in to continue</p>
            </div>

            <div className="flex gap-4 mb-6">
              <button
                onClick={() => setLoginMethod("email")}
                className={`flex-1 py-2 rounded-lg transition-colors ${
                  loginMethod === "email"
                    ? "bg-primary-orange text-white"
                    : "bg-card hover:bg-card/70"
                }`}
              >
                <Mail className="w-5 h-5 mx-auto" />
                <span className="text-sm mt-1">Email</span>
              </button>
              <button
                onClick={() => setLoginMethod("phone")}
                className={`flex-1 py-2 rounded-lg transition-colors ${
                  loginMethod === "phone"
                    ? "bg-primary-orange text-white"
                    : "bg-card hover:bg-card/70"
                }`}
              >
                <Phone className="w-5 h-5 mx-auto" />
                <span className="text-sm mt-1">Phone</span>
              </button>
            </div>

            {loginMethod === "email" ? (
              <form onSubmit={handleEmailLogin} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                      placeholder="Enter your email"
                      disabled={isLoading}
                    />
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text/40" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                      placeholder="Enter your password"
                      disabled={isLoading}
                    />
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text/40" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary w-full flex items-center justify-center"
                >
                  {isLoading ? (
                    <span className="animate-pulse">Signing in...</span>
                  ) : (
                    <>
                      <LogIn className="w-5 h-5 mr-2" />
                      <span>Sign In</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handlePhoneLogin} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Mobile Number
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      pattern="[6-9]\d{9}"
                      className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                      placeholder="Enter 10-digit mobile number"
                      disabled={isLoading || retryDelay > 0}
                    />
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text/40" />
                  </div>
                </div>

                {retryDelay > 0 && (
                  <div className="bg-primary-orange/10 text-primary-orange p-4 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm">
                      Please wait {retryDelay} seconds before trying again
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || retryDelay > 0}
                  className="btn-primary w-full flex items-center justify-center"
                >
                  {isLoading ? (
                    <span className="animate-pulse">Sending Code...</span>
                  ) : (
                    <>
                      <LogIn className="w-5 h-5 mr-2" />
                      <span>Get Verification Code</span>
                    </>
                  )}
                </button>
              </form>
            )}

            <div className="mt-6 text-center">
              <p className="text-text/60">
                Don't have an account?{" "}
                <Link
                  to="/signup"
                  className="text-primary-orange hover:text-primary-red"
                >
                  Sign Up
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
          phone={phone}
          verificationId={verificationId}
          onVerified={handleVerified}
          onCancel={() => setShowOTPVerification(false)}
        />
      )}
    </div>
  );
}
