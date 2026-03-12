import { useState, useEffect } from "react";
import {
  Bell,
  Mail,
  Clock,
  Plus,
  X,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Send,
  Key,
} from "lucide-react";
import {
  useAlertConfig,
  useUpdateAlertConfig,
  useTriggerAlertCheck,
  useAlertHistory,
} from "@/hooks/useAlertConfig";
import { formatRelativeTime } from "@/lib/utils";

const THRESHOLD_OPTIONS = [
  { value: 2, label: "2 heures" },
  { value: 4, label: "4 heures" },
  { value: 8, label: "8 heures" },
  { value: 24, label: "24 heures" },
  { value: 48, label: "48 heures" },
];

export function SettingsPage() {
  const { data: config, isLoading } = useAlertConfig();
  const { data: history = [] } = useAlertHistory();
  const updateConfig = useUpdateAlertConfig();
  const triggerCheck = useTriggerAlertCheck();

  // Local form state
  const [isActive, setIsActive] = useState(false);
  const [threshold, setThreshold] = useState(4);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Sync config → form
  useEffect(() => {
    if (config) {
      setIsActive(config.is_active);
      setThreshold(config.threshold_hours);
      setRecipients(config.email_recipients ?? []);
    }
  }, [config]);

  async function handleSave() {
    if (!config) return;
    await updateConfig.mutateAsync({
      id: config.id,
      is_active: isActive,
      threshold_hours: threshold,
      email_recipients: recipients,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleTest() {
    setTestResult(null);
    try {
      const result = await triggerCheck.mutateAsync();
      if (result.skipped) {
        setTestResult(`ℹ️ ${result.reason}`);
      } else if (result.dry_run) {
        setTestResult(
          `🔍 Mode dry-run (RESEND_API_KEY non configuré) — ${result.alerts_sent} bornes détectées`
        );
      } else if (result.alerts_sent > 0) {
        setTestResult(
          `✅ ${result.alerts_sent} email(s) envoyé(s) avec succès`
        );
      } else {
        setTestResult(`ℹ️ ${result.reason ?? "Aucune alerte à envoyer"}`);
      }
    } catch (e) {
      setTestResult(`❌ Erreur : ${(e as Error).message}`);
    }
  }

  function addEmail() {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@") || recipients.includes(email)) return;
    setRecipients([...recipients, email]);
    setNewEmail("");
  }

  function removeEmail(email: string) {
    setRecipients(recipients.filter((r) => r !== email));
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-foreground-muted">
        Chargement...
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-xl font-bold">Paramètres</h1>
        <p className="text-sm text-foreground-muted">
          Configuration des alertes automatiques de maintenance
        </p>
      </div>

      {/* Card alertes */}
      <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
            <Bell className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Alertes automatiques</p>
            <p className="text-xs text-foreground-muted">
              Notification email quand une borne est en panne trop longtemps
            </p>
          </div>
          {/* Toggle */}
          <button
            onClick={() => setIsActive(!isActive)}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
              isActive ? "bg-primary" : "bg-surface-elevated border border-border"
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                isActive ? "translate-x-5.5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Seuil */}
        <div className="px-5 py-4">
          <label className="flex items-center gap-2 text-sm font-medium mb-3">
            <Clock className="w-4 h-4 text-foreground-muted" />
            Seuil de déclenchement
          </label>
          <div className="flex flex-wrap gap-2">
            {THRESHOLD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setThreshold(opt.value)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  threshold === opt.value
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "text-foreground-muted border-border hover:border-foreground-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-foreground-muted mt-2">
            Une alerte sera envoyée si une borne reste en panne plus de{" "}
            <strong>{threshold}h</strong>. Anti-spam : max 1 alerte / borne / 12h.
          </p>
        </div>

        {/* Destinataires */}
        <div className="px-5 py-4">
          <label className="flex items-center gap-2 text-sm font-medium mb-3">
            <Mail className="w-4 h-4 text-foreground-muted" />
            Destinataires ({recipients.length})
          </label>

          <div className="space-y-2 mb-3">
            {recipients.map((email) => (
              <div
                key={email}
                className="flex items-center justify-between bg-surface-elevated border border-border rounded-xl px-4 py-2"
              >
                <span className="text-sm">{email}</span>
                <button
                  onClick={() => removeEmail(email)}
                  className="text-foreground-muted hover:text-status-faulted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="email"
              placeholder="ajouter@email.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEmail()}
              className="flex-1 px-4 py-2 text-sm bg-surface-elevated border border-border rounded-xl focus:outline-none focus:border-primary/50 placeholder:text-foreground-muted"
            />
            <button
              onClick={addEmail}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary border border-primary/30 rounded-xl text-sm font-medium hover:bg-primary/20 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Ajouter
            </button>
          </div>
        </div>

        {/* Resend info */}
        <div className="px-5 py-4 bg-surface-elevated/30">
          <div className="flex items-start gap-3">
            <Key className="w-4 h-4 text-foreground-muted mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground-muted mb-1">
                Configuration Resend (service d'envoi email)
              </p>
              <p className="text-xs text-foreground-muted">
                Ajoutez le secret{" "}
                <code className="bg-surface-elevated px-1.5 py-0.5 rounded font-mono text-primary">
                  RESEND_API_KEY
                </code>{" "}
                dans Supabase Dashboard → Settings → Edge Functions → Secrets.
                Sans clé, le mode dry-run détecte les alertes sans les envoyer.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={updateConfig.isPending}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-background font-semibold rounded-xl text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {updateConfig.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle className="w-4 h-4" />
            ) : null}
            {saved ? "Sauvegardé !" : "Sauvegarder"}
          </button>

          <button
            onClick={handleTest}
            disabled={triggerCheck.isPending}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm font-medium hover:border-foreground-muted transition-colors disabled:opacity-50"
          >
            {triggerCheck.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Tester maintenant
          </button>

          {testResult && (
            <p className="text-sm text-foreground-muted flex-1">{testResult}</p>
          )}
        </div>
      </div>

      {/* Historique des alertes */}
      {history.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-status-faulted" />
              Dernières alertes envoyées
            </h2>
          </div>
          <div className="divide-y divide-border">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between px-5 py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {(entry.stations as { name: string } | null)?.name ?? "Borne inconnue"}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {(entry.stations as { city: string | null } | null)?.city ?? "—"} ·{" "}
                    {entry.hours_in_fault != null
                      ? `${Math.round(entry.hours_in_fault)}h en panne`
                      : ""}
                  </p>
                </div>
                <span className="text-xs text-foreground-muted">
                  {formatRelativeTime(entry.sent_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
