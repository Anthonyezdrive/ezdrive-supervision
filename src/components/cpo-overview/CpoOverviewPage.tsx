// ============================================================
// EZDrive — CPO Overview Page
// Dashboard with donut charts for station/EVSE status overview
// ============================================================

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Radio,
  Wifi,
  Zap,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
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
  connectors: { id: string; type: string; status: string; max_power_kw: number }[];
}

// ── Chart colors ──────────────────────────────────────────────

const CONNECTION_COLORS: Record<string, string> = {
  "En ligne": "#10b981",
  "Hors ligne": "#ef4444",
  Inconnu: "#6b7280",
};

const EVSE_COLORS: Record<string, string> = {
  Available: "#10b981",
  Charging: "#3b82f6",
  Faulted: "#ef4444",
  Unavailable: "#f59e0b",
  Preparing: "#8b5cf6",
  Other: "#6b7280",
};

const LAST_OCPP_COLORS: Record<string, string> = {
  "< 4h": "#10b981",
  "< 24h": "#3b82f6",
  "< 30j": "#f59e0b",
  "> 30j": "#ef4444",
  Jamais: "#6b7280",
};

const TABS = ["Vue d'ensemble", "Bornes en panne"] as const;
type Tab = (typeof TABS)[number];

const PAGE_SIZE = 15;

// ── Component ─────────────────────────────────────────────────

export function CpoOverviewPage() {
  const { selectedCpoId } = useCpo();
  const [activeTab, setActiveTab] = useState<Tab>("Vue d'ensemble");
  const [faultedSearch, setFaultedSearch] = useState("");
  const [faultedPage, setFaultedPage] = useState(1);

  // ── Fetch stations ────────────────────────────────────────

  const { data: stations, isLoading } = useQuery<StationRow[]>({
    queryKey: ["cpo-overview-stations", selectedCpoId ?? "all"],
    retry: false,
    queryFn: async () => {
      try {
        let query = supabase
          .from("stations")
          .select("id, name, address, city, ocpp_status, is_online, last_synced_at, max_power_kw, connectors")
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

  // ── Computed stats ────────────────────────────────────────

  const stats = useMemo(() => {
    if (!stations) return null;
    const total = stations.length;
    const online = stations.filter((s) => s.is_online).length;
    const offline = stations.filter((s) => !s.is_online).length;
    const charging = stations.filter((s) => s.ocpp_status === "Charging").length;
    const faulted = stations.filter((s) => s.ocpp_status === "Faulted").length;

    // Connection chart
    const connectionData = [
      { name: "En ligne", value: online },
      { name: "Hors ligne", value: offline },
    ].filter((d) => d.value > 0);

    // EVSE status chart
    const evseMap: Record<string, number> = {};
    for (const s of stations) {
      if (s.connectors && Array.isArray(s.connectors)) {
        for (const c of s.connectors) {
          const st = c.status || "Unknown";
          const key = ["Available", "Charging", "Faulted", "Unavailable", "Preparing"].includes(st) ? st : "Other";
          evseMap[key] = (evseMap[key] || 0) + 1;
        }
      }
    }
    const evseData = Object.entries(evseMap)
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);

    // Last OCPP communication
    const now = Date.now();
    const lastOcppBuckets = { "< 4h": 0, "< 24h": 0, "< 30j": 0, "> 30j": 0, Jamais: 0 };
    for (const s of stations) {
      if (!s.last_synced_at) {
        lastOcppBuckets["Jamais"]++;
        continue;
      }
      const diffH = (now - new Date(s.last_synced_at).getTime()) / 3600000;
      if (diffH < 4) lastOcppBuckets["< 4h"]++;
      else if (diffH < 24) lastOcppBuckets["< 24h"]++;
      else if (diffH < 720) lastOcppBuckets["< 30j"]++;
      else lastOcppBuckets["> 30j"]++;
    }
    const lastOcppData = Object.entries(lastOcppBuckets)
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0);

    // Faulted stations
    const faultedStations = stations.filter(
      (s) => s.ocpp_status === "Faulted"
    );

    return { total, online, charging, faulted, connectionData, evseData, lastOcppData, faultedStations };
  }, [stations]);

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
        summary="Vue d'ensemble de votre activité CPO (Charge Point Operator) en roaming"
        items={[
          { label: "CPO", description: "Charge Point Operator — vous, en tant qu'opérateur qui gère les bornes physiques." },
          { label: "Sessions roaming", description: "Charges effectuées sur vos bornes par des clients d'autres opérateurs." },
          { label: "Revenus roaming", description: "Facturation aux eMSP partenaires pour l'utilisation de vos bornes par leurs clients." },
          { label: "Taux d'occupation", description: "Pourcentage de vos sessions provenant de clients en roaming vs clients directs." },
        ]}
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Bornes totales" value={stats?.total ?? 0} icon={Radio} color="#6366f1" />
        <KPICard label="En ligne" value={stats?.online ?? 0} icon={Wifi} color="#10b981" />
        <KPICard label="En charge" value={stats?.charging ?? 0} icon={Zap} color="#3b82f6" />
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Connection Chart */}
          <DonutChart
            title="Connexion des bornes"
            data={stats.connectionData}
            colors={CONNECTION_COLORS}
          />

          {/* EVSE Status Chart */}
          <DonutChart
            title="État EVSE"
            data={stats.evseData}
            colors={EVSE_COLORS}
          />

          {/* Last OCPP Chart */}
          <DonutChart
            title="Dernière communication OCPP"
            data={stats.lastOcppData}
            colors={LAST_OCPP_COLORS}
          />
        </div>
      )}

      {activeTab === "Bornes en panne" && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
            <input
              type="text"
              placeholder="Rechercher une borne en panne..."
              value={faultedSearch}
              onChange={(e) => { setFaultedSearch(e.target.value); setFaultedPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
            />
          </div>

          {/* Faulted Table */}
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated/50">
                    <th className="text-left px-4 py-3 font-semibold text-foreground-muted">Nom</th>
                    <th className="text-left px-4 py-3 font-semibold text-foreground-muted">Ville</th>
                    <th className="text-left px-4 py-3 font-semibold text-foreground-muted">Adresse</th>
                    <th className="text-left px-4 py-3 font-semibold text-foreground-muted">Puissance</th>
                    <th className="text-left px-4 py-3 font-semibold text-foreground-muted">Dernier sync</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedFaulted.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-foreground-muted">
                        {filteredFaulted.length === 0
                          ? "Aucune borne en panne 🎉"
                          : "Aucun résultat pour cette recherche"}
                      </td>
                    </tr>
                  ) : (
                    pagedFaulted.map((s) => (
                      <tr key={s.id} className="border-b border-border/50 hover:bg-surface-elevated/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>
                        <td className="px-4 py-3 text-foreground-muted">{s.city ?? "—"}</td>
                        <td className="px-4 py-3 text-foreground-muted">{s.address ?? "—"}</td>
                        <td className="px-4 py-3 text-foreground-muted">{s.max_power_kw ? `${s.max_power_kw} kW` : "—"}</td>
                        <td className="px-4 py-3 text-foreground-muted">
                          {s.last_synced_at
                            ? new Date(s.last_synced_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                            : "Jamais"}
                        </td>
                      </tr>
                    ))
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
