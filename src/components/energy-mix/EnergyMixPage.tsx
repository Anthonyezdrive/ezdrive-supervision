// ============================================================
// EZDrive — Energy Mix Profiles Page
// Manage energy source profiles for charging stations
// ============================================================

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Leaf,
  Plus,
  Sun,
  Wind,
  Droplets,
  Atom,
  Flame,
  Factory,
  Edit3,
  Trash2,
  MapPin,
  Percent,
  ChevronDown,
  X,
  Pencil,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/contexts/ToastContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SlideOver } from "@/components/ui/SlideOver";
import { KPICard } from "@/components/ui/KPICard";

// ── Types ─────────────────────────────────────────────────────

interface EnergySource {
  type: string;
  percentage: number;
}

interface EnergyMixProfile {
  id: string;
  name: string;
  supplier: string;
  product: string;
  renewable_percentage: number;
  sources: EnergySource[];
  sites_count: number;
  description: string | null;
  is_green: boolean;
  created_at: string;
  updated_at: string;
}

// ── Source icon mapping ───────────────────────────────────────

const SOURCE_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  solar: { icon: Sun, color: "#FBBF24", label: "Solaire" },
  wind: { icon: Wind, color: "#60A5FA", label: "Éolien" },
  hydro: { icon: Droplets, color: "#34D399", label: "Hydraulique" },
  nuclear: { icon: Atom, color: "#A78BFA", label: "Nucléaire" },
  gas: { icon: Flame, color: "#F97316", label: "Gaz" },
  coal: { icon: Factory, color: "#8892B0", label: "Charbon" },
  biomass: { icon: Leaf, color: "#10B981", label: "Biomasse" },
  geothermal: { icon: Flame, color: "#EC4899", label: "Géothermie" },
  other: { icon: Flame, color: "#8892B0", label: "Autre" },
};

const SOURCE_TYPES = Object.entries(SOURCE_CONFIG).map(([key, cfg]) => ({
  value: key,
  label: cfg.label,
}));

// ── Renewable source types ───────────────────────────────────

const RENEWABLE_TYPES = new Set(["solar", "wind", "hydro", "biomass", "geothermal"]);

function computeRenewablePercentage(sources: EnergySource[]): number {
  return sources.reduce((sum, s) => sum + (RENEWABLE_TYPES.has(s.type) ? s.percentage : 0), 0);
}

// ── Empty form ───────────────────────────────────────────────

const EMPTY_FORM = {
  name: "",
  supplier: "",
  product: "",
  description: "",
  is_green: false,
  sites_count: 0,
  sources: [] as EnergySource[],
};

// ── Donut chart component ─────────────────────────────────────

