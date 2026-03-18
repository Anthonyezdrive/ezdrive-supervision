import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCpo } from "@/contexts/CpoContext";
import {
  BatteryCharging,
  Zap,
  Clock,
  AlertTriangle,
  Settings,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHelp } from "@/components/ui/PageHelp";

// ============================================================
// Smart Charging — OCPP Smart Charging Profiles Management
// ============================================================

export function SmartChargingPage() {
  const { selectedCpoId } = useCpo();
  const [activeTab, setActiveTab] = useState<"profiles" | "commands">("profiles");

  // ── Resolve station IDs and chargepoint IDs for selected CPO ──
  const { data: cpoFilterIds } = useQuery({
    queryKey: ["smart-charging-cpo-filter-ids", selectedCpoId ?? "all"],
    enabled: !!selectedCpoId,
    queryFn: async () => {
      const { data: stns } = await supabase.from("stations").select("id").eq("cpo_id", selectedCpoId!);
      const stationIds = (stns ?? []).map((s: { id: string }) => s.id);
      if (stationIds.length === 0) return { stationIds: [], chargepointIds: [] };
      const { data: cps } = await supabase.from("ocpp_chargepoints").select("id").in("station_id", stationIds);
      return { stationIds, chargepointIds: (cps ?? []).map((c: { id: string }) => c.id) };
    },
    staleTime: 60000,
  });

  // Fetch chargepoints with their status
  const { data: chargepoints, isLoading: cpLoading } = useQuery({
    queryKey: ["smart-charging-chargepoints", selectedCpoId ?? "all"],
    retry: false,
    queryFn: async () => {
      try {
        if (selectedCpoId && cpoFilterIds?.stationIds.length === 0) return [];
        let query = supabase
          .from("ocpp_chargepoints")
          .select("*")
          .order("last_heartbeat_at", { ascending: false });
        if (selectedCpoId && cpoFilterIds?.stationIds.length) {
          query = query.in("station_id", cpoFilterIds.stationIds);
        }
        const { data, error } = await query;
        if (error) { console.warn("[SmartCharging] ocpp_chargepoints:", error.message); return []; }
        return data ?? [];
      } catch { return []; }
    },
  });

  // Fetch active transactions for current load
  const { data: activeSessions } = useQuery({
    queryKey: ["smart-charging-sessions", selectedCpoId ?? "all"],
    retry: false,
    queryFn: async () => {
      try {
        if (selectedCpoId && cpoFilterIds?.chargepointIds.length === 0) return [];
        let query = supabase
          .from("ocpp_transactions")
          .select("*, stations(name, city, max_power_kw)")
          .eq("status", "Active")
          .order("started_at", { ascending: false });
        if (selectedCpoId && cpoFilterIds?.chargepointIds.length) {
          query = query.in("chargepoint_id", cpoFilterIds.chargepointIds);
        }
        const { data, error } = await query;
        if (error) { console.warn("[SmartCharging] ocpp_transactions:", error.message); return []; }
        return data ?? [];
      } catch { return []; }
    },
    refetchInterval: 15000,
  });

  // Fetch feature toggle status
  const { data: toggleEnabled } = useQuery({
    queryKey: ["smart-charging-toggle"],
    retry: false,
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from("feature_toggles")
          .select("enabled")
          .eq("key", "enable_smart_charging")
          .maybeSingle();
        return data?.enabled ?? false;
      } catch { return false; }
    },
  });

  // Fetch command history
  // TODO: ocpp_command_queue uses chargepoint_identity (string), not chargepoint_id (UUID) — filtering by CPO would require resolving identities
  const { data: commands } = useQuery({
    queryKey: ["smart-charging-commands"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("ocpp_command_queue")
          .select("*")
          .in("command", ["SetChargingProfile", "ClearChargingProfile", "GetCompositeSchedule"])
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) { console.warn("[SmartCharging] ocpp_command_queue:", error.message); return []; }
        return data ?? [];
      } catch { return []; }
    },
  });

  const connectedCount = chargepoints?.filter((cp: { is_connected: boolean }) => cp.is_connected).length ?? 0;
  const totalPower = activeSessions?.reduce((sum: number, s: { stations?: { max_power_kw?: number } }) =>
    sum + (s.stations?.max_power_kw ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">
            Smart Charging
          </h1>
          <p className="text-sm text-foreground-muted mt-1">
            Gestion intelligente de la charge OCPP
          </p>
        </div>
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium",
          toggleEnabled
            ? "bg-primary/10 text-primary border border-primary/20"
            : "bg-danger/10 text-danger border border-danger/20"
        )}>
          <div className={cn(
            "w-2 h-2 rounded-full",
            toggleEnabled ? "bg-primary animate-pulse-dot" : "bg-danger"
          )} />
          {toggleEnabled ? "Actif" : "Désactivé"}
        </div>
      </div>

      <PageHelp
        summary="Gestion intelligente de la puissance de charge pour optimiser votre consommation"
        items={[
          { label: "Profils de charge", description: "Définissez des limites de puissance par tranche horaire pour éviter les dépassements." },
          { label: "Load balancing", description: "Répartition automatique de la puissance disponible entre les bornes actives." },
          { label: "Pics de consommation", description: "Visualisez les pics pour ajuster vos profils et réduire votre facture électrique." },
          { label: "Planification", description: "Programmez des restrictions horaires (ex: réduire la puissance aux heures de pointe)." },
        ]}
        tips={["Le smart charging nécessite des bornes compatibles OCPP Smart Charging (profil 2.0+)."]}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={BatteryCharging}
          label="Chargepoints connectés"
          value={connectedCount}
          total={chargepoints?.length ?? 0}
          color="#00D4AA"
        />
        <KpiCard
          icon={Zap}
          label="Sessions actives"
          value={activeSessions?.length ?? 0}
          color="#4ECDC4"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Puissance totale"
          value={`${totalPower} kW`}
          color="#F39C12"
        />
        <KpiCard
          icon={Clock}
          label="Commandes envoyées"
          value={commands?.length ?? 0}
          color="#8892B0"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 w-fit">
        {(["profiles", "commands"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-all",
              activeTab === tab
                ? "bg-primary/10 text-primary"
                : "text-foreground-muted hover:text-foreground"
            )}
          >
            {tab === "profiles" ? "Chargepoints" : "Historique commandes"}
          </button>
        ))}
      </div>

      {activeTab === "profiles" ? (
        <ChargepointGrid
          chargepoints={chargepoints ?? []}
          activeSessions={activeSessions ?? []}
          isLoading={cpLoading}
        />
      ) : (
        <CommandHistory commands={commands ?? []} />
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  total,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string | number;
  total?: number;
  color: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <p className="text-lg font-heading font-bold text-foreground">
          {value}
          {total !== undefined && (
            <span className="text-sm text-foreground-muted font-normal">
              {" "}/ {total}
            </span>
          )}
        </p>
        <p className="text-xs text-foreground-muted">{label}</p>
      </div>
    </div>
  );
}

