// ============================================================
// EZDrive — Validate Token Page
// Utility to validate RFID/OCPI tokens and find associated user
// ============================================================

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ScanLine,
  Search,
  User,
  CreditCard,
  CheckCircle2,
  XCircle,
  Loader2,
  Fingerprint,
  Eye,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  Crown,
  MapPin,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useCpo } from "@/contexts/CpoContext";
import { PageHelp } from "@/components/ui/PageHelp";

// ── Types ─────────────────────────────────────────────────────

type SearchMode = "auth_id" | "chip_id" | "visual_id";

interface ExceptionResult {
  allowed: boolean;
  free_charging: boolean;
  reason: string;
  group_name: string | null;
  rule_type: string | null;
  rule_name: string | null;
}

interface StationContextResult {
  allowed: boolean;
  reason: string;
  group_name: string | null;
}

interface StationOption {
  id: string;
  name: string;
  evse_id: string | null;
}

interface TokenResult {
  found: boolean;
  token?: {
    id: string;
    uid: string;
    type: string;
    status: string;
    visual_number: string | null;
    issuer: string | null;
    created_at: string;
  };
  user?: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    status: string | null;
  };
  exception?: ExceptionResult;
  stationContext?: StationContextResult;
}

const MODES: { key: SearchMode; label: string; icon: React.ComponentType<{ className?: string }>; placeholder: string }[] = [
  { key: "auth_id", label: "Auth ID", icon: KeyRound, placeholder: "Ex: 04A3B2C1D5E6F7" },
  { key: "chip_id", label: "Chip ID", icon: Fingerprint, placeholder: "Ex: E0040150A1B2C3D4" },
  { key: "visual_id", label: "Visual ID", icon: Eye, placeholder: "Ex: FR-EZD-C00001-A" },
];

// ── Component ─────────────────────────────────────────────────

