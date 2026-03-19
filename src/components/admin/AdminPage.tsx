import { useState, useMemo } from "react";
import { Tag, Search, CheckCircle, Loader2, ChevronDown } from "lucide-react";
import { PageHelp } from "@/components/ui/PageHelp";
import { useStations } from "@/hooks/useStations";
import { useCPOs } from "@/hooks/useCPOs";
import { useTerritories } from "@/hooks/useTerritories";
import { useUpdateStationCPO } from "@/hooks/useUpdateStationCPO";
import { useCpo } from "@/contexts/CpoContext";
import type { Station } from "@/types/station";

type SaveState = "idle" | "saving" | "saved" | "error";

export function AdminPage() {
  const { selectedCpoId } = useCpo();
  const { data: stations = [], isLoading } = useStations(selectedCpoId);
  const { data: cpos = [] } = useCPOs();
  const { data: territories = [] } = useTerritories();
  const updateCPO = useUpdateStationCPO();

  const [search, setSearch] = useState("");
  const [filterTerritory, setFilterTerritory] = useState("");
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});

  const filtered = useMemo(() => {
    return stations.filter((s) => {
      if (showUnassigned && s.cpo_id) return false;
      if (filterTerritory && s.territory_code !== filterTerritory) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.gfx_id.toLowerCase().includes(q) ||
          (s.city?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [stations, search, filterTerritory, showUnassigned]);

  const unassignedCount = stations.filter((s) => !s.cpo_id).length;

  // Répartition CPO
  const cpoStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of stations) {
      const key = s.cpo_name ?? "Non assigné";
      map[key] = (map[key] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [stations]);

  async function handleCPOChange(station: Station, newCpoId: string) {
    setSaveStates((prev) => ({ ...prev, [station.id]: "saving" }));
    try {
      await updateCPO.mutateAsync({
        station_id: station.id,
        gfx_id: station.gfx_id,
        cpo_id: newCpoId === "" ? null : newCpoId,
      });
      setSaveStates((prev) => ({ ...prev, [station.id]: "saved" }));
      setTimeout(() => {
        setSaveStates((prev) => ({ ...prev, [station.id]: "idle" }));
      }, 2000);
    } catch {
      setSaveStates((prev) => ({ ...prev, [station.id]: "error" }));
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold">Gestion CPO</h1>
          <p className="text-sm text-foreground-muted">
            Assignez manuellement les bornes aux opérateurs CPO
          </p>
        </div>
        {unassignedCount > 0 && (
          <span className="inline-flex items-center gap-1.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 rounded-lg px-3 py-1.5 text-xs font-semibold">
            <Tag className="w-3.5 h-3.5" />
            {unassignedCount} non assignée{unassignedCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <PageHelp
        summary="Panneau d'administration pour la gestion des CPO, territoires et configurations"
        items={[
          { label: "CPO", description: "Charge Point Operator — entité qui gère un ensemble de bornes. Ajoutez ou modifiez les CPO ici." },
          { label: "Territoires", description: "Zones géographiques (Martinique, Guadeloupe, Guyane, Réunion) regroupant les bornes." },
          { label: "Synchronisation GFX", description: "Déclenchez une synchronisation manuelle avec GreenFlux pour mettre à jour les bornes." },
          { label: "Configuration", description: "Paramètres globaux du système de supervision." },
        ]}
        tips={["Seuls les utilisateurs avec le rôle Admin ou Opérateur ont accès à cette page."]}
      />

      {/* Résumé CPO */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cpoStats.map(([name, count]) => (
          <div
            key={name}
            className="bg-surface border border-border rounded-xl px-4 py-3"
          >
            <p className="text-xs text-foreground-muted">{name}</p>
            <p className="text-2xl font-bold font-heading mt-0.5">{count}</p>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            type="text"
            placeholder="Rechercher une borne..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-surface border border-border rounded-xl focus:outline-none focus:border-primary/50 placeholder:text-foreground-muted"
          />
        </div>

        <div className="relative">
          <select
            value={filterTerritory}
            onChange={(e) => setFilterTerritory(e.target.value)}
            className="appearance-none bg-surface border border-border rounded-xl px-4 py-2 pr-8 text-sm focus:outline-none focus:border-primary/50"
          >
            <option value="">Tous les territoires</option>
            {territories.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted pointer-events-none" />
        </div>

        <button
          onClick={() => setShowUnassigned(!showUnassigned)}
          className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
            showUnassigned
              ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
              : "text-foreground-muted border-border hover:border-foreground-muted"
          }`}
        >
          Non assignées seulement
        </button>

        <span className="text-sm text-foreground-muted ml-auto">
          {filtered.length} / {stations.length} bornes
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-foreground-muted">
          Chargement...
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  {["Borne", "Ville", "Territoire", "Puissance", "CPO"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((station) => {
                  const state = saveStates[station.id] ?? "idle";
                  return (
                    <tr key={station.id} className="hover:bg-surface-elevated/40 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium">{station.name}</p>
                        <p className="text-xs text-foreground-muted font-mono">
                          {station.gfx_id}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">
                        {station.city ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">
                        {station.territory_name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">
                        {station.max_power_kw
                          ? `${station.max_power_kw} kW`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <CPOSelector
                          currentCpoId={station.cpo_id}
                          cpos={cpos}
                          state={state}
                          onChange={(cpoId) =>
                            handleCPOChange(station, cpoId)
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="flex items-center justify-center h-32 text-foreground-muted text-sm">
                Aucune borne ne correspond aux filtres
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CPOSelector({
  currentCpoId,
  cpos,
  state,
  onChange,
}: {
  currentCpoId: string | null;
  cpos: Array<{ id: string; name: string; code: string; color: string | null }>;
  state: SaveState;
  onChange: (cpoId: string) => void;
}) {
  if (state === "saving") {
    return (
      <div className="flex items-center gap-2 text-sm text-foreground-muted">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Sauvegarde...
      </div>
    );
  }

  if (state === "saved") {
    return (
      <div className="flex items-center gap-2 text-sm text-status-available">
        <CheckCircle className="w-3.5 h-3.5" />
        Sauvegardé
      </div>
    );
  }

  if (state === "error") {
    return (
      <span className="text-sm text-status-faulted">Erreur — réessayer</span>
    );
  }

  return (
    <div className="relative">
      <select
        value={currentCpoId ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none text-sm rounded-lg px-3 py-1.5 pr-7 border focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors ${
          currentCpoId
            ? "bg-surface-elevated border-border"
            : "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
        }`}
      >
        <option value="">— Non assigné</option>
        {cpos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted pointer-events-none" />
    </div>
  );
}
