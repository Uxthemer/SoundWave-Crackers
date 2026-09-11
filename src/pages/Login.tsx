import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Phone, Mail, LogIn, AlertCircle, Lock, KeyRound, Eye, EyeOff, ArrowRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { OTPVerification } from "../components/OTPVerification";
import { supabase } from "../lib/supabase";
import { decodeStoredPassword } from "../lib/legacyPasswordStore";
import toast from "react-hot-toast";
import { z } from "zod";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

const emailSchema = z.string().email("Invalid email format");
const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, "Invalid phone number");
// const passwordSchema = z
//   .string()
//   .min(6, "Password must be at least 6 characters");

const loginSchema = z
  .object({
    identifier: z.string(),
    password: z.string().min(6, "Password must be at least 6 characters"),
  })
  .superRefine((data, ctx) => {
    const isEmail = emailSchema.safeParse(data.identifier).success;
    const isPhone = phoneSchema.safeParse(data.identifier).success;

    if (!isEmail && !isPhone) {
      ctx.addIssue({
        path: ["identifier"],
        code: z.ZodIssueCode.custom,
        message: "Must be a valid email or phone number",
      });
    }
  });

type LoginMethod = "email" | "phone";

// Helper for toast with icon and color
function showToast(type: "success" | "error" | "warning", message: string) {
  const icon =
    type === "success"
      ? <CheckCircle2 className="text-green-600 w-5 h-5 mr-2" />
      : type === "error"
      ? <XCircle className="text-red-600 w-5 h-5 mr-2" />
      : <AlertTriangle className="text-yellow-500 w-5 h-5 mr-2" />;
  toast(
    <span className="flex items-center">{icon}{message}</span>,
    {
      duration: 6000,
      icon: null,
      style: {
        background: type === "success"
          ? "#e6ffed"
          : type === "error"
          ? "#ffeaea"
          : "#fffbe5",
        color: "#222",
      },
    }
  );
}

