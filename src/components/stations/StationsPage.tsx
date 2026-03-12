import { useState, useMemo } from "react";
import { Download } from "lucide-react";
import { useStations } from "@/hooks/useStations";
import { useCPOs } from "@/hooks/useCPOs";
import { useTerritories } from "@/hooks/useTerritories";
import { FilterBar } from "@/components/ui/FilterBar";
import { StationTable } from "./StationTable";
import { StationDetailDrawer } from "./StationDetailDrawer";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { DEFAULT_FILTERS, type StationFilters } from "@/types/filters";
import type { Station } from "@/types/station";
import { downloadCSV, todayISO } from "@/lib/export";

export function StationsPage() {
  const { data: stations, isLoading, isError, refetch } = useStations();
  const { data: cpos } = useCPOs();
  const { data: territories } = useTerritories();
  const [filters, setFilters] = useState<StationFilters>(DEFAULT_FILTERS);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);

  function handleExport() {
    const rows = (filtered ?? []).map((s) => ({
      "ID GFX": s.gfx_id,
      Nom: s.name,
      Adresse: s.address ?? "",
      Ville: s.city ?? "",
      Territoire: s.territory_name ?? "",
      CPO: s.cpo_name ?? "",
      Statut: s.ocpp_status,
      "En ligne": s.is_online ? "Oui" : "Non",
      "Puissance (kW)": s.max_power_kw ?? "",
      "Heures dans statut": s.hours_in_status != null ? Math.round(s.hours_in_status) : "",
      "Dernière sync": s.last_synced_at ?? "",
    }));
    downloadCSV(rows, `ezdrive-bornes-${todayISO()}.csv`);
  }

  const filtered = useMemo(() => {
    if (!stations) return [];
    return stations.filter((s) => {
      if (filters.cpo && s.cpo_code !== filters.cpo) return false;
      if (filters.territory && s.territory_code !== filters.territory) return false;
      if (filters.status && s.ocpp_status !== filters.status) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.gfx_id.toLowerCase().includes(q) ||
          (s.address?.toLowerCase().includes(q) ?? false) ||
          (s.city?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [stations, filters]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-bold">Bornes Live</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-foreground-muted">
            {filtered.length} / {stations?.length ?? 0} bornes
          </span>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border rounded-xl text-xs text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      <FilterBar
        filters={filters}
        onFiltersChange={setFilters}
        cpos={cpos ?? []}
        territories={territories ?? []}
      />

      {isLoading ? (
        <TableSkeleton rows={10} />
      ) : isError ? (
        <ErrorState
          message="Impossible de charger les bornes"
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-foreground-muted">
          <p className="text-lg mb-1">Aucune borne trouvée</p>
          <p className="text-sm">Ajustez vos filtres ou lancez une synchronisation.</p>
        </div>
      ) : (
        <StationTable stations={filtered} onSelect={(s) => setSelectedStation(s)} />
      )}

      {selectedStation && (
        <StationDetailDrawer
          station={selectedStation}
          onClose={() => setSelectedStation(null)}
        />
      )}
    </div>
  );
}
