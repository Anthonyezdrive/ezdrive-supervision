import { useState, useMemo, lazy, Suspense } from "react";
import { BarChart2, Download, TrendingUp, AlertTriangle, CheckCircle, CalendarDays } from "lucide-react";
import { useSLAByTerritory, useSLAByCPO } from "@/hooks/useSLAData";
import type { SLADateRange } from "@/hooks/useSLAData";
import { useStations } from "@/hooks/useStations";
import { useCpo } from "@/contexts/CpoContext";
import { downloadCSV, todayISO } from "@/lib/export";
import { cn } from "@/lib/utils";
import { SLARowSkeleton, CardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHelp } from "@/components/ui/PageHelp";

const SlaTrendChart = lazy(() =>
  import("./SlaTrendChart").then((m) => ({ default: m.SlaTrendChart }))
);

function AvailBar({ pct }: { pct: number }) {
  const color =
    pct >= 90 ? "bg-status-available" : pct >= 70 ? "bg-yellow-400" : "bg-status-faulted";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-surface-elevated rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span
        className={cn(
          "text-xs font-semibold tabular-nums w-12 text-right",
          pct >= 90
            ? "text-status-available"
            : pct >= 70
            ? "text-yellow-400"
            : "text-status-faulted"
        )}
      >
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

const DATE_PRESETS = [
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

export function AnalyticsPage() {
  const { selectedCpoId } = useCpo();

  const [activePreset, setActivePreset] = useState<number | null>(30);
  const [dateRange, setDateRange] = useState<SLADateRange>({
    from: daysAgoISO(30),
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

  const { data: territories = [], isLoading: loadTerr, isError: errTerr, refetch: refetchTerr } = useSLAByTerritory(selectedCpoId, dateRange);
  const { data: cpos = [], isLoading: loadCPO, isError: errCPO, refetch: refetchCPO } = useSLAByCPO(selectedCpoId, dateRange);
  const { data: stations = [] } = useStations(selectedCpoId);

  // Global SLA
  const globalPct = useMemo(() => {
    if (!territories.length) return 0;
    const total = territories.reduce((s, t) => s + t.total_stations, 0);
    const operational = territories.reduce(
      (s, t) => s + t.available + t.charging + t.other,
      0
    );
    return total > 0 ? Math.round((operational / total) * 1000) / 10 : 0;
  }, [territories]);

  const worstTerritory = useMemo(
    () => [...territories].sort((a, b) => a.availability_pct - b.availability_pct)[0],
    [territories]
  );
  const bestTerritory = useMemo(
    () => [...territories].sort((a, b) => b.availability_pct - a.availability_pct)[0],
    [territories]
  );

  // Export CSV bornes
  function handleExportStations() {
    const rows = stations.map((s) => ({
      "ID GFX": s.gfx_id,
      Nom: s.name,
      Ville: s.city ?? "",
      Territoire: s.territory_name ?? "",
      CPO: s.cpo_name ?? "",
      Statut: s.ocpp_status,
      "En ligne": s.is_online ? "Oui" : "Non",
      "Puissance (kW)": s.max_power_kw ?? "",
      "Dernière sync": s.last_synced_at ?? "",
    }));
    downloadCSV(rows, `ezdrive-bornes-${todayISO()}.csv`);
  }

  // Export CSV SLA territoires
  function handleExportSLA() {
    const rows = territories.map((t) => ({
      Territoire: t.territory_name ?? t.territory_code,
      "Total bornes": t.total_stations,
      Disponibles: t.available,
      "En charge": t.charging,
      "En panne": t.faulted,
      Indisponibles: t.unavailable,
      "Taux disponibilité (%)": t.availability_pct,
      "Durée panne moy. (h)": t.avg_fault_hours ?? "",
    }));
    downloadCSV(rows, `ezdrive-sla-territoires-${todayISO()}.csv`);
  }

  const isLoading = loadTerr || loadCPO;
  const isError = errTerr || errCPO;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold">Analytics & SLA</h1>
          <p className="text-sm text-foreground-muted">
            Taux de disponibilité par territoire et CPO
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportSLA}
            disabled={territories.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            SLA CSV
          </button>
          <button
            onClick={handleExportStations}
            disabled={stations.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Bornes CSV
          </button>
        </div>
      </div>

      {/* Date range selector */}
      <div className="flex flex-wrap items-center gap-3 bg-surface border border-border rounded-2xl px-4 py-3">
        <CalendarDays className="w-4 h-4 text-foreground-muted shrink-0" />
        <span className="text-xs text-foreground-muted font-medium">Période :</span>
        <div className="flex gap-1">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => handlePreset(p.days)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                activePreset === p.days
                  ? "bg-primary text-white"
                  : "bg-surface-elevated text-foreground-muted hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="h-5 w-px bg-border mx-1" />
        <div className="flex items-center gap-2 text-xs">
          <label className="text-foreground-muted">Du</label>
          <input
            type="date"
            value={dateRange.from ?? ""}
            onChange={(e) => handleCustomFrom(e.target.value)}
            className="bg-surface-elevated border border-border rounded-lg px-2 py-1.5 text-xs text-foreground"
          />
          <label className="text-foreground-muted">au</label>
          <input
            type="date"
            value={dateRange.to ?? ""}
            onChange={(e) => handleCustomTo(e.target.value)}
            className="bg-surface-elevated border border-border rounded-lg px-2 py-1.5 text-xs text-foreground"
          />
        </div>
      </div>

      <PageHelp
        summary="Analyse de performance et suivi des SLA de votre réseau de bornes"
        items={[
          { label: "Taux de disponibilité", description: "Pourcentage de temps où les bornes sont opérationnelles (Available + Charging) vs total." },
          { label: "SLA", description: "Service Level Agreement — objectif contractuel de disponibilité (généralement 95-99%)." },
          { label: "Temps moyen de résolution", description: "Durée moyenne entre la détection d'une panne et sa résolution." },
          { label: "Graphiques temporels", description: "Évolution des métriques sur la période sélectionnée (jour, semaine, mois)." },
        ]}
        tips={["Les données sont calculées à partir des changements de statut OCPP enregistrés par le serveur."]}
      />

      {isLoading ? (
        <>
          {/* KPI skeletons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <SLARowSkeleton count={5} />
          <SLARowSkeleton count={3} />
        </>
      ) : isError ? (
        <ErrorState
          message="Impossible de charger les données SLA"
          onRetry={() => { refetchTerr(); refetchCPO(); }}
        />
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-surface border border-border rounded-2xl px-5 py-4">
              <div className="flex items-center gap-2 text-foreground-muted text-xs mb-2">
                <TrendingUp className="w-3.5 h-3.5" />
                Disponibilité globale
              </div>
              <div
                className={cn(
                  "text-3xl font-bold font-heading",
                  globalPct >= 90
                    ? "text-status-available"
                    : globalPct >= 70
                    ? "text-yellow-400"
                    : "text-status-faulted"
                )}
              >
                {globalPct.toFixed(1)}%
              </div>
              <div className="mt-2">
                <AvailBar pct={globalPct} />
              </div>
            </div>

            <div className="bg-surface border border-border rounded-2xl px-5 py-4">
              <div className="flex items-center gap-2 text-foreground-muted text-xs mb-2">
                <CheckCircle className="w-3.5 h-3.5 text-status-available" />
                Meilleur territoire
              </div>
              {bestTerritory ? (
                <>
                  <div className="text-sm font-semibold">
                    {bestTerritory.territory_name ?? bestTerritory.territory_code ?? "—"}
                  </div>
                  <div className="text-2xl font-bold font-heading text-status-available mt-1">
                    {bestTerritory.availability_pct.toFixed(1)}%
                  </div>
                  <div className="text-xs text-foreground-muted">{bestTerritory.total_stations} bornes</div>
                </>
              ) : (
                <div className="text-foreground-muted text-sm">—</div>
              )}
            </div>

            <div className="bg-surface border border-border rounded-2xl px-5 py-4">
              <div className="flex items-center gap-2 text-foreground-muted text-xs mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-status-faulted" />
                À surveiller
              </div>
              {worstTerritory ? (
                <>
                  <div className="text-sm font-semibold">
                    {worstTerritory.territory_name ?? worstTerritory.territory_code ?? "—"}
                  </div>
                  <div
                    className={cn(
                      "text-2xl font-bold font-heading mt-1",
                      worstTerritory.availability_pct >= 90
                        ? "text-status-available"
                        : worstTerritory.availability_pct >= 70
                        ? "text-yellow-400"
                        : "text-status-faulted"
                    )}
                  >
                    {worstTerritory.availability_pct.toFixed(1)}%
                  </div>
                  <div className="text-xs text-foreground-muted">
                    {worstTerritory.faulted} en panne / {worstTerritory.total_stations} bornes
                  </div>
                </>
              ) : (
                <div className="text-foreground-muted text-sm">—</div>
              )}
            </div>
          </div>

          {/* SLA par territoire */}
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">Disponibilité par territoire</h2>
            </div>
            <div className="divide-y divide-border">
              {territories.map((t) => (
                <div
                  key={t.territory_code ?? "null"}
                  className="px-5 py-3 grid grid-cols-[1fr_auto_auto_auto_auto_200px] items-center gap-4"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {t.territory_name ?? t.territory_code ?? "Non assigné"}
                    </p>
                    <p className="text-xs text-foreground-muted">{t.total_stations} bornes</p>
                  </div>
                  <span className="text-xs text-status-available font-medium">{t.available} dispo</span>
                  <span className="text-xs text-status-charging font-medium">{t.charging} charge</span>
                  <span className="text-xs text-status-faulted font-medium">{t.faulted} panne</span>
                  {t.avg_fault_hours != null ? (
                    <span className="text-xs text-foreground-muted">moy {t.avg_fault_hours.toFixed(0)}h</span>
                  ) : (
                    <span />
                  )}
                  <AvailBar pct={t.availability_pct} />
                </div>
              ))}
              {territories.length === 0 && (
                <div className="flex items-center justify-center h-20 text-foreground-muted text-sm">
                  Aucune donnée
                </div>
              )}
            </div>
          </div>

          {/* SLA par CPO */}
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">Disponibilité par CPO</h2>
            </div>
            <div className="divide-y divide-border">
              {cpos.map((c) => (
                <div
                  key={c.cpo_code ?? "null"}
                  className="px-5 py-3 grid grid-cols-[1fr_auto_auto_auto_200px] items-center gap-4"
                >
                  <div className="flex items-center gap-2">
                    {c.cpo_color && (
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: c.cpo_color }}
                      />
                    )}
                    <div>
                      <p className="text-sm font-medium">{c.cpo_name ?? "Non assigné"}</p>
                      <p className="text-xs text-foreground-muted">{c.total_stations} bornes</p>
                    </div>
                  </div>
                  <span className="text-xs text-status-available font-medium">{c.available} dispo</span>
                  <span className="text-xs text-status-charging font-medium">{c.charging} charge</span>
                  <span className="text-xs text-status-faulted font-medium">{c.faulted} panne</span>
                  <AvailBar pct={c.availability_pct} />
                </div>
              ))}
              {cpos.length === 0 && (
                <div className="flex items-center justify-center h-20 text-foreground-muted text-sm">
                  Aucune donnée
                </div>
              )}
            </div>
          </div>

          {/* Tendance SLA historique */}
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">Tendance SLA historique</h2>
            </div>
            <div className="px-5 py-4">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-64 text-foreground-muted text-sm">
                    Chargement du graphique...
                  </div>
                }
              >
                <SlaTrendChart
                  cpoId={selectedCpoId}
                  from={dateRange.from}
                  to={dateRange.to}
                />
              </Suspense>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
