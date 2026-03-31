import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useOutletContext } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, Legend,
  AreaChart, Area,
} from "recharts";
import {
  Clock, Zap, Euro, GitCompareArrows,
  CreditCard, FileDown, TrendingUp, TrendingDown,
  Leaf, BarChart3, Activity, MapPin,
} from "lucide-react";
import { PageHelp } from "@/components/ui/PageHelp";
import { ExportButtons } from "./ExportButtons";
import { useB2BCdrs, useB2BCdrsPrevYear } from "@/hooks/useB2BCdrs";
import { useB2BFilters } from "@/contexts/B2BFilterContext";
import {
  computeKPIs, groupByMonth, formatDuration,
  formatNumber, formatEUR, getLocationName, computeCO2Evite,
} from "@/lib/b2b-formulas";
import { exportCSV, exportPDF } from "@/lib/b2b-export";
import type { B2BClient } from "@/types/b2b";

const MONTH_SHORT = [
  "Jan", "Fév", "Mars", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sept", "Oct", "Nov", "Déc",
];

const ACCENT = "#9ACC0E";
const ACCENT_BLUE = "#3B82F6";
const BAR_COLOR_PREV = "#4A5568";

const tooltipStyle = {
  backgroundColor: "#111638",
  border: "1px solid #2A2F5A",
  borderRadius: "12px",
  color: "#F7F9FC",
  fontSize: "12px",
};

type ChartMode = "ca" | "volume" | "sessions";

