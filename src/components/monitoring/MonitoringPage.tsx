// ============================================================
// EZDrive — Monitoring Page (split for performance)
// Main orchestrator — each tab is lazy-loaded
// ============================================================

import { useMemo, useState, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Wifi,
  WifiOff,
  Zap,
  Cpu,
  AlertTriangle,
  Clock,
  Server,
  Bell,
  Wrench,
  History,
  ClipboardList,
  Terminal,
  Gauge,
} from "lucide-react";
import { cn, formatDuration, formatRelativeTime } from "@/lib/utils";
import { useCpo } from "@/contexts/CpoContext";
import { useRecentAlerts } from "@/hooks/useStationAlerts";
import { KPICard } from "@/components/ui/KPICard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { KPISkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHelp } from "@/components/ui/PageHelp";
import { MaintenancePage } from "@/components/maintenance/MaintenancePage";
import { QuickActions } from "./QuickActions";
import { RefreshIndicator } from "@/components/shared/RefreshIndicator";
import { SyncButton } from "@/components/shared/SyncButton";
import {
  useMonitoringStations,
  useActiveTransactions,
  useChargepoints,
  heartbeatFresh,
  computeEnergy,
} from "./monitoring-shared";

// ── Lazy-loaded tabs (split from 2954-line monolith) ──────
const AlertsTab = lazy(() => import("./MonitoringAlertsTab"));
const AlertHistoryTab = lazy(() => import("./MonitoringHistoryTab"));
const InterventionsTab = lazy(() => import("./MonitoringInterventionsTab"));
const OcppLogsTab = lazy(() => import("./MonitoringOcppLogsTab"));
const CapacityTab = lazy(() => import("./MonitoringCapacityTab"));

// ── Tab loading fallback ──────────────────────────────────
function TabLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-xs text-foreground-muted">{t("common.loading")}</p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

type MonitoringTab = "realtime" | "alerts" | "history" | "maintenance" | "interventions" | "ocpp_logs" | "capacity";

const MONITORING_TABS: { key: MonitoringTab; labelKey: string; icon: typeof Activity }[] = [
  { key: "realtime", labelKey: "monitoring.realtime", icon: Activity },
  { key: "alerts", labelKey: "monitoring.alerts", icon: Bell },
  { key: "history", labelKey: "monitoring.history", icon: History },
  { key: "ocpp_logs", labelKey: "monitoring.ocppLogs", icon: Terminal },
  { key: "capacity", labelKey: "monitoring.capacity", icon: Gauge },
  { key: "maintenance", labelKey: "monitoring.maintenance", icon: Wrench },
  { key: "interventions", labelKey: "monitoring.interventions", icon: ClipboardList },
];