export function ValidateTokenPage() {
  const { selectedCpoId } = useCpo();
  const [mode, setMode] = useState<SearchMode>("auth_id");
  const [tokenInput, setTokenInput] = useState("");
  const [stationId, setStationId] = useState<string>("");
  const [result, setResult] = useState<TokenResult | null>(null);

  // Fetch stations list for contextual validation
  const { data: stations } = useQuery<StationOption[]>({
    queryKey: ["stations-list", selectedCpoId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("stations")
        .select("id, name, evse_id")
        .order("name");
      if (selectedCpoId) query = query.eq("cpo_id", selectedCpoId);
      const { data, error } = await query;
      if (error) {
        console.warn("[ValidateToken] stations query:", error.message);
        return [];
      }
      return (data ?? []) as StationOption[];
    },
  });

  // Helper: check token authorization on a specific station
  async function checkStationContext(tokenUid: string, sid: string): Promise<StationContextResult> {
    // Try RPC first
    try {
      const { data, error } = await supabase.rpc("check_token_exception", {
        p_token_uid: tokenUid,
        p_station_id: sid,
      });
      if (!error && data) return data as StationContextResult;
    } catch {
      // RPC may not exist — fall through to manual check
    }

    // Manual check: access_group_members
    const { data: groupMembers } = await supabase
      .from("access_group_members")
      .select("id, access_group:access_groups(id, name)")
      .eq("token_uid", tokenUid)
      .eq("station_id", sid)
      .limit(1);

    if (groupMembers && groupMembers.length > 0) {
      const group = (groupMembers[0] as any)?.access_group;
      return {
        allowed: true,
        reason: `Membre du groupe d'accès "${group?.name ?? "—"}"`,
        group_name: group?.name ?? null,
      };
    }

    // Check exceptions table
    const { data: exceptions } = await supabase
      .from("exceptions")
      .select("id, type, reason")
      .eq("token_uid", tokenUid)
      .eq("station_id", sid)
      .limit(1);

    if (exceptions && exceptions.length > 0) {
      const ex = exceptions[0];
      const isBlacklist = ex.type === "blacklist";
      return {
        allowed: !isBlacklist,
        reason: ex.reason ?? (isBlacklist ? "Blacklisté sur cette station" : "Exception active"),
        group_name: null,
      };
    }

    // No specific rule found — general authorization applies
    return {
      allowed: true,
      reason: "Aucune restriction spécifique — autorisation générale",
      group_name: null,
    };
  }

  const validateMutation = useMutation({
    mutationFn: async ({ searchMode, value, selectedStationId }: { searchMode: SearchMode; value: string; selectedStationId: string }) => {
      const trimmed = value.trim();
      if (!trimmed) throw new Error("Veuillez entrer une valeur");

      // Search in rfid_cards table
      let query = supabase.from("rfid_cards").select("*");
      if (searchMode === "auth_id") query = query.eq("uid", trimmed);
      else if (searchMode === "chip_id") query = query.eq("uid", trimmed);
      else query = query.eq("visual_number", trimmed);
      if (selectedCpoId) query = query.eq("cpo_id", selectedCpoId);

      const { data: cards, error: cardError } = await query.limit(1);
      if (cardError) {
        console.warn("[ValidateToken] rfid_cards query:", cardError.message);
      }

      const card = cards?.[0];

      if (!card) {
        // Try all_tokens unified view as fallback (covers ocpi_tokens, gfx_tokens, etc.)
        let tokenQuery = supabase.from("all_tokens").select("*");
        if (searchMode === "auth_id") tokenQuery = tokenQuery.eq("uid", trimmed);
        else if (searchMode === "visual_id") tokenQuery = tokenQuery.eq("visual_number", trimmed);
        else tokenQuery = tokenQuery.eq("uid", trimmed);
        if (selectedCpoId) tokenQuery = tokenQuery.eq("cpo_id", selectedCpoId);

        const { data: tokens } = await tokenQuery.limit(1);
        const token = tokens?.[0];

        if (!token) {
          return { found: false } as TokenResult;
        }

        // Found in all_tokens — look up user
        let user: TokenResult["user"] = undefined;
        if (token.consumer_id) {
          const { data: profile } = await supabase
            .from("all_consumers")
            .select("id, first_name, last_name, email, phone, status")
            .eq("id", token.consumer_id)
            .single();
          if (profile) user = { ...profile, full_name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null };
        }

        // Check exception rules
        const { data: exData } = await supabase.rpc("check_token_exceptions", { p_token_uid: token.uid });
        const exception = exData as ExceptionResult | null;

        // Check station context if a station is selected
        let stationContext: StationContextResult | undefined;
        if (selectedStationId) {
          stationContext = await checkStationContext(token.uid, selectedStationId);
        }

        return {
          found: true,
          token: {
            id: token.id,
            uid: token.uid,
            type: token.type ?? "OCPI",
            status: token.status ?? "unknown",
            visual_number: token.visual_number ?? null,
            issuer: token.issuer ?? null,
            created_at: token.created_at,
          },
          user,
          exception: exception ?? undefined,
          stationContext,
        } as TokenResult;
      }

      // Found in rfid_cards — look up user
      let user: TokenResult["user"] = undefined;
      if (card.consumer_id) {
        const { data: profile } = await supabase
          .from("all_consumers")
          .select("id, first_name, last_name, email, phone, status")
          .eq("id", card.consumer_id)
          .single();
        if (profile) user = { ...profile, full_name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null };
      }

      // Check exception rules
      const { data: exData2 } = await supabase.rpc("check_token_exceptions", { p_token_uid: card.uid });
      const exception2 = exData2 as ExceptionResult | null;

      // Check station context if a station is selected
      let stationContext2: StationContextResult | undefined;
      if (selectedStationId) {
        stationContext2 = await checkStationContext(card.uid, selectedStationId);
      }

      return {
        found: true,
        token: {
          id: card.id,
          uid: card.uid,
          type: card.type ?? "RFID",
          status: card.status ?? "unknown",
          visual_number: card.visual_number ?? null,
          issuer: card.issuer ?? null,
          created_at: card.created_at,
        },
        user,
        exception: exception2 ?? undefined,
        stationContext: stationContext2,
      } as TokenResult;
    },
    onSuccess: (data) => setResult(data),
    onError: () => setResult({ found: false }),
  });

  function handleValidate() {
    setResult(null);
    validateMutation.mutate({ searchMode: mode, value: tokenInput, selectedStationId: stationId });
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">
          Valider un Token
        </h1>
        <p className="text-sm text-foreground-muted mt-1">
          Rechercher un token RFID ou OCPI et vérifier son association utilisateur
        </p>
      </div>

      <PageHelp
        summary="Validation et test de tokens RFID/OCPI pour vérifier les autorisations"
        items={[
          { label: "Validation", description: "Vérifiez si un token (badge RFID) est autorisé à charger sur une borne donnée." },
          { label: "Token UID", description: "Identifiant unique inscrit sur le badge RFID du conducteur." },
          { label: "Résultat", description: "Accepted (autorisé), Blocked (bloqué), Expired (expiré), Invalid (inconnu), NoCredit (solde insuffisant)." },
          { label: "Usage", description: "Utile pour diagnostiquer les problèmes d'authentification sur les bornes." },
        ]}
        tips={["Testez ici avant de créer un ticket de support — le problème est souvent un badge expiré ou bloqué."]}
      />

      {/* Search Card */}
      <div className="bg-surface border border-border rounded-2xl p-6 max-w-xl">
        {/* Mode Selection */}
        <div className="space-y-3 mb-6">
          <label className="text-sm font-medium text-foreground">Type de recherche</label>
          <div className="flex gap-3">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => { setMode(m.key); setResult(null); }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all",
                  mode === m.key
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-surface border-border text-foreground-muted hover:text-foreground hover:border-foreground-muted/30"
                )}
              >
                <m.icon className="w-4 h-4" />
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input + Button */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
            <input
              type="text"
              placeholder={MODES.find((m) => m.key === mode)?.placeholder}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleValidate()}
              className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
            />
          </div>
          <button
            onClick={handleValidate}
            disabled={validateMutation.isPending || !tokenInput.trim()}
            className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {validateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Valider
          </button>
        </div>

        {/* Station Selector (optional) */}
        <div className="mt-4 space-y-1.5">
          <label className="text-sm text-foreground-muted">Station (optionnel)</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 appearance-none"
            >
              <option value="">Toutes les stations</option>
              {stations?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.evse_id ? ` (${s.evse_id})` : ""}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-foreground-muted/70">
            Sélectionnez une station pour vérifier si le token y est autorisé
          </p>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="max-w-xl">
          {!result.found ? (
            /* Not Found */
            <div className="bg-surface border border-red-500/20 rounded-2xl p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                <XCircle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Token introuvable</h3>
                <p className="text-sm text-foreground-muted mt-0.5">
                  Aucun token ne correspond à la valeur saisie dans les tables RFID et OCPI.
                </p>
              </div>
            </div>
          ) : (
            /* Found */
            <div className="space-y-4">
              {/* Token Info */}
              <div className="bg-surface border border-emerald-500/20 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Token trouvé</h3>
                    <p className="text-xs text-foreground-muted">{result.token?.type} — {result.token?.uid}</p>
                  </div>
                  <span
                    className={cn(
                      "ml-auto px-2.5 py-1 rounded-full text-xs font-semibold",
                      result.token?.status === "active" || result.token?.status === "VALID"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : result.token?.status === "blocked" || result.token?.status === "BLOCKED"
                        ? "bg-red-500/10 text-red-400"
                        : "bg-amber-500/10 text-amber-400"
                    )}
                  >
                    {result.token?.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <InfoRow icon={CreditCard} label="UID" value={result.token?.uid ?? "—"} />
                  <InfoRow icon={Eye} label="Visual" value={result.token?.visual_number ?? "—"} />
                  <InfoRow icon={ScanLine} label="Type" value={result.token?.type ?? "—"} />
                  <InfoRow icon={KeyRound} label="Émetteur" value={result.token?.issuer ?? "—"} />
                </div>
              </div>

              {/* Exception Status */}
              {result.exception?.rule_type && (
                <div
                  className={cn(
                    "border rounded-2xl p-6",
                    result.exception.rule_type === "blacklist"
                      ? "bg-surface border-red-500/20"
                      : result.exception.free_charging
                      ? "bg-surface border-amber-500/20"
                      : "bg-surface border-blue-500/20"
                  )}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        result.exception.rule_type === "blacklist"
                          ? "bg-red-500/10"
                          : result.exception.free_charging
                          ? "bg-amber-500/10"
                          : "bg-blue-500/10"
                      )}
                    >
                      {result.exception.rule_type === "blacklist" ? (
                        <ShieldAlert className="w-5 h-5 text-red-400" />
                      ) : result.exception.free_charging ? (
                        <Crown className="w-5 h-5 text-amber-400" />
                      ) : result.exception.reason?.includes("maintenance") ? (
                        <Wrench className="w-5 h-5 text-blue-400" />
                      ) : (
                        <ShieldCheck className="w-5 h-5 text-blue-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        {result.exception.rule_type === "blacklist"
                          ? "Token bloque par exception"
                          : result.exception.free_charging
                          ? "Token VIP — charge gratuite"
                          : "Exception active"}
                      </h3>
                      <p className="text-xs text-foreground-muted">
                        {result.exception.reason}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "ml-auto px-2.5 py-1 rounded-full text-xs font-semibold",
                        result.exception.rule_type === "blacklist"
                          ? "bg-red-500/10 text-red-400"
                          : result.exception.free_charging
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-blue-500/10 text-blue-400"
                      )}
                    >
                      {result.exception.rule_type}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <InfoRow icon={ShieldCheck} label="Groupe" value={result.exception.group_name ?? "—"} />
                    <InfoRow icon={KeyRound} label="Regle" value={result.exception.rule_name ?? "—"} />
                    <InfoRow icon={CreditCard} label="Charge gratuite" value={result.exception.free_charging ? "Oui" : "Non"} />
                    <InfoRow icon={CheckCircle2} label="Autorise" value={result.exception.allowed ? "Oui" : "Non"} />
                  </div>
                </div>
              )}

              {/* Station Context */}
              {result.stationContext && stationId && (
                <div
                  className={cn(
                    "border rounded-2xl p-6",
                    result.stationContext.allowed
                      ? "bg-surface border-emerald-500/20"
                      : "bg-surface border-red-500/20"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        result.stationContext.allowed ? "bg-emerald-500/10" : "bg-red-500/10"
                      )}
                    >
                      {result.stationContext.allowed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-foreground">
                        Contexte station
                      </h3>
                      <p className="text-sm mt-0.5">
                        {result.stationContext.allowed ? (
                          <span className="text-emerald-400">
                            Autorise sur {stations?.find((s) => s.id === stationId)?.name ?? "station"}
                          </span>
                        ) : (
                          <span className="text-red-400">
                            Non autorise sur {stations?.find((s) => s.id === stationId)?.name ?? "station"}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-foreground-muted mt-1">{result.stationContext.reason}</p>
                    </div>
                    <span
                      className={cn(
                        "ml-auto shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold",
                        result.stationContext.allowed
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-red-500/10 text-red-400"
                      )}
                    >
                      {result.stationContext.allowed ? "Autorise" : "Refuse"}
                    </span>
                  </div>
                  {result.stationContext.group_name && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <InfoRow icon={ShieldCheck} label="Groupe d'acces" value={result.stationContext.group_name} />
                    </div>
                  )}
                </div>
              )}

              {/* User Info */}
              {result.user ? (
                <div className="bg-surface border border-border rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        {result.user.full_name || "Sans nom"}
                      </h3>
                      <p className="text-xs text-foreground-muted">{result.user.email ?? "—"}</p>
                    </div>
                    {result.user.status && (
                      <span
                        className={cn(
                          "ml-auto px-2.5 py-1 rounded-full text-xs font-semibold",
                          result.user.status === "active"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-amber-500/10 text-amber-400"
                        )}
                      >
                        {result.user.status}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <InfoRow icon={User} label="Nom" value={result.user.full_name ?? "—"} />
                    <InfoRow icon={KeyRound} label="Téléphone" value={result.user.phone ?? "—"} />
                  </div>
                </div>
              ) : (
                <div className="bg-surface border border-amber-500/20 rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Aucun utilisateur associé</h3>
                    <p className="text-xs text-foreground-muted">Ce token n'est lié à aucun profil conducteur.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Info Row ──────────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-foreground-muted/50 shrink-0" />
      <span className="text-foreground-muted">{label}:</span>
      <span className="text-foreground font-medium truncate">{value}</span>
    </div>
  );
}
