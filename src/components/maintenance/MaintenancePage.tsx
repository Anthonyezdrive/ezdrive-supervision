import { useState, useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { useMaintenanceStations } from "@/hooks/useMaintenanceStations";
import { useCPOs } from "@/hooks/useCPOs";
import { useTerritories } from "@/hooks/useTerritories";
import { FilterBar } from "@/components/ui/FilterBar";
import { MaintenanceTable } from "./MaintenanceTable";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { DEFAULT_FILTERS, type StationFilters } from "@/types/filters";

export function MaintenancePage() {
  const { data: stations, isLoading, isError, refetch } = useMaintenanceStations();
  const { data: cpos } = useCPOs();
  const { data: territories } = useTerritories();
  const [filters, setFilters] = useState<StationFilters>(DEFAULT_FILTERS);

  const filtered = useMemo(() => {
    if (!stations) return [];
    return stations.filter((s) => {
      if (filters.cpo && s.cpo_code !== filters.cpo) return false;
      if (filters.territory && s.territory_code !== filters.territory) return false;
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

  const criticalCount = filtered.filter((s) => s.hours_in_fault >= 24).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-xl font-bold">Maintenance</h1>
          {criticalCount > 0 && (
            <span className="inline-flex items-center gap-1 bg-status-faulted/15 text-status-faulted border border-status-faulted/30 rounded-lg px-2.5 py-1 text-xs font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />
              {criticalCount} critique{criticalCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {!isLoading && !isError && (
          <span className="text-sm text-foreground-muted">
            {filtered.length} borne{filtered.length > 1 ? "s" : ""} en défaut
          </span>
        )}
      </div>

      <FilterBar
        filters={filters}
        onFiltersChange={setFilters}
        cpos={cpos ?? []}
        territories={territories ?? []}
        showStatusFilter={false}
      />

      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : isError ? (
        <ErrorState
          message="Impossible de charger les données de maintenance"
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 bg-surface border border-border rounded-2xl">
          <div className="w-12 h-12 rounded-xl bg-status-available/15 flex items-center justify-center mb-3">
            <AlertTriangle className="w-6 h-6 text-status-available" />
          </div>
          <p className="text-foreground font-medium">Aucune borne en défaut</p>
          <p className="text-sm text-foreground-muted mt-1">
            Toutes les bornes fonctionnent normalement.
          </p>
        </div>
      ) : (
        <MaintenanceTable stations={filtered} />
      )}
    </div>
  );
}