export function MonitoringPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<MonitoringTab>("realtime");
  const navigate = useNavigate();
  const { selectedCpoId } = useCpo();
  const {
    data: stations,
    isLoading: stationsLoading,
    isError: stationsError,
    refetch: refetchStations,
    dataUpdatedAt,
  } = useMonitoringStations(selectedCpoId);

  const {
    data: activeSessions,
    isLoading: sessionsLoading,
  } = useActiveTransactions();

  const {
    data: chargepoints,
    isLoading: chargepointsLoading,
  } = useChargepoints();

  const { data: recentAlerts } = useRecentAlerts(10);

  const isLoading = stationsLoading || sessionsLoading || chargepointsLoading;

  // KPI computations
  const kpis = useMemo(() => {
    if (!stations) return null;
    const online = stations.filter((s) => s.is_online).length;
    const offline = stations.filter((s) => !s.is_online).length;
    const faulted = stations.filter(
      (s) => s.ocpp_status === "Faulted" || s.ocpp_status === "Unavailable"
    ).length;
    return {
      online,
      offline,
      sessions: activeSessions?.length ?? 0,
      connectedCPs: chargepoints?.filter((cp) => cp.is_connected).length ?? 0,
      alerts: faulted,
    };
  }, [stations, activeSessions, chargepoints]);

  // Stations with alerts: faulted or offline, sorted by duration desc
  const alertStations = useMemo(() => {
    if (!stations) return [];
    return stations
      .filter(
        (s) =>
          !s.is_online ||
          s.ocpp_status === "Faulted" ||
          s.ocpp_status === "Unavailable"
      )
      .sort((a, b) => (b.hours_in_status ?? 0) - (a.hours_in_status ?? 0));
  }, [stations]);

  // ── Tab bar (shared across all states) ──
  const tabBar = (
    <div className="flex gap-1 border-b border-border">
      {MONITORING_TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors relative",
              isActive ? "text-primary" : "text-foreground-muted hover:text-foreground"
            )}
          >
            <Icon className="w-4 h-4" />
            {t(tab.labelKey)}
            {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
          </button>
        );
      })}
    </div>
  );

  // ── Tab header wrapper ──
  const renderTab = (subtitle: string, content: React.ReactNode) => (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-bold">{t("monitoring.title")}</h1>
          <p className="text-sm text-foreground-muted mt-1">{subtitle}</p>
        </div>
        <RefreshIndicator dataUpdatedAt={dataUpdatedAt} />
      </div>
      {tabBar}
      <Suspense fallback={<TabLoader />}>{content}</Suspense>
    </div>
  );

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-xl font-bold">{t("monitoring.title")}</h1>
          <p className="text-sm text-foreground-muted mt-1">{t("monitoring.description")}</p>
        </div>
        {tabBar}
        <KPISkeleton />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TableSkeleton rows={5} />
          <TableSkeleton rows={5} />
        </div>
        <TableSkeleton rows={6} />
      </div>
    );
  }

  // ── Error state ──
  if (stationsError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-xl font-bold">{t("monitoring.title")}</h1>
          <p className="text-sm text-foreground-muted mt-1">{t("monitoring.description")}</p>
        </div>
        {tabBar}
        <ErrorState
          message={t("monitoring.errorLoading")}
          onRetry={() => refetchStations()}
        />
      </div>
    );
  }

  // ── Lazy-loaded tabs ──
  if (activeTab === "alerts") return renderTab(t("monitoring.description"), <AlertsTab />);
  if (activeTab === "history") return renderTab(t("monitoring.historyDesc"), <AlertHistoryTab />);
  if (activeTab === "ocpp_logs") return renderTab(t("monitoring.ocppLogsDesc"), <OcppLogsTab />);
  if (activeTab === "capacity") return renderTab(t("monitoring.capacityDesc"), <CapacityTab />);
  if (activeTab === "maintenance") return renderTab(t("monitoring.description"), <MaintenancePage />);
  if (activeTab === "interventions") return renderTab(t("monitoring.interventionsDesc"), <InterventionsTab />);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="font-heading text-xl font-bold">{t("monitoring.title")}</h1>
            <p className="text-sm text-foreground-muted mt-1">
              {t("monitoring.description")}
            </p>
          </div>
          <SyncButton functionName="push-notify" label="Test Push" variant="small" body={{ user_id: "test", type: "charge_completed", variables: { station_name: "Test" } }} confirmMessage="Envoyer une notification push de test ?" />
        </div>
        <RefreshIndicator dataUpdatedAt={dataUpdatedAt} />
      </div>

      {tabBar}

      <PageHelp
        summary="Surveillance en temps réel des connexions et heartbeats OCPP de vos bornes"
        items={[
          { label: "Heartbeat", description: "Signal envoyé régulièrement par la borne pour confirmer qu'elle est connectée. Absence = borne déconnectée." },
          { label: "Connectivité", description: "Online (connecté au serveur OCPP), Offline (pas de signal depuis plus de 15 min)." },
          { label: "Dernière communication", description: "Date/heure du dernier message OCPP reçu de la borne." },
          { label: "Alertes", description: "Les bornes sans heartbeat depuis plus de 30 minutes sont signalées en rouge." },
        ]}
        tips={["Une borne offline n'est pas forcément en panne — vérifiez d'abord la connexion internet du site."]}
      />

      {/* ── Health overview KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard label={t("monitoring.stationsOnline")} value={kpis?.online ?? 0} icon={Wifi} color="#00D4AA" borderColor="border-status-available/30" />
        <KPICard label={t("monitoring.stationsOffline")} value={kpis?.offline ?? 0} icon={WifiOff} color="#FF6B6B" borderColor="border-status-faulted/30" />
        <KPICard label={t("monitoring.activeSessions")} value={kpis?.sessions ?? 0} icon={Zap} color="#4ECDC4" borderColor="border-status-charging/30" />
        <KPICard label={t("monitoring.connectedChargepoints")} value={kpis?.connectedCPs ?? 0} icon={Cpu} color="#3498DB" borderColor="border-[#3498DB]/30" />
        <div className="relative">
          {(kpis?.alerts ?? 0) > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-status-faulted rounded-full animate-pulse z-10" />
          )}
          <KPICard label={t("monitoring.activeAlerts")} value={kpis?.alerts ?? 0} icon={AlertTriangle} color="#FF6B6B" borderColor="border-status-faulted/30" />
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Bornes en alerte */}
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-status-faulted" />
            <h2 className="font-heading text-sm font-semibold">{t("monitoring.stationsInAlert")}</h2>
            <span className="ml-auto text-xs text-foreground-muted">
              {alertStations.length} borne{alertStations.length > 1 ? "s" : ""}
            </span>
          </div>

          {alertStations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-foreground-muted">
              <Activity className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">{t("monitoring.noActiveAlert")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-foreground-muted border-b border-border">
                    <th className="text-left font-medium px-4 py-2.5">{t("monitoring.station")}</th>
                    <th className="text-left font-medium px-4 py-2.5">{t("monitoring.city")}</th>
                    <th className="text-left font-medium px-4 py-2.5">{t("common.status")}</th>
                    <th className="text-left font-medium px-4 py-2.5">{t("monitoring.since")}</th>
                    <th className="text-left font-medium px-4 py-2.5">CPO</th>
                    <th className="text-left font-medium px-4 py-2.5">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {alertStations.slice(0, 15).map((station) => (
                    <tr key={station.id} className="hover:bg-surface-elevated/50 transition-colors">
                      <td className="px-4 py-3 font-medium truncate max-w-[180px]">
                        <button
                          onClick={() => navigate(`/stations?station=${station.id}`)}
                          className="text-primary hover:text-primary/80 hover:underline transition-colors text-left"
                        >
                          {station.name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-foreground-muted">{station.city ?? "--"}</td>
                      <td className="px-4 py-3"><StatusBadge status={station.ocpp_status} /></td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs font-medium", (station.hours_in_status ?? 0) >= 24 ? "text-danger" : (station.hours_in_status ?? 0) >= 6 ? "text-warning" : "text-foreground-muted")}>
                          {formatDuration(station.hours_in_status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground-muted text-xs">{station.cpo_name ?? "--"}</td>
                      <td className="px-4 py-3">
                        <QuickActions stationId={station.id} stationName={station.name} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Sessions en cours */}
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Zap className="w-4 h-4 text-status-charging" />
            <h2 className="font-heading text-sm font-semibold">{t("monitoring.activeSessions")}</h2>
            <span className="ml-auto text-xs text-foreground-muted">
              {activeSessions?.length ?? 0} session{(activeSessions?.length ?? 0) > 1 ? "s" : ""}
            </span>
          </div>

          {!activeSessions || activeSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-foreground-muted">
              <Zap className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">{t("sessions.noActiveSessions")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-foreground-muted border-b border-border">
                    <th className="text-left font-medium px-4 py-2.5">{t("monitoring.station")}</th>
                    <th className="text-left font-medium px-4 py-2.5">{t("monitoring.connector")}</th>
                    <th className="text-left font-medium px-4 py-2.5">{t("sessions.startTime")}</th>
                    <th className="text-right font-medium px-4 py-2.5">{t("sessions.energy")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activeSessions.slice(0, 15).map((tx) => (
                    <tr key={tx.id} className="hover:bg-surface-elevated/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground truncate max-w-[160px]">{tx.stations?.name ?? "--"}</p>
                        <p className="text-xs text-foreground-muted">{tx.stations?.city ?? ""}</p>
                      </td>
                      <td className="px-4 py-3 text-foreground-muted">#{tx.connector_id}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs text-foreground-muted">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(tx.started_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-status-charging font-semibold">{computeEnergy(tx)} kWh</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Chargepoints OCPP ── */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Server className="w-4 h-4 text-foreground-muted" />
          <h2 className="font-heading text-sm font-semibold">{t("monitoring.chargepointsOcpp")}</h2>
          <span className="ml-auto text-xs text-foreground-muted">
            {chargepoints?.length ?? 0} chargepoint{(chargepoints?.length ?? 0) > 1 ? "s" : ""}
          </span>
        </div>

        {!chargepoints || chargepoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-foreground-muted">
            <Cpu className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">{t("monitoring.noChargepoint")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-foreground-muted border-b border-border">
                  <th className="text-left font-medium px-4 py-2.5">Identity</th>
                  <th className="text-left font-medium px-4 py-2.5">{t("monitoring.model")}</th>
                  <th className="text-left font-medium px-4 py-2.5">{t("monitoring.firmwareVersion")}</th>
                  <th className="text-left font-medium px-4 py-2.5">{t("monitoring.lastHeartbeat")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {chargepoints.map((cp) => (
                  <tr key={cp.id} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground font-mono text-xs">{cp.identity}</td>
                    <td className="px-4 py-3 text-foreground-muted">
                      {cp.vendor ? `${cp.vendor} ${cp.model ?? ""}`.trim() : cp.model ?? "--"}
                    </td>
                    <td className="px-4 py-3">
                      {cp.firmware_version ? (
                        <span className="inline-flex items-center rounded-md bg-surface-elevated px-2 py-0.5 text-xs font-mono text-foreground-muted">{cp.firmware_version}</span>
                      ) : (
                        <span className="text-foreground-muted text-xs">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {cp.last_heartbeat_at ? (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className={cn("w-2 h-2 rounded-full", heartbeatFresh(cp.last_heartbeat_at) ? "bg-status-available" : "bg-status-faulted")} />
                          <span className={cn(heartbeatFresh(cp.last_heartbeat_at) ? "text-foreground" : "text-foreground-muted")}>
                            {formatRelativeTime(cp.last_heartbeat_at)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-foreground-muted text-xs">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Recent alerts widget ── */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Bell className="w-4 h-4 text-warning" />
          <h2 className="font-heading text-sm font-semibold">{t("monitoring.recentAlerts")}</h2>
          <span className="ml-auto text-xs text-foreground-muted">
            {recentAlerts?.length ?? 0} récente{(recentAlerts?.length ?? 0) > 1 ? "s" : ""}
          </span>
        </div>

        {!recentAlerts || recentAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-foreground-muted">
            <Bell className="w-6 h-6 mb-2 opacity-40" />
            <p className="text-sm">{t("monitoring.noRecentAlert")}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center gap-3 px-5 py-3 hover:bg-surface-elevated/50 transition-colors"
              >
                <span className="text-xs text-foreground-muted whitespace-nowrap min-w-[80px]">
                  {formatRelativeTime(alert.sent_at)}
                </span>
                <span className="text-sm font-medium text-foreground truncate">
                  {alert.details?.station_name ?? t("monitoring.unknownStation")}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                    alert.alert_type === "recovery"
                      ? "bg-status-available/15 text-status-available"
                      : alert.alert_type === "extended_outage"
                        ? "bg-danger/15 text-danger"
                        : alert.alert_type === "fault_threshold"
                          ? "bg-warning/15 text-warning"
                          : "bg-status-faulted/15 text-status-faulted"
                  )}
                >
                  {alert.alert_type === "disconnection"
                    ? "Déconnexion"
                    : alert.alert_type === "recovery"
                      ? "Rétabli"
                      : alert.alert_type === "extended_outage"
                        ? "Panne prolongée"
                        : alert.alert_type === "fault_threshold"
                          ? "Seuil dépassé"
                          : alert.alert_type}
                </span>
                {alert.details?.territory && (
                  <span className="ml-auto text-xs text-foreground-muted whitespace-nowrap">
                    {alert.details.territory}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
