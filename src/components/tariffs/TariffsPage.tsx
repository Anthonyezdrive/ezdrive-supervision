import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCpo } from "@/contexts/CpoContext";
import { PageHelp } from "@/components/ui/PageHelp";
import {
  Wallet,
  Zap,
  DollarSign,
  Search,
  Globe,
  Plus,
  X,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Tariffs Management Page
// ============================================================

interface StationTariff {
  id: string;
  station_id: string;
  tariff_id: string | null;
  name: string;
  currency: string;
  ocpi_tariff_id: string | null;
  start_fee: number | null;
  price_per_kwh: number | null;
  price_per_hour: number | null;
  idle_fee_per_hour: number | null;
  created_at: string;
  updated_at?: string;
  stations: { name: string; city: string } | null;
}

interface OcpiTariff {
  id: string;
  tariff_id_ocpi: string;
  currency: string;
  elements: unknown;
  created_at: string;
}

interface TariffFormData {
  name: string;
  station_id: string;
  currency: string;
  start_fee: number | null;
  price_per_kwh: number | null;
  price_per_hour: number | null;
  idle_fee_per_hour: number | null;
}

export function TariffsPage() {
  const queryClient = useQueryClient();
  const { selectedCpoId } = useCpo();
  const [activeTab, setActiveTab] = useState<"station" | "ocpi">("station");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StationTariff | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StationTariff | null>(null);

  // ── Resolve station IDs for selected CPO ──
  const { data: cpoStationIds } = useQuery({
    queryKey: ["tariffs-cpo-station-ids", selectedCpoId ?? "all"],
    enabled: !!selectedCpoId,
    queryFn: async () => {
      const { data: stns } = await supabase.from("stations").select("id").eq("cpo_id", selectedCpoId!);
      return (stns ?? []).map((s: { id: string }) => s.id);
    },
    staleTime: 60000,
  });

  // Station tariffs
  const { data: stationTariffs, isLoading: stLoading } = useQuery({
    queryKey: ["station-tariffs", selectedCpoId ?? "all"],
    queryFn: async () => {
      if (selectedCpoId && cpoStationIds?.length === 0) return [] as StationTariff[];
      let query = supabase
        .from("station_tariffs")
        .select("*, stations(name, city)")
        .order("created_at", { ascending: false });
      if (selectedCpoId && cpoStationIds?.length) {
        query = query.in("station_id", cpoStationIds);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as StationTariff[];
    },
  });

  // OCPI tariffs — TODO: no direct cpo_id column, left unfiltered
  const { data: ocpiTariffs, isLoading: ocpiLoading } = useQuery({
    queryKey: ["ocpi-tariffs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ocpi_tariffs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OcpiTariff[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TariffFormData) => {
      const { error } = await supabase.from("station_tariffs").insert({
        name: data.name,
        station_id: data.station_id || null,
        currency: data.currency,
        start_fee: data.start_fee || null,
        price_per_kwh: data.price_per_kwh || null,
        price_per_hour: data.price_per_hour || null,
        idle_fee_per_hour: data.idle_fee_per_hour || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["station-tariffs"] });
      setShowModal(false);
      setEditing(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TariffFormData }) => {
      const { error } = await supabase.from("station_tariffs").update({
        name: data.name,
        station_id: data.station_id || null,
        currency: data.currency,
        start_fee: data.start_fee || null,
        price_per_kwh: data.price_per_kwh || null,
        price_per_hour: data.price_per_hour || null,
        idle_fee_per_hour: data.idle_fee_per_hour || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["station-tariffs"] });
      setShowModal(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("station_tariffs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["station-tariffs"] });
      setDeleteTarget(null);
    },
  });

  const filteredStation = useMemo(() => {
    if (!stationTariffs) return [];
    if (!search) return stationTariffs;
    const q = search.toLowerCase();
    return stationTariffs.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.stations?.name?.toLowerCase().includes(q) ||
        t.stations?.city?.toLowerCase().includes(q)
    );
  }, [stationTariffs, search]);

  const filteredOcpi = useMemo(() => {
    if (!ocpiTariffs) return [];
    if (!search) return ocpiTariffs;
    const q = search.toLowerCase();
    return ocpiTariffs.filter(
      (t) =>
        t.tariff_id_ocpi?.toLowerCase().includes(q) ||
        t.currency?.toLowerCase().includes(q)
    );
  }, [ocpiTariffs, search]);

  // Stats
  const avgPriceKwh = useMemo(() => {
    if (!stationTariffs?.length) return 0;
    const withPrice = stationTariffs.filter((t) => t.price_per_kwh && t.price_per_kwh > 0);
    if (!withPrice.length) return 0;
    return withPrice.reduce((sum, t) => sum + (t.price_per_kwh ?? 0), 0) / withPrice.length;
  }, [stationTariffs]);

  const formatEur = (v: number | null) =>
    v != null ? `${v.toFixed(2)} €` : "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">Tarifs</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Configuration des tarifs de recharge
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-background rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouveau tarif
        </button>
      </div>

      <PageHelp
        summary="Configuration des grilles tarifaires appliquées aux sessions de charge"
        items={[
          { label: "Tarif", description: "Grille de prix définissant le coût par kWh, par minute, et/ou les frais fixes de connexion." },
          { label: "Composantes", description: "ENERGY (par kWh), TIME (par minute), FLAT (frais fixe), PARKING_TIME (stationnement post-charge)." },
          { label: "Affectation", description: "Chaque tarif est assigné à une ou plusieurs bornes/locations." },
          { label: "Format OCPI", description: "Les tarifs suivent le standard OCPI pour être compatibles avec les réseaux partenaires." },
        ]}
        tips={["Les modifications de tarifs ne s'appliquent qu'aux nouvelles sessions — les sessions en cours conservent le tarif initial."]}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Wallet} label="Total tarifs" value={(stationTariffs?.length ?? 0) + (ocpiTariffs?.length ?? 0)} color="#8892B0" />
        <KpiCard icon={Zap} label="Tarifs station" value={stationTariffs?.length ?? 0} color="#00D4AA" />
        <KpiCard icon={Globe} label="Tarifs OCPI" value={ocpiTariffs?.length ?? 0} color="#4ECDC4" />
        <KpiCard icon={DollarSign} label="Prix moyen/kWh" value={`${avgPriceKwh.toFixed(3)} €`} color="#F39C12" />
      </div>

      {/* Search + Tabs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            type="text"
            placeholder="Rechercher tarif, station, ville..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
          />
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
          {([
            { key: "station" as const, label: "Tarifs Stations", count: stationTariffs?.length ?? 0 },
            { key: "ocpi" as const, label: "Tarifs OCPI", count: ocpiTariffs?.length ?? 0 },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2",
                activeTab === tab.key
                  ? "bg-primary/10 text-primary"
                  : "text-foreground-muted hover:text-foreground"
              )}
            >
              {tab.label}
              <span className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px]",
                activeTab === tab.key ? "bg-primary/20" : "bg-surface-elevated"
              )}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {activeTab === "station" ? (
        <StationTariffsTable
          tariffs={filteredStation}
          isLoading={stLoading}
          formatEur={formatEur}
          onEdit={(t) => { setEditing(t); setShowModal(true); }}
          onDelete={(t) => setDeleteTarget(t)}
        />
      ) : (
        <OcpiTariffsTable tariffs={filteredOcpi} isLoading={ocpiLoading} />
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <TariffModal
          editing={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSubmit={(data) => {
            if (editing) {
              updateMutation.mutate({ id: editing.id, data });
            } else {
              createMutation.mutate(data);
            }
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
          error={((createMutation.error || updateMutation.error) as Error | null)?.message ?? null}
        />
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <DeleteConfirmModal
          tariff={deleteTarget}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// ── Station Tariffs Table ─────────────────────────────────

function StationTariffsTable({
  tariffs,
  isLoading,
  formatEur,
  onEdit,
  onDelete,
}: {
  tariffs: StationTariff[];
  isLoading: boolean;
  formatEur: (v: number | null) => string;
  onEdit: (t: StationTariff) => void;
  onDelete: (t: StationTariff) => void;
}) {
  if (isLoading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-10 animate-shimmer rounded" />
        ))}
      </div>
    );
  }

  if (!tariffs.length) {
    return (
      <div className="bg-surface border border-border rounded-xl py-16 text-center">
        <Wallet className="w-12 h-12 text-foreground-muted/20 mx-auto mb-3" />
        <p className="text-foreground-muted">Aucun tarif station trouvé</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Nom tarif</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Station</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Ville</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-foreground-muted">Frais départ</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-foreground-muted">Prix/kWh</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-foreground-muted">Prix/heure</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-foreground-muted">Frais idle</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Devise</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-foreground-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tariffs.map((t) => (
              <tr key={t.id} className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors">
                <td className="px-4 py-3">
                  <span className="text-sm font-medium text-foreground">{t.name}</span>
                </td>
                <td className="px-4 py-3 text-sm text-foreground">
                  {t.stations?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-sm text-foreground-muted">
                  {t.stations?.city ?? "—"}
                </td>
                <td className="px-4 py-3 text-right text-sm font-mono text-foreground-muted tabular-nums">
                  {formatEur(t.start_fee)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-mono tabular-nums">
                  <span className={t.price_per_kwh ? "text-primary font-medium" : "text-foreground-muted"}>
                    {formatEur(t.price_per_kwh)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-sm font-mono text-foreground-muted tabular-nums">
                  {formatEur(t.price_per_hour)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-mono text-foreground-muted tabular-nums">
                  {formatEur(t.idle_fee_per_hour)}
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 bg-surface-elevated rounded text-xs text-foreground-muted">
                    {t.currency}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(t)}
                      className="p-1.5 text-foreground-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      title="Modifier"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(t)}
                      className="p-1.5 text-foreground-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
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
    </div>
  );
}

// ── OCPI Tariffs Table ────────────────────────────────────

function OcpiTariffsTable({
  tariffs,
  isLoading,
}: {
  tariffs: OcpiTariff[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-10 animate-shimmer rounded" />
        ))}
      </div>
    );
  }

  if (!tariffs.length) {
    return (
      <div className="bg-surface border border-border rounded-xl py-16 text-center">
        <Globe className="w-12 h-12 text-foreground-muted/20 mx-auto mb-3" />
        <p className="text-foreground-muted">Aucun tarif OCPI trouvé</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">ID Tarif</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Devise</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Composants</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Créé le</th>
            </tr>
          </thead>
          <tbody>
            {tariffs.map((t) => {
              const components = parseOcpiElements(t.elements);
              return (
                <tr key={t.id} className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-foreground">
                    {t.tariff_id_ocpi}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-surface-elevated rounded text-xs text-foreground-muted">
                      {t.currency}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {components.map((c, i) => (
                        <span
                          key={i}
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-medium",
                            c.type === "ENERGY" ? "bg-primary/10 text-primary" :
                            c.type === "TIME" ? "bg-status-charging/10 text-status-charging" :
                            c.type === "FLAT" ? "bg-warning/10 text-warning" :
                            "bg-surface-elevated text-foreground-muted"
                          )}
                        >
                          {c.type}: {c.price}€
                        </span>
                      ))}
                      {components.length === 0 && (
                        <span className="text-xs text-foreground-muted">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground-muted">
                    {new Date(t.created_at).toLocaleDateString("fr-FR")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────

function parseOcpiElements(elements: unknown): Array<{ type: string; price: string }> {
  try {
    if (!Array.isArray(elements)) return [];
    const result: Array<{ type: string; price: string }> = [];
    for (const el of elements) {
      const components = el?.price_components ?? [];
      for (const pc of components) {
        result.push({
          type: pc.type ?? "UNKNOWN",
          price: (pc.price ?? 0).toFixed(4),
        });
      }
    }
    return result;
  } catch {
    return [];
  }
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: number | string;
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

// ── Tariff Create/Edit Modal ─────────────────────────────

function TariffModal({
  editing,
  onClose,
  onSubmit,
  isLoading,
  error,
}: {
  editing: StationTariff | null;
  onClose: () => void;
  onSubmit: (data: TariffFormData) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<TariffFormData>({
    name: editing?.name ?? "",
    station_id: editing?.station_id ?? "",
    currency: editing?.currency ?? "EUR",
    start_fee: editing?.start_fee ?? null,
    price_per_kwh: editing?.price_per_kwh ?? null,
    price_per_hour: editing?.price_per_hour ?? null,
    idle_fee_per_hour: editing?.idle_fee_per_hour ?? null,
  });

  // Fetch stations for the select — need CPO context to filter
  const { selectedCpoId: modalCpoId } = useCpo();
  const { data: stations } = useQuery({
    queryKey: ["stations-list", modalCpoId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("stations")
        .select("id, name, city")
        .order("name");
      if (modalCpoId) {
        query = query.eq("cpo_id", modalCpoId);
      }
      const { data } = await query;
      return data ?? [];
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit(form);
  }

  const numField = (key: keyof TariffFormData, label: string, placeholder: string) => (
    <div>
      <label className="block text-xs text-foreground-muted mb-1.5">{label}</label>
      <input
        type="number"
        min={0}
        step={0.0001}
        value={form[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value ? Number(e.target.value) : null })}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm focus:outline-none focus:border-primary/50"
      />
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl">
          <div className="flex items-center justify-between p-5 border-b border-border">
            <h2 className="font-heading font-bold text-lg">
              {editing ? "Modifier le tarif" : "Nouveau tarif station"}
            </h2>
            <button onClick={onClose} className="p-1.5 hover:bg-surface-elevated rounded-lg transition-colors">
              <X className="w-5 h-5 text-foreground-muted" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-xs text-foreground-muted mb-1.5">Nom du tarif *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Tarif standard kWh"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs text-foreground-muted mb-1.5">Station (optionnel)</label>
              <select
                value={form.station_id}
                onChange={(e) => setForm({ ...form, station_id: e.target.value })}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm focus:outline-none focus:border-primary/50"
              >
                <option value="">— Toutes les stations —</option>
                {(stations ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.city ? `— ${s.city}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-foreground-muted mb-1.5">Devise</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm focus:outline-none focus:border-primary/50"
              >
                <option value="EUR">EUR — Euro</option>
                <option value="USD">USD — Dollar</option>
                <option value="GBP">GBP — Livre sterling</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {numField("start_fee", "Frais de départ (€)", "0.00")}
              {numField("price_per_kwh", "Prix / kWh (€)", "0.3500")}
              {numField("price_per_hour", "Prix / heure (€)", "0.00")}
              {numField("idle_fee_per_hour", "Idle fee / heure (€)", "0.00")}
            </div>
            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-foreground-muted hover:text-foreground transition-colors">
                Annuler
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 py-2.5 bg-primary text-background rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {editing ? "Enregistrer" : "Créer le tarif"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ── Delete Confirmation Modal ─────────────────────────────

function DeleteConfirmModal({
  tariff,
  onConfirm,
  onCancel,
  isLoading,
}: {
  tariff: StationTariff;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onCancel} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-surface border border-border rounded-2xl w-full max-w-sm shadow-2xl p-6">
          <h2 className="font-heading font-bold text-lg mb-2">Supprimer ce tarif ?</h2>
          <p className="text-sm text-foreground-muted mb-6">
            Le tarif <strong className="text-foreground">"{tariff.name}"</strong> sera définitivement supprimé. Cette action est irréversible.
          </p>
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-foreground-muted hover:text-foreground transition-colors">
              Annuler
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Supprimer
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