function EnergyDonut({ sources, size = 120 }: { sources: EnergySource[]; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg width={size} height={size} className="shrink-0">
      {sources.map((source, i) => {
        const config = SOURCE_CONFIG[source.type] ?? SOURCE_CONFIG.other;
        const dashArray = (source.percentage / 100) * circumference;
        const currentOffset = offset;
        offset += dashArray;

        return (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={config.color}
            strokeWidth={8}
            strokeDasharray={`${dashArray} ${circumference - dashArray}`}
            strokeDashoffset={-currentOffset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        );
      })}
      {/* Center text */}
      <text
        x={size / 2}
        y={size / 2 - 4}
        textAnchor="middle"
        className="text-lg font-bold fill-foreground"
      >
        {computeRenewablePercentage(sources)}%
      </text>
      <text
        x={size / 2}
        y={size / 2 + 14}
        textAnchor="middle"
        className="text-[10px] fill-foreground-muted"
      >
        renouvelable
      </text>
    </svg>
  );
}

// ── Profile card ──────────────────────────────────────────────

function ProfileCard({
  profile,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  profile: EnergyMixProfile;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden transition-all hover:border-opacity-80">
      <div className="w-full text-left p-5">
        <div className="flex items-start gap-5">
          {/* Donut chart */}
          <button onClick={onToggle} className="shrink-0">
            <EnergyDonut sources={profile.sources} size={100} />
          </button>

          {/* Info */}
          <button onClick={onToggle} className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-semibold text-foreground">{profile.name}</h3>
              {profile.is_green && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-md text-[10px] font-semibold">
                  <Leaf className="w-3 h-3" />
                  100% Vert
                </span>
              )}
            </div>
            <p className="text-sm text-foreground-muted">{profile.supplier} — {profile.product}</p>
            {profile.description && (
              <p className="text-xs text-foreground-muted/70 mt-1.5 line-clamp-2">{profile.description}</p>
            )}

            {/* Source pills */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {profile.sources.map((source, i) => {
                const config = SOURCE_CONFIG[source.type] ?? SOURCE_CONFIG.other;
                return (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
                    style={{ backgroundColor: `${config.color}15`, color: config.color }}
                  >
                    <config.icon className="w-3 h-3" />
                    {config.label} {source.percentage}%
                  </span>
                );
              })}
            </div>
          </button>

          {/* Stats + actions */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-lg font-bold text-foreground">{profile.renewable_percentage}%</p>
              <p className="text-[10px] text-foreground-muted">Renouvelable</p>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-lg font-bold text-foreground">{profile.sites_count}</p>
              <p className="text-[10px] text-foreground-muted">Sites</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="p-1.5 text-foreground-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                title="Modifier"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-1.5 text-foreground-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Supprimer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <button onClick={onToggle}>
              <ChevronDown className={cn("w-4 h-4 text-foreground-muted transition-transform", isExpanded && "rotate-180")} />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-border px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {profile.sources.map((source, i) => {
              const config = SOURCE_CONFIG[source.type] ?? SOURCE_CONFIG.other;
              return (
                <div key={i} className="flex items-center gap-3 p-3 bg-surface-elevated rounded-xl">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${config.color}15`, color: config.color }}>
                    <config.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{config.label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${source.percentage}%`, backgroundColor: config.color }} />
                      </div>
                      <span className="text-xs font-semibold text-foreground-muted tabular-nums">{source.percentage}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-xs text-foreground-muted mb-4">
            <MapPin className="w-3.5 h-3.5" />
            {profile.sites_count} sites de charge utilisent ce profil
            <span className="mx-2">•</span>
            Dernière mise à jour : {new Date(profile.updated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-border">
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground bg-surface-elevated border border-border rounded-lg transition-colors"
            >
              <Edit3 className="w-3 h-3" />
              Modifier
            </button>
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/5 border border-red-500/20 rounded-lg transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Supprimer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export function EnergyMixPage() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<EnergyMixProfile | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<EnergyMixProfile | null>(null);

  // ── Data fetching ──

  const { data: profiles, isLoading } = useQuery<EnergyMixProfile[]>({
    queryKey: ["energy-mix-profiles"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("energy_mix_profiles")
          .select("*")
          .order("created_at", { ascending: true });
        if (error) {
          console.warn("[EnergyMixPage] Table error:", error.message);
          return [];
        }
        return (data as EnergyMixProfile[]) ?? [];
      } catch {
        return [];
      }
    },
  });

  // ── Mutations ──

  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const renewablePct = computeRenewablePercentage(data.sources);
      const { data: result, error } = await supabase
        .from("energy_mix_profiles")
        .insert({
          name: data.name,
          supplier: data.supplier,
          product: data.product,
          description: data.description || null,
          renewable_percentage: renewablePct,
          is_green: data.is_green,
          sites_count: Number(data.sites_count) || 0,
          sources: data.sources as unknown as Record<string, unknown>[],
        })
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["energy-mix-profiles"] });
      closeModal();
      toastSuccess("Profil créé", "Le profil energy mix a été ajouté");
    },
    onError: (error: Error) => {
      toastError("Erreur", error.message || "Une erreur est survenue");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & typeof EMPTY_FORM) => {
      const renewablePct = computeRenewablePercentage(data.sources);
      const { data: result, error } = await supabase
        .from("energy_mix_profiles")
        .update({
          name: data.name,
          supplier: data.supplier,
          product: data.product,
          description: data.description || null,
          renewable_percentage: renewablePct,
          is_green: data.is_green,
          sites_count: Number(data.sites_count) || 0,
          sources: data.sources as unknown as Record<string, unknown>[],
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["energy-mix-profiles"] });
      closeModal();
      toastSuccess("Profil modifié", "Les modifications ont été enregistrées");
    },
    onError: (error: Error) => {
      toastError("Erreur", error.message || "Une erreur est survenue");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("energy_mix_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["energy-mix-profiles"] });
      setConfirmDelete(null);
      toastSuccess("Profil supprimé");
    },
    onError: (error: Error) => {
      setConfirmDelete(null);
      toastError("Erreur", error.message || "Une erreur est survenue");
    },
  });

  // ── Modal helpers ──

  function openCreate() {
    setEditingProfile(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(profile: EnergyMixProfile) {
    setEditingProfile(profile);
    setForm({
      name: profile.name,
      supplier: profile.supplier,
      product: profile.product,
      description: profile.description ?? "",
      is_green: profile.is_green,
      sites_count: profile.sites_count,
      sources: profile.sources.map((s) => ({ ...s })),
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingProfile(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingProfile) {
      updateMutation.mutate({ id: editingProfile.id, ...form });
    } else {
      createMutation.mutate(form);
    }
  }

  // ── Source management in form ──

  function addSource() {
    setForm((f) => ({
      ...f,
      sources: [...f.sources, { type: "solar", percentage: 0 }],
    }));
  }

  function updateSource(index: number, field: "type" | "percentage", value: string | number) {
    setForm((f) => {
      const updated = f.sources.map((s, i) =>
        i === index ? { ...s, [field]: field === "percentage" ? Number(value) : value } : s
      );
      return { ...f, sources: updated };
    });
  }

  function removeSource(index: number) {
    setForm((f) => ({
      ...f,
      sources: f.sources.filter((_, i) => i !== index),
    }));
  }

  // ── Derived values ──

  const profilesList = profiles ?? [];

  const formRenewablePct = computeRenewablePercentage(form.sources);
  const formTotalPct = form.sources.reduce((sum, s) => sum + s.percentage, 0);

  const stats = useMemo(() => {
    const list = profiles ?? [];
    return {
      totalProfiles: list.length,
      greenProfiles: list.filter((p) => p.is_green).length,
      avgRenewable: list.length > 0
        ? Math.round(list.reduce((s, p) => s + p.renewable_percentage, 0) / list.length)
        : 0,
      totalSites: list.reduce((s, p) => s + p.sites_count, 0),
    };
  }, [profiles]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">
            Profils Energy Mix
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Sources d'énergie et taux de renouvelable par réseau
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouveau profil
        </button>
      </div>

      {/* KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-6 w-12" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Profils définis" value={stats.totalProfiles} icon={Leaf} color="#60A5FA" />
          <KPICard label="100% verts" value={stats.greenProfiles} icon={Leaf} color="#34D399" />
          <KPICard label="Renouvelable moy." value={`${stats.avgRenewable}%`} icon={Percent} color="#FBBF24" />
          <KPICard label="Sites couverts" value={stats.totalSites} icon={MapPin} color="#A78BFA" />
        </div>
      )}

      {/* Profiles list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-2xl p-5">
              <div className="flex items-center gap-5">
                <Skeleton className="w-[100px] h-[100px] rounded-full" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-3 w-36" />
                  <Skeleton className="h-3 w-64" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-20 rounded-md" />
                    <Skeleton className="h-5 w-20 rounded-md" />
                    <Skeleton className="h-5 w-20 rounded-md" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : profilesList.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-56 bg-surface border border-border rounded-2xl">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Leaf className="w-7 h-7 text-primary" />
          </div>
          <p className="text-foreground font-medium text-lg">Aucun profil</p>
          <p className="text-sm text-foreground-muted mt-1 max-w-sm text-center">
            Créez votre premier profil energy mix pour définir les sources d'énergie de vos réseaux.
          </p>
          <button
            onClick={openCreate}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Créer un profil
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {profilesList.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              isExpanded={expandedProfile === profile.id}
              onToggle={() =>
                setExpandedProfile((prev) => (prev === profile.id ? null : profile.id))
              }
              onEdit={() => openEdit(profile)}
              onDelete={() => setConfirmDelete(profile)}
            />
          ))}
        </div>
      )}

      {/* ── Create / Edit Slide-Over ── */}
      <SlideOver
        open={modalOpen}
        onClose={closeModal}
        title={editingProfile ? "Modifier le profil" : "Nouveau profil"}
        subtitle="Définir les sources d'énergie du réseau"
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Nom du profil *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Mix Antilles EDF"
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
            />
          </div>

          {/* Supplier + Product */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Fournisseur *</label>
              <input
                required
                value={form.supplier}
                onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
                placeholder="EDF"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Produit *</label>
              <input
                required
                value={form.product}
                onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
                placeholder="EDF DOM-TOM"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Description du profil energy mix..."
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>

          {/* Sites count + Is green */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Nombre de sites</label>
              <input
                type="number"
                min={0}
                value={form.sites_count}
                onChange={(e) => setForm((f) => ({ ...f, sites_count: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_green}
                  onChange={(e) => setForm((f) => ({ ...f, is_green: e.target.checked }))}
                  className="w-4 h-4 rounded border-border bg-surface-elevated text-emerald-500 focus:ring-emerald-500/30 focus:ring-offset-0"
                />
                <span className="text-sm text-foreground flex items-center gap-1.5">
                  <Leaf className="w-3.5 h-3.5 text-emerald-400" />
                  Offre 100% verte
                </span>
              </label>
            </div>
          </div>

          {/* Renewable percentage (auto-calculated) */}
          <div className="p-3 bg-surface-elevated border border-border rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground-muted">% Renouvelable (auto-calculé)</span>
              <span className={cn(
                "text-sm font-bold tabular-nums",
                formRenewablePct >= 80 ? "text-emerald-400" :
                formRenewablePct >= 40 ? "text-amber-400" : "text-foreground-muted"
              )}>
                {formRenewablePct}%
              </span>
            </div>
            {formTotalPct !== 100 && form.sources.length > 0 && (
              <p className={cn(
                "text-[10px] mt-1",
                formTotalPct > 100 ? "text-red-400" : "text-amber-400"
              )}>
                Total des sources : {formTotalPct}% {formTotalPct > 100 ? "(dépasse 100%)" : "(ne fait pas 100%)"}
              </p>
            )}
          </div>

          {/* Sources */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-foreground-muted">Sources d'énergie</p>
              <button
                type="button"
                onClick={addSource}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 rounded-lg transition-colors"
              >
                <Plus className="w-3 h-3" />
                Ajouter
              </button>
            </div>

            {form.sources.length === 0 ? (
              <div className="text-center py-6 text-sm text-foreground-muted/60 border border-dashed border-border rounded-xl">
                Aucune source. Cliquez sur "Ajouter" pour commencer.
              </div>
            ) : (
              <div className="space-y-2">
                {form.sources.map((source, index) => {
                  const config = SOURCE_CONFIG[source.type] ?? SOURCE_CONFIG.other;
                  return (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2.5 bg-surface-elevated border border-border rounded-xl"
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${config.color}15`, color: config.color }}
                      >
                        <config.icon className="w-3.5 h-3.5" />
                      </div>
                      <select
                        value={source.type}
                        onChange={(e) => updateSource(index, "type", e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1.5 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
                      >
                        {SOURCE_TYPES.map((st) => (
                          <option key={st.value} value={st.value}>
                            {st.label}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={source.percentage}
                          onChange={(e) => updateSource(index, "percentage", e.target.value)}
                          className="w-16 px-2 py-1.5 bg-surface border border-border rounded-lg text-sm text-foreground text-right tabular-nums focus:outline-none focus:border-primary/50"
                        />
                        <span className="text-xs text-foreground-muted">%</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSource(index)}
                        className="p-1 text-foreground-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                        title="Retirer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Errors */}
          {(createMutation.error || updateMutation.error) && (
            <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-400">
              {((createMutation.error || updateMutation.error) as Error)?.message}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 text-sm text-foreground-muted hover:text-foreground border border-border rounded-xl transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "..."
                : editingProfile
                  ? "Enregistrer"
                  : "Créer"}
            </button>
          </div>
        </form>
      </SlideOver>

      {/* ── Delete Confirm Dialog ── */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Supprimer ce profil ?"
        description={`Le profil "${confirmDelete?.name}" sera définitivement supprimé.`}
        confirmLabel="Supprimer"
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          deleteMutation.mutate(confirmDelete!.id);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
