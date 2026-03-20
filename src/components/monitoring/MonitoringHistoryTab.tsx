import { useState, useMemo } from "react";
import { History, Search, Download, Wrench } from "lucide-react";
import { downloadCSV, todayISO } from "@/lib/export";
import { useAlertHistory } from "./monitoring-shared";
import InterventionCreateFromAlert, {
  type AlertForIntervention,
} from "./InterventionCreateFromAlert";

export default function AlertHistoryTab() {
  const { data: history, isLoading } = useAlertHistory();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [stationSearch, setStationSearch] = useState("");
  const [interventionAlert, setInterventionAlert] =
    useState<AlertForIntervention | null>(null);

  const filtered = useMemo(() => {
    if (!history) return [];
    return (history as any[]).filter((entry) => {
      if (statusFilter !== "all" && entry.alert_type !== statusFilter) return false;
      if (stationSearch) {
        const q = stationSearch.toLowerCase();
        const name = entry.stations?.name?.toLowerCase() ?? "";
        const id = entry.station_id?.toLowerCase() ?? "";
        if (!name.includes(q) && !id.includes(q)) return false;
      }
      if (dateFrom) {
        const entryDate = new Date(entry.sent_at).toISOString().slice(0, 10);
        if (entryDate < dateFrom) return false;
      }
      if (dateTo) {
        const entryDate = new Date(entry.sent_at).toISOString().slice(0, 10);
        if (entryDate > dateTo) return false;
      }
      return true;
    });
  }, [history, statusFilter, stationSearch, dateFrom, dateTo]);

  const alertTypes = useMemo(() => {
    if (!history) return [];
    const types = new Set((history as any[]).map((h) => h.alert_type).filter(Boolean));
    return Array.from(types);
  }, [history]);

  function handleExportCSV() {
    const rows = filtered.map((entry: any) => ({
      Borne: entry.stations?.name ?? entry.station_id,
      Type: entry.alert_type,
      "Heures en panne": entry.hours_in_fault != null ? Number(entry.hours_in_fault).toFixed(1) : "",
      "Envoyé le": entry.sent_at ? new Date(entry.sent_at).toLocaleString("fr-FR") : "",
    }));
    downloadCSV(rows, `ezdrive-alertes-historique-${todayISO()}.csv`);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px] max-w-xs">
          <label className="block text-xs text-foreground-muted mb-1">Rechercher borne</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
            <input
              type="text"
              placeholder="Nom ou ID..."
              value={stationSearch}
              onChange={(e) => setStationSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-foreground-muted mb-1">Type d'alerte</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
          >
            <option value="all">Tous les types</option>
            {alertTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-foreground-muted mb-1">Du</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-foreground-muted mb-1">Au</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>
        <button
          onClick={handleExportCSV}
          disabled={filtered.length === 0}
          className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          CSV
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-xs text-foreground-muted">
        <span>{filtered.length} alerte{filtered.length !== 1 ? "s" : ""}</span>
        {dateFrom && <span>depuis {dateFrom}</span>}
        {dateTo && <span>jusqu'au {dateTo}</span>}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-surface border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 bg-surface border border-border rounded-2xl">
          <History className="w-8 h-8 text-foreground-muted/40 mb-2" />
          <p className="text-foreground-muted">Aucune alerte dans l'historique</p>
          <p className="text-xs text-foreground-muted/60 mt-1">Ajustez vos filtres ou attendez que des alertes soient envoyées.</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-foreground-muted border-b border-border bg-surface-elevated">
                  <th className="text-left font-medium px-4 py-3">Borne</th>
                  <th className="text-left font-medium px-4 py-3">Type</th>
                  <th className="text-left font-medium px-4 py-3">Heures en panne</th>
                  <th className="text-left font-medium px-4 py-3">Envoyé le</th>
                  <th className="text-right font-medium px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((entry: any) => (
                  <tr key={entry.id} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {entry.stations?.name ?? entry.station_id?.slice(0, 8) ?? "--"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-xs font-medium rounded-lg">
                        {entry.alert_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground-muted tabular-nums">
                      {entry.hours_in_fault != null ? `${Number(entry.hours_in_fault).toFixed(1)}h` : "--"}
                    </td>
                    <td className="px-4 py-3 text-foreground-muted text-xs">
                      {entry.sent_at
                        ? new Date(entry.sent_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "--"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() =>
                          setInterventionAlert({
                            id: entry.id,
                            alert_type: entry.alert_type,
                            title: entry.alert_type,
                            station_id: entry.station_id ?? undefined,
                            station_name:
                              entry.stations?.name ?? entry.station_id?.slice(0, 8) ?? undefined,
                            triggered_at: entry.sent_at ?? undefined,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-primary hover:text-white bg-primary/10 hover:bg-primary rounded-lg transition-colors"
                        title="Créer une intervention depuis cette alerte"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        Intervention
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Intervention creation modal */}
      {interventionAlert && (
        <InterventionCreateFromAlert
          alert={interventionAlert}
          onClose={() => setInterventionAlert(null)}
          onCreated={() => setInterventionAlert(null)}
        />
      )}
    </div>
  );
}
