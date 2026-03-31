// ============================================================
// EZDrive — CPO Overview Page
// Dashboard with KPIs, territory breakdown, power distribution
// ============================================================

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Radio,
  Wifi,
  AlertTriangle,
  CheckCircle2,
  Search,
  ChevronLeft,
  ChevronRight,
  MapPin,
  RotateCcw,
  Wrench,
  ExternalLink,
  Download,
  Check,
  X,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { useCpo } from "@/contexts/CpoContext";
import { cn } from "@/lib/utils";
import { KPICard } from "@/components/ui/KPICard";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageHelp } from "@/components/ui/PageHelp";
import { useOcppCommand } from "@/hooks/useOcppCommands";
import { useTranslation } from "react-i18next";

// ── Types ─────────────────────────────────────────────────────

interface StationRow {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  ocpp_status: string;
  is_online: boolean;
  last_synced_at: string | null;
  max_power_kw: number | null;
  territory_id: string | null;
  connectors: { id: string; type: string; status: string; max_power_kw: number }[];
}

interface TerritoryRow {
  id: string;
  name: string;
  code: string;
}

// ── Chart colors ──────────────────────────────────────────────

const CONNECTION_COLORS: Record<string, string> = {
  "En ligne": "#10b981",
  "Hors ligne": "#ef4444",
  Inconnu: "#6b7280",
};

const FRESHNESS_COLORS: Record<string, string> = {
  "< 15 min": "#10b981",
  "< 1h": "#3b82f6",
  "< 24h": "#f59e0b",
  "> 24h": "#ef4444",
  Jamais: "#6b7280",
};

const POWER_COLORS: Record<string, string> = {
  "AC lent (≤7 kW)": "#8b5cf6",
  "AC standard (≤22 kW)": "#3b82f6",
  "DC rapide (≤50 kW)": "#f59e0b",
  "DC ultra-rapide (>50 kW)": "#ef4444",
  "Non renseigné": "#6b7280",
};

const TABS = ["Vue d'ensemble", "Bornes en panne"] as const;
type Tab = (typeof TABS)[number];

const PAGE_SIZE = 15;

// ── Component ─────────────────────────────────────────────────

