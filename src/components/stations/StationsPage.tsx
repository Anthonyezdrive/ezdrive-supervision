// ============================================================
// EZDrive — Stations Page (GreenFlux-style)
// List view → click → full page detail with 6 tabs
// ============================================================

import { useState, useMemo, useCallback } from "react";
import { Download, Plus, Upload, RotateCcw, X, Zap } from "lucide-react";
import { useStations } from "@/hooks/useStations";
import { useCPOs } from "@/hooks/useCPOs";
import { useTerritories } from "@/hooks/useTerritories";
import { useCpo } from "@/contexts/CpoContext";
import { useQueryClient } from "@tanstack/react-query";
import { useOcppCommand } from "@/hooks/useOcppCommands";
import { FilterBar } from "@/components/ui/FilterBar";
import { StationTable } from "./StationTable";
import { StationDetailView } from "./StationDetailView";
import { StationFormModal } from "./StationFormModal";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { DEFAULT_FILTERS, type StationFilters } from "@/types/filters";
import type { Station } from "@/types/station";
import { downloadCSV, todayISO } from "@/lib/export";
import { PageHelp } from "@/components/ui/PageHelp";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type PowerFilter = "all" | "ac_22" | "dc_60" | "dc_fast";

export function StationsPage() {
  const { t } = useTranslation();

  const POWER_FILTERS: { key: PowerFilter; label: string }[] = [
    { key: "all", label: t("common.all") },
    { key: "ac_22", label: "AC ≤22kW" },
    { key: "dc_60", label: "DC 25-60kW" },
    { key: "dc_fast", label: "DC >60kW" },
  ];
  const { selectedCpoId } = useCpo();
  const { data: stations, isLoading, isError, refetch } = useStations(selectedCpoId);
  const { data: cpos } = useCPOs();
  const { data: territories } = useTerritories();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<StationFilters>(DEFAULT_FILTERS);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editStation, setEditStation] = useState<Station | null>(null);
  const [powerFilter, setPowerFilter] = useState<PowerFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStatus, setImportStatus] = useState<{ loading: boolean; message: string | null }>({ loading: false, message: null });
  const [batchResetLoading, setBatchResetLoading] = useState(false);
  const [batchResetConfirm, setBatchResetConfirm] = useState(false);
  const ocppCommand = useOcppCommand();

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleStationUpdated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["stations"] });
    setSelectedStation(null);
    setEditStation(null);
    setShowCreateModal(false);
  }, [queryClient]);

  const filtered = useMemo(() => {
    if (!stations) return [];
    return stations.filter((s) => {
      if (filters.cpo && s.cpo_code !== filters.cpo) return false;
      if (filters.territory && s.territory_code !== filters.territory) return false;
      if (filters.status && s.ocpp_status !== filters.status) return false;
      if (filters.source && s.source !== filters.source) return false;
      // Power filter
      if (powerFilter !== "all") {
        const pw = s.max_power_kw ?? 0;
        if (powerFilter === "ac_22" && pw > 22) return false;
        if (powerFilter === "dc_60" && (pw < 25 || pw > 60)) return false;
        if (powerFilter === "dc_fast" && pw <= 60) return false;
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.gfx_id?.toLowerCase().includes(q) ?? false) ||
          (s.address?.toLowerCase().includes(q) ?? false) ||
          (s.city?.toLowerCase().includes(q) ?? false) ||
          (s.charge_point_vendor?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [stations, filters, powerFilter]);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map((s) => s.id));
    });
  }, [filtered]);

  const selectedStations = useMemo(
    () => filtered.filter((s) => selectedIds.has(s.id)),
    [filtered, selectedIds]
  );

  async function handleBatchReset() {
    setBatchResetLoading(true);
    try {
      for (const station of selectedStations) {
        await ocppCommand.mutateAsync({
          stationId: station.id,
          command: "Reset",
          params: { type: "Soft" },
        });
      }
      setSelectedIds(new Set());
      setBatchResetConfirm(false);
    } catch {
      // individual errors are handled by the mutation
    } finally {
      setBatchResetLoading(false);
    }
  }

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
      Modele: s.charge_point_model ?? "",
      Firmware: s.firmware_version ?? "",
      Protocole: s.protocol_version ?? "",
      "Type borne": s.charger_type ?? "",
      Vitesse: s.charging_speed ?? "",
      "Remote Start/Stop": s.remote_manageable ? "Oui" : "Non",
      "Heures dans statut": s.hours_in_status != null ? Math.round(s.hours_in_status) : "",
      "Derniere sync": s.last_synced_at ?? "",
    }));
    downloadCSV(rows, `ezdrive-bornes-${todayISO()}.csv`);
  }

  // Level 2: Station detail (full page, GreenFlux-style)
  if (selectedStation) {
    return (
      <StationDetailView
        station={selectedStation}
        onBack={() => setSelectedStation(null)}
        onEdit={(s) => { setSelectedStation(null); setEditStation(s); }}
        onDeleted={handleStationUpdated}
      />
    );
  }

  // Level 1: Station list
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-bold">
          Stations de charge ({stations?.length ?? 0})
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-foreground-muted">
            {filtered.length} / {stations?.length ?? 0} bornes
          </span>
          <button
            type="button"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border rounded-xl text-xs text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border rounded-xl text-xs text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Importer CSV
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-background rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            + Ajouter Nouveau
          </button>
        </div>
      </div>

      <PageHelp
        summary="Vue temps reel de toutes vos bornes de recharge avec filtres et export"
        items={[
          { label: "Filtres", description: "Filtrez par CPO, territoire, statut OCPP ou recherchez par nom/adresse/identifiant." },
          { label: "Statuts OCPP", description: "Available (libre), Charging (en charge), Faulted (en panne), Unavailable (hors service)." },
          { label: "Fiche detaillee", description: "Cliquez sur une borne pour ouvrir sa fiche complete avec 6 onglets (Details, Diagnostic, Facturation, Configuration, Autorisation, Planification)." },
          { label: "Export CSV", description: "Le bouton Export telecharge la liste filtree au format CSV pour Excel." },
        ]}
      />

      <FilterBar
        filters={filters}
        onFiltersChange={setFilters}
        cpos={cpos ?? []}
        territories={territories ?? []}
      />

      {/* Power type filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-foreground-muted">Puissance :</span>
        {POWER_FILTERS.map((pf) => (
          <button
            type="button"
            key={pf.key}
            onClick={() => setPowerFilter(pf.key)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-all",
              powerFilter === pf.key
                ? "bg-primary/15 text-primary border-primary/30"
                : "text-foreground-muted border-border hover:border-foreground-muted"
            )}
          >
            {pf.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <TableSkeleton rows={10} />
      ) : isError ? (
        <ErrorState
          message={t("common.error")}
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-foreground-muted">
          <p className="text-lg mb-1">Aucune borne trouvee</p>
          <p className="text-sm">Ajustez vos filtres ou lancez une synchronisation.</p>
        </div>
      ) : (
        <StationTable
          stations={filtered}
          onSelect={(s) => setSelectedStation(s)}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />
      )}

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-surface border border-border rounded-2xl px-5 py-3 shadow-2xl">
          <span className="text-sm font-semibold text-foreground">
            {selectedIds.size} borne{selectedIds.size > 1 ? "s" : ""} selectionnee{selectedIds.size > 1 ? "s" : ""}
          </span>
          <div className="w-px h-6 bg-border" />
          <button
            type="button"
            onClick={() => setBatchResetConfirm(true)}
            disabled={batchResetLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/25 rounded-xl text-xs font-semibold hover:bg-amber-500/20 transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset groupe
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="flex items-center gap-1.5 px-3 py-1.5 text-foreground-muted border border-border rounded-xl text-xs hover:text-foreground hover:border-foreground-muted transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Deselectionner
          </button>
        </div>
      )}

      {/* Batch reset confirmation dialog */}
      {batchResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-foreground">Reset groupe</h3>
                <p className="text-sm text-foreground-muted">
                  Envoyer un reset OCPP a {selectedIds.size} borne{selectedIds.size > 1 ? "s" : ""} ?
                </p>
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto mb-4 space-y-1">
              {selectedStations.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-xs text-foreground-muted px-2 py-1 bg-surface-elevated rounded-lg">
                  <span className={cn(
                    "w-2 h-2 rounded-full",
                    s.connectivity_status === "Online" ? "bg-emerald-400" : "bg-red-400"
                  )} />
                  <span className="truncate">{s.name}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBatchResetConfirm(false)}
                disabled={batchResetLoading}
                className="px-4 py-2 text-sm text-foreground-muted hover:text-foreground transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleBatchReset}
                disabled={batchResetLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-black rounded-xl text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {batchResetLoading ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    Reset en cours...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    Confirmer le reset
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
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

      {/* Import CSV Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-lg font-heading font-bold text-foreground mb-2">Importer des bornes (CSV)</h2>
            <p className="text-sm text-foreground-muted mb-4">
              Format attendu : name, address, city, postal_code, latitude, longitude, power_kw, cpo, ocpp_identity
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImportStatus({ loading: true, message: null });
                try {
                  const text = await file.text();
                  const lines = text.split("\n").filter((l) => l.trim());
                  if (lines.length < 2) { setImportStatus({ loading: false, message: "Fichier vide ou invalide." }); return; }
                  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
                  const rows = lines.slice(1).map((line) => {
                    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
                    const obj: Record<string, string> = {};
                    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
                    return obj;
                  });
                  const inserts = rows.map((r) => ({
                    name: r.name || "Sans nom",
                    address: r.address || null,
                    city: r.city || null,
                    postal_code: r.postal_code || null,
                    latitude: r.latitude ? parseFloat(r.latitude) : null,
                    longitude: r.longitude ? parseFloat(r.longitude) : null,
                    max_power_kw: r.power_kw ? parseFloat(r.power_kw) : null,
                    cpo_name: r.cpo || null,
                    ocpp_identity: r.ocpp_identity || null,
                  }));
                  const { error } = await supabase.from("stations").insert(inserts);
                  if (error) throw error;
                  setImportStatus({ loading: false, message: `${inserts.length} borne(s) importee(s) avec succes.` });
                  queryClient.invalidateQueries({ queryKey: ["stations"] });
                } catch (err) {
                  setImportStatus({ loading: false, message: `Erreur : ${err instanceof Error ? err.message : "Erreur inconnue"}` });
                }
              }}
              className="w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              disabled={importStatus.loading}
            />
            {importStatus.message && (
              <p className={cn("text-sm mt-3", importStatus.message.startsWith("Erreur") ? "text-danger" : "text-status-available")}>{importStatus.message}</p>
            )}
            <div className="flex justify-end mt-4">
              <button type="button" onClick={() => { setShowImportModal(false); setImportStatus({ loading: false, message: null }); }} className="px-4 py-2 text-sm text-foreground-muted hover:text-foreground transition-colors">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
