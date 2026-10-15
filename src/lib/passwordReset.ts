import { createClient } from "@supabase/supabase-js";

/**
 * Sends the "forgot password" email so that its link works in any browser,
 * on any device.
 *
 * The app's own client uses the PKCE flow. A reset requested through it puts
 * half of a secret (the code verifier) in the requesting browser's storage
 * and the other half (the code) in the email -- so the link only works in
 * that same browser. Open the email on a phone, or in another browser, and it
 * fails; worse, the one-time token behind the link is spent on that failed
 * attempt, so going back to the right browser then says "expired".
 *
 * This client asks with the implicit flow instead. Supabase's link then
 * redirects to /update-password with the recovery session itself in the URL
 * fragment, which UpdatePassword sets directly -- nothing has to be waiting
 * in any particular browser.
 *
 * It is a separate, throwaway client on purpose: switching the main client to
 * implicit would change every other sign-in. It never holds a session (that
 * is created by the main client on /update-password) and uses its own
 * storage key so it does not compete with the main client's.
 *
 * Better still, and needed if mail scanners start opening links before the
 * customer does: set the Reset Password email template in Supabase to
 *   {{ .SiteURL }}/update-password?token_hash={{ .TokenHash }}&type=recovery
 * which UpdatePassword verifies with verifyOtp, from any device, and which a
 * scanner fetching the page does not use up.
 */
const resetClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "sb-password-reset-request",
    },
  }
);

export function requestPasswordReset(email: string, redirectTo: string) {
  return resetClient.auth.resetPasswordForEmail(email, { redirectTo });
}
