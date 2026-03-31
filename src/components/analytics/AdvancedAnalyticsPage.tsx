import { useState, useMemo } from "react";
import { BarChart3, TrendingUp, Clock, Zap, Activity, Sun, Moon, Building2, ArrowUp, ArrowDown, Loader2, Download, CalendarDays } from "lucide-react";
// recharts unused for now but ready for future charts
// import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useMonthlyCpoSummary, usePeakUsage, useStationUtilization } from "../../hooks/useAdvancedAnalytics";
import { useCpo } from "../../contexts/CpoContext";
import { downloadCSV, todayISO } from "@/lib/export";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type Tab = "revenue" | "peak" | "utilization" | "comparison";

interface DateRange {
  from: string;
  to: string;
}

const ADV_DATE_PRESETS = [
  { label: "7j", days: 7 },
  { label: "30j", days: 30 },
  { label: "90j", days: 90 },
  { label: "1an", days: 365 },
] as const;

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AdvancedAnalyticsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("revenue");
  const { selectedCpo } = useCpo();
  const cpoId = selectedCpo?.id ?? undefined;

  const [activePreset, setActivePreset] = useState<number | null>(90);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: daysAgoISO(90),
    to: todayISODate(),
  });

  function handlePreset(days: number) {
    setActivePreset(days);
    setDateRange({ from: daysAgoISO(days), to: todayISODate() });
  }

  function handleCustomFrom(value: string) {
    setActivePreset(null);
    setDateRange((prev) => ({ ...prev, from: value }));
  }

  function handleCustomTo(value: string) {
    setActivePreset(null);
    setDateRange((prev) => ({ ...prev, to: value }));
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof BarChart3 }> = [
    { id: "revenue", label: t("analytics.revenue"), icon: TrendingUp },
    { id: "peak", label: t("analytics.peakOffPeak", "Peak / Off-Peak"), icon: Sun },
    { id: "utilization", label: t("analytics.utilization"), icon: Activity },
    { id: "comparison", label: t("analytics.cpoComparison", "Comparaison CPO"), icon: Building2 },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-emerald-600" />
          {t("analytics.advanced")}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{t("analytics.advancedDescription", "Analyse détaillée des performances du réseau de charge")}</p>
      </div>

      {/* Date range selector (shared across all tabs) */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 mb-6 shadow-sm">
        <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="text-xs text-gray-500 font-medium">{t("dashboard.filterPeriod")} :</span>
        <div className="flex gap-1">
          {ADV_DATE_PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => handlePreset(p.days)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                activePreset === p.days
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 text-gray-500 hover:text-gray-700"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="h-5 w-px bg-gray-200 mx-1" />
        <div className="flex items-center gap-2 text-xs">
          <label className="text-gray-500">{t("b2b.from", "Du")}</label>
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => handleCustomFrom(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900"
          />
          <label className="text-gray-500">{t("b2b.to", "au")}</label>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => handleCustomTo(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              <Icon className="w-4 h-4" />{t.label}
            </button>
          );
        })}
      </div>

      {tab === "revenue" && <RevenueTab cpoId={cpoId} dateRange={dateRange} />}
      {tab === "peak" && <PeakTab cpoId={cpoId} dateRange={dateRange} />}
      {tab === "utilization" && <UtilizationTab cpoId={cpoId} dateRange={dateRange} />}
      {tab === "comparison" && <ComparisonTab dateRange={dateRange} />}
    </div>
  );
}

