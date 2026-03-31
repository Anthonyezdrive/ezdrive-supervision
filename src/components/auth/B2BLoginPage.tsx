import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Mail, CheckCircle } from "lucide-react";

type Mode = "login" | "forgot" | "sent";

/**
 * Dedicated B2B client login page at /portail
 * Simplified UI — no OAuth buttons, no "Supervision Dashboard" label.
 * B2B branding + direct redirect to /b2b/overview.
 */
export function B2BLoginPage() {
  const { t } = useTranslation();
  const { user, profile, loading, signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<Mode>("login");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse-dot text-primary text-lg">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  // Already logged in — redirect based on role
  if (user) {
    if (profile?.role === "b2b_client") {
      return <Navigate to="/b2b/overview" replace />;
    }
    // Admin/operator who hit /portail — send to admin dashboard
    return <Navigate to="/dashboard" replace />;
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await signIn(email, password);
    if (err) setError(err);
    setSubmitting(false);
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await resetPassword(email);
    if (err) {
      setError(err);
    } else {
      setMode("sent");
    }
    setSubmitting(false);
  }

  function switchMode(newMode: Mode) {
    setMode(newMode);
    setError(null);
    setPassword("");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Brand gradient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] blur-[150px] rounded-full opacity-10" style={{ background: "linear-gradient(90deg, #9ACC0E, #00C3FF)" }} />
      <div className="w-full max-w-sm relative">
        {/* Logo + B2B branding */}
        <div className="text-center mb-8">
          <img
            src="/logo-ezdrive.png"
            alt="EZDrive"
            className="h-14 mx-auto mb-3"
          />
          <p className="text-foreground-muted text-sm mt-1">
            {t("auth.b2bPortalSubtitle")}
          </p>
        </div>

        {/* Mode: Sent */}
        {mode === "sent" && (
          <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-success/15 mx-auto">
                <CheckCircle className="w-6 h-6 text-success" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                {t("auth.emailSent")}
              </h2>
              <p
                className="text-foreground-muted text-sm"
                dangerouslySetInnerHTML={{ __html: t("auth.emailSentDescription", { email }) }}
              />
              <p className="text-foreground-muted text-xs">
                {t("auth.checkSpam")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="w-full py-2.5 text-white font-semibold rounded-xl transition-colors"
              style={{ backgroundColor: "#9ACC0E" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#85B50C")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#9ACC0E")}
            >
              {t("auth.backToLogin")}
            </button>
          </div>
        )}

        {/* Mode: Forgot */}
        {mode === "forgot" && (
          <form
            onSubmit={handleForgot}
            className="bg-surface border border-border rounded-2xl p-6 space-y-4"
          >
            <div className="text-center space-y-1 mb-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mx-auto" style={{ backgroundColor: "#00C3FF15" }}>
                <Mail className="w-6 h-6" style={{ color: "#00C3FF" }} />
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                {t("auth.forgotPasswordTitle")}
              </h2>
              <p className="text-foreground-muted text-sm">
                {t("auth.resetPasswordDescription")}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-muted mb-1.5">
                {t("auth.email")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors"
                placeholder="vous@entreprise.fr"
              />
            </div>

            {error && (
              <div className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-xl px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#9ACC0E" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#85B50C")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#9ACC0E")}
            >
              {submitting ? t("auth.sendingResetLink") : t("auth.sendResetLink")}
            </button>

            <button
              type="button"
              onClick={() => switchMode("login")}
              className="w-full flex items-center justify-center gap-1.5 text-sm text-foreground-muted hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t("auth.backToLogin")}
            </button>
          </form>
        )}

        {/* Mode: Login */}
        {mode === "login" && (
          <form
            onSubmit={handleLogin}
            className="bg-surface border border-border rounded-2xl p-6 space-y-4 relative overflow-hidden"
          >
            {/* Brand gradient accent */}
            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "linear-gradient(90deg, #9ACC0E, #00C3FF)" }} />
            <div>
              <label className="block text-sm font-medium text-foreground-muted mb-1.5">
                {t("auth.email")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors"
                placeholder="vous@entreprise.fr"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-foreground-muted">
                  {t("auth.password")}
                </label>
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-xs transition-colors"
                  style={{ color: "#00C3FF" }}
                >
                  {t("auth.forgotPassword")}
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-xl px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#9ACC0E" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#85B50C")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#9ACC0E")}
            >
              {submitting ? t("auth.signingIn") : t("auth.accessMyPortal")}
            </button>
          </form>
        )}

        {/* Footer */}
        <p className="text-center text-[11px] text-foreground-muted/50 mt-6">
          {t("auth.poweredBy")}
        </p>
      </div>
    </div>

  );
}
