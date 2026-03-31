// ============================================================
// EZDrive — OCPI Credential Wizard (4-step modal)
// Step 1: Partner info → Step 2: URLs → Step 3: Tokens → Step 4: Handshake
// ============================================================

import { useState, useCallback } from "react";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Globe,
  Link2,
  Key,
  Zap,
  Copy,
  Check,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  generateOcpiToken,
  useRegisterPartner,
  useTriggerHandshake,
} from "@/hooks/useOcpiCredentials";
import type { HandshakeLog } from "@/hooks/useOcpiCredentials";

interface Props {
  cpoId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

const STEPS = [
  { key: "info", label: "Infos partenaire", icon: Globe },
  { key: "urls", label: "URLs", icon: Link2 },
  { key: "tokens", label: "Tokens", icon: Key },
  { key: "handshake", label: "Handshake", icon: Zap },
] as const;

export function OcpiCredentialWizard({ cpoId, onClose, onSuccess }: Props) {
  const [step, setStep] = useState(0);

  // Step 1 fields
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [partyId, setPartyId] = useState("");
  const [role, setRole] = useState<"CPO" | "EMSP" | "HUB">("CPO");

  // Step 2 fields
  const [versionsUrl, setVersionsUrl] = useState("");

  // Step 3 fields
  const [ourToken] = useState(() => generateOcpiToken());
  const [partnerToken, setPartnerToken] = useState("");
  const [copied, setCopied] = useState(false);

  // Step 4 state
  const [handshakeLogs, setHandshakeLogs] = useState<HandshakeLog[]>([]);
  const [handshakeDone, setHandshakeDone] = useState(false);
  const [_createdId, setCreatedId] = useState<string | null>(null);

  const registerMutation = useRegisterPartner();
  const handshakeMutation = useTriggerHandshake();

  const canNext = useCallback(() => {
    switch (step) {
      case 0:
        return name.trim().length > 0 && countryCode.length === 2 && partyId.length === 3;
      case 1:
        return versionsUrl.trim().length > 0 && versionsUrl.startsWith("http");
      case 2:
        return partnerToken.trim().length > 0;
      default:
        return false;
    }
  }, [step, name, countryCode, partyId, versionsUrl, partnerToken]);

  const handleCopyToken = () => {
    navigator.clipboard.writeText(ourToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
      return;
    }
  };

  const handleLaunchHandshake = async () => {
    // Register partner first
    setHandshakeLogs([
      { step: "Enregistrement du partenaire", status: "running" },
      { step: "Connexion au versions endpoint", status: "pending" },
      { step: "Echange des credentials", status: "pending" },
      { step: "Validation du handshake", status: "pending" },
    ]);

    try {
      const result = await registerMutation.mutateAsync({
        name,
        country_code: countryCode.toUpperCase(),
        party_id: partyId.toUpperCase(),
        role,
        versions_url: versionsUrl,
        token_a: ourToken,
        token_b: partnerToken,
        cpo_id: cpoId,
      });

      setCreatedId(result.id);

      setHandshakeLogs((prev) =>
        prev.map((l, i) =>
          i === 0
            ? { ...l, status: "success", message: `ID: ${result.id.slice(0, 8)}...` }
            : i === 1
            ? { ...l, status: "running" }
            : l
        )
      );

      // Trigger handshake
      setHandshakeLogs((prev) =>
        prev.map((l, i) =>
          i === 1
            ? { ...l, status: "success", message: versionsUrl }
            : i === 2
            ? { ...l, status: "running" }
            : l
        )
      );

      await handshakeMutation.mutateAsync(result.id);

      setHandshakeLogs((prev) =>
        prev.map((l, i) =>
          i === 2
            ? { ...l, status: "success", message: "token_c recu" }
            : i === 3
            ? { ...l, status: "success", message: "Handshake termine avec succes" }
            : l
        )
      );

      setHandshakeDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";

      setHandshakeLogs((prev) =>
        prev.map((l) =>
          l.status === "running"
            ? { ...l, status: "error", message }
            : l.status === "pending"
            ? { ...l, status: "error", message: "Annule" }
            : l
        )
      );
    }
  };

  const inputClass =
    "w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-colors";
  const labelClass = "block text-sm font-medium text-foreground mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            Nouvelle connexion OCPI
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center px-6 py-3 border-b border-border bg-surface-elevated/30">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={s.key} className="flex items-center flex-1">
                <div
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : isDone
                      ? "text-emerald-400"
                      : "text-foreground-muted"
                  )}
                >
                  {isDone ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-foreground-muted/30 mx-1 shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="px-6 py-6 min-h-[320px]">
          {/* Step 1: Infos partenaire */}
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-foreground-muted mb-4">
                Renseignez les informations du partenaire OCPI avec lequel vous souhaitez etablir une connexion.
              </p>

              <div>
                <label className={labelClass}>Nom du partenaire</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Gireve, Hubject, Freshmile..."
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Code pays (2 car.)</label>
                  <input
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value.toUpperCase().slice(0, 2))}
                    placeholder="FR"
                    maxLength={2}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Party ID (3 car.)</label>
                  <input
                    value={partyId}
                    onChange={(e) => setPartyId(e.target.value.toUpperCase().slice(0, 3))}
                    placeholder="EZD"
                    maxLength={3}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "CPO" | "EMSP" | "HUB")}
                  className={inputClass}
                >
                  <option value="CPO">CPO</option>
                  <option value="EMSP">EMSP</option>
                  <option value="HUB">HUB</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 2: URLs */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-foreground-muted mb-4">
                Saisissez l'URL du endpoint <code className="px-1.5 py-0.5 bg-surface-elevated rounded text-xs font-mono text-primary">/versions</code> du partenaire.
                C'est le point d'entree OCPI 2.2.1 qui permet de decouvrir tous les modules supportes.
              </p>

              <div>
                <label className={labelClass}>Versions URL</label>
                <input
                  value={versionsUrl}
                  onChange={(e) => setVersionsUrl(e.target.value)}
                  placeholder="https://partner.com/ocpi/versions"
                  className={inputClass}
                />
                <p className="text-xs text-foreground-muted mt-1.5">
                  Format attendu : <span className="font-mono text-foreground-muted/80">https://&lt;host&gt;/ocpi/versions</span>
                </p>
              </div>

              <div className="bg-surface-elevated/50 border border-border rounded-xl p-4 mt-4">
                <h4 className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-2">
                  A propos du flow OCPI 2.2.1
                </h4>
                <p className="text-xs text-foreground-muted leading-relaxed">
                  Le versions endpoint retourne la liste des versions supportees. EZDrive selectionnera
                  automatiquement la version 2.2.1, puis interrogera le endpoint de details pour obtenir
                  la liste des modules disponibles (locations, tokens, cdrs, tariffs, sessions, commands).
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Tokens */}
          {step === 2 && (
            <div className="space-y-5">
              <p className="text-sm text-foreground-muted mb-4">
                Echangez les tokens d'authentification. Communiquez votre token au partenaire
                et saisissez le token qu'il vous a fourni.
              </p>

              <div>
                <label className={labelClass}>Notre token (Token A) — a communiquer au partenaire</label>
                <div className="flex items-center gap-2">
                  <input
                    value={ourToken}
                    readOnly
                    className={cn(inputClass, "font-mono text-xs flex-1")}
                  />
                  <button
                    onClick={handleCopyToken}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm font-medium hover:bg-surface transition-colors shrink-0"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-400">Copie</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copier</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className={labelClass}>Token du partenaire (Token B)</label>
                <input
                  value={partnerToken}
                  onChange={(e) => setPartnerToken(e.target.value)}
                  placeholder="Collez le token fourni par le partenaire..."
                  className={cn(inputClass, "font-mono text-xs")}
                />
              </div>
            </div>
          )}

          {/* Step 4: Handshake */}
          {step === 3 && (
            <div className="space-y-5">
              <p className="text-sm text-foreground-muted mb-4">
                Lancez le handshake OCPI pour finaliser la connexion. EZDrive va contacter
                le partenaire, echanger les credentials et valider la connexion.
              </p>

              {handshakeLogs.length === 0 ? (
                <div className="flex flex-col items-center py-8">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <Zap className="w-8 h-8 text-primary" />
                  </div>
                  <p className="text-sm text-foreground font-medium mb-1">Pret a lancer le handshake</p>
                  <p className="text-xs text-foreground-muted mb-6">
                    {name} ({countryCode}/{partyId}) — {role}
                  </p>
                  <button
                    onClick={handleLaunchHandshake}
                    disabled={registerMutation.isPending || handshakeMutation.isPending}
                    className="flex items-center gap-2 px-6 py-3 bg-primary text-white hover:bg-primary/90 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {registerMutation.isPending || handshakeMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                    Lancer le handshake
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {handshakeLogs.map((log, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors",
                        log.status === "success"
                          ? "bg-emerald-500/5 border-emerald-500/20"
                          : log.status === "error"
                          ? "bg-red-500/5 border-red-500/20"
                          : log.status === "running"
                          ? "bg-primary/5 border-primary/20"
                          : "bg-surface-elevated/30 border-border"
                      )}
                    >
                      <div className="mt-0.5">
                        {log.status === "success" && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                        {log.status === "error" && <XCircle className="w-4 h-4 text-red-400" />}
                        {log.status === "running" && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                        {log.status === "pending" && (
                          <div className="w-4 h-4 rounded-full border-2 border-foreground-muted/30" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{log.step}</p>
                        {log.message && (
                          <p className="text-xs text-foreground-muted mt-0.5 font-mono truncate">
                            {log.message}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}

                  {handshakeDone && (
                    <div className="flex justify-end mt-4">
                      <button
                        onClick={() => {
                          onSuccess();
                          onClose();
                        }}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl text-sm font-semibold transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Terminer
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer navigation */}
        {step < 3 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <button
              onClick={() => (step > 0 ? setStep(step - 1) : onClose())}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {step > 0 ? "Precedent" : "Annuler"}
            </button>
            <button
              onClick={handleNext}
              disabled={!canNext()}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-primary text-white hover:bg-primary/90 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Suivant
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
