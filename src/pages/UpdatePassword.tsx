import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { encodeStoredPassword } from "../lib/legacyPasswordStore";
import toast from "react-hot-toast";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  KeyRound,
} from "lucide-react";

/** Same rule the sign-up form enforces, so a reset cannot weaken an account. */
const MIN_PASSWORD_LENGTH = 6;

/** How long to wait for the recovery link to turn into a session. */
const SESSION_WAIT_MS = 8000;
const POLL_INTERVAL_MS = 300;
/** Grace period before claiming the code ourselves, so we never race the
 *  client's own automatic exchange of it. */
const MANUAL_EXCHANGE_AFTER_MS = 1500;

/**
 * Everything a recovery link can carry, read once at module load.
 *
 * This has to happen before React mounts: the Supabase client processes the
 * URL as soon as it is created and strips what it consumes, so a component
 * reading `window.location` later can find an empty URL and conclude the link
 * was bad.
 */
const LINK_PARAMS = (() => {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const get = (key: string) => query.get(key) ?? hash.get(key);

  return {
    /** Device-independent: a one-time token verified server-side. */
    tokenHash: get("token_hash"),
    type: get("type"),
    /** Implicit flow: the session arrives whole, in the fragment. */
    accessToken: get("access_token"),
    refreshToken: get("refresh_token"),
    /** PKCE: needs the verifier held by the browser that asked for the reset. */
    code: query.get("code"),
    errorCode: get("error_code"),
    errorDescription: get("error_description") ?? get("error"),
  };
})();

/**
 * Takes the recovery parameters out of the address bar once they are spent.
 *
 * A one-time token cannot be redeemed twice, so leaving it in the URL means a
 * refresh reports a working reset as a broken link.
 */
function scrubUrl() {
  window.history.replaceState({}, "", window.location.pathname);
}

/**
 * Reads the error Supabase reports back on a bad recovery link.
 *
 * It arrives in the query string on the PKCE flow and in the URL fragment on
 * the implicit one, so both are checked rather than assuming which is in use.
 */
function readLinkError(): string | null {
  const code = LINK_PARAMS.errorCode;
  const description = LINK_PARAMS.errorDescription;

  if (!code && !description) return null;

  // The generic Supabase wording ("Email link is invalid or has expired")
  // leaves people re-clicking the same dead link, so say what to do.
  if (code === "otp_expired" || /expired/i.test(description ?? "")) {
    return "This reset link has expired. Reset links are valid for a short time — please request a new one.";
  }
  return description
    ? description.replace(/\+/g, " ")
    : "This reset link is not valid.";
}

/**
 * Sets a new password from the link in a reset email.
 *
 * The link does not carry the password — it carries a one-time credential
 * that supabase-js trades for a short-lived session, and the new password is
 * set against that session. So the page's real job is to wait for that
 * session to appear before showing the form.
 *
 * That wait is the part that was wrong before: the session was checked once,
 * immediately on mount, and anyone whose exchange had not finished by then
 * was told their link was invalid.
 */
