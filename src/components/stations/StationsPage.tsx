import { useState, useMemo, useCallback } from "react";
import { Download, Plus } from "lucide-react";
import { useStations } from "@/hooks/useStations";
import { useCPOs } from "@/hooks/useCPOs";
import { useTerritories } from "@/hooks/useTerritories";
import { useCpo } from "@/contexts/CpoContext";
import { useQueryClient } from "@tanstack/react-query";
import { FilterBar } from "@/components/ui/FilterBar";
import { StationTable } from "./StationTable";
import { StationDetailDrawer } from "./StationDetailDrawer";
import { StationFormModal } from "./StationFormModal";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { DEFAULT_FILTERS, type StationFilters } from "@/types/filters";
import type { Station } from "@/types/station";
import { downloadCSV, todayISO } from "@/lib/export";
import { PageHelp } from "@/components/ui/PageHelp";

export function StationsPage() {
  const { selectedCpoId } = useCpo();
  const { data: stations, isLoading, isError, refetch } = useStations(selectedCpoId);
  const { data: cpos } = useCPOs();
  const { data: territories } = useTerritories();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<StationFilters>(DEFAULT_FILTERS);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editStation, setEditStation] = useState<Station | null>(null);

  const handleStationUpdated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["stations"] });
    setSelectedStation(null);
    setEditStation(null);
    setShowCreateModal(false);
  }, [queryClient]);

  function handleExport() {
    const rows = (filtered ?? []).map((s) => ({
      "ID GFX": s.gfx_id,
      Nom: s.name,
      Adresse: s.address ?? "",
      Ville: s.city ?? "",
      Territoire: s.territory_name ?? "",
      CPO: s.cpo_name ?? "",
      Statut: s.ocpp_status,
      Connexion: s.connectivity_status ?? "",
      "En ligne": s.is_online ? "Oui" : "Non",
      "Puissance (kW)": s.max_power_kw ?? "",
      Fabricant: s.charge_point_vendor ?? "",
      Modèle: s.charge_point_model ?? "",
      Firmware: s.firmware_version ?? "",
      Protocole: s.protocol_version ?? "",
      "Type borne": s.charger_type ?? "",
      Vitesse: s.charging_speed ?? "",
      "Remote Start/Stop": s.remote_manageable ? "Oui" : "Non",
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
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-background rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouvelle borne
          </button>
        </div>
      </div>

      <PageHelp
        summary="Vue temps réel de toutes vos bornes de recharge avec filtres et export"
        items={[
          { label: "Filtres", description: "Filtrez par CPO, territoire, statut OCPP ou recherchez par nom/adresse." },
          { label: "Statuts OCPP", description: "Available (libre), Charging (en charge), Faulted (en panne), Unavailable (hors service), Preparing/Finishing (en transition)." },
          { label: "Fiche détaillée", description: "Cliquez sur une borne pour ouvrir sa fiche avec tous ses détails techniques (firmware, connecteurs, historique)." },
          { label: "Export CSV", description: "Le bouton Export télécharge la liste filtrée au format CSV pour Excel." },
        ]}
        tips={["Les bornes se synchronisent toutes les 5 minutes via GreenFlux. Le statut 'Faulted' nécessite une intervention terrain."]}
      />

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
          onEdit={(s) => { setSelectedStation(null); setEditStation(s); }}
          onDeleted={handleStationUpdated}
        />
      )}

      {/* Create / Edit Modal */}
      {(showCreateModal || editStation) && (
        <StationFormModal
          station={editStation ?? undefined}
          cpos={cpos ?? []}
          territories={territories ?? []}
          onClose={() => { setShowCreateModal(false); setEditStation(null); }}
          onSaved={handleStationUpdated}
        />
      )}
    </div>
  );
}