// ── Chargepoint Grid ──────────────────────────────────────

function ChargepointGrid({
  chargepoints,
  activeSessions,
  isLoading,
}: {
  chargepoints: Array<{
    id: string;
    chargepoint_identity: string;
    model: string | null;
    vendor: string | null;
    firmware_version: string | null;
    is_connected: boolean;
    last_heartbeat_at: string | null;
    connector_count: number | null;
  }>;
  activeSessions: Array<{
    chargepoint_id: string;
    connector_id: number;
    energy_kwh: number | null;
    started_at: string;
  }>;
  isLoading: boolean;
}) {
  const [_expanded] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-xl p-4 h-32 animate-shimmer" />
        ))}
      </div>
    );
  }

  if (!chargepoints.length) {
    return (
      <div className="bg-surface border border-border rounded-xl p-12 text-center">
        <BatteryCharging className="w-12 h-12 text-foreground-muted/30 mx-auto mb-3" />
        <p className="text-foreground-muted">Aucun chargepoint connecté</p>
        <p className="text-sm text-foreground-muted/60 mt-1">
          Les bornes apparaîtront ici une fois connectées via OCPP
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {chargepoints.map((cp) => {
        const sessions = activeSessions.filter((s) => s.chargepoint_id === cp.chargepoint_identity);

        return (
          <div
            key={cp.id}
            className={cn(
              "bg-surface border rounded-xl overflow-hidden transition-all",
              cp.is_connected ? "border-border hover:border-primary/30" : "border-border opacity-60"
            )}
          >
            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-foreground font-heading">
                    {cp.chargepoint_identity}
                  </p>
                  <p className="text-xs text-foreground-muted mt-0.5">
                    {cp.vendor ?? "Unknown"} {cp.model ?? ""}
                  </p>
                </div>
                <div className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium",
                  cp.is_connected
                    ? "bg-primary/10 text-primary"
                    : "bg-status-offline/10 text-status-offline"
                )}>
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    cp.is_connected ? "bg-primary animate-pulse-dot" : "bg-status-offline"
                  )} />
                  {cp.is_connected ? "Connecté" : "Déconnecté"}
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-foreground-muted">
                <span>FW: {cp.firmware_version ?? "N/A"}</span>
                <span>{cp.connector_count ?? "?"} connecteur(s)</span>
              </div>

              {sessions.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-status-charging font-medium mb-1">
                    {sessions.length} session(s) active(s)
                  </p>
                  {sessions.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-foreground-muted mt-1">
                      <span>Connecteur {s.connector_id}</span>
                      <span className="text-status-charging">{(s.energy_kwh ?? 0).toFixed(1)} kWh</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cp.is_connected && (
              <div className="border-t border-border bg-surface-elevated/50 px-4 py-2 flex gap-2">
                <button className="flex items-center gap-1 text-[10px] text-foreground-muted hover:text-primary transition-colors">
                  <Settings className="w-3 h-3" />
                  Profil
                </button>
                <button className="flex items-center gap-1 text-[10px] text-foreground-muted hover:text-primary transition-colors">
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Command History ───────────────────────────────────────

function CommandHistory({
  commands,
}: {
  commands: Array<{
    id: string;
    chargepoint_identity: string;
    command: string;
    payload: unknown;
    status: string;
    result: unknown;
    created_at: string;
    executed_at: string | null;
  }>;
}) {
  if (!commands.length) {
    return (
      <div className="bg-surface border border-border rounded-xl p-12 text-center">
        <Clock className="w-12 h-12 text-foreground-muted/30 mx-auto mb-3" />
        <p className="text-foreground-muted">Aucune commande Smart Charging</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: "bg-warning/10 text-warning",
    sent: "bg-status-charging/10 text-status-charging",
    accepted: "bg-primary/10 text-primary",
    rejected: "bg-danger/10 text-danger",
    timeout: "bg-status-offline/10 text-status-offline",
  };

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Chargepoint</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Commande</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Statut</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Créé le</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Exécuté le</th>
            </tr>
          </thead>
          <tbody>
            {commands.map((cmd) => (
              <tr key={cmd.id} className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-foreground">
                  {cmd.chargepoint_identity}
                </td>
                <td className="px-4 py-3 text-foreground">
                  <span className="px-2 py-0.5 bg-surface-elevated rounded text-xs">
                    {cmd.command}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={cn(
                    "px-2 py-0.5 rounded text-xs font-medium",
                    statusColors[cmd.status] ?? "bg-surface-elevated text-foreground-muted"
                  )}>
                    {cmd.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-foreground-muted">
                  {new Date(cmd.created_at).toLocaleString("fr-FR")}
                </td>
                <td className="px-4 py-3 text-xs text-foreground-muted">
                  {cmd.executed_at
                    ? new Date(cmd.executed_at).toLocaleString("fr-FR")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