export function UpdatePassword() {
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">(
    "checking"
  );
  const [linkError, setLinkError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Guards the async waiting below from running after unmount, and from two
  // paths both declaring a result.
  const settled = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const settle = (next: "ready" | "invalid", message?: string) => {
      if (cancelled || settled.current) return;
      settled.current = true;
      if (message) setLinkError(message);
      setStatus(next);
    };

    // 1. An explicitly rejected link needs no waiting.
    const reported = readLinkError();
    if (reported) {
      settle("invalid", reported);
      return;
    }

    // 2. A token_hash link is verified server-side, so it works from any
    //    device — the phone that opened the email need not be the machine
    //    that asked for the reset. This is the path that makes tapping the
    //    link in a mail app work.
    if (LINK_PARAMS.tokenHash) {
      (async () => {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: LINK_PARAMS.tokenHash as string,
          type: (LINK_PARAMS.type as "recovery") || "recovery",
        });
        scrubUrl();
        if (error) {
          settle(
            "invalid",
            /expired/i.test(error.message)
              ? "This reset link has expired. Please request a new one."
              : "This reset link is invalid or has already been used. Please request a new one."
          );
        } else {
          settle("ready");
        }
      })();
      return;
    }

    // 3. An implicit-flow link carries the session itself, which likewise
    //    does not care which device opened it.
    if (LINK_PARAMS.accessToken && LINK_PARAMS.refreshToken) {
      (async () => {
        const { error } = await supabase.auth.setSession({
          access_token: LINK_PARAMS.accessToken as string,
          refresh_token: LINK_PARAMS.refreshToken as string,
        });
        scrubUrl();
        if (error) {
          settle(
            "invalid",
            "This reset link is invalid or has already been used. Please request a new one."
          );
        } else {
          settle("ready");
        }
      })();
      return;
    }

    // 4. The session can arrive through the listener...
    //
    // PASSWORD_RECOVERY is only emitted by the implicit flow. This client is
    // configured for PKCE, where the code exchange emits SIGNED_IN instead —
    // which is why listening for PASSWORD_RECOVERY alone used to miss it.
    // Any event carrying a session means the link worked.
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) settle("ready");
      }
    );

    // 5. ...or it may already be established, or still be mid-exchange.
    //
    // detectSessionInUrl processes the link asynchronously and strips the
    // code from the URL afterwards, so the only reliable approach is to look
    // repeatedly for a short window rather than once.
    const startedAt = Date.now();

    const waitForSession = async () => {
      while (!cancelled && !settled.current) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          settle("ready");
          return;
        }

        // If a code is still sitting in the URL after a moment, the automatic
        // exchange has not claimed it, so trade it in directly.
        //
        // The delay matters: a code can only be redeemed once, so racing
        // detectSessionInUrl would make one of the two attempts fail and this
        // page report a working link as broken.
        const code =
          Date.now() - startedAt > MANUAL_EXCHANGE_AFTER_MS
            ? LINK_PARAMS.code
            : null;
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) {
            settle("ready");
            return;
          }
          // PKCE keeps the other half of the exchange in the browser that
          // asked for the reset. Opening the email elsewhere cannot work, and
          // the raw error ("both auth code and code verifier should be
          // non-empty") explains none of that.
          // A PKCE link is only redeemable in the browser that requested
          // the reset — the other half of the exchange is in that browser's
          // storage. Opening the email on a phone lands here. The fix is the
          // token_hash email template above, which has no such restriction.
          if (/verifier/i.test(error.message) || /invalid request/i.test(error.message)) {
            settle(
              "invalid",
              "This link has to be opened in the same browser you requested the reset from. Request a new link and open it on this device, or finish the reset on the device you started from."
            );
            return;
          }
        }

        if (Date.now() - startedAt > SESSION_WAIT_MS) {
          settle(
            "invalid",
            "This reset link is invalid or has already been used. Please request a new one."
          );
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    };

    waitForSession();

    return () => {
      cancelled = true;
      listener?.subscription.unsubscribe();
    };
  }, []);

  /**
   * Writes the new password into the `user_profiles.pwd` mirror that phone
   * sign-in reads. Reports rather than throws — see the call site.
   */
  const syncStoredPassword = async (password: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Recovery session ended");

      const { error } = await supabase
        .from("user_profiles")
        .update({ pwd: encodeStoredPassword(password) })
        .eq("user_id", user.id);
      if (error) throw error;
    } catch (err) {
      // Email sign-in works from here on; only phone sign-in would be stale,
      // so say so specifically instead of implying the reset failed.
      console.error("Failed to sync stored password for phone login:", err);
      toast(
        <span className="flex items-center">
          <XCircle className="text-amber-600 w-5 h-5 mr-2" />
          Password changed, but phone sign-in could not be updated. Please sign
          in with your email, or contact us.
        </span>,
        { duration: 9000, style: { background: "#fff7e6", color: "#222" } }
      );
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Checked here rather than left to the server: the password is typed
    // twice and a round trip to be told it is too short is a poor trade.
    if (newPwd.length < MIN_PASSWORD_LENGTH) {
      setFormError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
      );
      return;
    }
    if (newPwd !== confirmPwd) {
      setFormError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;

      // Phone sign-in replays the password out of user_profiles.pwd, so a
      // reset that only changed the auth password would leave phone login
      // trying the old one. Update the mirror in the same breath.
      //
      // This runs AFTER the real password change and never blocks it: the
      // account password is already updated at this point, and failing the
      // whole reset over the mirror would be worse than a warning.
      await syncStoredPassword(newPwd);

      toast(
        <span className="flex items-center">
          <CheckCircle2 className="text-green-600 w-5 h-5 mr-2" />
          Password updated successfully! Please sign in.
        </span>,
        { duration: 6000, style: { background: "#e6ffed", color: "#222" } }
      );

      // The recovery session exists only to set the password. Ending it means
      // a shared or borrowed device is not left signed in to the account.
      await supabase.auth.signOut();
      navigate("/login");
    } catch (error: any) {
      const message =
        error?.message ?? "Failed to update password. Please try again.";
      setFormError(message);
      toast(
        <span className="flex items-center">
          <XCircle className="text-red-600 w-5 h-5 mr-2" />
          {message}
        </span>,
        { duration: 6000, style: { background: "#ffeaea", color: "#222" } }
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleUpdate}
        className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md space-y-5"
      >
        <h2 className="text-xl font-bold flex items-center gap-2">
          <KeyRound className="w-6 h-6 text-primary-orange" />
          Set New Password
        </h2>

        {status === "checking" && (
          <div className="flex flex-col items-center gap-3 py-8 text-gray-600">
            <Loader2 className="w-6 h-6 animate-spin text-primary-orange" />
            <span>Checking your reset link…</span>
          </div>
        )}

        {status === "invalid" && (
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-2 text-red-600">
              <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{linkError ?? "Invalid or expired password recovery link."}</p>
            </div>
            <Link
              to="/login"
              className="btn-primary w-full flex items-center justify-center"
            >
              Request a new reset link
            </Link>
          </div>
        )}

        {status === "ready" && (
          <>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className="w-full px-4 py-2 pr-11 rounded-lg border border-card-border/10 focus:outline-none focus:border-primary-orange"
                placeholder="New Password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                disabled={loading}
                autoComplete="new-password"
              />
              {/* A password being set from a phone keyboard is mistyped often
                  enough that hiding it costs more than it protects. */}
              <button
                type="button"
                onClick={() => setShowPwd((shown) => !shown)}
                aria-label={showPwd ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-primary-orange"
              >
                {showPwd ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>

            <input
              type={showPwd ? "text" : "password"}
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-card-border/10 focus:outline-none focus:border-primary-orange"
              placeholder="Confirm New Password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              disabled={loading}
              autoComplete="new-password"
            />

            <p className="text-xs text-gray-500">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>

            {formError && (
              <div className="flex items-start gap-2 text-sm text-red-600">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full flex items-center justify-center gap-2"
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? "Updating…" : "Set Password"}</span>
            </button>
          </>
        )}
      </form>
    </div>
  );
}