function RevenueTab({ cpoId }: { cpoId?: string; dateRange?: DateRange }) {
  const { t } = useTranslation();
  const { data: monthly = [], isLoading } = useMonthlyCpoSummary(cpoId);

  if (isLoading) return <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mx-auto mt-12" />;

  const totalRevenue = monthly.reduce((s, m) => s + m.total_revenue, 0);
  const totalSessions = monthly.reduce((s, m) => s + m.total_sessions, 0);
  const totalEnergy = monthly.reduce((s, m) => s + m.total_energy_kwh, 0);

  function handleExportRevenue() {
    const rows = monthly.map(m => ({
      Mois: new Date(m.month).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
      Sessions: m.total_sessions,
      "Énergie (kWh)": m.total_energy_kwh.toFixed(0),
      "Revenu (€)": m.total_revenue.toFixed(2),
      "Durée moy. (min)": m.avg_duration_min.toFixed(0),
      "Bornes actives": m.active_stations,
      Conducteurs: m.unique_drivers,
    }));
    downloadCSV(rows, `revenus_mensuels_${todayISO()}.csv`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <button onClick={handleExportRevenue} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors">
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: t("dashboard.totalRevenue"), value: `${totalRevenue.toFixed(0)}€`, icon: TrendingUp, color: "text-emerald-600" },
          { label: t("analytics.sessions"), value: totalSessions.toLocaleString(), icon: Zap, color: "text-blue-600" },
          { label: t("analytics.energy"), value: `${(totalEnergy / 1000).toFixed(1)} MWh`, icon: Activity, color: "text-purple-600" },
          { label: t("analytics.monthsAnalyzed", "Mois analysés"), value: monthly.length, icon: Clock, color: "text-amber-600" },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><k.icon className="w-4 h-4" />{k.label}</div>
            <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b"><h3 className="font-semibold text-gray-900">{t("analytics.monthlyRevenue", "Revenus mensuels")}</h3></div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr>
            {[t("b2b.month", "Mois"), t("analytics.sessions"), t("analytics.energyKwh", "Énergie (kWh)"), t("analytics.revenueEur", "Revenu (€)"), t("analytics.avgDuration", "Durée moy."), t("analytics.activeStations", "Bornes actives"), t("analytics.drivers", "Conducteurs")].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {monthly.map((m, i) => {
              const prev = monthly[i + 1];
              const revenueChange = prev ? ((m.total_revenue - prev.total_revenue) / (prev.total_revenue || 1)) * 100 : 0;
              return (
                <tr key={m.month} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{new Date(m.month).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</td>
                  <td className="px-4 py-3">{m.total_sessions.toLocaleString()}</td>
                  <td className="px-4 py-3">{m.total_energy_kwh.toFixed(0)}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold">{m.total_revenue.toFixed(2)}</span>
                    {revenueChange !== 0 && (
                      <span className={`ml-2 text-xs ${revenueChange > 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {revenueChange > 0 ? <ArrowUp className="w-3 h-3 inline" /> : <ArrowDown className="w-3 h-3 inline" />}
                        {Math.abs(revenueChange).toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{m.avg_duration_min.toFixed(0)} min</td>
                  <td className="px-4 py-3">{m.active_stations}</td>
                  <td className="px-4 py-3">{m.unique_drivers}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PeakTab({ cpoId }: { cpoId?: string; dateRange?: DateRange }) {
  const { t } = useTranslation();
  const { data: peakData = [], isLoading } = usePeakUsage(cpoId, 90);

  const summary = useMemo(() => {
    const grouped = { peak: { sessions: 0, energy: 0, revenue: 0 }, off_peak: { sessions: 0, energy: 0, revenue: 0 }, normal: { sessions: 0, energy: 0, revenue: 0 } };
    peakData.forEach(p => {
      const key = p.period_type as keyof typeof grouped;
      if (grouped[key]) {
        grouped[key].sessions += p.session_count;
        grouped[key].energy += p.energy_kwh;
        grouped[key].revenue += p.revenue;
      }
    });
    return grouped;
  }, [peakData]);

  if (isLoading) return <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mx-auto mt-12" />;

  const total = summary.peak.sessions + summary.off_peak.sessions + summary.normal.sessions;

  function handleExportPeak() {
    const rows = [
      { Période: "Heures pleines", Sessions: summary.peak.sessions, "Énergie (kWh)": summary.peak.energy.toFixed(0), "Revenu (€)": summary.peak.revenue.toFixed(2), "% Sessions": total ? (summary.peak.sessions / total * 100).toFixed(1) : "0" },
      { Période: "Heures normales", Sessions: summary.normal.sessions, "Énergie (kWh)": summary.normal.energy.toFixed(0), "Revenu (€)": summary.normal.revenue.toFixed(2), "% Sessions": total ? (summary.normal.sessions / total * 100).toFixed(1) : "0" },
      { Période: "Heures creuses", Sessions: summary.off_peak.sessions, "Énergie (kWh)": summary.off_peak.energy.toFixed(0), "Revenu (€)": summary.off_peak.revenue.toFixed(2), "% Sessions": total ? (summary.off_peak.sessions / total * 100).toFixed(1) : "0" },
    ];
    downloadCSV(rows, `peak_offpeak_${todayISO()}.csv`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <button onClick={handleExportPeak} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors">
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t("analytics.peakHours", "Heures pleines"), data: summary.peak, icon: Sun, color: "amber", pct: total ? (summary.peak.sessions / total * 100) : 0 },
          { label: t("analytics.normalHours", "Heures normales"), data: summary.normal, icon: Clock, color: "blue", pct: total ? (summary.normal.sessions / total * 100) : 0 },
          { label: t("analytics.offPeakHours", "Heures creuses"), data: summary.off_peak, icon: Moon, color: "indigo", pct: total ? (summary.off_peak.sessions / total * 100) : 0 },
        ].map(p => (
          <div key={p.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <p.icon className={`w-5 h-5 text-${p.color}-500`} />
              <h3 className="font-semibold text-gray-900">{p.label}</h3>
              <span className={`ml-auto text-sm font-bold text-${p.color}-600`}>{p.pct.toFixed(1)}%</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">{t("analytics.sessions")}</span><span className="font-medium">{p.data.sessions.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{t("analytics.energy")}</span><span className="font-medium">{p.data.energy.toFixed(0)} kWh</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{t("analytics.revenue")}</span><span className="font-medium">{p.data.revenue.toFixed(2)}€</span></div>
            </div>
            <div className="mt-3 w-full bg-gray-100 rounded-full h-2">
              <div className={`bg-${p.color}-500 h-2 rounded-full`} style={{ width: `${p.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-2">{t("analytics.analysis90days", "Analyse (90 derniers jours)")}</h3>
        <p className="text-sm text-gray-500">
          {summary.off_peak.sessions > summary.peak.sessions
            ? t("analytics.offPeakMajority", "La majorité des sessions ont lieu en heures creuses -- bon pour l'optimisation réseau.")
            : t("analytics.peakMajority", "Les sessions sont concentrées en heures pleines -- considérez des tarifs incitatifs off-peak.")}
        </p>
      </div>
    </div>
  );
}

function UtilizationTab({ cpoId }: { cpoId?: string; dateRange?: DateRange }) {
  const { t } = useTranslation();
  const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
  const { data: utilization = [], isLoading } = useStationUtilization(cpoId, currentMonth);

  if (isLoading) return <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mx-auto mt-12" />;

  const avgUtil = utilization.length ? utilization.reduce((s, u) => s + u.utilization_pct, 0) / utilization.length : 0;

  function handleExportUtilization() {
    const rows = utilization.map((u, i) => ({
      "#": i + 1,
      Borne: u.station_name,
      "Heures de charge": u.charging_hours.toFixed(1),
      "Jours actifs": u.days_active,
      "Utilisation (%)": u.utilization_pct.toFixed(1),
    }));
    downloadCSV(rows, `utilisation_bornes_${todayISO()}.csv`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <button onClick={handleExportUtilization} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors">
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500">{t("analytics.avgUtilizationRate", "Taux d'utilisation moyen")}</div>
          <div className="text-3xl font-bold text-emerald-600">{avgUtil.toFixed(1)}%</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500">{t("analytics.stationsAnalyzed", "Bornes analysées")}</div>
          <div className="text-3xl font-bold text-blue-600">{utilization.length}</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500">{t("analytics.underutilizedStations", "Bornes sous-utilisées (<10%)")}</div>
          <div className="text-3xl font-bold text-amber-600">{utilization.filter(u => u.utilization_pct < 10).length}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b"><h3 className="font-semibold text-gray-900">{t("analytics.utilizationRanking", "Classement par utilisation")}</h3></div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr>
            {["#", t("analytics.station", "Borne"), t("analytics.chargingHours", "Heures de charge"), t("analytics.activeDays", "Jours actifs"), t("analytics.utilization")].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {utilization.slice(0, 20).map((u, i) => (
              <tr key={u.station_id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                <td className="px-4 py-3 font-medium">{u.station_name}</td>
                <td className="px-4 py-3">{u.charging_hours.toFixed(1)}h</td>
                <td className="px-4 py-3">{u.days_active}j</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-gray-100 rounded-full h-2">
                      <div className={`h-2 rounded-full ${u.utilization_pct > 50 ? "bg-emerald-500" : u.utilization_pct > 20 ? "bg-blue-500" : "bg-amber-500"}`} style={{ width: `${Math.min(u.utilization_pct, 100)}%` }} />
                    </div>
                    <span className="font-medium text-sm">{u.utilization_pct.toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComparisonTab(_props: { dateRange?: DateRange }) {
  const { t } = useTranslation();
  const { data: monthly = [], isLoading } = useMonthlyCpoSummary();

  const cpoGroups = useMemo(() => {
    const map = new Map<string, typeof monthly>();
    monthly.forEach(m => {
      const key = m.cpo_id ?? "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    return map;
  }, [monthly]);

  if (isLoading) return <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mx-auto mt-12" />;

  function handleExportComparison() {
    const rows = Array.from(cpoGroups.entries()).map(([cpoId, months]) => {
      const total = months.reduce((acc, m) => ({
        sessions: acc.sessions + m.total_sessions,
        energy: acc.energy + m.total_energy_kwh,
        revenue: acc.revenue + m.total_revenue,
        duration: acc.duration + m.avg_duration_min * m.total_sessions,
        stations: Math.max(acc.stations, m.active_stations),
      }), { sessions: 0, energy: 0, revenue: 0, duration: 0, stations: 0 });
      return {
        CPO: cpoId,
        Sessions: total.sessions,
        "Énergie (MWh)": (total.energy / 1000).toFixed(1),
        "Revenu (€)": total.revenue.toFixed(2),
        "Durée moy. (min)": total.sessions > 0 ? (total.duration / total.sessions).toFixed(0) : "0",
        "Bornes actives": total.stations,
      };
    });
    downloadCSV(rows, `comparaison_cpo_${todayISO()}.csv`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <button onClick={handleExportComparison} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors">
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b"><h3 className="font-semibold text-gray-900">{t("analytics.cpoComparisonCumul", "Comparaison par CPO (cumul)")}</h3></div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr>
            {["CPO", t("analytics.sessions"), t("analytics.energyMwh", "Énergie (MWh)"), t("analytics.revenueEur", "Revenu (€)"), t("analytics.avgDuration", "Durée moy."), t("analytics.activeStations", "Bornes actives")].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {Array.from(cpoGroups.entries()).map(([cpoId, months]) => {
              const total = months.reduce((acc, m) => ({
                sessions: acc.sessions + m.total_sessions,
                energy: acc.energy + m.total_energy_kwh,
                revenue: acc.revenue + m.total_revenue,
                duration: acc.duration + m.avg_duration_min * m.total_sessions,
                stations: Math.max(acc.stations, m.active_stations),
              }), { sessions: 0, energy: 0, revenue: 0, duration: 0, stations: 0 });
              return (
                <tr key={cpoId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{cpoId.slice(0, 8)}...</td>
                  <td className="px-4 py-3">{total.sessions.toLocaleString()}</td>
                  <td className="px-4 py-3">{(total.energy / 1000).toFixed(1)}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-600">{total.revenue.toFixed(2)}</td>
                  <td className="px-4 py-3">{total.sessions > 0 ? (total.duration / total.sessions).toFixed(0) : 0} min</td>
                  <td className="px-4 py-3">{total.stations}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
