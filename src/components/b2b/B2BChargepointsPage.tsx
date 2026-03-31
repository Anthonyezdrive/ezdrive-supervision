import { useOutletContext } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Download, Wifi, WifiOff } from "lucide-react";
import { useB2BCdrs } from "@/hooks/useB2BCdrs";
import { useB2BStationLookup } from "@/hooks/useB2BStationLookup";
import { groupByChargePoint, formatDuration, formatNumber } from "@/lib/b2b-formulas";
import { downloadCSV, todayISO } from "@/lib/export";
import { PageHelp } from "@/components/ui/PageHelp";
import type { B2BClient } from "@/types/b2b";
import { useTranslation } from "react-i18next";

const CHART_COLORS = [
  "#9ACC0E", "#00C3FF", "#F39C12", "#FF6B6B", "#9B59B6",
  "#85B50C", "#00A8D6", "#2ECC71", "#E67E22", "#34495E",
  "#B8E04E", "#4DD4FF", "#D35400", "#27AE60",
];

const tooltipStyle = {
  backgroundColor: "#111638",
  border: "1px solid #2A2F5A",
  borderRadius: "12px",
  color: "#F7F9FC",
  fontSize: "12px",
};

const thClass =
  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground-muted";
const tdClass = "px-4 py-3.5 text-sm text-foreground whitespace-nowrap";

