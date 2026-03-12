import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { KPICard } from "@/components/ui/KPICard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Globe,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Zap,
  MapPin,
  CreditCard,
  Key,
  ArrowRight,
  Play,
  FileText,
  Activity,
} from "lucide-react";

// ============================================================
// OCPI Dashboard — Gireve IOP Integration Status
// ============================================================

export function OcpiPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"overview" | "locations" | "sessions" | "cdrs" | "push-log" | "tokens">("overview");

  // --- Data Hooks ---
  const { data: credentials } = useQuery({
    queryKey: ["ocpi-credentials"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ocpi_credentials")
        .select("*")
        .order("role");
      return data ?? [];
    },
  });

  const { data: locationCount } = useQuery({
    queryKey: ["ocpi-location-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("ocpi_locations")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: evseCount } = useQuery({
    queryKey: ["ocpi-evse-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("ocpi_evses")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: sessionCount } = useQuery({
    queryKey: ["ocpi-session-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("ocpi_sessions")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: cdrCount } = useQuery({
    queryKey: ["ocpi-cdr-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("ocpi_cdrs")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: tokenCount } = useQuery({
    queryKey: ["ocpi-token-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("ocpi_tokens")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: pushQueuePending } = useQuery({
    queryKey: ["ocpi-push-pending"],
    queryFn: async () => {
      const { count } = await supabase
        .from("ocpi_push_queue")
        .select("*", { count: "exact", head: true })
        .in("status", ["PENDING", "RETRY"]);
      return count ?? 0;
    },
    refetchInterval: 10000,
  });

  const { data: pushQueueFailed } = useQuery({
    queryKey: ["ocpi-push-failed"],
    queryFn: async () => {
      const { count } = await supabase
        .from("ocpi_push_queue")
        .select("*", { count: "exact", head: true })
        .eq("status", "FAILED");
      return count ?? 0;
    },
  });

  const { data: recentPushLogs } = useQuery({
    queryKey: ["ocpi-push-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ocpi_push_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    refetchInterval: 15000,
  });

  const { data: locations } = useQuery({
    queryKey: ["ocpi-locations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ocpi_locations")
        .select("*, ocpi_evses(*, ocpi_connectors(*))")
        .order("name")
        .limit(50);
      return data ?? [];
    },
    enabled: activeTab === "locations",
  });

  const { data: sessions } = useQuery({
    queryKey: ["ocpi-sessions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ocpi_sessions")
        .select("*")
        .order("start_date_time", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: activeTab === "sessions",
  });

  const { data: cdrs } = useQuery({
    queryKey: ["ocpi-cdrs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ocpi_cdrs")
        .select("*")
        .order("start_date_time", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: activeTab === "cdrs",
  });

  const { data: tokens } = useQuery({
    queryKey: ["ocpi-tokens-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ocpi_tokens")
        .select("*")
        .order("last_updated", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: activeTab === "tokens",
  });

  // --- Mutations ---
  const seedMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpi-seed-locations`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ocpi-location-count"] });
      queryClient.invalidateQueries({ queryKey: ["ocpi-evse-count"] });
      queryClient.invalidateQueries({ queryKey: ["ocpi-locations"] });
    },
  });

  const pushMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocpi-push`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ocpi-push-pending"] });
      queryClient.invalidateQueries({ queryKey: ["ocpi-push-failed"] });
      queryClient.invalidateQueries({ queryKey: ["ocpi-push-logs"] });
    },
  });

  // --- Tabs ---
  const tabs = [
    { id: "overview" as const, label: "Vue d'ensemble", icon: Activity },
    { id: "locations" as const, label: "Locations", icon: MapPin },
    { id: "sessions" as const, label: "Sessions", icon: Zap },
    { id: "cdrs" as const, label: "CDRs", icon: FileText },
    { id: "tokens" as const, label: "Tokens", icon: Key },
    { id: "push-log" as const, label: "Push Log", icon: Send },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <Globe className="w-6 h-6 text-primary" />
            OCPI 2.2.1 — Gireve IOP
          </h1>
          <p className="text-sm text-foreground-muted mt-1">
            Interface d'interopérabilité EZDrive CPO + eMSP
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-surface-elevated hover:bg-surface border border-border rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${seedMutation.isPending ? "animate-spin" : ""}`} />
            {seedMutation.isPending ? "Seeding..." : "Seed Locations"}
          </button>
          <button
            onClick={() => pushMutation.mutate()}
            disabled={pushMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white hover:bg-primary/90 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Send className={`w-4 h-4 ${pushMutation.isPending ? "animate-spin" : ""}`} />
            {pushMutation.isPending ? "Pushing..." : "Push to Gireve"}
          </button>
        </div>
      </div>

      {/* Connection Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(credentials ?? []).map((cred: Record<string, unknown>) => (
          <div
            key={cred.id as string}
            className="bg-surface border border-border rounded-2xl p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    cred.status === "CONNECTED"
                      ? "bg-green-500/15 text-green-500"
                      : "bg-amber-500/15 text-amber-500"
                  }`}
                >
                  {cred.role === "CPO" ? (
                    <Zap className="w-5 h-5" />
                  ) : (
                    <CreditCard className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">
                    {cred.role as string} — {cred.country_code as string}{cred.party_id as string}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {cred.platform as string} → {cred.gireve_country_code as string}{cred.gireve_party_id as string}
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                  cred.status === "CONNECTED"
                    ? "bg-green-500/15 text-green-500"
                    : cred.status === "PENDING"
                    ? "bg-amber-500/15 text-amber-500"
                    : "bg-red-500/15 text-red-500"
                }`}
              >
                {cred.status as string}
              </span>
            </div>
            {cred.token_b && (
              <p className="mt-2 text-[10px] text-foreground-muted font-mono truncate">
                Token B: {(cred.token_b as string).substring(0, 20)}...
              </p>
            )}
          </div>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard label="Locations" value={locationCount ?? 0} icon={MapPin} color="primary" />
        <KPICard label="EVSEs" value={evseCount ?? 0} icon={Zap} color="primary" />
        <KPICard label="Sessions" value={sessionCount ?? 0} icon={Activity} color="primary" />
        <KPICard label="CDRs" value={cdrCount ?? 0} icon={FileText} color="primary" />
        <KPICard label="Tokens" value={tokenCount ?? 0} icon={Key} color="primary" />
        <KPICard
          label="Push Queue"
          value={pushQueuePending ?? 0}
          icon={Send}
          color={(pushQueueFailed ?? 0) > 0 ? "danger" : "primary"}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-foreground-muted hover:text-foreground"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <OverviewTab
          credentials={credentials ?? []}
          recentLogs={recentPushLogs ?? []}
          seedResult={seedMutation.data}
          pushResult={pushMutation.data}
        />
      )}
      {activeTab === "locations" && <LocationsTab locations={locations ?? []} />}
      {activeTab === "sessions" && <SessionsTab sessions={sessions ?? []} />}
      {activeTab === "cdrs" && <CdrsTab cdrs={cdrs ?? []} />}
      {activeTab === "tokens" && <TokensTab tokens={tokens ?? []} />}
      {activeTab === "push-log" && <PushLogTab logs={recentPushLogs ?? []} />}
    </div>
  );
}

// ============================================================
// Tab Components
// ============================================================

function OverviewTab({ credentials, recentLogs, seedResult, pushResult }: {
  credentials: Record<string, unknown>[];
  recentLogs: Record<string, unknown>[];
  seedResult?: Record<string, unknown>;
  pushResult?: Record<string, unknown>;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* OCPI Endpoints */}
      <div className="bg-surface border border-border rounded-2xl p-5">
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          Endpoints OCPI exposés
        </h3>
        <div className="space-y-2 text-xs font-mono">
          {[
            "GET  /versions",
            "GET  /2.2.1",
            "POST /2.2.1/credentials",
            "GET  /2.2.1/locations",
            "GET  /2.2.1/tariffs",
            "GET  /2.2.1/sessions",
            "GET  /2.2.1/cdrs",
            "GET  /2.2.1/tokens",
            "POST /2.2.1/tokens/{uid}/authorize",
            "POST /2.2.1/commands/START_SESSION",
            "POST /2.2.1/commands/STOP_SESSION",
          ].map((ep) => (
            <div key={ep} className="flex items-center gap-2 text-foreground-muted">
              <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />
              <span>{ep}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Actions */}
      <div className="bg-surface border border-border rounded-2xl p-5">
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Derniers logs OCPI
        </h3>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {recentLogs.length === 0 ? (
            <p className="text-sm text-foreground-muted">Aucun log OCPI</p>
          ) : (
            recentLogs.slice(0, 10).map((log: Record<string, unknown>) => (
              <div
                key={log.id as string}
                className="flex items-center justify-between text-xs py-1.5 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {(log.response_status as number) >= 200 && (log.response_status as number) < 300 ? (
                    <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-500 shrink-0" />
                  )}
                  <span className="font-mono text-foreground-muted truncate">
                    {log.action as string} {log.ocpi_path as string}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-foreground-muted">{log.duration_ms as number}ms</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      (log.response_status as number) >= 200 && (log.response_status as number) < 300
                        ? "bg-green-500/15 text-green-500"
                        : "bg-red-500/15 text-red-500"
                    }`}
                  >
                    {log.response_status as number}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Seed Result */}
      {seedResult && (
        <div className="bg-surface border border-border rounded-2xl p-5">
          <h3 className="font-semibold text-foreground mb-2">Dernier Seed</h3>
          <pre className="text-xs text-foreground-muted font-mono whitespace-pre-wrap">
            {JSON.stringify(seedResult, null, 2)}
          </pre>
        </div>
      )}

      {/* Push Result */}
      {pushResult && (
        <div className="bg-surface border border-border rounded-2xl p-5">
          <h3 className="font-semibold text-foreground mb-2">Dernier Push</h3>
          <pre className="text-xs text-foreground-muted font-mono whitespace-pre-wrap">
            {JSON.stringify(pushResult, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function LocationsTab({ locations }: { locations: Record<string, unknown>[] }) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-elevated border-b border-border">
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Location ID</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Nom</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Ville</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">EVSEs</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Status</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">MAJ</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((loc: Record<string, unknown>) => {
              const evses = (loc.ocpi_evses as Record<string, unknown>[]) ?? [];
              return (
                <tr key={loc.id as string} className="border-b border-border last:border-0 hover:bg-surface-elevated/50">
                  <td className="px-4 py-3 font-mono text-xs">{loc.ocpi_id as string}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{(loc.name as string) || "—"}</td>
                  <td className="px-4 py-3 text-foreground-muted">{loc.city as string}</td>
                  <td className="px-4 py-3">
                    {evses.map((evse: Record<string, unknown>) => (
                      <span
                        key={evse.uid as string}
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium mr-1 ${
                          evse.status === "AVAILABLE" ? "bg-green-500/15 text-green-500" :
                          evse.status === "CHARGING" ? "bg-blue-500/15 text-blue-500" :
                          evse.status === "OUTOFORDER" ? "bg-red-500/15 text-red-500" :
                          "bg-gray-500/15 text-gray-500"
                        }`}
                      >
                        {evse.status as string}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-3">
                    {loc.publish ? (
                      <span className="text-green-500 text-xs">Publié</span>
                    ) : (
                      <span className="text-amber-500 text-xs">Masqué</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground-muted">
                    {new Date(loc.last_updated as string).toLocaleString("fr-FR")}
                  </td>
                </tr>
              );
            })}
            {locations.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-foreground-muted">
                  Aucune location OCPI. Cliquez "Seed Locations" pour importer les stations.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SessionsTab({ sessions }: { sessions: Record<string, unknown>[] }) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-elevated border-b border-border">
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Session ID</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Status</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">kWh</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Début</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Fin</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Location</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s: Record<string, unknown>) => (
              <tr key={s.id as string} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{(s.session_id as string)?.substring(0, 12)}...</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    s.status === "ACTIVE" ? "bg-blue-500/15 text-blue-500" :
                    s.status === "COMPLETED" ? "bg-green-500/15 text-green-500" :
                    "bg-gray-500/15 text-gray-500"
                  }`}>{s.status as string}</span>
                </td>
                <td className="px-4 py-3 font-medium">{Number(s.kwh).toFixed(2)}</td>
                <td className="px-4 py-3 text-xs">{new Date(s.start_date_time as string).toLocaleString("fr-FR")}</td>
                <td className="px-4 py-3 text-xs">{s.end_date_time ? new Date(s.end_date_time as string).toLocaleString("fr-FR") : "—"}</td>
                <td className="px-4 py-3 text-xs text-foreground-muted">{s.location_id as string}</td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-foreground-muted">Aucune session OCPI</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CdrsTab({ cdrs }: { cdrs: Record<string, unknown>[] }) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-elevated border-b border-border">
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">CDR ID</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Énergie</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Durée</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Coût</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Date</th>
            </tr>
          </thead>
          <tbody>
            {cdrs.map((c: Record<string, unknown>) => (
              <tr key={c.id as string} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{(c.cdr_id as string)?.substring(0, 12)}...</td>
                <td className="px-4 py-3 font-medium">{Number(c.total_energy).toFixed(2)} kWh</td>
                <td className="px-4 py-3">{Number(c.total_time).toFixed(1)}h</td>
                <td className="px-4 py-3 font-medium">{Number(c.total_cost).toFixed(2)} {c.currency as string}</td>
                <td className="px-4 py-3 text-xs">{new Date(c.start_date_time as string).toLocaleString("fr-FR")}</td>
              </tr>
            ))}
            {cdrs.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-foreground-muted">Aucun CDR</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TokensTab({ tokens }: { tokens: Record<string, unknown>[] }) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-elevated border-b border-border">
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">UID</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Type</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Issuer</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Contract</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Valid</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Whitelist</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t: Record<string, unknown>) => (
              <tr key={t.id as string} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{t.uid as string}</td>
                <td className="px-4 py-3">{t.type as string}</td>
                <td className="px-4 py-3">{t.issuer as string}</td>
                <td className="px-4 py-3 font-mono text-xs">{t.contract_id as string}</td>
                <td className="px-4 py-3">
                  {t.valid ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                </td>
                <td className="px-4 py-3 text-xs">{t.whitelist as string}</td>
              </tr>
            ))}
            {tokens.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-foreground-muted">Aucun token OCPI</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PushLogTab({ logs }: { logs: Record<string, unknown>[] }) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-elevated border-b border-border">
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Date</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Module</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Action</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Path</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Status</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Durée</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log: Record<string, unknown>) => (
              <tr key={log.id as string} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-xs">{new Date(log.created_at as string).toLocaleString("fr-FR")}</td>
                <td className="px-4 py-3 text-xs font-medium">{log.module as string}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded bg-primary/15 text-primary text-xs font-medium">
                    {log.action as string}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-foreground-muted truncate max-w-[200px]">
                  {log.ocpi_path as string}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      (log.response_status as number) >= 200 && (log.response_status as number) < 300
                        ? "bg-green-500/15 text-green-500"
                        : "bg-red-500/15 text-red-500"
                    }`}
                  >
                    {log.response_status as number}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-foreground-muted">{log.duration_ms as number}ms</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-foreground-muted">Aucun log de push OCPI</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
