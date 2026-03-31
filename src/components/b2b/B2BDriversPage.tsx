import { useOutletContext } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useB2BCdrs } from "@/hooks/useB2BCdrs";
import { groupByDriver, formatNumber } from "@/lib/b2b-formulas";
import { downloadCSV, todayISO } from "@/lib/export";
import { exportPDF } from "@/lib/b2b-export";
import { ExportButtons } from "./ExportButtons";
import { PageHelp } from "@/components/ui/PageHelp";
import type { B2BClient } from "@/types/b2b";
import { useTranslation } from "react-i18next";

const CHART_COLORS = [
  "#9ACC0E", "#00C3FF", "#F39C12", "#FF6B6B", "#9B59B6",
  "#85B50C", "#00A8D6", "#2ECC71", "#E67E22", "#34495E",
  "#B8E04E", "#4DD4FF", "#D35400", "#27AE60", "#2980B9",
  "#C0392B", "#7F8C8D", "#BDC3C7",
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

export function B2BDriversPage() {
  const { t } = useTranslation();
  const { activeClient, customerExternalIds } =
    useOutletContext<{ activeClient: B2BClient | null; customerExternalIds: string[] }>();
  const { data: cdrs, isLoading } = useB2BCdrs(customerExternalIds);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-surface border border-border rounded-2xl p-6 h-[300px] animate-pulse" />
        <div className="bg-surface border border-border rounded-2xl p-6 h-[400px] animate-pulse" />
      </div>
    );
  }

  const data = cdrs ?? [];
  const rows = groupByDriver(data);

  // Chart data (top 15 + "Autres")
  const topN = 15;
  const topDrivers = rows.slice(0, topN);
  const othersVolume = rows.slice(topN).reduce((s, r) => s + r.volumeGratuit, 0);
  const chartData = [
    ...topDrivers.map((r) => ({
      name: r.driverName,
      value: Math.round(r.volumeGratuit * 100) / 100,
    })),
    ...(othersVolume > 0 ? [{ name: "Autres", value: Math.round(othersVolume * 100) / 100 }] : []),
  ].filter((d) => d.value > 0);

  const totalVolume = rows.reduce((s, r) => s + r.volumeGratuit, 0);

  function handleExport() {
    const exportRows = rows.map((r) => ({
      Nom: r.lastName,
      Prénom: r.firstName,
      Token_Visual_Number: r.tokenVisualNumber,
      "Volume tarif gratuit (kWh)": formatNumber(r.volumeGratuit),
    }));
    downloadCSV(exportRows, `b2b-par-conducteur-${activeClient?.slug ?? "client"}-${todayISO()}.csv`);
  }

  function handleExportPDF() {
    const clientName = activeClient?.name ?? "B2B";
    const pdfRows = rows.map((r) => ({
      nom: r.lastName,
      prenom: r.firstName,
      token: r.tokenVisualNumber,
      volume: formatNumber(r.volumeGratuit),
    }));
    exportPDF(
      `Rapport par conducteur — ${clientName}`,
      `Genere le ${new Date().toLocaleDateString("fr-FR")}`,
      [
        { key: "nom", label: "Nom", width: 2 },
        { key: "prenom", label: "Prenom", width: 2 },
        { key: "token", label: "Token", width: 3 },
        { key: "volume", label: "Vol. gratuit (kWh)", align: "right", width: 2 },
      ],
      pdfRows,
      `rapport-par-conducteur-${activeClient?.slug ?? "client"}.pdf`,
      {
        kpis: [
          { label: "Conducteurs", value: String(rows.length) },
          { label: "Volume total", value: `${formatNumber(totalVolume)} kWh` },
        ],
        totalsRow: {
          nom: "TOTAL",
          prenom: "",
          token: "",
          volume: formatNumber(totalVolume),
        },
      }
    );
  }

  return (
    <div className="space-y-6">
      <PageHelp
        summary={t("b2b.driversHelpSummary", "Statistiques de charge par conducteur — identifiez les usages de vos collaborateurs")}
        items={[
          { label: t("b2b.driverLabel", "Conducteur"), description: t("b2b.driverLabelDesc", "Identifié par son tag RFID ou son identifiant dans le système de charge.") },
          { label: t("b2b.sessionsCount", "Sessions"), description: t("b2b.driverSessionsDesc", "Nombre total de sessions de charge effectuées par ce conducteur.") },
          { label: t("b2b.volumeKwh", "Volume (kWh)"), description: t("b2b.driverVolumeDesc", "Énergie totale consommée par ce conducteur sur la période.") },
          { label: t("b2b.cost", "Coût"), description: t("b2b.driverCostDesc", "Montant total des charges effectuées par ce conducteur.") },
        ]}
        tips={[t("b2b.driversTip", "Les conducteurs sont identifiés par leur token RFID. Un même collaborateur peut avoir plusieurs badges.")]}
      />

      {/* Pie chart */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <h3 className="text-base font-semibold text-foreground mb-4">
          {t("b2b.volumeByDriver", "Volume (kWh) Mobilité flotte par Nom du conducteur")}
        </h3>
        {chartData.length > 0 ? (
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <ResponsiveContainer width="100%" height={320} className="max-w-[400px]">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  dataKey="value"
                  stroke="none"
                  paddingAngle={1}
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
                  <span className="text-sm text-foreground-muted ml-auto tabular-nums">
                    {totalVolume > 0
                      ? `${((entry.value / totalVolume) * 100).toFixed(0)}%`
                      : "0%"}
                  </span>
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
        <h3 className="text-base font-semibold text-foreground">
          {t("b2b.driverDetail", "Détail par conducteur")}
        </h3>
        <ExportButtons onCSV={handleExport} onPDF={handleExportPDF} disabled={rows.length === 0} />
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className={thClass}>{t("b2b.lastName", "Nom")}</th>
                <th className={thClass}>{t("b2b.firstName", "Prénom")}</th>
                <th className={thClass}>{t("b2b.tokenVisualNumber", "Token Visual Number")}</th>
                <th className={`${thClass} text-right`}>{t("b2b.freeVolume", "Volume tarif gratuit (kWh)")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-foreground-muted text-sm">
                    {t("common.noData", "Aucune donnée")}
                  </td>
                </tr>
              ) : (
                <>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors">
                      <td className={`${tdClass} font-medium`}>{r.lastName}</td>
                      <td className={tdClass}>{r.firstName}</td>
                      <td className={`${tdClass} font-mono text-xs`}>{r.tokenVisualNumber}</td>
                      <td className={`${tdClass} text-right`}>{formatNumber(r.volumeGratuit)}</td>
                    </tr>
                  ))}
                  {/* Total */}
                  <tr className="bg-surface-elevated/30 font-bold border-t-2" style={{ borderTopColor: "#9ACC0E40" }}>
                    <td colSpan={3} className={tdClass}>{t("common.total", "Total")}</td>
                    <td className={`${tdClass} text-right`}>{formatNumber(totalVolume)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