export function B2BChargepointsPage() {
  const { t } = useTranslation();
  const { activeClient, customerExternalIds } =
    useOutletContext<{ activeClient: B2BClient | null; customerExternalIds: string[] }>();
  const { data: cdrs, isLoading } = useB2BCdrs(customerExternalIds);
  const { data: stationLookup } = useB2BStationLookup();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-surface border border-border rounded-2xl p-6 h-[300px] animate-pulse" />
        <div className="bg-surface border border-border rounded-2xl p-6 h-[400px] animate-pulse" />
      </div>
    );
  }

  const data = cdrs ?? [];
  const rows = groupByChargePoint(data, stationLookup);

  // Chart data
  const totalVolume = rows.reduce((s, r) => s + r.volume, 0);
  const chartData = rows.map((r) => ({
    name: r.chargePointId,
    value: Math.round(r.volume * 100) / 100,
    pct: totalVolume > 0 ? ((r.volume / totalVolume) * 100).toFixed(1) : "0",
  }));

  // Totals
  const totals = {
    volume: totalVolume,
    duration: rows.reduce((s, r) => s + r.duration, 0),
    saturation: rows.length > 0 ? rows.reduce((s, r) => s + r.saturation, 0) / rows.length : 0,
    co2: rows.reduce((s, r) => s + r.co2Evite, 0),
  };

  function handleExport() {
    const exportRows = rows.map((r) => ({
      Charge_Point_ID: r.chargePointId,
      Site: r.siteName,
      Fabricant: r.vendor ?? "",
      Modèle: r.model ?? "",
      "Puissance (kW)": r.maxPowerKw != null ? formatNumber(r.maxPowerKw, 0) : "",
      Connexion: r.connectivityStatus ?? "",
      Sessions: r.sessionCount,
      "Volume (kWh)": formatNumber(r.volume),
      Durée_totale: formatDuration(r.duration),
      "Saturation (%)": formatNumber(r.saturation * 100),
      "CO2 évité (kg)": formatNumber(r.co2Evite),
    }));
    downloadCSV(exportRows, `b2b-par-borne-${activeClient?.slug ?? "client"}-${todayISO()}.csv`);
  }

  return (
    <div className="space-y-6">
      <PageHelp
        summary={t("b2b.chargepointsHelpSummary", "Analyse par borne de recharge — volume, sessions et informations techniques")}
        items={[
          { label: t("b2b.chargepointLabel", "Borne"), description: t("b2b.chargepointDesc", "Point de charge identifié par son nom et sa localisation.") },
          { label: t("b2b.volumeKwh", "Volume (kWh)"), description: t("b2b.volumeKwhDesc", "Énergie totale consommée sur cette borne par vos collaborateurs.") },
          { label: t("b2b.vendorModelLabel", "Fabricant/Modèle"), description: t("b2b.vendorModelDesc", "Informations techniques sur le matériel de la borne (si disponible).") },
          { label: t("b2b.connectionLabel", "Connexion"), description: t("b2b.connectionDesc", "Statut de connectivité de la borne : online (connectée) ou offline (déconnectée).") },
        ]}
        tips={[t("b2b.ocppTip", "Les données techniques (fabricant, modèle, puissance) proviennent de la synchronisation avec le serveur OCPP.")]}
      />

      {/* Donut chart + Legend */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <h3 className="text-base font-semibold text-foreground mb-4">
          {t("b2b.volumeByChargepoint", "Répartition des Volumes délivrés par Borne")}
        </h3>
        {chartData.length > 0 ? (
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <ResponsiveContainer width="100%" height={280} className="max-w-[400px]">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={110}
                  dataKey="value"
                  stroke="none"
                  paddingAngle={2}
                >
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number, name: string) => [`${formatNumber(v)} kWh`, name]}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1">
              {chartData.map((entry, i) => (
                <div key={entry.name} className="flex items-center gap-2.5">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                  <span className="text-sm text-foreground truncate">{entry.name}</span>
                  <span className="text-sm text-foreground-muted ml-auto tabular-nums">{entry.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-48 text-foreground-muted text-sm">
            {t("common.noData", "Aucune donnée")}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">{t("b2b.chargepointDetail", "Détail par borne")}</h3>
        <button
          onClick={handleExport}
          disabled={rows.length === 0}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-surface-elevated border border-border rounded-xl text-foreground-muted hover:text-foreground hover:border-border-focus transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          {t("b2b.exportCsv", "Export CSV")}
        </button>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className={thClass}>{t("b2b.chargepointLabel", "Borne")}</th>
                <th className={thClass}>{t("b2b.site", "Site")}</th>
                <th className={thClass}>{t("b2b.vendorModel", "Fabricant / Modèle")}</th>
                <th className={`${thClass} text-center`}>{t("b2b.power", "Puissance")}</th>
                <th className={`${thClass} text-center`}>{t("b2b.connection", "Connexion")}</th>
                <th className={`${thClass} text-right`}>{t("b2b.sessionsCount", "Sessions")}</th>
                <th className={`${thClass} text-right`}>{t("b2b.volumeKwh", "Volume (kWh)")}</th>
                <th className={`${thClass} text-right`}>{t("b2b.totalDuration", "Durée totale")}</th>
                <th className={`${thClass} text-right`}>{t("b2b.saturation", "Saturation")}</th>
                <th className={`${thClass} text-right`}>{t("b2b.co2Avoided", "CO₂ évité")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.chargePointId} className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors">
                  <td className={`${tdClass} font-medium`}>
                    <span className="text-sm">{r.chargePointId}</span>
                  </td>
                  <td className={`${tdClass} text-foreground-muted`}>{r.siteName}</td>
                  <td className={tdClass}>
                    {r.vendor ? (
                      <div>
                        <span className="text-sm">{r.vendor}</span>
                        {r.model && (
                          <span className="text-xs text-foreground-muted ml-1">{r.model}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-foreground-muted">—</span>
                    )}
                  </td>
                  <td className={`${tdClass} text-center`}>
                    {r.maxPowerKw != null ? `${r.maxPowerKw} kW` : "—"}
                  </td>
                  <td className={`${tdClass} text-center`}>
                    {r.connectivityStatus ? (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                        r.connectivityStatus === "Online" ? "text-success" : "text-danger"
                      }`}>
                        {r.connectivityStatus === "Online" ? (
                          <Wifi className="w-3.5 h-3.5" />
                        ) : (
                          <WifiOff className="w-3.5 h-3.5" />
                        )}
                        {r.connectivityStatus}
                      </span>
                    ) : (
                      <span className="text-foreground-muted">—</span>
                    )}
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>{r.sessionCount}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{formatNumber(r.volume)}</td>
                  <td className={`${tdClass} text-right`}>{formatDuration(r.duration)}</td>
                  <td className={`${tdClass} text-right`}>{formatNumber(r.saturation * 100)} %</td>
                  <td className={`${tdClass} text-right`}>{formatNumber(r.co2Evite)} kg</td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="bg-surface-elevated/30 font-bold border-t-2" style={{ borderTopColor: "#9ACC0E40" }}>
                  <td className={tdClass}>{t("common.total", "Total")}</td>
                  <td className={tdClass} />
                  <td className={tdClass} />
                  <td className={tdClass} />
                  <td className={tdClass} />
                  <td className={`${tdClass} text-right tabular-nums`}>{rows.reduce((s, r) => s + r.sessionCount, 0)}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{formatNumber(totals.volume)}</td>
                  <td className={`${tdClass} text-right`}>{formatDuration(totals.duration)}</td>
                  <td className={`${tdClass} text-right`}>{formatNumber(totals.saturation * 100)} %</td>
                  <td className={`${tdClass} text-right`}>{formatNumber(totals.co2)} kg</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