function ForgotPasswordModal({
  forgotEmail,
  setForgotEmail,
  forgotLoading,
  setShowForgotModal,
  handleForgotPassword,
}: {
  forgotEmail: string;
  setForgotEmail: (v: string) => void;
  forgotLoading: boolean;
  setShowForgotModal: (v: boolean) => void;
  handleForgotPassword: (e: React.FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md relative">
        <button
          className="absolute top-2 right-2 text-gray-500 hover:text-primary"
          onClick={() => setShowForgotModal(false)}
        >
          <XCircle className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <KeyRound className="w-6 h-6 text-primary-orange" />
          Forgot Password
        </h2>
        <form onSubmit={handleForgotPassword} className="space-y-4">
          <label className="block text-sm font-medium mb-2">
            Enter your registered email address
          </label>
          <p className="text-xs text-gray-500 -mt-2">
            We'll send you a link to set a new password. Open it in this same
            browser, and use it within the hour.
          </p>
          <input
            type="email"
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-card-border/10 focus:outline-none focus:border-primary-orange"
            placeholder="Email"
            disabled={forgotLoading}
            required
          />
          <button
            type="submit"
            className="btn-primary w-full flex items-center justify-center"
            disabled={forgotLoading}
          >
            {forgotLoading ? (
              <span className="animate-pulse">Sending...</span>
            ) : (
              <>
                <KeyRound className="w-5 h-5 mr-2" />
                <span>Send Reset Link</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export function Login() {
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showOTPVerification, setShowOTPVerification] = useState(false);
  const [verificationId, setVerificationId] = useState("");
  const [retryDelay, setRetryDelay] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const { signInWithEmail, signInWithPhone } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Where to go after signing in, or after skipping.
   *
   * Checkout sends customers here with the page they came from, so both
   * outcomes put them back at their cart rather than on the home page with an
   * order half-placed. Anything that is not a local path is ignored, so a
   * crafted link cannot use this to bounce someone off-site.
   */
  const rawReturnTo = (location.state as { from?: string } | null)?.from;
  const returnTo =
    typeof rawReturnTo === "string" &&
    rawReturnTo.startsWith("/") &&
    !rawReturnTo.startsWith("//")
      ? rawReturnTo
      : "/";

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate identifier (email or phone) and password
      loginSchema.parse({ identifier: email, password });

      const { error } = await signInWithEmail(email, password);
      if (error) throw error;

      showToast("success", "Successfully signed in!");
      navigate(returnTo);
    } catch (error: any) {
      console.error(error);
      showToast(
        "error",
        error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (retryDelay > 0) {
      showToast("warning", `Please wait ${retryDelay} seconds before trying again`);
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

          showToast("warning", `Too many attempts. Please try again in ${delay} seconds`);
          throw error;
        }
        throw error;
      }

      if (!verificationId) {
        showToast("error", "Failed to send verification code. Please try again.");
        throw new Error("Failed to send verification code");
      }

      setVerificationId(verificationId);
      setShowOTPVerification(true);
      showToast("success", "Verification code sent successfully!");

      setRetryCount(0);
    } catch (error: any) {
      console.error(error);
      showToast(
        "error",
        error.message && !error.message.startsWith("An error")
          ? "Could not send verification code. Please check your number."
          : "An error occurred. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerified = async () => {
    try {
      const { data: phoneUser, error: phoneUserError } = await supabase
        .from("user_profiles")
        .select("email, pwd")
        .eq("phone", phone)
        .single();
      if (phoneUserError) throw phoneUserError;
      if (!phoneUser) throw new Error("No account found for this number");

      // The OTP proves the phone number; the actual Supabase session still
      // comes from an email + password sign-in, replayed from the mirror
      // that password resets now keep in step.
      const storedPassword = decodeStoredPassword(phoneUser.pwd);
      if (!storedPassword) {
        // Older accounts predate the mirror. Send them down a route that
        // works instead of failing with "verification failed", which points
        // at the OTP they just completed correctly.
        showToast(
          "error",
          "Phone sign-in is not set up for this account yet. Please sign in with your email, or use Forgot Password."
        );
        return;
      }

      const { error } = await signInWithEmail(phoneUser.email, storedPassword);
      if (error) throw error;

      showToast("success", "Successfully signed in!");
      navigate(returnTo);
    } catch (error: any) {
      console.error(error);
      showToast("error", "Verification failed. Please try again.");
    }
  };

  // --- FORGOT PASSWORD LOGIC ---
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validated before the request so a typo is reported as a typo, rather
    // than as "failed to send" alongside every other possible failure.
    const parsed = emailSchema.safeParse(forgotEmail.trim());
    if (!parsed.success) {
      showToast("error", "Please enter a valid email address.");
      return;
    }

    setForgotLoading(true);
    try {
      // VITE_PUBLIC_SITE_URL pins the link to the deployed site, so a reset
      // requested from a preview build still points at production.
      //
      // Except when running locally: sending a developer's test reset to the
      // live site means testing the deployed build instead of the one being
      // worked on, and the link cannot come back to a machine the phone
      // cannot reach anyway.
      //
      // Either way the URL must also be listed under Supabase -> Authentication
      // -> URL Configuration -> Redirect URLs, or Supabase quietly substitutes
      // the project's Site URL.
      const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(
        window.location.hostname
      );
      const configuredSite = import.meta.env.VITE_PUBLIC_SITE_URL as
        | string
        | undefined;
      const base = isLocalHost
        ? window.location.origin
        : configuredSite || window.location.origin;
      const redirectUrl = `${base.replace(/\/+$/, "")}/update-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(
        parsed.data,
        { redirectTo: redirectUrl }
      );
      if (error) throw error;

      // Supabase answers the same way whether or not the address is
      // registered, so that this form cannot be used to discover who has an
      // account. The wording reflects that rather than promising an email.
      showToast(
        "success",
        "If that email is registered, a reset link is on its way. It expires in about an hour."
      );
      setShowForgotModal(false);
      setForgotEmail("");
    } catch (error: any) {
      console.error(error);
      // Rate limiting is the common real failure and has a clear remedy.
      const message: string = error?.message ?? "";
      showToast(
        "error",
        /rate limit|too many|429/i.test(message)
          ? "Too many reset requests. Please wait a few minutes and try again."
          : message || "Failed to send reset link. Please try again."
      );
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-8 pb-12 flex items-center justify-center">
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

            {/* <div className="flex gap-4 mb-6">
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
            </div> */}

            {loginMethod === "email" ? (
              <form onSubmit={handleEmailLogin} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                      placeholder="Enter your email or phone number"
                      required
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
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                      placeholder="Enter your password"
                      disabled={isLoading}
                    />
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text/40" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text/40 hover:text-text/60 focus:outline-none"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
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

            <div className="mt-4 text-center">
              <button
                type="button"
                className="text-primary-orange hover:text-primary-red underline text-sm"
                onClick={() => setShowForgotModal(true)}
              >
                Forgot Password?
              </button>
            </div>

            <div className="mt-6 text-center">
              <p className="text-text/60">
                Don't have an account?{" "}
                <Link
                  to="/signup"
                  state={{ from: returnTo }}
                  className="text-primary-orange hover:text-primary-red"
                >
                  Sign Up
                </Link>
              </p>
            </div>

            {/* Signing in is optional. Skipping returns to whatever page sent
                the customer here — the cart, normally — with everything in it
                still there, so they can check out as a guest. */}
            <div className="mt-6 pt-5 border-t border-card-border/10 text-center">
              <button
                type="button"
                onClick={() => navigate(returnTo)}
                className="inline-flex items-center gap-2 text-text/70 hover:text-primary-orange font-semibold transition-colors"
              >
                <span>Skip for now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-xs text-text/50 mt-1">
                Continue without an account — you can still place and track an
                order.
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
      {showForgotModal && (
        <ForgotPasswordModal
          forgotEmail={forgotEmail}
          setForgotEmail={setForgotEmail}
          forgotLoading={forgotLoading}
          setShowForgotModal={setShowForgotModal}
          handleForgotPassword={handleForgotPassword}
        />
      )}
    </div>
  );
}
