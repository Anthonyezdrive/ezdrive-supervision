import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle, Eye, EyeOff } from "lucide-react";

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const { user, profile, loading, isRecovery, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse-dot text-primary text-lg">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  // Not logged in and not in recovery → redirect to login
  if (!user && !isRecovery) {
    return <Navigate to="/login" replace />;
  }

  // Success → show confirmation then redirect
  if (success) {
    const dest = profile?.role === "b2b_client" ? "/b2b/overview" : "/dashboard";
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm">
          <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-success/15 mx-auto">
                <CheckCircle className="w-7 h-7 text-success" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                {t("auth.passwordUpdatedTitle")}
              </h2>
              <p className="text-foreground-muted text-sm">
                {t("auth.passwordUpdatedDescription")}
              </p>
            </div>
            <a
              href={dest}
              className="block w-full py-2.5 bg-primary hover:bg-primary-hover text-foreground-inverse font-semibold rounded-xl transition-colors text-center"
            >
              {t("auth.accessMySpace")}
            </a>
          </div>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t("auth.passwordMinLength"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.passwordsDoNotMatch"));
      return;
    }

    setSubmitting(true);
    const { error: err } = await updatePassword(password);
    if (err) {
      setError(err);
    } else {
      setSuccess(true);
    }
    setSubmitting(false);
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
          <h1 className="font-heading text-2xl font-bold text-foreground">
            {t("auth.newPasswordTitle")}
          </h1>
          <p className="text-foreground-muted text-sm mt-1">
            {t("auth.newPasswordDescription")}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-border rounded-2xl p-6 space-y-4"
        >
          {/* New password */}
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1.5">
              {t("auth.newPassword")}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoFocus
                className="w-full px-3 py-2.5 pr-10 bg-surface-elevated border border-border rounded-xl text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors"
                placeholder={t("auth.newPasswordPlaceholder")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm password */}
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1.5">
              {t("auth.confirmPassword")}
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors"
              placeholder={t("auth.confirmPasswordPlaceholder")}
            />
          </div>

          {/* Password strength hints */}
          <div className="space-y-1.5">
            <StrengthCheck ok={password.length >= 8} label={t("auth.strengthAtLeast8")} />
            <StrengthCheck ok={/[A-Z]/.test(password)} label={t("auth.strengthUppercase")} />
            <StrengthCheck ok={/[0-9]/.test(password)} label={t("auth.strengthDigit")} />
            <StrengthCheck ok={password.length > 0 && password === confirm} label={t("auth.strengthMatch")} />
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
            {submitting ? t("auth.updatingPassword") : t("auth.saveNewPassword")}
          </button>
        </form>
      </div>
    </div>
  );
}

function StrengthCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-1.5 h-1.5 rounded-full transition-colors ${
          ok ? "bg-success" : "bg-foreground-muted/30"
        }`}
      />
      <span
        className={`text-xs transition-colors ${
          ok ? "text-success" : "text-foreground-muted/60"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
