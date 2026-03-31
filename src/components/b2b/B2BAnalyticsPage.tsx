import { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { Zap, Euro, TrendingUp, Activity, BarChart3, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { KPICard } from "@/components/ui/KPICard";
import { useB2BCdrs } from "@/hooks/useB2BCdrs";
import { useB2BFilters } from "@/contexts/B2BFilterContext";
import { formatNumber, formatEUR } from "@/lib/b2b-formulas";
import type { B2BClient, B2BCdr } from "@/types/b2b";
import { useTranslation } from "react-i18next";

const MONTH_SHORT = [
  "jan", "fév", "mars", "avr", "mai", "juin",
  "juil", "août", "sept", "oct", "nov", "déc",
];

const tooltipStyle = {
  backgroundColor: "#111638",
  border: "1px solid #2A2F5A",
  borderRadius: "12px",
  color: "#F7F9FC",
  fontSize: "12px",
};

const COLORS = {
  recharges: "#00C3FF",
  ca: "#9ACC0E",
  mwh: "#F39C12",
  caAnnuel: "#E74C3C",
};

type ChartMode = "recharges" | "ca" | "mwh";

interface MonthlyRow {
  month: number;
  label: string;
  recharges: number;
  ca: number;
  mwh: number;
}

interface StationRow {
  stationId: string;
  stationName: string;
  cdrs: number;
  mwh: number;
  ca: number;
  caAnnuel: number;
  firstSession: string;
  lastSession: string;
}

function groupCdrsByMonth(cdrs: B2BCdr[]): MonthlyRow[] {
  const map = new Map<number, MonthlyRow>();
  for (let m = 0; m < 12; m++) {
    map.set(m, { month: m, label: MONTH_SHORT[m], recharges: 0, ca: 0, mwh: 0 });
  }
  for (const c of cdrs) {
    const d = new Date(c.start_date_time);
    const m = d.getMonth();
    const row = map.get(m)!;
    row.recharges += 1;
    row.ca += c.total_cost ?? 0;
    row.mwh += (c.total_energy ?? 0) / 1000;
  }
  return Array.from(map.values());
}

function groupCdrsByStation(cdrs: B2BCdr[], _year: number): StationRow[] {
  const map = new Map<string, StationRow>();
  for (const c of cdrs) {
    const sid = c.station_id ?? "unknown";
    const name = (c.cdr_location as any)?.name ?? sid;
    if (!map.has(sid)) {
      map.set(sid, {
        stationId: sid,
        stationName: name,
        cdrs: 0,
        mwh: 0,
        ca: 0,
        caAnnuel: 0,
        firstSession: c.start_date_time,
        lastSession: c.start_date_time,
      });
    }
    const row = map.get(sid)!;
    row.cdrs += 1;
    row.mwh += (c.total_energy ?? 0) / 1000;
    row.ca += c.total_cost ?? 0;
    if (c.start_date_time < row.firstSession) row.firstSession = c.start_date_time;
    if (c.start_date_time > row.lastSession) row.lastSession = c.start_date_time;
  }

  // Compute annualized CA
  for (const row of map.values()) {
    const first = new Date(row.firstSession);
    const last = new Date(row.lastSession);
    const months = Math.max(
      (last.getFullYear() - first.getFullYear()) * 12 + last.getMonth() - first.getMonth() + 1,
      1
    );
    row.caAnnuel = (row.ca / months) * 12;
  }

  return Array.from(map.values()).sort((a, b) => b.ca - a.ca);
}

export function B2BAnalyticsPage() {
  const { t } = useTranslation();
  const { activeClient: _activeClient, customerExternalIds } =
    useOutletContext<{ activeClient: B2BClient | null; customerExternalIds: string[] }>();
  const { year } = useB2BFilters();
  const [chartMode, setChartMode] = useState<ChartMode>("ca");

  const { data: cdrs, isLoading } = useB2BCdrs(customerExternalIds);
  const data = cdrs ?? [];

  const monthly = useMemo(() => groupCdrsByMonth(data), [data]);
  const stations = useMemo(() => groupCdrsByStation(data, year), [data, year]);

  // KPIs
  const totalRecharges = data.length;
  const totalCA = data.reduce((s, c) => s + (c.total_cost ?? 0), 0);
  const totalMWh = data.reduce((s, c) => s + (c.total_energy ?? 0), 0) / 1000;
  const avgCAPerStation = stations.length > 0 ? stations.reduce((s, r) => s + r.caAnnuel, 0) / stations.length : 0;

  // MoM trend
  const currentMonth = new Date().getMonth();
  const thisMonthCA = monthly[currentMonth]?.ca ?? 0;
  const lastMonthCA = currentMonth > 0 ? (monthly[currentMonth - 1]?.ca ?? 0) : 0;
  const momTrend = lastMonthCA > 0 ? ((thisMonthCA - lastMonthCA) / lastMonthCA) * 100 : 0;

  const chartColor = COLORS[chartMode];
  const chartLabel = chartMode === "recharges" ? t("b2b.recharges", "Recharges") : chartMode === "ca" ? t("b2b.caEurLabel", "CA (EUR)") : t("b2b.mwhLabel", "MWh");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-surface border border-border rounded-2xl p-5 h-[88px] animate-pulse" />
          ))}
        </div>
        <div className="bg-surface border border-border rounded-2xl p-6 h-[400px] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label={t("b2b.rechargesYear", "Recharges (année)")} value={formatNumber(totalRecharges)} icon={Activity} color={COLORS.recharges} />
        <KPICard label={t("b2b.caYear", "CA {{year}}", { year })} value={formatEUR(totalCA)} icon={Euro} color={COLORS.ca} />
        <KPICard label={t("b2b.energyYear", "Energie {{year}}", { year })} value={`${formatNumber(totalMWh)} MWh`} icon={Zap} color={COLORS.mwh} />
        <KPICard label={t("b2b.avgAnnualCaPerStation", "CA annuel moyen / borne")} value={formatEUR(avgCAPerStation)} icon={TrendingUp} color={COLORS.caAnnuel} />
      </div>

      {/* Trend indicator */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-4 py-2.5">
          {momTrend >= 0 ? (
            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
          ) : (
            <ArrowDownRight className="w-4 h-4 text-red-400" />
          )}
          <span className="text-sm text-foreground-muted">
            {t("b2b.currentMonthTrend", "Tendance mois en cours :")}
          </span>
          <span className={`text-sm font-semibold ${momTrend >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {momTrend >= 0 ? "+" : ""}{momTrend.toFixed(1)}%
          </span>
          <span className="text-xs text-foreground-muted">{t("b2b.vsPreviousMonth", "vs mois precedent")}</span>
        </div>
      </div>

      {/* Chart mode selector + chart */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-foreground-muted" />
            {t("b2b.monthlyEvolutionChart", "Evolution mensuelle")}
          </h3>
          <div className="flex items-center gap-1 bg-surface-elevated border border-border rounded-xl p-1">
            {([
              { key: "recharges" as ChartMode, label: t("b2b.recharges", "Recharges") },
              { key: "ca" as ChartMode, label: t("b2b.caEurLabel", "CA (EUR)") },
              { key: "mwh" as ChartMode, label: t("b2b.mwhLabel", "MWh") },
            ]).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setChartMode(opt.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  chartMode === opt.key
                    ? "bg-primary/15 text-primary"
                    : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={monthly} margin={{ top: 20, right: 10, bottom: 5, left: -10 }}>
            <XAxis dataKey="label" tick={{ fill: "#B0B8D4", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: "#B0B8D4", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) =>
                chartMode === "ca" ? `${(v / 1000).toFixed(0)}k` :
                chartMode === "mwh" ? `${v.toFixed(1)}` :
                v.toLocaleString("fr-FR")
              }
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number) => [
                chartMode === "ca" ? formatEUR(v) :
                chartMode === "mwh" ? `${v.toFixed(2)} MWh` :
                `${v.toLocaleString("fr-FR")} recharges`,
                chartLabel,
              ]}
            />
            <Bar dataKey={chartMode} radius={[8, 8, 0, 0]} maxBarSize={50}>
              <LabelList
                dataKey={chartMode}
                position="top"
                fill="#D0D6E8"
                fontSize={11}
                fontWeight={500}
                formatter={(v: number) =>
                  chartMode === "ca" ? `${(v / 1000).toFixed(1)}k` :
                  chartMode === "mwh" ? v.toFixed(1) :
                  v.toString()
                }
              />
              {monthly.map((_, i) => (
                <Cell key={i} fill={chartColor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Revenue per station table */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-foreground-muted" />
            {t("b2b.revenuePerStation", "Chiffre d'affaires par borne — estimation annuelle")}
          </h3>
          <p className="text-xs text-foreground-muted mt-1">
            {t("b2b.annualCaEstimate", "CA annuel estime = (CA total / nb mois d'activite) × 12")}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-foreground-muted uppercase tracking-wider">{t("b2b.chargepointLabel", "Borne")}</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-foreground-muted uppercase tracking-wider">{t("b2b.recharges", "Recharges")}</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-foreground-muted uppercase tracking-wider">{t("b2b.mwhLabel", "MWh")}</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-foreground-muted uppercase tracking-wider">{t("b2b.caYear", "CA {{year}}", { year })}</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-foreground-muted uppercase tracking-wider">{t("b2b.annualCaEstimated", "CA annuel estime")}</th>
              </tr>
            </thead>
            <tbody>
              {stations.map((s, i) => (
                <tr key={s.stationId} className={i % 2 === 0 ? "bg-surface" : "bg-surface-elevated/30"}>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{s.stationName}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted text-right">{formatNumber(s.cdrs)}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted text-right">{s.mwh.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-foreground text-right font-medium">{formatEUR(s.ca)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-bold"
                      style={{
                        color: s.caAnnuel > 30000 ? "#2ECC71" : s.caAnnuel > 10000 ? "#F39C12" : "#E74C3C",
                        backgroundColor: s.caAnnuel > 30000 ? "#2ECC7115" : s.caAnnuel > 10000 ? "#F39C1215" : "#E74C3C15",
                      }}
                    >
                      {formatEUR(s.caAnnuel)}
                    </span>
                  </td>
                </tr>
              ))}
              {/* Total row */}
              <tr className="border-t-2 border-border bg-surface-elevated">
                <td className="px-4 py-3 text-sm font-bold text-foreground">{t("common.total", "TOTAL").toUpperCase()}</td>
                <td className="px-4 py-3 text-sm font-bold text-foreground text-right">{formatNumber(totalRecharges)}</td>
                <td className="px-4 py-3 text-sm font-bold text-foreground text-right">{totalMWh.toFixed(2)}</td>
                <td className="px-4 py-3 text-sm font-bold text-foreground text-right">{formatEUR(totalCA)}</td>
                <td className="px-4 py-3 text-sm font-bold text-foreground text-right">
                  {formatEUR(stations.reduce((s, r) => s + r.caAnnuel, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
