import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Mail, CheckCircle } from "lucide-react";

type Mode = "login" | "forgot" | "sent";

export function LoginPage() {
  const { t } = useTranslation();
  const { user, profile, loading, signIn, signInWithGoogle, signInWithApple, resetPassword } = useAuth();
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

  if (user) {
    // B2B clients → portail B2B, others → dashboard admin
    const dest = profile?.role === "b2b_client" ? "/b2b/overview" : "/dashboard";
    return <Navigate to={dest} replace />;
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/logo-ezdrive.png"
            alt="EZDrive"
            className="h-14 mx-auto mb-3"
          />
          <p className="text-foreground-muted text-sm mt-1">
            Supervision Dashboard
          </p>
        </div>

        {/* Mode: Sent — Success message */}
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
              className="w-full py-2.5 bg-primary hover:bg-primary-hover text-foreground-inverse font-semibold rounded-xl transition-colors"
            >
              {t("auth.backToLogin")}
            </button>
          </div>
        )}

        {/* Mode: Forgot — Email form */}
        {mode === "forgot" && (
          <form
            onSubmit={handleForgot}
            className="bg-surface border border-border rounded-2xl p-6 space-y-4"
          >
            <div className="text-center space-y-1 mb-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/15 mx-auto">
                <Mail className="w-6 h-6 text-primary" />
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
                placeholder="vous@ezdrive.fr"
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
              className="w-full py-2.5 bg-primary hover:bg-primary-hover text-foreground-inverse font-semibold rounded-xl transition-colors disabled:opacity-50"
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

        {/* Mode: Login — Standard form */}
        {mode === "login" && (
          <form
            onSubmit={handleLogin}
            className="bg-surface border border-border rounded-2xl p-6 space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-foreground-muted mb-1.5">
                {t("auth.email")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors"
                placeholder="vous@ezdrive.fr"
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
                  className="text-xs text-primary hover:text-primary-hover transition-colors"
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
              className="w-full py-2.5 bg-primary hover:bg-primary-hover text-foreground-inverse font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              {submitting ? t("auth.signingIn") : t("auth.signIn")}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-foreground-muted">{t("auth.or")}</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Google Sign-in */}
            <button
              type="button"
              onClick={async () => {
                setError(null);
                const { error: err } = await signInWithGoogle();
                if (err) setError(err);
              }}
              className="w-full py-2.5 bg-surface-elevated hover:bg-surface border border-border rounded-xl font-medium text-foreground transition-colors flex items-center justify-center gap-2.5"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {t("auth.continueWithGoogle")}
            </button>

            {/* Apple Sign-in */}
            <button
              type="button"
              onClick={async () => {
                setError(null);
                const { error: err } = await signInWithApple();
                if (err) setError(err);
              }}
              className="w-full py-2.5 bg-surface-elevated hover:bg-surface border border-border rounded-xl font-medium text-foreground transition-colors flex items-center justify-center gap-2.5"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              {t("auth.continueWithApple")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
