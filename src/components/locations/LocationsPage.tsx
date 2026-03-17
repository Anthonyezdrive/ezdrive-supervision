import { useState, useMemo } from "react";
import { PageHelp } from "@/components/ui/PageHelp";
import { useStations } from "@/hooks/useStations";
import {
  MapPin,
  Radio,
  Globe,
  Building2,
  Search,
  ChevronDown,
  CheckCircle,
  BatteryCharging,
  AlertTriangle,
  WifiOff,
  Zap,
  Plus,
  Eye,
  EyeOff,
  X,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Station } from "@/types/station";
import { supabase } from "@/lib/supabase";
import { apiPost, apiPut, apiDelete } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useCPOs } from "@/hooks/useCPOs";
import { useTerritories } from "@/hooks/useTerritories";
import { StationFormModal } from "@/components/stations/StationFormModal";

// ============================================================
// Locations Page — Stations grouped by city/territory
// ============================================================

interface LocationGroup {
  city: string;
  territory: string | null;
  stations: Station[];
  available: number;
  charging: number;
  faulted: number;
  offline: number;
  totalPower: number;
}

export function LocationsPage() {
  const { data: stations, isLoading } = useStations();
  const [search, setSearch] = useState("");
  const [expandedCity, setExpandedCity] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editStation, setEditStation] = useState<Station | null>(null);
  const [deleteStation, setDeleteStation] = useState<Station | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const queryClient = useQueryClient();
  const { data: cpos } = useCPOs();
  const { data: territories } = useTerritories();

  async function handleDeleteStation() {
    if (!deleteStation) return;
    setDeleteLoading(true);
    try {
      await apiDelete(`admin-stations/${deleteStation.id}`);
      queryClient.invalidateQueries({ queryKey: ["stations"] });
    } catch (err) {
      console.error("[Locations] delete error:", err);
    } finally {
      setDeleteLoading(false);
      setDeleteStation(null);
    }
  }

  const groups = useMemo(() => {
    if (!stations) return [];
    const map = new Map<string, LocationGroup>();

    for (const s of stations) {
      const city = s.city || "Non défini";
      let group = map.get(city);
      if (!group) {
        group = {
          city,
          territory: s.territory_name,
          stations: [],
          available: 0,
          charging: 0,
          faulted: 0,
          offline: 0,
          totalPower: 0,
        };
        map.set(city, group);
      }
      group.stations.push(s);
      group.totalPower += s.max_power_kw ?? 0;
      if (s.ocpp_status === "Available") group.available++;
      else if (s.ocpp_status === "Charging") group.charging++;
      else if (s.ocpp_status === "Faulted") group.faulted++;
      if (!s.is_online) group.offline++;
    }

    return Array.from(map.values()).sort(
      (a, b) => b.stations.length - a.stations.length
    );
  }, [stations]);

  const filtered = useMemo(() => {
    if (!search) return groups;
    const q = search.toLowerCase();
    return groups.filter(
      (g) =>
        g.city.toLowerCase().includes(q) ||
        g.territory?.toLowerCase().includes(q) ||
        g.stations.some((s) => s.name.toLowerCase().includes(q))
    );
  }, [groups, search]);

  const uniqueTerritories = useMemo(() => {
    const set = new Set(groups.map((g) => g.territory).filter(Boolean));
    return set.size;
  }, [groups]);

  async function handleTogglePublish(group: LocationGroup) {
    const allPublished = group.stations.every(
      (s) => (s as any).is_public !== false
    );
    await supabase
      .from("stations")
      .update({ is_public: !allPublished })
      .in(
        "id",
        group.stations.map((s) => s.id)
      );
    queryClient.invalidateQueries({ queryKey: ["stations"] });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">
            Localisations
          </h1>
          <p className="text-sm text-foreground-muted mt-1">
            Stations de recharge par zone géographique
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter un site
        </button>
      </div>

      <PageHelp
        summary="Gestion de vos sites d'implantation (locations OCPI) regroupant les bornes"
        items={[
          { label: "Location", description: "Un site physique (parking, station-service, copropriété) pouvant contenir plusieurs bornes." },
          { label: "Coordonnées GPS", description: "Latitude/longitude utilisées pour l'affichage sur la carte et le roaming OCPI." },
          { label: "EVSE", description: "Chaque point de charge (connecteur) de la location, identifié par un EVSE ID unique." },
          { label: "Visibilité OCPI", description: "Les locations publiées sont visibles par les opérateurs partenaires via le protocole OCPI." },
        ]}
        tips={["Assurez-vous que les coordonnées GPS sont précises — elles sont transmises aux apps de navigation des conducteurs."]}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={MapPin} label="Localisations" value={groups.length} color="#8892B0" />
        <KpiCard icon={Radio} label="Total bornes" value={stations?.length ?? 0} color="#00D4AA" />
        <KpiCard icon={Globe} label="Territoires" value={uniqueTerritories} color="#4ECDC4" />
        <KpiCard icon={Building2} label="Villes" value={groups.length} color="#F39C12" />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
        <input
          type="text"
          placeholder="Rechercher ville, territoire ou station..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
        />
      </div>

      {/* Location Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl h-40 animate-shimmer" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl py-16 text-center">
          <MapPin className="w-12 h-12 text-foreground-muted/20 mx-auto mb-3" />
          <p className="text-foreground-muted">Aucune localisation trouvée</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((group) => {
            const isExpanded = expandedCity === group.city;
            const allPublished = group.stations.every(
              (s) => (s as any).is_public !== false
            );
            return (
              <div
                key={group.city}
                className={cn(
                  "bg-surface border rounded-xl overflow-hidden transition-all",
                  isExpanded ? "border-primary/30 md:col-span-2 lg:col-span-3" : "border-border hover:border-border"
                )}
              >
                {/* Card header */}
                <button
                  onClick={() => setExpandedCity(isExpanded ? null : group.city)}
                  className="w-full text-left p-4 hover:bg-surface-elevated/30 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-heading text-sm font-semibold text-foreground">
                        {group.city}
                      </h3>
                      {group.territory && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-medium rounded">
                          {group.territory}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-heading font-bold text-foreground">
                        {group.stations.length}
                      </span>
                      <span className="text-xs text-foreground-muted">borne{group.stations.length > 1 ? "s" : ""}</span>
                      {/* Publish toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePublish(group);
                        }}
                        className={cn(
                          "p-1 rounded-lg transition-colors",
                          allPublished
                            ? "text-[#00D4AA] hover:bg-[#00D4AA]/10"
                            : "text-foreground-muted/50 hover:bg-surface-elevated"
                        )}
                        title={allPublished ? "Dépublier" : "Publier"}
                      >
                        {allPublished ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <ChevronDown className={cn(
                        "w-4 h-4 text-foreground-muted transition-transform",
                        isExpanded && "rotate-180"
                      )} />
                    </div>
                  </div>

                  {/* Status breakdown */}
                  <div className="flex items-center gap-3 text-xs">
                    {group.available > 0 && (
                      <div className="flex items-center gap-1 text-status-available">
                        <CheckCircle className="w-3 h-3" />
                        <span>{group.available}</span>
                      </div>
                    )}
                    {group.charging > 0 && (
                      <div className="flex items-center gap-1 text-status-charging">
                        <BatteryCharging className="w-3 h-3" />
                        <span>{group.charging}</span>
                      </div>
                    )}
                    {group.faulted > 0 && (
                      <div className="flex items-center gap-1 text-status-faulted">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{group.faulted}</span>
                      </div>
                    )}
                    {group.offline > 0 && (
                      <div className="flex items-center gap-1 text-status-offline">
                        <WifiOff className="w-3 h-3" />
                        <span>{group.offline}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-foreground-muted ml-auto">
                      <Zap className="w-3 h-3" />
                      <span>{Math.round(group.totalPower * 10) / 10} kW</span>
                    </div>
                  </div>
                </button>

                {/* Expanded station list */}
                {isExpanded && (
                  <div className="border-t border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="text-left px-4 py-2 text-xs font-medium text-foreground-muted">Station</th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-foreground-muted">Adresse</th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-foreground-muted">Statut</th>
                          <th className="text-right px-4 py-2 text-xs font-medium text-foreground-muted">Puissance</th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-foreground-muted">CPO</th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-foreground-muted">GPS</th>
                          <th className="text-right px-4 py-2 text-xs font-medium text-foreground-muted">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.stations.map((s) => (
                          <tr key={s.id} className="border-b border-border/30 hover:bg-surface-elevated/30 transition-colors">
                            <td className="px-4 py-2.5 text-xs font-medium text-foreground">{s.name}</td>
                            <td className="px-4 py-2.5 text-xs text-foreground-muted">{s.address}</td>
                            <td className="px-4 py-2.5">
                              <StatusDot status={s.ocpp_status} isOnline={s.is_online} />
                            </td>
                            <td className="px-4 py-2.5 text-right text-xs text-foreground-muted tabular-nums">
                              {s.max_power_kw ? `${s.max_power_kw} kW` : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-foreground-muted">{s.cpo_name ?? "—"}</td>
                            <td className="px-4 py-2.5 text-xs text-foreground-muted font-mono">
                              {(s as any).latitude && (s as any).longitude
                                ? `${Number((s as any).latitude).toFixed(4)}, ${Number((s as any).longitude).toFixed(4)}`
                                : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => setEditStation(s)}
                                  className="p-1 rounded-lg hover:bg-surface-elevated text-foreground-muted hover:text-foreground transition-colors"
                                  title="Modifier"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleteStation(s)}
                                  className="p-1 rounded-lg hover:bg-red-500/10 text-foreground-muted hover:text-red-400 transition-colors"
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Location Modal */}
      <AddLocationModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
      />

      {/* Edit Station Modal */}
      {editStation && (
        <StationFormModal
          station={editStation}
          cpos={cpos ?? []}
          territories={territories ?? []}
          onClose={() => setEditStation(null)}
          onSaved={() => {
            setEditStation(null);
            queryClient.invalidateQueries({ queryKey: ["stations"] });
          }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteStation && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setDeleteStation(null)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-surface border border-border rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-sm text-foreground">Supprimer cette borne ?</h3>
                  <p className="text-xs text-foreground-muted mt-0.5">{deleteStation.name}</p>
                </div>
              </div>
              <p className="text-xs text-foreground-muted">
                La borne sera marquée comme indisponible et hors ligne. Cette action est réversible depuis la page Bornes.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteStation(null)}
                  className="flex-1 py-2 rounded-xl border border-border text-sm text-foreground-muted hover:text-foreground transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleDeleteStation}
                  disabled={deleteLoading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {deleteLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── AddLocationModal ──────────────────────────────────────────

function AddLocationModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formPostalCode, setFormPostalCode] = useState("");
  const [formLat, setFormLat] = useState("");
  const [formLng, setFormLng] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiPost("admin-stations", {
        name: formName,
        address: formAddress || null,
        city: formCity,
        postal_code: formPostalCode || null,
        latitude: formLat ? parseFloat(formLat) : null,
        longitude: formLng ? parseFloat(formLng) : null,
      });
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      return;
    }
    setLoading(false);
    queryClient.invalidateQueries({ queryKey: ["stations"] });
    // reset
    setFormName("");
    setFormAddress("");
    setFormCity("");
    setFormPostalCode("");
    setFormLat("");
    setFormLng("");
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-border">
            <h2 className="font-heading font-bold text-base text-foreground">
              Ajouter un site
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-surface-elevated rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-foreground-muted" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-foreground-muted mb-1">
                Nom <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Station EZDrive Guadeloupe"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-medium text-foreground-muted mb-1">
                Adresse
              </label>
              <input
                type="text"
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                placeholder="12 rue de la Paix"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>

            {/* City + Postal code */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground-muted mb-1">
                  Ville <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formCity}
                  onChange={(e) => setFormCity(e.target.value)}
                  placeholder="Pointe-à-Pitre"
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-muted mb-1">
                  Code postal
                </label>
                <input
                  type="text"
                  value={formPostalCode}
                  onChange={(e) => setFormPostalCode(e.target.value)}
                  placeholder="97110"
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
            </div>

            {/* GPS */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground-muted mb-1">
                  Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={formLat}
                  onChange={(e) => setFormLat(e.target.value)}
                  placeholder="16.0000"
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-muted mb-1">
                  Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={formLng}
                  onChange={(e) => setFormLng(e.target.value)}
                  placeholder="-61.7000"
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Créer le site"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────

function StatusDot({ status, isOnline }: { status: string; isOnline: boolean }) {
  const configs: Record<string, { label: string; color: string; bg: string }> = {
    Available: { label: "Disponible", color: "text-status-available", bg: "bg-status-available" },
    Charging: { label: "En charge", color: "text-status-charging", bg: "bg-status-charging" },
    Faulted: { label: "En panne", color: "text-status-faulted", bg: "bg-status-faulted" },
    Unavailable: { label: "Indisponible", color: "text-status-unavailable", bg: "bg-status-unavailable" },
  };
  const cfg = configs[status] ?? { label: isOnline ? status : "Hors ligne", color: "text-status-offline", bg: "bg-status-offline" };

  return (
    <div className={cn("flex items-center gap-1.5 text-xs", cfg.color)}>
      <div className={cn("w-1.5 h-1.5 rounded-full", cfg.bg)} />
      {cfg.label}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}15` }}>
        <Icon className="w-4.5 h-4.5" style={{ color }} />
      </div>
      <div>
        <p className="text-lg font-heading font-bold text-foreground">{value}</p>
        <p className="text-[11px] text-foreground-muted">{label}</p>
      </div>
    </div>
  );
}
