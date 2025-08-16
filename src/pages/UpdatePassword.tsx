import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import { CheckCircle2, XCircle } from "lucide-react";

export function UpdatePassword() {
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [canReset, setCanReset] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for PASSWORD_RECOVERY event
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setCanReset(true);
      }
    });

    // Try to refresh session (important for Supabase PKCE flow)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setCanReset(true);
      }
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      toast(
        <span className="flex items-center">
          <XCircle className="text-red-600 w-5 h-5 mr-2" />
          Passwords do not match.
        </span>,
        { duration: 6000, style: { background: "#ffeaea", color: "#222" } }
      );
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      toast(
        <span className="flex items-center">
          <CheckCircle2 className="text-green-600 w-5 h-5 mr-2" />
          Password updated successfully! Please login.
        </span>,
        { duration: 6000, style: { background: "#e6ffed", color: "#222" } }
      );
      await supabase.auth.signOut();
      navigate("/login");
    } catch (error: any) {
      console.error(error);
      toast(
        <span className="flex items-center">
          <XCircle className="text-red-600 w-5 h-5 mr-2" />
          {error?.message
            ? error.message
            : "Failed to update password. Please try again."}
        </span>,
        { duration: 6000, style: { background: "#ffeaea", color: "#222" } }
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form
        onSubmit={handleUpdate}
        className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md space-y-6"
      >
        <h2 className="text-xl font-bold mb-4">Set New Password</h2>
        {!canReset ? (
          <div className="text-center text-red-600 flex items-center justify-center gap-2">
            <XCircle className="w-5 h-5" />
            Invalid or expired password recovery link.
          </div>
        ) : (
          <>
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-card-border/10 focus:outline-none focus:border-primary-orange"
              placeholder="New Password"
              required
              disabled={loading}
              autoComplete="new-password"
            />
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-card-border/10 focus:outline-none focus:border-primary-orange"
              placeholder="Confirm New Password"
              required
              disabled={loading}
              autoComplete="new-password"
            />
            <button
              type="submit"
              className="btn-primary w-full flex items-center justify-center"
              disabled={loading}
            >
              {loading ? (
                <span className="animate-pulse">Updating...</span>
              ) : (
                <span>Set Password</span>
              )}
            </button>
          </>
        )}
      </form>
    </div>
  );
}