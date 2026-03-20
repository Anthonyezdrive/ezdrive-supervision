// ============================================================
// EZDrive — OCPI Handshake Modal
// Re-handshake for existing subscriptions, token regeneration
// ============================================================

import { useState } from "react";
import {
  X,
  Copy,
  Check,
  Zap,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Key,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useTriggerHandshake,
  useRegenerateToken,
} from "@/hooks/useOcpiCredentials";
import type { HandshakeLog } from "@/hooks/useOcpiCredentials";

interface Subscription {
  id: string;
  name: string;
  token_a: string | null;
  token_b: string | null;
  versions_url: string | null;
  status: string;
  country_code: string;
  party_id: string;
  role: string;
}

interface Props {
  subscription: Subscription;
  onClose: () => void;
  onSuccess: () => void;
}

function maskToken(token: string | null): string {
  if (!token) return "—";
  if (token.length <= 8) return "****" + token.slice(-4);
  return "*".repeat(Math.min(30, token.length - 4)) + token.slice(-4);
}

export function OcpiHandshakeModal({ subscription, onClose, onSuccess }: Props) {
  const [currentTokenA, setCurrentTokenA] = useState(subscription.token_a);
  const [showFullToken, setShowFullToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState<HandshakeLog[]>([]);
  const [done, setDone] = useState(false);

  const handshakeMutation = useTriggerHandshake();
  const regenerateMutation = useRegenerateToken();

  const handleCopy = () => {
    if (currentTokenA) {
      navigator.clipboard.writeText(currentTokenA);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRegenerate = async () => {
    try {
      const result = await regenerateMutation.mutateAsync(subscription.id);
      setCurrentTokenA(result.token_a);
    } catch {
      // Error handled by mutation
    }
  };

  const handleLaunchHandshake = async () => {
    setLogs([
      { step: "Connexion au versions endpoint", status: "running" },
      { step: "Envoi des credentials", status: "pending" },
      { step: "Reception du token_c", status: "pending" },
      { step: "Validation finale", status: "pending" },
    ]);

    try {
      // Step 1: connecting
      await new Promise((r) => setTimeout(r, 300)); // UX delay

      setLogs((prev) =>
        prev.map((l, i) =>
          i === 0
            ? { ...l, status: "success", message: subscription.versions_url ?? "" }
            : i === 1
            ? { ...l, status: "running" }
            : l
        )
      );

      // Step 2-3: actual handshake
      await handshakeMutation.mutateAsync(subscription.id);

      setLogs((prev) =>
        prev.map((l, i) =>
          i === 1
            ? { ...l, status: "success", message: "Credentials envoyes" }
            : i === 2
            ? { ...l, status: "success", message: "token_c recu et stocke" }
            : i === 3
            ? { ...l, status: "success", message: "Handshake reussi" }
            : l
        )
      );

      setDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";

      setLogs((prev) =>
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Re-handshake OCPI
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Subscription info */}
          <div className="bg-surface-elevated/50 border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">Partenaire</span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded text-xs font-semibold",
                  subscription.status === "CONNECTED"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : subscription.status === "PENDING"
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-red-500/15 text-red-400"
                )}
              >
                {subscription.status}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">{subscription.name}</p>
            <p className="text-xs text-foreground-muted mt-1 font-mono">
              {subscription.country_code}/{subscription.party_id} — {subscription.role}
            </p>
          </div>

          {/* Token A section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Key className="w-4 h-4 text-foreground-muted" />
                Notre token (Token A)
              </label>
              <button
                onClick={() => setShowFullToken(!showFullToken)}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                {showFullToken ? "Masquer" : "Afficher"}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-xs font-mono text-foreground truncate">
                {showFullToken ? currentTokenA ?? "—" : maskToken(currentTokenA)}
              </div>
              <button
                onClick={handleCopy}
                disabled={!currentTokenA}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm hover:bg-surface transition-colors disabled:opacity-50 shrink-0"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={handleRegenerate}
                disabled={regenerateMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm hover:bg-surface transition-colors disabled:opacity-50 shrink-0"
                title="Regenerer le token"
              >
                <RefreshCw
                  className={cn("w-4 h-4", regenerateMutation.isPending && "animate-spin")}
                />
              </button>
            </div>
            {regenerateMutation.isSuccess && (
              <p className="text-xs text-emerald-400 mt-1.5">Token regenere avec succes</p>
            )}
          </div>

          {/* Handshake logs */}
          {logs.length > 0 ? (
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                Progression du handshake
              </h4>
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-3 px-4 py-2.5 rounded-xl border transition-colors",
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
            </div>
          ) : (
            /* Launch button */
            <button
              onClick={handleLaunchHandshake}
              disabled={handshakeMutation.isPending}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-primary text-white hover:bg-primary/90 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {handshakeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              Lancer le handshake
            </button>
          )}

          {/* Done button */}
          {done && (
            <button
              onClick={() => {
                onSuccess();
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl text-sm font-semibold transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