export function CpoOverviewPage() {
  const { t } = useTranslation();
  const { selectedCpoId } = useCpo();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ocppCommand = useOcppCommand();

  const [activeTab, setActiveTab] = useState<Tab>("Vue d'ensemble");
  const [faultedSearch, setFaultedSearch] = useState("");
  const [faultedPage, setFaultedPage] = useState(1);

  // Reset confirmation dialog
  const [resetConfirmId, setResetConfirmId] = useState<string | null>(null);
  // Intervention modal
  const [interventionStation, setInterventionStation] = useState<StationRow | null>(null);
  const [interventionForm, setInterventionForm] = useState({ title: "", description: "", category: "panne", priority: "medium" });
  // Acknowledge state — trigger re-renders
  const [, setAckTick] = useState(0);
  const forceAckRefresh = useCallback(() => setAckTick((t) => t + 1), []);

  // ── Fetch stations ────────────────────────────────────────

  const { data: stations, isLoading } = useQuery<StationRow[]>({
    queryKey: ["cpo-overview-stations", selectedCpoId ?? "all"],
    retry: false,
    queryFn: async () => {
      try {
        let query = supabase
          .from("stations")
          .select("id, name, address, city, ocpp_status, is_online, last_synced_at, max_power_kw, territory_id, connectors")
          .order("name");
        if (selectedCpoId) {
          query = query.eq("cpo_id", selectedCpoId);
        }
        const { data, error } = await query;
        if (error) {
          console.warn("[CpoOverview] stations query error:", error.message);
          return [];
        }
        return (data ?? []) as StationRow[];
      } catch {
        return [];
      }
    },
  });

  // ── Fetch territories ──────────────────────────────────────

  const { data: territories } = useQuery<TerritoryRow[]>({
    queryKey: ["territories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("territories")
        .select("id, name, code")
        .order("code");
      return (data ?? []) as TerritoryRow[];
    },
  });

  // ── Intervention mutation ─────────────────────────────────

  const createIntervention = useMutation({
    mutationFn: async (data: { title: string; description: string; station_id: string; category: string; priority: string }) => {
      const { error } = await supabase.from("interventions").insert({
        ...data,
        station_id: data.station_id || null,
        status: "pending",
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interventions-list"] });
      queryClient.invalidateQueries({ queryKey: ["intervention-detail"] });
      setInterventionStation(null);
      setInterventionForm({ title: "", description: "", category: "panne", priority: "medium" });
    },
  });

  // ── Acknowledge helpers ─────────────────────────────────────

  const isAcknowledged = useCallback((stationId: string) => {
    return !!localStorage.getItem(`ack-${stationId}`);
  }, []);

  const toggleAcknowledge = useCallback((stationId: string) => {
    const key = `ack-${stationId}`;
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, new Date().toISOString());
      // Clean up old acknowledgments (keep last 30 days)
      const ACK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
      try {
        const ackKeys = Object.keys(localStorage).filter(k => k.startsWith("ack-"));
        const now = Date.now();
        ackKeys.forEach(k => {
          const val = localStorage.getItem(k);
          if (val && now - new Date(val).getTime() > ACK_TTL_MS) {
            localStorage.removeItem(k);
          }
        });
      } catch { /* ignore */ }
    }
    forceAckRefresh();
  }, [forceAckRefresh]);

  // ── Reset handler ───────────────────────────────────────────

  const handleReset = useCallback((stationId: string) => {
    ocppCommand.mutate(
      { stationId, command: "Reset", params: { type: "Soft" } },
      { onSuccess: () => setResetConfirmId(null) }
    );
  }, [ocppCommand]);

  // ── Computed stats ────────────────────────────────────────

  const stats = useMemo(() => {
    if (!stations) return null;
    const total = stations.length;
    const online = stations.filter((s) => s.is_online).length;
    const charging = stations.filter((s) => s.ocpp_status === "Charging").length;
    const faulted = stations.filter((s) => s.ocpp_status === "Faulted").length;
    const available = stations.filter((s) => s.ocpp_status === "Available").length;
    const availabilityPct = total > 0 ? Math.round(((available + charging) / total) * 100) : 0;

    // Connection chart
    const connectionData = [
      { name: "En ligne", value: online },
      { name: "Hors ligne", value: total - online },
    ].filter((d) => d.value > 0);

    // Freshness of data (last_synced_at)
    const now = Date.now();
    const freshnessBuckets = { "< 15 min": 0, "< 1h": 0, "< 24h": 0, "> 24h": 0, Jamais: 0 };
    for (const s of stations) {
      if (!s.last_synced_at) {
        freshnessBuckets["Jamais"]++;
        continue;
      }
      const diffMin = (now - new Date(s.last_synced_at).getTime()) / 60000;
      if (diffMin < 15) freshnessBuckets["< 15 min"]++;
      else if (diffMin < 60) freshnessBuckets["< 1h"]++;
      else if (diffMin < 1440) freshnessBuckets["< 24h"]++;
      else freshnessBuckets["> 24h"]++;
    }
    const freshnessData = Object.entries(freshnessBuckets)
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0);

    // Power distribution
    const powerBuckets = {
      "AC lent (≤7 kW)": 0,
      "AC standard (≤22 kW)": 0,
      "DC rapide (≤50 kW)": 0,
      "DC ultra-rapide (>50 kW)": 0,
      "Non renseigné": 0,
    };
    for (const s of stations) {
      const p = s.max_power_kw;
      if (!p || p <= 0) powerBuckets["Non renseigné"]++;
      else if (p <= 7) powerBuckets["AC lent (≤7 kW)"]++;
      else if (p <= 22) powerBuckets["AC standard (≤22 kW)"]++;
      else if (p <= 50) powerBuckets["DC rapide (≤50 kW)"]++;
      else powerBuckets["DC ultra-rapide (>50 kW)"]++;
    }
    const powerData = Object.entries(powerBuckets)
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0);

    // Territory breakdown
    const territoryMap = new Map<string, { total: number; online: number; faulted: number; charging: number }>();
    for (const s of stations) {
      const tid = s.territory_id ?? "unknown";
      const prev = territoryMap.get(tid) ?? { total: 0, online: 0, faulted: 0, charging: 0 };
      prev.total++;
      if (s.is_online) prev.online++;
      if (s.ocpp_status === "Faulted") prev.faulted++;
      if (s.ocpp_status === "Charging") prev.charging++;
      territoryMap.set(tid, prev);
    }
    const territoryData = (territories ?? [])
      .map((t) => {
        const d = territoryMap.get(t.id);
        if (!d) return null;
        return {
          name: t.name,
          code: t.code,
          "En ligne": d.online,
          "Hors ligne": d.total - d.online,
          total: d.total,
          faulted: d.faulted,
          charging: d.charging,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b?.total ?? 0) - (a?.total ?? 0));

    // Faulted stations
    const faultedStations = stations.filter(
      (s) => s.ocpp_status === "Faulted"
    );

    return {
      total, online, charging, faulted, available, availabilityPct,
      connectionData, freshnessData, powerData, territoryData,
      faultedStations,
    };
  }, [stations, territories]);

  // ── Filtered faulted list ─────────────────────────────────

  const filteredFaulted = useMemo(() => {
    if (!stats) return [];
    const q = faultedSearch.toLowerCase();
    return stats.faultedStations.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.city ?? "").toLowerCase().includes(q) ||
        (s.address ?? "").toLowerCase().includes(q)
    );
  }, [stats, faultedSearch]);

  const totalFaultedPages = Math.max(1, Math.ceil(filteredFaulted.length / PAGE_SIZE));
  const pagedFaulted = filteredFaulted.slice((faultedPage - 1) * PAGE_SIZE, faultedPage * PAGE_SIZE);

  // ── CSV Export ──────────────────────────────────────────────

  const exportFaultedCSV = useCallback(() => {
    if (!filteredFaulted || filteredFaulted.length === 0) return;
    const headers = ["Nom", "Ville", "Adresse", "Puissance (kW)", "Dernier sync"];
    const rows = filteredFaulted.map((s) => [
      s.name,
      s.city ?? "",
      s.address ?? "",
      s.max_power_kw?.toString() ?? "",
      s.last_synced_at ? new Date(s.last_synced_at).toLocaleString("fr-FR") : "Jamais",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bornes-en-panne-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredFaulted]);

  // ── Loading ───────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">
          Vue d'ensemble CPO
        </h1>
        <p className="text-sm text-foreground-muted mt-1">
          État global du réseau de bornes de recharge
        </p>
      </div>

      <PageHelp
        summary="Vue d'ensemble de votre réseau de bornes — statuts, répartition géographique et puissance"
        items={[
          { label: "Disponibilité", description: "Pourcentage de bornes opérationnelles (statut Available ou Charging) sur le total du réseau." },
          { label: "En ligne", description: "Bornes connectées et communicantes (dernière synchronisation récente)." },
          { label: "En panne", description: "Bornes en statut Faulted — nécessitent une intervention technique." },
          { label: "Fraîcheur", description: "Délai depuis la dernière remontée de données (sync API ou heartbeat OCPP)." },
        ]}
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Bornes totales" value={stats?.total ?? 0} icon={Radio} color="#6366f1" />
        <KPICard label="En ligne" value={stats?.online ?? 0} icon={Wifi} color="#10b981" />
        <KPICard label="Disponibilité" value={`${stats?.availabilityPct ?? 0}%`} icon={CheckCircle2} color="#3b82f6" />
        <KPICard
          label="En panne"
          value={stats?.faulted ?? 0}
          icon={AlertTriangle}
          color="#ef4444"
          borderColor={stats?.faulted ? "border-red-500/30" : undefined}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors relative",
              activeTab === tab
                ? "text-primary"
                : "text-foreground-muted hover:text-foreground"
            )}
          >
            {tab}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "Vue d'ensemble" && stats && (
        <div className="space-y-6">
          {/* Row 1: Donut charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <DonutChart
              title="Connexion des bornes"
              data={stats.connectionData}
              colors={CONNECTION_COLORS}
            />
            <DonutChart
              title="Répartition par puissance"
              data={stats.powerData}
              colors={POWER_COLORS}
            />
            <DonutChart
              title="Fraîcheur des données"
              data={stats.freshnessData}
              colors={FRESHNESS_COLORS}
            />
          </div>

          {/* Row 2: Territory breakdown */}
          {stats.territoryData.length > 0 && (
            <div className="bg-surface border border-border rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-4 h-4 text-foreground-muted" />
                <h3 className="text-sm font-semibold text-foreground">Répartition par territoire</h3>
              </div>
              <ResponsiveContainer width="100%" height={Math.max(180, stats.territoryData.length * 50)}>
                <BarChart
                  data={stats.territoryData}
                  layout="vertical"
                  margin={{ top: 0, right: 30, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: "var(--color-foreground-muted)" }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 13, fill: "var(--color-foreground)" }}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "12px",
                      fontSize: "13px",
                    }}
                    formatter={(value: number, name: string) => [value, name]}
                  />
                  <Legend
                    verticalAlign="top"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: "12px", paddingBottom: "8px" }}
                  />
                  <Bar dataKey="En ligne" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Hors ligne" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {activeTab === "Bornes en panne" && (
        <div className="space-y-4">
          {/* Search + Export */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
              <input
                type="text"
                placeholder="Rechercher une borne en panne..."
                value={faultedSearch}
                onChange={(e) => { setFaultedSearch(e.target.value); setFaultedPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              />
            </div>
            <button
              onClick={exportFaultedCSV}
              disabled={filteredFaulted.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-surface border border-border rounded-xl hover:bg-surface-elevated disabled:opacity-40 transition-colors"
            >
              <Download className="w-4 h-4" />
              Exporter CSV
            </button>
          </div>

          {/* Faulted Table */}
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated/50">
                    <th className="text-left px-4 py-3 font-semibold text-foreground-muted">Statut</th>
                    <th className="text-left px-4 py-3 font-semibold text-foreground-muted">Nom</th>
                    <th className="text-left px-4 py-3 font-semibold text-foreground-muted">Ville</th>
                    <th className="text-left px-4 py-3 font-semibold text-foreground-muted">Adresse</th>
                    <th className="text-left px-4 py-3 font-semibold text-foreground-muted">Puissance</th>
                    <th className="text-left px-4 py-3 font-semibold text-foreground-muted">Dernier sync</th>
                    <th className="text-left px-4 py-3 font-semibold text-foreground-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedFaulted.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-foreground-muted">
                        {filteredFaulted.length === 0
                          ? "Aucune borne en panne"
                          : "Aucun résultat pour cette recherche"}
                      </td>
                    </tr>
                  ) : (
                    pagedFaulted.map((s) => {
                      const acked = isAcknowledged(s.id);
                      return (
                        <tr key={s.id} className="border-b border-border/50 hover:bg-surface-elevated/30 transition-colors">
                          {/* Acknowledge badge */}
                          <td className="px-4 py-3">
                            <button
                              onClick={() => toggleAcknowledge(s.id)}
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors",
                                acked
                                  ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                                  : "bg-red-500/10 text-red-600 hover:bg-red-500/20"
                              )}
                              title={acked ? "Marquer comme non vu" : "Marquer comme vu"}
                            >
                              {acked ? (
                                <><Check className="w-3 h-3" /> Vu</>
                              ) : (
                                "Nouveau"
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>
                          <td className="px-4 py-3 text-foreground-muted">{s.city ?? "—"}</td>
                          <td className="px-4 py-3 text-foreground-muted">{s.address ?? "—"}</td>
                          <td className="px-4 py-3 text-foreground-muted">{s.max_power_kw ? `${s.max_power_kw} kW` : "—"}</td>
                          <td className="px-4 py-3 text-foreground-muted">
                            {s.last_synced_at
                              ? new Date(s.last_synced_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                              : "Jamais"}
                          </td>
                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setResetConfirmId(s.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-600 rounded-lg hover:bg-amber-500/20 transition-colors"
                                title="Reset OCPP (Soft)"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Reset
                              </button>
                              <button
                                onClick={() => {
                                  setInterventionStation(s);
                                  setInterventionForm({
                                    title: `Panne — ${s.name}`,
                                    description: `Borne en statut Faulted. Ville : ${s.city ?? "N/A"}. Adresse : ${s.address ?? "N/A"}.`,
                                    category: "panne",
                                    priority: "medium",
                                  });
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-blue-500/10 text-blue-600 rounded-lg hover:bg-blue-500/20 transition-colors"
                                title="Créer une intervention"
                              >
                                <Wrench className="w-3 h-3" />
                                Intervention
                              </button>
                              <button
                                onClick={() => navigate(`/stations?station=${s.id}`)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-surface-elevated text-foreground-muted rounded-lg hover:bg-border transition-colors"
                                title="Voir le détail"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Détail
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalFaultedPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-xs text-foreground-muted">
                  {filteredFaulted.length} borne{filteredFaulted.length > 1 ? "s" : ""} en panne
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFaultedPage((p) => Math.max(1, p - 1))}
                    disabled={faultedPage === 1}
                    className="p-1.5 rounded-lg border border-border hover:bg-surface-elevated disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-foreground-muted">
                    {faultedPage} / {totalFaultedPages}
                  </span>
                  <button
                    onClick={() => setFaultedPage((p) => Math.min(totalFaultedPages, p + 1))}
                    disabled={faultedPage === totalFaultedPages}
                    className="p-1.5 rounded-lg border border-border hover:bg-surface-elevated disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Reset Confirmation Dialog ─────────────────────────── */}
      {resetConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold text-foreground mb-2">Confirmer le reset</h3>
            <p className="text-sm text-foreground-muted mb-5">
              Envoyer une commande <span className="font-mono text-xs bg-surface-elevated px-1.5 py-0.5 rounded">Soft Reset</span> OCPP à cette borne ?
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setResetConfirmId(null)}
                className="px-4 py-2 text-sm font-medium text-foreground-muted bg-surface border border-border rounded-xl hover:bg-surface-elevated transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => handleReset(resetConfirmId)}
                disabled={ocppCommand.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-xl hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {ocppCommand.isPending ? "Envoi..." : "Confirmer le reset"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Intervention Modal ─────────────────────────── */}
      {interventionStation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">Créer une intervention</h3>
              <button
                onClick={() => setInterventionStation(null)}
                className="p-1 rounded-lg hover:bg-surface-elevated transition-colors"
              >
                <X className="w-4 h-4 text-foreground-muted" />
              </button>
            </div>
            <p className="text-xs text-foreground-muted mb-4">
              Borne : <span className="font-medium text-foreground">{interventionStation.name}</span> — {interventionStation.city ?? "Ville inconnue"}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground-muted mb-1">Titre</label>
                <input
                  type="text"
                  value={interventionForm.title}
                  onChange={(e) => setInterventionForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-muted mb-1">Description</label>
                <textarea
                  value={interventionForm.description}
                  onChange={(e) => setInterventionForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground-muted mb-1">Catégorie</label>
                  <select
                    value={interventionForm.category}
                    onChange={(e) => setInterventionForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="panne">Panne</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="vandalisme">Vandalisme</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-muted mb-1">Priorité</label>
                  <select
                    value={interventionForm.priority}
                    onChange={(e) => setInterventionForm((f) => ({ ...f, priority: e.target.value }))}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="low">Basse</option>
                    <option value="medium">Moyenne</option>
                    <option value="high">Haute</option>
                    <option value="critical">Critique</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setInterventionStation(null)}
                className="px-4 py-2 text-sm font-medium text-foreground-muted bg-surface border border-border rounded-xl hover:bg-surface-elevated transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() =>
                  createIntervention.mutate({
                    title: interventionForm.title,
                    description: interventionForm.description,
                    station_id: interventionStation.id,
                    category: interventionForm.category,
                    priority: interventionForm.priority,
                  })
                }
                disabled={createIntervention.isPending || !interventionForm.title.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {createIntervention.isPending ? "Création..." : "Créer l'intervention"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Donut Chart Component ─────────────────────────────────────

function DonutChart({
  title,
  data,
  colors,
}: {
  title: string;
  data: { name: string; value: number }[];
  colors: Record<string, string>;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={colors[entry.name] ?? "#6b7280"} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "12px",
              fontSize: "13px",
            }}
            formatter={(value: number, name: string) => [
              `${value} (${total > 0 ? Math.round((value / total) * 100) : 0}%)`,
              name,
            ]}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