export function B2BOverviewPage() {
  const { t } = useTranslation();
  const { activeClient, customerExternalIds } =
    useOutletContext<{ activeClient: B2BClient | null; customerExternalIds: string[] }>();
  const { year } = useB2BFilters();

  const [showComparison, setShowComparison] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>("ca");

  const { data: cdrs, isLoading } = useB2BCdrs(customerExternalIds);
  const { data: prevCdrs } = useB2BCdrsPrevYear(customerExternalIds, showComparison);

  const allData = cdrs ?? [];

  // Core KPIs
  const totalSessions = allData.length;
  const caRetail = useMemo(
    () => allData.reduce((sum, c) => sum + (c.total_retail_cost ?? 0), 0), [allData]
  );
  const totalEnergy = useMemo(
    () => allData.reduce((sum, c) => sum + (c.total_energy ?? 0), 0), [allData]
  );
  const totalDuration = useMemo(
    () => allData.reduce((sum, c) => sum + (c.total_time ?? 0), 0), [allData]
  );
  const co2Saved = useMemo(() => computeCO2Evite(totalEnergy), [totalEnergy]);

  // Monthly trend (compare last 2 months with data)
  const monthlyTrend = useMemo(() => {
    const byMonth = new Map<number, { ca: number; sessions: number; energy: number }>();
    for (const c of allData) {
      const m = new Date(c.start_date_time).getMonth();
      const entry = byMonth.get(m) ?? { ca: 0, sessions: 0, energy: 0 };
      entry.ca += c.total_retail_cost ?? 0;
      entry.sessions += 1;
      entry.energy += c.total_energy ?? 0;
      byMonth.set(m, entry);
    }
    const sorted = [...byMonth.entries()].sort((a, b) => b[0] - a[0]);
    if (sorted.length < 2) return null;
    const [latest, prev] = sorted;
    const caPct = prev[1].ca > 0 ? ((latest[1].ca - prev[1].ca) / prev[1].ca) * 100 : 0;
    const sessPct = prev[1].sessions > 0 ? ((latest[1].sessions - prev[1].sessions) / prev[1].sessions) * 100 : 0;
    const energyPct = prev[1].energy > 0 ? ((latest[1].energy - prev[1].energy) / prev[1].energy) * 100 : 0;
    return { ca: caPct, sessions: sessPct, energy: energyPct, latestMonth: MONTH_SHORT[latest[0]] };
  }, [allData]);

  // Top 5 stations by revenue
  const topStations = useMemo(() => {
    const map = new Map<string, { ca: number; sessions: number; energy: number }>();
    for (const c of allData) {
      const name = getLocationName(c);
      if (name === "Inconnu") continue;
      const entry = map.get(name) ?? { ca: 0, sessions: 0, energy: 0 };
      entry.ca += c.total_retail_cost ?? 0;
      entry.sessions += 1;
      entry.energy += c.total_energy ?? 0;
      map.set(name, entry);
    }
    return [...map.entries()]
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 5);
  }, [allData]);

  // Monthly CA for sparkline
  const monthlySparkline = useMemo(() => {
    const arr = Array.from({ length: 12 }, (_, i) => ({ month: i, ca: 0, sessions: 0, energy: 0 }));
    for (const c of allData) {
      const m = new Date(c.start_date_time).getMonth();
      arr[m].ca += c.total_retail_cost ?? 0;
      arr[m].sessions += 1;
      arr[m].energy += c.total_energy ?? 0;
    }
    return arr.filter(d => d.ca > 0 || d.sessions > 0);
  }, [allData]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface border border-border rounded-2xl p-6 h-[140px] animate-pulse" />
          ))}
        </div>
        <div className="bg-surface border border-border rounded-2xl p-6 h-[380px] animate-pulse" />
      </div>
    );
  }

  const rate = activeClient?.redevance_rate ?? 0.33;
  const kpis = computeKPIs(allData, rate);
  const monthlyData = groupByMonth(allData, rate);

  // Previous year for comparison
  const prevMonthlyData = showComparison && prevCdrs ? groupByMonth(prevCdrs, rate) : null;
  const prevMonthMap = new Map(prevMonthlyData?.map((m) => [m.month, m]) ?? []);

  const chartDataKey = chartMode === "ca" ? "ca" : chartMode === "volume" ? "volume" : "sessions";
  const chartColor = chartMode === "ca" ? ACCENT : chartMode === "volume" ? ACCENT_BLUE : "#8B5CF6";

  const chartData = monthlyData.map((m) => {
    return {
      name: MONTH_SHORT[m.month - 1],
      ca: Math.round(allData.filter(c => new Date(c.start_date_time).getMonth() === m.month - 1).reduce((s, c) => s + (c.total_retail_cost ?? 0), 0)),
      volume: Math.round(m.volume),
      sessions: allData.filter(c => new Date(c.start_date_time).getMonth() === m.month - 1).length,
      ...(showComparison ? {
        caPrev: Math.round((prevCdrs ?? []).filter(c => new Date(c.start_date_time).getMonth() === m.month - 1).reduce((s, c) => s + (c.total_retail_cost ?? 0), 0)),
        volumePrev: Math.round(prevMonthMap.get(m.month)?.volume ?? 0),
        sessionsPrev: (prevCdrs ?? []).filter(c => new Date(c.start_date_time).getMonth() === m.month - 1).length,
      } : {}),
    };
  });

  const clientName = activeClient?.name ?? "B2B";

  const handleExportCSV = () => {
    const rows = monthlyData.map((m) => ({
      mois: MONTH_SHORT[m.month - 1],
      volume: formatNumber(m.volume),
      duree: formatDuration(m.duration),
      redevance: formatEUR(m.redevance),
    }));
    exportCSV(rows, [
      { key: "mois", label: "Mois" },
      { key: "volume", label: "Volume (kWh)" },
      { key: "duree", label: "Duree" },
      { key: "redevance", label: "Chiffre d'Affaires (EUR)" },
    ], `rapport-overview-${clientName}-${year}.csv`);
  };

  const handleExportPDF = () => {
    const rows = monthlyData.map((m) => ({
      mois: MONTH_SHORT[m.month - 1],
      volume: formatNumber(m.volume),
      duree: formatDuration(m.duration),
      redevance: formatEUR(m.redevance),
    }));
    exportPDF(
      `Vue d'ensemble — ${clientName}`,
      `Annee ${year}`,
      [
        { key: "mois", label: "Mois", width: 2 },
        { key: "volume", label: "Volume (kWh)", align: "right", width: 2 },
        { key: "duree", label: "Duree", align: "right", width: 2 },
        { key: "redevance", label: "Chiffre d'Affaires", align: "right", width: 2 },
      ],
      rows,
      `rapport-overview-${clientName}-${year}.pdf`,
      {
        kpis: [
          { label: "Duree totale", value: formatDuration(kpis.totalTime) },
          { label: "Volume total", value: `${formatNumber(kpis.totalEnergy)} kWh` },
          { label: "Chiffre d'Affaires", value: formatEUR(kpis.redevance) },
        ],
        totalsRow: {
          mois: "TOTAL",
          volume: formatNumber(kpis.totalEnergy),
          duree: formatDuration(kpis.totalTime),
          redevance: formatEUR(kpis.redevance),
        },
      }
    );
  };

  // Trend badge helper
  const TrendBadge = ({ value, suffix = t("b2b.vsPrevMonth") }: { value: number | null; suffix?: string }) => {
    if (value == null || !isFinite(value)) return null;
    const isUp = value >= 0;
    return (
      <div className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium",
        isUp ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
      )}>
        {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {isUp ? "+" : ""}{value.toFixed(1)}% {suffix}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Export buttons */}
      <div className="flex items-center justify-between">
        <div />
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-elevated border border-border rounded-lg text-xs font-medium text-foreground-muted hover:text-foreground hover:bg-surface transition-colors"
          >
            <FileDown className="w-3.5 h-3.5" />
            {t("b2b.downloadInvoice")}
          </button>
          <ExportButtons onCSV={handleExportCSV} onPDF={handleExportPDF} />
        </div>
      </div>

      <PageHelp
        summary={t("b2b.overviewHelpSummary")}
        items={[
          { label: t("b2b.revenue"), description: t("b2b.revenueGenerated") },
          { label: t("b2b.volumeMwh"), description: t("b2b.volumeMwhDesc") },
          { label: t("b2b.sessionsCount"), description: t("b2b.sessionsCountDesc") },
          { label: t("b2b.co2Avoided"), description: t("b2b.co2AvoidedDesc") },
        ]}
        tips={[t("b2b.dataUpdatedDaily")]}
      />

      {/* ═══ Hero KPIs ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* CA Retail — primary */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#9ACC0E]/10 via-surface to-surface border border-[#9ACC0E]/20 rounded-2xl p-6">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#9ACC0E]/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#9ACC0E]/10">
                <Euro className="w-5 h-5 text-[#9ACC0E]" />
              </div>
              <span className="text-sm font-medium text-foreground-muted">{t("b2b.revenue")}</span>
            </div>
            <p className="text-3xl font-heading font-bold text-foreground mb-1">
              {formatEUR(caRetail)}
            </p>
            <div className="flex items-center gap-2">
              {monthlyTrend && <TrendBadge value={monthlyTrend.ca} />}
            </div>
            {/* Mini sparkline */}
            {monthlySparkline.length > 1 && (
              <div className="mt-3 -mx-1">
                <ResponsiveContainer width="100%" height={40}>
                  <AreaChart data={monthlySparkline}>
                    <defs>
                      <linearGradient id="sparkGreen" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#9ACC0E" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#9ACC0E" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="ca" stroke="#9ACC0E" fill="url(#sparkGreen)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Volume total */}
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-500/10 via-surface to-surface border border-blue-500/20 rounded-2xl p-6">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/10">
                <Zap className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-sm font-medium text-foreground-muted">Énergie délivrée</span>
            </div>
            <p className="text-3xl font-heading font-bold text-foreground mb-1">
              {totalEnergy > 1000 ? `${formatNumber(totalEnergy / 1000)} MWh` : `${formatNumber(totalEnergy)} kWh`}
            </p>
            <div className="flex items-center gap-2">
              {monthlyTrend && <TrendBadge value={monthlyTrend.energy} />}
            </div>
            {monthlySparkline.length > 1 && (
              <div className="mt-3 -mx-1">
                <ResponsiveContainer width="100%" height={40}>
                  <AreaChart data={monthlySparkline}>
                    <defs>
                      <linearGradient id="sparkBlue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="energy" stroke="#3B82F6" fill="url(#sparkBlue)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Sessions */}
        <div className="relative overflow-hidden bg-gradient-to-br from-violet-500/10 via-surface to-surface border border-violet-500/20 rounded-2xl p-6">
          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-violet-500/10">
                <Activity className="w-5 h-5 text-violet-400" />
              </div>
              <span className="text-sm font-medium text-foreground-muted">Sessions de recharge</span>
            </div>
            <p className="text-3xl font-heading font-bold text-foreground mb-1">
              {totalSessions.toLocaleString("fr-FR")}
            </p>
            <div className="flex items-center gap-2">
              {monthlyTrend && <TrendBadge value={monthlyTrend.sessions} />}
            </div>
            {monthlySparkline.length > 1 && (
              <div className="mt-3 -mx-1">
                <ResponsiveContainer width="100%" height={40}>
                  <AreaChart data={monthlySparkline}>
                    <defs>
                      <linearGradient id="sparkViolet" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="sessions" stroke="#8B5CF6" fill="url(#sparkViolet)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Secondary KPIs: Duration + CO2 ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-cyan-500/10 shrink-0">
            <Clock className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <p className="text-xl font-heading font-bold text-foreground">{formatDuration(totalDuration)}</p>
            <p className="text-xs text-foreground-muted">Durée totale de charge</p>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500/10 shrink-0">
            <Zap className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-xl font-heading font-bold text-foreground">
              {formatNumber(totalSessions > 0 ? totalEnergy / totalSessions : 0)} kWh
            </p>
            <p className="text-xs text-foreground-muted">Moyenne / session</p>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/10 shrink-0">
            <Leaf className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-xl font-heading font-bold text-foreground">
              {co2Saved > 1000 ? `${formatNumber(co2Saved / 1000)} t` : `${formatNumber(co2Saved)} kg`}
            </p>
            <p className="text-xs text-foreground-muted">CO₂ évité</p>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-500/10 shrink-0">
            <CreditCard className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <p className="text-xl font-heading font-bold text-foreground">
              {formatEUR(totalSessions > 0 ? caRetail / totalSessions : 0)}
            </p>
            <p className="text-xs text-foreground-muted">CA moyen / session</p>
          </div>
        </div>
      </div>

      {/* ═══ Main Chart ═══ */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-foreground-muted" />
            <h3 className="text-base font-semibold text-foreground">
              Évolution mensuelle
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {/* Chart mode toggle */}
            {(
              [
                { key: "ca", label: "CA (€)", color: ACCENT },
                { key: "volume", label: "Volume (kWh)", color: ACCENT_BLUE },
                { key: "sessions", label: "Sessions", color: "#8B5CF6" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setChartMode(opt.key)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                  chartMode === opt.key
                    ? "border-opacity-40 bg-opacity-10 text-foreground"
                    : "border-border text-foreground-muted hover:text-foreground hover:bg-surface-elevated"
                )}
                style={chartMode === opt.key ? {
                  borderColor: `${opt.color}66`,
                  backgroundColor: `${opt.color}15`,
                  color: opt.color,
                } : {}}
              >
                {opt.label}
              </button>
            ))}
            <div className="w-px h-6 bg-border mx-1" />
            <button
              onClick={() => setShowComparison((v) => !v)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
                showComparison
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-foreground-muted hover:text-foreground hover:bg-surface-elevated"
              )}
            >
              <GitCompareArrows className="w-3.5 h-3.5" />
              {year - 1}
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 20, right: 10, bottom: 5, left: -10 }}>
            <XAxis
              dataKey="name"
              tick={{ fill: "#B0B8D4", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#B0B8D4", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              tickFormatter={(v: number) =>
                chartMode === "ca"
                  ? v >= 1000 ? `${(v / 1000).toFixed(0)}k€` : `${v}€`
                  : chartMode === "volume"
                    ? v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`
                    : `${v}`
              }
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number, name: string) => {
                const label = name.includes("Prev") ? `${year - 1}` : `${year}`;
                const formatted = chartMode === "ca"
                  ? `${v.toLocaleString("fr-FR")} €`
                  : chartMode === "volume"
                    ? `${v.toLocaleString("fr-FR")} kWh`
                    : `${v.toLocaleString("fr-FR")} sessions`;
                return [formatted, label];
              }}
            />
            {showComparison && (
              <>
                <Legend
                  wrapperStyle={{ fontSize: 12, color: "#B0B8D4" }}
                  formatter={(value: string) => (value.includes("Prev") ? `${year - 1}` : `${year}`)}
                />
                <Bar dataKey={`${chartDataKey}Prev`} radius={[6, 6, 0, 0]} maxBarSize={30} fill={BAR_COLOR_PREV} opacity={0.4} />
              </>
            )}
            <Bar dataKey={chartDataKey} radius={[8, 8, 0, 0]} maxBarSize={showComparison ? 30 : 48}>
              {!showComparison && (
                <LabelList
                  dataKey={chartDataKey}
                  position="top"
                  fill="#D0D6E8"
                  fontSize={11}
                  fontWeight={500}
                  formatter={(v: number) =>
                    chartMode === "ca"
                      ? v >= 1000 ? `${(v / 1000).toFixed(1)}k€` : `${v}€`
                      : chartMode === "volume"
                        ? v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`
                        : `${v}`
                  }
                />
              )}
              {chartData.map((_, i) => (
                <Cell key={i} fill={chartColor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ═══ Top Stations + Stats ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Top stations */}
        <div className="lg:col-span-3 bg-surface border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-foreground-muted" />
            <h3 className="text-sm font-semibold text-foreground">Top Stations par CA</h3>
          </div>
          <div className="space-y-3">
            {topStations.map((station, i) => {
              const maxCa = topStations[0]?.ca ?? 1;
              const pct = (station.ca / maxCa) * 100;
              return (
                <div key={station.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold",
                        i === 0 ? "bg-[#9ACC0E]/15 text-[#9ACC0E]" :
                        i === 1 ? "bg-blue-500/15 text-blue-400" :
                        i === 2 ? "bg-violet-500/15 text-violet-400" :
                        "bg-white/5 text-foreground-muted"
                      )}>
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium text-foreground truncate max-w-[240px]">
                        {station.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-foreground-muted">
                      <span>{station.sessions} sessions</span>
                      <span className="font-semibold text-foreground">{formatEUR(station.ca)}</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: i === 0 ? ACCENT : i === 1 ? ACCENT_BLUE : i === 2 ? "#8B5CF6" : "#6B7280",
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {topStations.length === 0 && (
              <p className="text-sm text-foreground-muted text-center py-4">Aucune donnée</p>
            )}
          </div>
        </div>

        {/* Session stats */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-surface border border-border rounded-2xl p-5">
            <p className="text-xs text-foreground-muted mb-3 uppercase tracking-wider">Répartition sessions</p>
            <div className="space-y-3">
              {(() => {
                const paid = allData.filter(c => c.total_retail_cost != null && c.total_retail_cost > 0).length;
                const free = allData.filter(c => c.total_retail_cost === 0 || c.total_retail_cost == null).length;
                const total = paid + free;
                const paidPct = total > 0 ? (paid / total) * 100 : 0;
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#9ACC0E]" />
                        <span className="text-sm text-foreground">Payantes</span>
                      </div>
                      <span className="text-sm font-semibold text-foreground">{paid} ({paidPct.toFixed(0)}%)</span>
                    </div>
                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-[#9ACC0E] rounded-full" style={{ width: `${paidPct}%` }} />
                    </div>
                    {free > 0 && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-blue-500" />
                          <span className="text-sm text-foreground">Gratuites (RFID)</span>
                        </div>
                        <span className="text-sm font-semibold text-foreground">{free} ({(100 - paidPct).toFixed(0)}%)</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-500/5 to-surface border border-emerald-500/20 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Leaf className="w-4 h-4 text-emerald-400" />
              <p className="text-xs text-foreground-muted uppercase tracking-wider">Impact environnemental</p>
            </div>
            <p className="text-2xl font-heading font-bold text-emerald-400 mb-1">
              {co2Saved > 1000 ? `${formatNumber(co2Saved / 1000)} tonnes` : `${formatNumber(co2Saved)} kg`}
            </p>
            <p className="text-xs text-foreground-muted">
              de CO₂ évités vs véhicules thermiques
            </p>
            <div className="mt-3 flex items-center gap-4 text-xs text-foreground-muted">
              <span>≈ {formatNumber(co2Saved / 150)} pleins d'essence</span>
              <span>≈ {formatNumber(co2Saved / 12000)} voitures/an</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
