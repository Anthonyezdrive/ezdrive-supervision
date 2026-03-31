import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Tag,
  Settings,
  Shield,
  LogIn,
  Globe,
  MapPin,
  Building2,
  CreditCard,
  BarChart3,
  Mail,
  Save,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  X,
  CheckCircle,
  ExternalLink,
  AlertTriangle,
  Link as LinkIcon,
  FileText,
  Search,
  Radio,
  Power,
  UserX,
  KeyRound,
  ShieldOff,
  History,
  Send,
  ToggleLeft,
  ToggleRight,
  Phone,
  AtSign,
  Key,
  ClipboardList,
  Copy,
  Check,
  Download,
  Filter,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncButton } from "@/components/shared/SyncButton";
import { AdminPage } from "@/components/admin/AdminPage";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useTranslation } from "react-i18next";

// ── Tab definitions (extended with new stories 91-96) ────────

const TABS = [
  { key: "admin" as const, label: "Gestion CPO", icon: Tag },
  { key: "settings" as const, label: "Parametres & Alertes", icon: Settings },
  { key: "platform" as const, label: "Parametres", icon: Globe },
  { key: "territories" as const, label: "Territoires", icon: MapPin },
  { key: "cpos" as const, label: "CPOs", icon: Building2 },
  { key: "stripe" as const, label: "Stripe", icon: CreditCard },
  { key: "stats" as const, label: "Statistiques", icon: BarChart3 },
  { key: "emails" as const, label: "Templates email", icon: Mail },
  { key: "logs" as const, label: "Logs connexion", icon: Shield },
  { key: "revocation" as const, label: "Révocation", icon: UserX },
  { key: "api-keys" as const, label: "Clés API", icon: Key },
  { key: "audit-log" as const, label: "Journal d'audit", icon: ClipboardList },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function AdminConfigPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>("admin");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-xl font-bold text-foreground">Administration</h1>
        <p className="text-sm text-foreground-muted mt-0.5">Gestion CPO et configuration</p>
      </div>

      {/* Synchronisations externes */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-surface border border-border rounded-xl">
        <span className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mr-2">Synchronisations externes</span>
        <SyncButton functionName="road-sync" label="Sync Road.io Stations" invalidateKeys={["stations"]} variant="small" formatSuccess={(d) => `${d.total_synced ?? 0} bornes sync · ${d.new_stations ?? 0} nouvelles`} />
        <SyncButton functionName="road-cdr-fix-links" label="Fix CDR Links" invalidateKeys={["billing", "cdrs"]} variant="small" confirmMessage="Relancer le fix des liens CDR Road.io ?" formatSuccess={(d) => `${d.total_cdrs_updated ?? 0} CDR liés`} />
        <SyncButton functionName="health-check" label="Health Check" variant="small" formatSuccess={() => `Système OK`} />
        <SyncButton functionName="maps-feed" label="Test Maps Feed" variant="small" />
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap",
              tab === t.key ? "text-primary" : "text-foreground-muted hover:text-foreground"
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {tab === t.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
          </button>
        ))}
      </div>
      {tab === "admin" && <AdminPage />}
      {tab === "settings" && <SettingsPage />}
      {tab === "platform" && <PlatformSettingsSection />}
      {tab === "territories" && <TerritoriesSection />}
      {tab === "cpos" && <CposSection />}
      {tab === "stripe" && <StripeConfigSection />}
      {tab === "stats" && <PlatformStatsSection />}
      {tab === "emails" && <EmailTemplatesSection />}
      {tab === "logs" && <LoginLogsSection />}
      {tab === "revocation" && <RevocationSection />}
      {tab === "api-keys" && <ApiKeysSection />}
      {tab === "audit-log" && <AuditLogSection />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Story 91: Global platform settings
// ══════════════════════════════════════════════════════════════

interface PlatformSettings {
  platform_name: string;
  default_language: string;
  logo_url: string;
  primary_color: string;
  support_email: string;
}

const DEFAULT_SETTINGS: PlatformSettings = {
  platform_name: "EZDrive Supervision",
  default_language: "fr",
  logo_url: "",
  primary_color: "#00D4AA",
  support_email: "support@ezdrive.fr",
};

function PlatformSettingsSection() {
  const queryClient = useQueryClient();
  const { error: toastError } = useToast();
  const [form, setForm] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      return data as PlatformSettings | null;
    },
  });

  useEffect(() => {
    if (settings) {
      setForm({
        platform_name: settings.platform_name ?? DEFAULT_SETTINGS.platform_name,
        default_language: settings.default_language ?? DEFAULT_SETTINGS.default_language,
        logo_url: settings.logo_url ?? DEFAULT_SETTINGS.logo_url,
        primary_color: settings.primary_color ?? DEFAULT_SETTINGS.primary_color,
        support_email: settings.support_email ?? DEFAULT_SETTINGS.support_email,
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("platform_settings")
        .upsert({ id: "default", ...form });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: () => toastError("Erreur lors de la sauvegarde"),
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Globe className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-base font-heading font-bold text-foreground">Parametres de la plateforme</h2>
          <p className="text-xs text-foreground-muted">Configuration globale de la supervision</p>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
        {/* Platform name */}
        <div className="px-5 py-4">
          <label className="block text-xs font-medium text-foreground-muted mb-1.5">Nom de la plateforme</label>
          <input
            type="text"
            value={form.platform_name}
            onChange={(e) => setForm({ ...form, platform_name: e.target.value })}
            className="w-full bg-surface-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
          />
        </div>

        {/* Default language */}
        <div className="px-5 py-4">
          <label className="block text-xs font-medium text-foreground-muted mb-1.5">Langue par defaut</label>
          <div className="flex gap-3">
            {[
              { value: "fr", label: "Francais" },
              { value: "en", label: "English" },
            ].map((lang) => (
              <button
                key={lang.value}
                onClick={() => setForm({ ...form, default_language: lang.value })}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium border transition-all",
                  form.default_language === lang.value
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "text-foreground-muted border-border hover:border-foreground-muted"
                )}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* Logo URL */}
        <div className="px-5 py-4">
          <label className="block text-xs font-medium text-foreground-muted mb-1.5">URL du logo</label>
          <input
            type="url"
            value={form.logo_url}
            onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
            placeholder="https://example.com/logo.png"
            className="w-full bg-surface-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
          />
          {form.logo_url && (
            <div className="mt-2 flex items-center gap-3">
              <img src={form.logo_url} alt="Logo preview" className="h-8 object-contain rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <span className="text-xs text-foreground-muted">Apercu</span>
            </div>
          )}
        </div>

        {/* Primary color */}
        <div className="px-5 py-4">
          <label className="block text-xs font-medium text-foreground-muted mb-1.5">Couleur principale</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.primary_color}
              onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
              className="w-10 h-10 rounded-lg border border-border cursor-pointer"
            />
            <input
              type="text"
              value={form.primary_color}
              onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
              className="w-32 bg-surface-elevated border border-border rounded-xl px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50"
            />
            <span className="w-6 h-6 rounded-full border border-border" style={{ backgroundColor: form.primary_color }} />
          </div>
        </div>

        {/* Support email */}
        <div className="px-5 py-4">
          <label className="block text-xs font-medium text-foreground-muted mb-1.5">Email de support</label>
          <input
            type="email"
            value={form.support_email}
            onChange={(e) => setForm({ ...form, support_email: e.target.value })}
            className="w-full bg-surface-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
          />
        </div>

        {/* Save */}
        <div className="px-5 py-4 flex items-center gap-3">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-background font-semibold rounded-xl text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved ? "Sauvegarde !" : "Sauvegarder"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Story 92: Territory management (CRUD)
// ══════════════════════════════════════════════════════════════

interface Territory {
  id: string;
  name: string;
  code: string;
  region: string;
  description?: string;
  station_count?: number;
}

function TerritoriesSection() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", code: "", region: "", description: "" });
  const [deleteTarget, setDeleteTarget] = useState<Territory | null>(null);

  const { data: territories, isLoading } = useQuery({
    queryKey: ["admin-territories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("territories")
        .select("id, name, code, region, description")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Territory[];
    },
  });

  // Fetch station counts per territory
  const { data: stationCounts } = useQuery({
    queryKey: ["admin-territory-station-counts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stations")
        .select("id, territory_id");
      const counts: Record<string, number> = {};
      for (const s of data ?? []) {
        const tid = (s as Record<string, unknown>).territory_id as string | undefined;
        if (tid) counts[tid] = (counts[tid] ?? 0) + 1;
      }
      return counts;
    },
  });

  const enrichedTerritories = useMemo(() => {
    return (territories ?? []).map((t) => ({
      ...t,
      station_count: stationCounts?.[t.id] ?? 0,
    }));
  }, [territories, stationCounts]);

  const filteredTerritories = useMemo(() => {
    if (!search.trim()) return enrichedTerritories;
    const q = search.toLowerCase();
    return enrichedTerritories.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        t.region.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q)
    );
  }, [enrichedTerritories, search]);

  // KPIs
  const totalStations = useMemo(() => enrichedTerritories.reduce((s, t) => s + (t.station_count ?? 0), 0), [enrichedTerritories]);
  const uniqueRegions = useMemo(() => new Set(enrichedTerritories.map((t) => t.region).filter(Boolean)).size, [enrichedTerritories]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("territories").insert(form);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-territories"] });
      setShowCreate(false);
      setForm({ name: "", code: "", region: "", description: "" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, station_count: _sc, ...data }: Territory) => {
      const { error } = await supabase.from("territories").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-territories"] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("territories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-territories"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MapPin className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-base font-heading font-bold text-foreground">Territoires</h2>
            <p className="text-xs text-foreground-muted">Gestion des zones géographiques et affectation des bornes</p>
          </div>
        </div>
        <button
          onClick={() => { setShowCreate(true); setForm({ name: "", code: "", region: "", description: "" }); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-xs text-foreground-muted font-semibold uppercase">Territoires</p>
          <p className="text-2xl font-bold text-foreground mt-1">{enrichedTerritories.length}</p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-xs text-foreground-muted font-semibold uppercase">Bornes affectées</p>
          <p className="text-2xl font-bold text-foreground mt-1">{totalStations}</p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-xs text-foreground-muted font-semibold uppercase">Régions</p>
          <p className="text-2xl font-bold text-foreground mt-1">{uniqueRegions}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un territoire..."
          className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
        />
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-surface border border-primary/30 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Nouveau territoire</h3>
          <div className="grid grid-cols-2 gap-3">
            <input type="text" placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-surface-elevated border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50" />
            <input type="text" placeholder="Code postal prefix" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="bg-surface-elevated border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50" />
            <input type="text" placeholder="Région" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}
              className="bg-surface-elevated border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50" />
            <input type="text" placeholder="Description (optionnel)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="bg-surface-elevated border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Créer
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-foreground-muted hover:text-foreground">Annuler</button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Nom</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Région</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Description</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-foreground-muted uppercase">Bornes</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTerritories.map((t) => (
                <TerritoryRow
                  key={t.id}
                  territory={t}
                  isEditing={editingId === t.id}
                  onEdit={() => setEditingId(t.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={(updated) => updateMutation.mutate(updated)}
                  onDelete={() => setDeleteTarget(t)}
                  saving={updateMutation.isPending}
                />
              ))}
              {filteredTerritories.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-foreground-muted">{search ? "Aucun résultat" : "Aucun territoire"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Supprimer ce territoire ?"
        description={deleteTarget ? `Supprimer le territoire "${deleteTarget.name}" ? Cette action est irréversible.` : ""}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function TerritoryRow({
  territory,
  isEditing,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  saving,
}: {
  territory: Territory;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (t: Territory) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(territory);

  useEffect(() => { setForm(territory); }, [territory]);

  if (isEditing) {
    return (
      <tr className="bg-primary/5">
        <td className="px-4 py-2">
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="bg-surface-elevated border border-border rounded-lg px-2 py-1.5 text-sm w-full focus:outline-none focus:border-primary/50" />
        </td>
        <td className="px-4 py-2">
          <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
            className="bg-surface-elevated border border-border rounded-lg px-2 py-1.5 text-sm w-full focus:outline-none focus:border-primary/50" />
        </td>
        <td className="px-4 py-2">
          <input type="text" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}
            className="bg-surface-elevated border border-border rounded-lg px-2 py-1.5 text-sm w-full focus:outline-none focus:border-primary/50" />
        </td>
        <td className="px-4 py-2">
          <input type="text" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="bg-surface-elevated border border-border rounded-lg px-2 py-1.5 text-sm w-full focus:outline-none focus:border-primary/50" placeholder="Description" />
        </td>
        <td className="px-4 py-2 text-center text-foreground-muted">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded">
            <Radio className="w-3 h-3" /> {territory.station_count ?? 0}
          </span>
        </td>
        <td className="px-4 py-2 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <button onClick={() => onSave(form)} disabled={saving} className="p-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            </button>
            <button onClick={onCancelEdit} className="p-1.5 rounded-lg bg-foreground-muted/10 text-foreground-muted hover:bg-foreground-muted/20">
              <X className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-surface-elevated/50 transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-foreground">{territory.name}</td>
      <td className="px-4 py-3 text-sm text-foreground-muted font-mono">{territory.code}</td>
      <td className="px-4 py-3 text-sm text-foreground-muted">{territory.region}</td>
      <td className="px-4 py-3 text-sm text-foreground-muted">{territory.description || "—"}</td>
      <td className="px-4 py-3 text-center">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded">
          <Radio className="w-3 h-3" /> {territory.station_count ?? 0}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <button onClick={onEdit} className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated" title="Modifier">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-foreground-muted hover:text-danger hover:bg-danger/10" title="Supprimer">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ══════════════════════════════════════════════════════════════
// Story 93: CPO management (CRUD)
// ══════════════════════════════════════════════════════════════

interface CpoEntry {
  id: string;
  name: string;
  code: string;
  stripe_connect_id: string | null;
  color: string | null;
  territory_id?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  is_active?: boolean;
  station_count?: number;
}

function CposSection() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", code: "", stripe_connect_id: "", color: "#00D4AA", territory_id: "", contact_email: "", contact_phone: "" });
  const [deleteTarget, setDeleteTarget] = useState<CpoEntry | null>(null);

  // Fetch territories for dropdown
  const { data: territories } = useQuery({
    queryKey: ["admin-territories"],
    queryFn: async () => {
      const { data } = await supabase.from("territories").select("id, name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: cpos, isLoading } = useQuery({
    queryKey: ["admin-cpos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cpo_operators")
        .select("id, name, code, color, description, territory_id, contact_email, contact_phone, is_active")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        stripe_connect_id: c.description,
        color: c.color,
        territory_id: c.territory_id ?? null,
        contact_email: c.contact_email ?? null,
        contact_phone: c.contact_phone ?? null,
        is_active: c.is_active !== false, // default true
      })) as CpoEntry[];
    },
  });

  // Station counts per CPO
  const { data: stationCounts } = useQuery({
    queryKey: ["admin-cpo-station-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("stations").select("id, cpo_operator_id");
      const counts: Record<string, number> = {};
      for (const s of data ?? []) {
        const cid = (s as Record<string, unknown>).cpo_operator_id as string | undefined;
        if (cid) counts[cid] = (counts[cid] ?? 0) + 1;
      }
      return counts;
    },
  });

  const enrichedCpos = useMemo(() => {
    return (cpos ?? []).map((c) => ({ ...c, station_count: stationCounts?.[c.id] ?? 0 }));
  }, [cpos, stationCounts]);

  const filteredCpos = useMemo(() => {
    if (!search.trim()) return enrichedCpos;
    const q = search.toLowerCase();
    return enrichedCpos.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [enrichedCpos, search]);

  // KPIs
  const activeCpos = useMemo(() => enrichedCpos.filter((c) => c.is_active !== false).length, [enrichedCpos]);
  const totalStations = useMemo(() => enrichedCpos.reduce((s, c) => s + (c.station_count ?? 0), 0), [enrichedCpos]);
  const withStripe = useMemo(() => enrichedCpos.filter((c) => c.stripe_connect_id).length, [enrichedCpos]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cpo_operators").insert({
        name: form.name,
        code: form.code,
        color: form.color,
        description: form.stripe_connect_id || null,
        territory_id: form.territory_id || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        level: 1,
        is_white_label: false,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-cpos"] });
      queryClient.invalidateQueries({ queryKey: ["cpo_operators"] });
      setShowCreate(false);
      setForm({ name: "", code: "", stripe_connect_id: "", color: "#00D4AA", territory_id: "", contact_email: "", contact_phone: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cpo_operators").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-cpos"] });
      queryClient.invalidateQueries({ queryKey: ["cpo_operators"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (cpo: CpoEntry) => {
      const { station_count: _sc, ...rest } = cpo;
      const { error } = await supabase.from("cpo_operators").update({
        name: rest.name,
        code: rest.code,
        color: rest.color,
        description: rest.stripe_connect_id,
        territory_id: rest.territory_id || null,
        contact_email: rest.contact_email || null,
        contact_phone: rest.contact_phone || null,
        is_active: rest.is_active,
      }).eq("id", rest.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-cpos"] });
      queryClient.invalidateQueries({ queryKey: ["cpo_operators"] });
      setEditingId(null);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("cpo_operators").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-cpos"] });
      queryClient.invalidateQueries({ queryKey: ["cpo_operators"] });
    },
  });

  const territoryMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of territories ?? []) m[t.id] = t.name;
    return m;
  }, [territories]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-base font-heading font-bold text-foreground">CPOs</h2>
            <p className="text-xs text-foreground-muted">Charge Point Operators — gestion et configuration</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ajouter CPO
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-xs text-foreground-muted font-semibold uppercase">Total CPOs</p>
          <p className="text-2xl font-bold text-foreground mt-1">{enrichedCpos.length}</p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-xs text-foreground-muted font-semibold uppercase">Actifs</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{activeCpos}</p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-xs text-foreground-muted font-semibold uppercase">Bornes totales</p>
          <p className="text-2xl font-bold text-foreground mt-1">{totalStations}</p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-xs text-foreground-muted font-semibold uppercase">Stripe Connect</p>
          <p className="text-2xl font-bold text-foreground mt-1">{withStripe}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un CPO..."
          className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50" />
      </div>

      {showCreate && (
        <div className="bg-surface border border-primary/30 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Nouveau CPO</h3>
          <div className="grid grid-cols-2 gap-3">
            <input type="text" placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-surface-elevated border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50" />
            <input type="text" placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="bg-surface-elevated border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50" />
            <input type="text" placeholder="Stripe Connect ID (acct_...)" value={form.stripe_connect_id} onChange={(e) => setForm({ ...form, stripe_connect_id: e.target.value })}
              className="bg-surface-elevated border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50" />
            <select value={form.territory_id} onChange={(e) => setForm({ ...form, territory_id: e.target.value })}
              className="bg-surface-elevated border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50">
              <option value="">— Territoire —</option>
              {(territories ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input type="email" placeholder="Email contact" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              className="bg-surface-elevated border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50" />
            <input type="tel" placeholder="Téléphone" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              className="bg-surface-elevated border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50" />
            <div className="flex items-center gap-2">
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-8 h-8 rounded border border-border cursor-pointer" />
              <span className="text-xs text-foreground-muted">Couleur</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate()} disabled={!form.name || !form.code || createMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Créer
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-foreground-muted hover:text-foreground">Annuler</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">CPO</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Territoire</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Contact</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-foreground-muted uppercase">Bornes</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-foreground-muted uppercase">Statut</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCpos.map((cpo) => (
                <CpoRow
                  key={cpo.id}
                  cpo={cpo}
                  territories={territories ?? []}
                  territoryMap={territoryMap}
                  isEditing={editingId === cpo.id}
                  onEdit={() => setEditingId(cpo.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={(updated) => updateMutation.mutate(updated)}
                  onDelete={() => setDeleteTarget(cpo)}
                  onToggleActive={(active) => toggleActiveMutation.mutate({ id: cpo.id, is_active: active })}
                  saving={updateMutation.isPending}
                />
              ))}
              {filteredCpos.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-foreground-muted">{search ? "Aucun résultat" : "Aucun CPO"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Supprimer ce CPO ?"
        description={deleteTarget ? `Supprimer le CPO "${deleteTarget.name}" ? Cette action est irréversible.` : ""}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function CpoRow({
  cpo,
  territories,
  territoryMap,
  isEditing,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onToggleActive,
  saving,
}: {
  cpo: CpoEntry;
  territories: { id: string; name: string }[];
  territoryMap: Record<string, string>;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (c: CpoEntry) => void;
  onDelete: () => void;
  onToggleActive: (active: boolean) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(cpo);
  useEffect(() => { setForm(cpo); }, [cpo]);

  if (isEditing) {
    return (
      <tr className="bg-primary/5">
        <td className="px-4 py-2">
          <div className="flex items-center gap-2">
            <input type="color" value={form.color ?? "#00D4AA"} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-6 h-6 rounded cursor-pointer" />
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-surface-elevated border border-border rounded-lg px-2 py-1.5 text-sm flex-1 focus:outline-none focus:border-primary/50" />
          </div>
        </td>
        <td className="px-4 py-2">
          <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
            className="bg-surface-elevated border border-border rounded-lg px-2 py-1.5 text-sm w-full focus:outline-none focus:border-primary/50" />
        </td>
        <td className="px-4 py-2">
          <select value={form.territory_id ?? ""} onChange={(e) => setForm({ ...form, territory_id: e.target.value || null })}
            className="bg-surface-elevated border border-border rounded-lg px-2 py-1.5 text-sm w-full focus:outline-none focus:border-primary/50">
            <option value="">—</option>
            {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </td>
        <td className="px-4 py-2">
          <input type="email" value={form.contact_email ?? ""} onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            className="bg-surface-elevated border border-border rounded-lg px-2 py-1.5 text-sm w-full focus:outline-none focus:border-primary/50" placeholder="Email" />
        </td>
        <td className="px-4 py-2 text-center text-foreground-muted">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded">
            <Radio className="w-3 h-3" /> {cpo.station_count ?? 0}
          </span>
        </td>
        <td className="px-4 py-2 text-center">—</td>
        <td className="px-4 py-2 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <button onClick={() => onSave(form)} disabled={saving} className="p-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            </button>
            <button onClick={onCancelEdit} className="p-1.5 rounded-lg bg-foreground-muted/10 text-foreground-muted hover:bg-foreground-muted/20">
              <X className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  const isActive = cpo.is_active !== false;

  return (
    <tr className={cn("hover:bg-surface-elevated/50 transition-colors", !isActive && "opacity-50")}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cpo.color ?? "#6b7280" }} />
          <span className="text-sm font-medium text-foreground">{cpo.name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-foreground-muted font-mono">{cpo.code}</td>
      <td className="px-4 py-3 text-sm text-foreground-muted">
        {cpo.territory_id ? (territoryMap[cpo.territory_id] ?? "—") : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="space-y-0.5">
          {cpo.contact_email && (
            <div className="flex items-center gap-1 text-xs text-foreground-muted">
              <AtSign className="w-3 h-3" /> {cpo.contact_email}
            </div>
          )}
          {cpo.contact_phone && (
            <div className="flex items-center gap-1 text-xs text-foreground-muted">
              <Phone className="w-3 h-3" /> {cpo.contact_phone}
            </div>
          )}
          {!cpo.contact_email && !cpo.contact_phone && <span className="text-xs text-foreground-muted">—</span>}
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded">
          <Radio className="w-3 h-3" /> {cpo.station_count ?? 0}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <button
          onClick={() => onToggleActive(!isActive)}
          className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors", isActive ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25" : "bg-red-500/15 text-red-400 hover:bg-red-500/25")}
          title={isActive ? "Désactiver" : "Activer"}
        >
          {isActive ? <><ToggleRight className="w-3.5 h-3.5" /> Actif</> : <><ToggleLeft className="w-3.5 h-3.5" /> Inactif</>}
        </button>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <button onClick={onEdit} className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated"><Pencil className="w-4 h-4" /></button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-foreground-muted hover:text-danger hover:bg-danger/10"><Trash2 className="w-4 h-4" /></button>
        </div>
      </td>
    </tr>
  );
}

// ══════════════════════════════════════════════════════════════
// Story 94: Stripe configuration
// ══════════════════════════════════════════════════════════════

function StripeConfigSection() {
  const { data: connectedAccounts, isLoading } = useQuery({
    queryKey: ["stripe-connected-accounts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("cpo_operators")
        .select("id, name, code, description, color")
        .not("description", "is", null)
        .order("name");
      return (data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        stripe_id: c.description,
        color: c.color,
      }));
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CreditCard className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-base font-heading font-bold text-foreground">Configuration Stripe</h2>
          <p className="text-xs text-foreground-muted">Webhooks, comptes connectes et cles API</p>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <LinkIcon className="w-4 h-4 text-foreground-muted" />
            <span className="text-xs font-semibold text-foreground-muted uppercase">Webhook</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-sm font-medium text-foreground">Actif</span>
          </div>
          <p className="text-xs text-foreground-muted mt-1">Endpoint configure dans Supabase Edge Functions</p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-4 h-4 text-foreground-muted" />
            <span className="text-xs font-semibold text-foreground-muted uppercase">Comptes connectes</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{connectedAccounts?.length ?? 0}</p>
          <p className="text-xs text-foreground-muted mt-1">CPOs avec Stripe Connect</p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-foreground-muted" />
            <span className="text-xs font-semibold text-foreground-muted uppercase">Cle API</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-sm font-medium text-foreground">Configuree</span>
          </div>
          <p className="text-xs text-foreground-muted mt-1">Secret stocke dans Supabase Edge Functions</p>
        </div>
      </div>

      {/* Connected accounts */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Comptes Stripe Connect</h3>
          <a
            href="https://dashboard.stripe.com/connect/accounts/overview"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium"
          >
            Ouvrir Stripe Dashboard <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        {isLoading ? (
          <div className="p-5 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <div className="divide-y divide-border">
            {(connectedAccounts ?? []).map((acc: any) => (
              <div key={acc.id} className="flex items-center justify-between px-5 py-3 hover:bg-surface-elevated/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: acc.color ?? "#6b7280" }} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{acc.name}</p>
                    <p className="text-xs text-foreground-muted font-mono">{acc.stripe_id}</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-400 text-xs font-medium rounded">Connecte</span>
              </div>
            ))}
            {(connectedAccounts ?? []).length === 0 && (
              <div className="px-5 py-8 text-center text-foreground-muted text-sm">Aucun compte connecte</div>
            )}
          </div>
        )}
      </div>

      {/* Fee configuration per CPO */}
      <StripeFeesSection connectedAccounts={connectedAccounts ?? []} />

      {/* Last webhook events */}
      <StripeWebhookLogSection />

      {/* Test webhook */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Test webhook</h3>
            <p className="text-xs text-foreground-muted mt-0.5">Envoyez un événement de test pour vérifier la configuration</p>
          </div>
          <StripeTestWebhookButton />
        </div>
      </div>
    </div>
  );
}

function StripeFeesSection({ connectedAccounts }: { connectedAccounts: { id: string; name: string; code: string; stripe_id: string; color: string }[] }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);

  // Fetch fee configs
  const { data: feeConfigs } = useQuery({
    queryKey: ["stripe-fee-configs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stripe_fee_configs")
        .select("cpo_id, platform_fee_pct, fixed_fee_cents, currency, updated_at");
      return (data ?? []) as { cpo_id: string; platform_fee_pct: number; fixed_fee_cents: number; currency: string; updated_at: string }[];
    },
  });

  const feeMap = useMemo(() => {
    const m: Record<string, { platform_fee_pct: number; fixed_fee_cents: number; currency: string }> = {};
    for (const f of feeConfigs ?? []) m[f.cpo_id] = f;
    return m;
  }, [feeConfigs]);

  const saveMutation = useMutation({
    mutationFn: async ({ cpo_id, platform_fee_pct, fixed_fee_cents }: { cpo_id: string; platform_fee_pct: number; fixed_fee_cents: number }) => {
      const { error } = await supabase
        .from("stripe_fee_configs")
        .upsert({ cpo_id, platform_fee_pct, fixed_fee_cents, currency: "eur", updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stripe-fee-configs"] });
      setEditingId(null);
    },
  });

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Commissions par CPO</h3>
        <p className="text-xs text-foreground-muted mt-0.5">Frais de plateforme appliqués sur chaque transaction</p>
      </div>
      <div className="divide-y divide-border">
        {connectedAccounts.map((acc) => {
          const fee = feeMap[acc.id];
          const isEditing = editingId === acc.id;
          return (
            <StripeFeeRow
              key={acc.id}
              acc={acc}
              fee={fee}
              isEditing={isEditing}
              onEdit={() => setEditingId(acc.id)}
              onCancel={() => setEditingId(null)}
              onSave={(pct, cents) => saveMutation.mutate({ cpo_id: acc.id, platform_fee_pct: pct, fixed_fee_cents: cents })}
              saving={saveMutation.isPending}
            />
          );
        })}
        {connectedAccounts.length === 0 && (
          <div className="px-5 py-8 text-center text-foreground-muted text-sm">Aucun compte connecté</div>
        )}
      </div>
    </div>
  );
}

function StripeFeeRow({ acc, fee, isEditing, onEdit, onCancel, onSave, saving }: {
  acc: { id: string; name: string; color: string };
  fee?: { platform_fee_pct: number; fixed_fee_cents: number };
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (pct: number, cents: number) => void;
  saving: boolean;
}) {
  const [pct, setPct] = useState(fee?.platform_fee_pct ?? 0);
  const [cents, setCents] = useState(fee?.fixed_fee_cents ?? 0);
  useEffect(() => {
    setPct(fee?.platform_fee_pct ?? 0);
    setCents(fee?.fixed_fee_cents ?? 0);
  }, [fee]);

  if (isEditing) {
    return (
      <div className="flex items-center justify-between px-5 py-3 bg-primary/5">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: acc.color ?? "#6b7280" }} />
          <span className="text-sm font-medium text-foreground">{acc.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <input type="number" step="0.1" min="0" max="100" value={pct} onChange={(e) => setPct(Number(e.target.value))}
              className="w-20 bg-surface-elevated border border-border rounded-lg px-2 py-1.5 text-sm text-right font-mono focus:outline-none focus:border-primary/50" />
            <span className="text-xs text-foreground-muted">%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <input type="number" min="0" value={cents} onChange={(e) => setCents(Number(e.target.value))}
              className="w-20 bg-surface-elevated border border-border rounded-lg px-2 py-1.5 text-sm text-right font-mono focus:outline-none focus:border-primary/50" />
            <span className="text-xs text-foreground-muted">cts</span>
          </div>
          <button onClick={() => onSave(pct, cents)} disabled={saving} className="p-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          </button>
          <button onClick={onCancel} className="p-1.5 rounded-lg bg-foreground-muted/10 text-foreground-muted hover:bg-foreground-muted/20">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-5 py-3 hover:bg-surface-elevated/50 transition-colors">
      <div className="flex items-center gap-3">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: acc.color ?? "#6b7280" }} />
        <span className="text-sm font-medium text-foreground">{acc.name}</span>
      </div>
      <div className="flex items-center gap-4">
        {fee ? (
          <div className="flex items-center gap-3 text-xs text-foreground-muted">
            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded font-mono">{fee.platform_fee_pct}%</span>
            {fee.fixed_fee_cents > 0 && <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded font-mono">+{fee.fixed_fee_cents} cts</span>}
          </div>
        ) : (
          <span className="text-xs text-foreground-muted">Non configuré</span>
        )}
        <button onClick={onEdit} className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function StripeWebhookLogSection() {
  const { data: webhookEvents, isLoading } = useQuery({
    queryKey: ["stripe-webhook-events"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stripe_webhook_events")
        .select("id, event_type, status, created_at, payload")
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as { id: string; event_type: string; status: string; created_at: string; payload: any }[];
    },
  });

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Derniers événements webhook</h3>
          <p className="text-xs text-foreground-muted mt-0.5">20 derniers événements reçus</p>
        </div>
      </div>
      {isLoading ? (
        <div className="p-5 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (webhookEvents ?? []).length === 0 ? (
        <div className="px-5 py-8 text-center text-foreground-muted text-sm">
          Aucun événement webhook enregistré. Les événements seront capturés automatiquement par l'Edge Function.
        </div>
      ) : (
        <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
          {(webhookEvents ?? []).map((evt) => (
            <div key={evt.id} className="flex items-center justify-between px-5 py-2.5 hover:bg-surface-elevated/50 transition-colors">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  evt.status === "success" || evt.status === "processed" ? "bg-emerald-400" :
                  evt.status === "failed" ? "bg-red-400" : "bg-amber-400"
                )} />
                <span className="text-sm font-mono text-foreground">{evt.event_type}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn(
                  "px-2 py-0.5 rounded text-xs font-medium",
                  evt.status === "success" || evt.status === "processed" ? "bg-emerald-500/15 text-emerald-400" :
                  evt.status === "failed" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"
                )}>
                  {evt.status}
                </span>
                <span className="text-xs text-foreground-muted whitespace-nowrap">
                  {new Date(evt.created_at).toLocaleString("fr-FR")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StripeTestWebhookButton() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const { error } = await supabase.functions.invoke("stripe-webhook-test", {
        body: { test: true },
      });
      setResult(error ? "error" : "success");
    } catch {
      setResult("error");
    }
    setTesting(false);
    setTimeout(() => setResult(null), 5000);
  };

  return (
    <button
      onClick={handleTest}
      disabled={testing}
      className={cn(
        "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
        result === "success" ? "bg-emerald-500/15 text-emerald-400" :
        result === "error" ? "bg-red-500/15 text-red-400" :
        "bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
      )}
    >
      {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
       result === "success" ? <CheckCircle className="w-3.5 h-3.5" /> :
       result === "error" ? <AlertTriangle className="w-3.5 h-3.5" /> :
       <Send className="w-3.5 h-3.5" />}
      {testing ? "Test en cours..." : result === "success" ? "Webhook OK" : result === "error" ? "Erreur" : "Tester"}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════
// Story 95: Platform usage statistics
// ══════════════════════════════════════════════════════════════

function PlatformStatsSection() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => {
      // Active users
      const { count: activeUsers } = await supabase
        .from("ezdrive_profiles")
        .select("id", { count: "exact", head: true });

      // Users updated this month (proxy for logins)
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { count: loginsThisMonth } = await supabase
        .from("ezdrive_profiles")
        .select("id", { count: "exact", head: true })
        .gte("updated_at", startOfMonth.toISOString());

      // Role distribution
      const { data: roleData } = await supabase
        .from("ezdrive_profiles")
        .select("role");
      const roleCounts: Record<string, number> = {};
      for (const r of roleData ?? []) {
        const role = (r as any).role ?? "unknown";
        roleCounts[role] = (roleCounts[role] ?? 0) + 1;
      }

      // Total sessions (CDRs) count
      const { count: totalSessions } = await supabase
        .from("ocpi_cdrs")
        .select("id", { count: "exact", head: true });

      // Active stations
      const { count: activeStations } = await supabase
        .from("stations")
        .select("id", { count: "exact", head: true });

      return {
        activeUsers: activeUsers ?? 0,
        loginsThisMonth: loginsThisMonth ?? 0,
        roleCounts,
        totalSessions: totalSessions ?? 0,
        activeStations: activeStations ?? 0,
      };
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      </div>
    );
  }

  const roleCounts = stats?.roleCounts ?? {};
  const topRoles = Object.entries(roleCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-base font-heading font-bold text-foreground">Statistiques de la plateforme</h2>
          <p className="text-xs text-foreground-muted">Metriques d'utilisation</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-5">
          <p className="text-xs text-foreground-muted font-semibold uppercase">Utilisateurs actifs</p>
          <p className="text-3xl font-bold text-foreground mt-1">{stats?.activeUsers ?? 0}</p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-5">
          <p className="text-xs text-foreground-muted font-semibold uppercase">Connexions ce mois</p>
          <p className="text-3xl font-bold text-foreground mt-1">{stats?.loginsThisMonth ?? 0}</p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-5">
          <p className="text-xs text-foreground-muted font-semibold uppercase">Sessions CDR</p>
          <p className="text-3xl font-bold text-foreground mt-1">{stats?.totalSessions ?? 0}</p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-5">
          <p className="text-xs text-foreground-muted font-semibold uppercase">Bornes actives</p>
          <p className="text-3xl font-bold text-foreground mt-1">{stats?.activeStations ?? 0}</p>
        </div>
      </div>

      {/* Role distribution */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Repartition par role</h3>
        </div>
        <div className="p-5 space-y-3">
          {topRoles.map(([role, count]) => {
            const total = stats?.activeUsers ?? 1;
            const pct = Math.round((count / total) * 100);
            return (
              <div key={role} className="flex items-center gap-3">
                <span className="text-sm text-foreground-muted w-24 capitalize">{role}</span>
                <div className="flex-1 h-2 bg-surface-elevated rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-sm font-medium text-foreground w-16 text-right">{count} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Story 96: Email templates configuration
// ══════════════════════════════════════════════════════════════

const EMAIL_TEMPLATES = [
  { key: "welcome", label: "Bienvenue", icon: Mail, description: "Email envoye a la creation du compte" },
  { key: "invoice", label: "Facture", icon: FileText, description: "Email envoye avec la facture mensuelle" },
  { key: "alert", label: "Alerte", icon: AlertTriangle, description: "Email d'alerte de panne prolongee" },
  { key: "password_reset", label: "Reset mot de passe", icon: Shield, description: "Email de reinitialisation du mot de passe" },
];

function EmailTemplatesSection() {
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["email-templates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("email_templates")
        .select("key, subject, body_html, updated_at")
        .order("key");
      return (data ?? []) as { key: string; subject: string; body_html: string; updated_at: string }[];
    },
  });

  const templateMap = useMemo(() => {
    const map: Record<string, { subject: string; body_html: string; updated_at: string }> = {};
    for (const t of templates ?? []) {
      map[t.key] = t;
    }
    return map;
  }, [templates]);

  const saveMutation = useMutation({
    mutationFn: async ({ key, subject, body_html }: { key: string; subject: string; body_html: string }) => {
      const { error } = await supabase
        .from("email_templates")
        .upsert({ key, subject, body_html, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setEditingKey(null);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Mail className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-base font-heading font-bold text-foreground">Templates email</h2>
          <p className="text-xs text-foreground-muted">Modeles d'emails envoyes par la plateforme</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : (
        <div className="space-y-4">
          {EMAIL_TEMPLATES.map((tpl) => {
            const existing = templateMap[tpl.key];
            const Icon = tpl.icon;

            if (editingKey === tpl.key) {
              return (
                <EmailTemplateEditor
                  key={tpl.key}
                  templateKey={tpl.key}
                  label={tpl.label}
                  icon={Icon}
                  initialSubject={existing?.subject ?? ""}
                  initialBody={existing?.body_html ?? ""}
                  onSave={(subject, body_html) => saveMutation.mutate({ key: tpl.key, subject, body_html })}
                  onCancel={() => setEditingKey(null)}
                  saving={saveMutation.isPending}
                />
              );
            }

            return (
              <div key={tpl.key} className="bg-surface border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{tpl.label}</p>
                      <p className="text-xs text-foreground-muted">{tpl.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {existing?.updated_at && (
                      <span className="text-xs text-foreground-muted">
                        Modifie le {new Date(existing.updated_at).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                    <button
                      onClick={() => setEditingKey(tpl.key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary font-medium hover:bg-primary/10 rounded-lg transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Editer
                    </button>
                  </div>
                </div>
                {existing?.subject && (
                  <div className="mt-3 p-3 bg-surface-elevated rounded-xl">
                    <p className="text-xs text-foreground-muted mb-1">Sujet :</p>
                    <p className="text-sm text-foreground">{existing.subject}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-surface-elevated/30 border border-border rounded-2xl p-4">
        <p className="text-xs text-foreground-muted">
          <strong>Note :</strong> L'envoi reel des emails est gere par Supabase Auth (reset password) et les Edge Functions (alertes, factures).
          Les templates ici servent de reference pour le contenu des emails.
        </p>
      </div>
    </div>
  );
}

function EmailTemplateEditor({
  templateKey: _templateKey,
  label,
  icon: Icon,
  initialSubject,
  initialBody,
  onSave,
  onCancel,
  saving,
}: {
  templateKey: string;
  label: string;
  icon: React.ElementType;
  initialSubject: string;
  initialBody: string;
  onSave: (subject: string, body: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);

  return (
    <div className="bg-surface border border-primary/30 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">Editer : {label}</h3>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground-muted mb-1.5">Sujet</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Sujet de l'email"
          className="w-full bg-surface-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground-muted mb-1.5">Corps (HTML)</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="<h1>Bienvenue sur EZDrive</h1><p>Votre compte a ete cree...</p>"
          rows={8}
          className="w-full bg-surface-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm font-mono text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 resize-none"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSave(subject, body)}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Sauvegarder
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm text-foreground-muted hover:text-foreground">Annuler</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Admin P1: User access revocation
// ══════════════════════════════════════════════════════════════

interface RevocableUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  updated_at: string;
  is_disabled?: boolean;
}

function RevocationSection() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ userId: string; action: "disable" | "enable" | "reset_password" } | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-revocation-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ezdrive_profiles")
        .select("id, email, full_name, role, updated_at, is_disabled")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as RevocableUser[];
    },
  });

  // Audit log
  const { data: auditLog } = useQuery({
    queryKey: ["admin-revocation-audit"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_audit_log")
        .select("id, action, target_user_id, target_email, performed_by, details, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      return (data ?? []) as {
        id: string; action: string; target_user_id: string; target_email: string;
        performed_by: string; details: string; created_at: string;
      }[];
    },
  });

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users ?? [];
    const q = search.toLowerCase();
    return (users ?? []).filter(
      (u) =>
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.full_name ?? "").toLowerCase().includes(q) ||
        (u.role ?? "").toLowerCase().includes(q)
    );
  }, [users, search]);

  // KPIs
  const totalUsers = (users ?? []).length;
  const disabledUsers = (users ?? []).filter((u) => u.is_disabled).length;
  const adminUsers = (users ?? []).filter((u) => u.role === "admin").length;

  const disableMutation = useMutation({
    mutationFn: async ({ userId, disable }: { userId: string; disable: boolean }) => {
      const { error } = await supabase
        .from("ezdrive_profiles")
        .update({ is_disabled: disable })
        .eq("id", userId);
      if (error) throw error;
      // Log audit
      const target = (users ?? []).find((u) => u.id === userId);
      await supabase.from("admin_audit_log").insert({
        action: disable ? "disable_user" : "enable_user",
        target_user_id: userId,
        target_email: target?.email ?? "",
        details: disable ? "Compte désactivé par admin" : "Compte réactivé par admin",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-revocation-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-revocation-audit"] });
      setConfirmAction(null);
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, email }: { userId: string; email: string }) => {
      // Trigger Supabase password reset email
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      // Log audit
      await supabase.from("admin_audit_log").insert({
        action: "force_password_reset",
        target_user_id: userId,
        target_email: email,
        details: "Réinitialisation forcée du mot de passe",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-revocation-audit"] });
      setConfirmAction(null);
    },
  });

  const handleConfirm = () => {
    if (!confirmAction) return;
    const user = (users ?? []).find((u) => u.id === confirmAction.userId);
    if (!user) return;

    if (confirmAction.action === "disable") {
      disableMutation.mutate({ userId: confirmAction.userId, disable: true });
    } else if (confirmAction.action === "enable") {
      disableMutation.mutate({ userId: confirmAction.userId, disable: false });
    } else if (confirmAction.action === "reset_password") {
      resetPasswordMutation.mutate({ userId: confirmAction.userId, email: user.email });
    }
  };

  const isPending = disableMutation.isPending || resetPasswordMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <UserX className="w-5 h-5 text-red-400" />
        <div>
          <h2 className="text-base font-heading font-bold text-foreground">Révocation d'accès</h2>
          <p className="text-xs text-foreground-muted">Désactivation de comptes, réinitialisation de mots de passe, audit</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-xs text-foreground-muted font-semibold uppercase">Utilisateurs</p>
          <p className="text-2xl font-bold text-foreground mt-1">{totalUsers}</p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-xs text-foreground-muted font-semibold uppercase">Désactivés</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{disabledUsers}</p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-xs text-foreground-muted font-semibold uppercase">Admins</p>
          <p className="text-2xl font-bold text-foreground mt-1">{adminUsers}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un utilisateur..."
          className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50" />
      </div>

      {/* Confirmation dialog */}
      {confirmAction && (
        <div className="bg-red-500/5 border border-red-500/30 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">
                {confirmAction.action === "disable" && "Confirmer la désactivation du compte"}
                {confirmAction.action === "enable" && "Confirmer la réactivation du compte"}
                {confirmAction.action === "reset_password" && "Confirmer la réinitialisation du mot de passe"}
              </p>
              <p className="text-xs text-foreground-muted mt-1">
                Utilisateur : {(users ?? []).find((u) => u.id === confirmAction.userId)?.email ?? "—"}
              </p>
              <div className="flex gap-2 mt-3">
                <button onClick={handleConfirm} disabled={isPending}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-50">
                  {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  Confirmer
                </button>
                <button onClick={() => setConfirmAction(null)} className="px-4 py-2 text-sm text-foreground-muted hover:text-foreground">Annuler</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Users table */}
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Utilisateur</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Rôle</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Dernière activité</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-foreground-muted uppercase">Statut</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredUsers.map((user) => {
                const isDisabled = user.is_disabled === true;
                return (
                  <tr key={user.id} className={cn("hover:bg-surface-elevated/50 transition-colors", isDisabled && "opacity-50")}>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{user.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        user.role === "admin" ? "bg-red-500/15 text-red-400" :
                        user.role === "manager" ? "bg-blue-500/15 text-blue-400" :
                        user.role === "b2b" ? "bg-amber-500/15 text-amber-400" :
                        "bg-foreground-muted/10 text-foreground-muted"
                      )}>
                        {user.role ?? "user"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                      {user.updated_at ? new Date(user.updated_at).toLocaleString("fr-FR") : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        isDisabled ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"
                      )}>
                        {isDisabled ? "Désactivé" : "Actif"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isDisabled ? (
                          <button
                            onClick={() => setConfirmAction({ userId: user.id, action: "enable" })}
                            className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10"
                            title="Réactiver le compte"
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmAction({ userId: user.id, action: "disable" })}
                            className="p-1.5 rounded-lg text-foreground-muted hover:text-red-400 hover:bg-red-500/10"
                            title="Désactiver le compte"
                          >
                            <ShieldOff className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmAction({ userId: user.id, action: "reset_password" })}
                          className="p-1.5 rounded-lg text-foreground-muted hover:text-amber-400 hover:bg-amber-500/10"
                          title="Forcer réinitialisation mot de passe"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-foreground-muted">{search ? "Aucun résultat" : "Aucun utilisateur"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Audit trail */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <History className="w-4 h-4 text-foreground-muted" />
          <h3 className="text-sm font-semibold text-foreground">Journal d'audit</h3>
        </div>
        {(auditLog ?? []).length === 0 ? (
          <div className="px-5 py-8 text-center text-foreground-muted text-sm">Aucune action enregistrée</div>
        ) : (
          <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
            {(auditLog ?? []).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between px-5 py-2.5 hover:bg-surface-elevated/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    entry.action.includes("disable") ? "bg-red-400" :
                    entry.action.includes("enable") ? "bg-emerald-400" :
                    "bg-amber-400"
                  )} />
                  <div>
                    <p className="text-sm text-foreground">
                      <span className="font-medium">
                        {entry.action === "disable_user" && "Désactivation"}
                        {entry.action === "enable_user" && "Réactivation"}
                        {entry.action === "force_password_reset" && "Reset mot de passe"}
                        {!["disable_user", "enable_user", "force_password_reset"].includes(entry.action) && entry.action}
                      </span>
                      {" — "}
                      <span className="text-foreground-muted">{entry.target_email}</span>
                    </p>
                    {entry.details && <p className="text-xs text-foreground-muted">{entry.details}</p>}
                  </div>
                </div>
                <span className="text-xs text-foreground-muted whitespace-nowrap">
                  {new Date(entry.created_at).toLocaleString("fr-FR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-surface-elevated/30 border border-border rounded-2xl p-4">
        <p className="text-xs text-foreground-muted">
          <strong>Note :</strong> La désactivation d'un compte empêche la connexion mais préserve les données.
          La réinitialisation de mot de passe envoie un email à l'utilisateur via Supabase Auth.
        </p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Story 90 (existing): Login Logs Section
// ══════════════════════════════════════════════════════════════

function LoginLogsSection() {
  const { data: loginLogs, isLoading } = useQuery({
    queryKey: ["admin-login-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <LogIn className="w-5 h-5 text-primary" />
        <h2 className="text-base font-heading font-bold text-foreground">Historique des connexions</h2>
      </div>

      {isLoading ? (
        <div className="bg-surface border border-border rounded-2xl p-6 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Utilisateur</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Derniere activite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(loginLogs ?? []).map((log) => (
                  <tr key={log.id as string} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">
                      {(log.full_name as string) ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">
                      {(log.email as string) ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        (log.role as string) === "admin" ? "bg-red-500/15 text-red-400" :
                        (log.role as string) === "manager" ? "bg-blue-500/15 text-blue-400" :
                        "bg-foreground-muted/10 text-foreground-muted"
                      )}>
                        {(log.role as string) ?? "user"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                      {log.updated_at ? new Date(log.updated_at as string).toLocaleString("fr-FR") : "\u2014"}
                    </td>
                  </tr>
                ))}
                {(loginLogs ?? []).length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-foreground-muted">Aucun log de connexion</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Story 6.5a: API Keys Management
// ══════════════════════════════════════════════════════════════

interface ApiKey {
  id: string;
  name: string;
  key_hash: string;
  key_prefix?: string;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

function maskKey(prefix?: string): string {
  if (!prefix) return "sk_...****";
  return `${prefix}...****`;
}

function relativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `Il y a ${diffD}j`;
  return new Date(dateStr).toLocaleDateString("fr-FR");
}

function ApiKeysSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);

  // Fetch API keys
  const { data: apiKeys, isLoading, error: fetchError } = useQuery({
    queryKey: ["admin-api-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        // Table might not exist
        if (error.code === "42P01" || error.message?.includes("does not exist")) {
          return [] as ApiKey[];
        }
        throw error;
      }
      return (data ?? []) as ApiKey[];
    },
  });

  const tableNotFound = fetchError && (
    (fetchError as any)?.code === "42P01" ||
    (fetchError as any)?.message?.includes("does not exist")
  );

  // Generate key mutation
  const generateMutation = useMutation({
    mutationFn: async (name: string) => {
      const rawKey = `sk_${crypto.randomUUID().replace(/-/g, "")}`;
      const keyPrefix = rawKey.slice(0, 7);
      // SHA-256 hash
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(rawKey)
      );
      const keyHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const { error } = await supabase.from("api_keys").insert({
        name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        created_by: user?.id,
      });
      if (error) throw error;
      return rawKey;
    },
    onSuccess: (rawKey) => {
      setGeneratedKey(rawKey);
      queryClient.invalidateQueries({ queryKey: ["admin-api-keys"] });
    },
  });

  // Revoke key mutation
  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-api-keys"] });
      setRevokeTarget(null);
    },
  });

  const handleGenerate = () => {
    if (!newKeyName.trim()) return;
    generateMutation.mutate(newKeyName.trim());
  };

  const handleCopy = async () => {
    if (!generatedKey) return;
    await navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewKeyName("");
    setGeneratedKey(null);
    setCopied(false);
    generateMutation.reset();
  };

  const activeKeys = (apiKeys ?? []).filter((k) => !k.revoked_at);
  const revokedKeys = (apiKeys ?? []).filter((k) => k.revoked_at);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Key className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-base font-heading font-bold text-foreground">Clés API</h2>
            <p className="text-xs text-foreground-muted">Gestion des clés d'accès à l'API</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Générer une clé API
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-xs text-foreground-muted font-semibold uppercase">Total</p>
          <p className="text-2xl font-bold text-foreground mt-1">{(apiKeys ?? []).length}</p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-xs text-foreground-muted font-semibold uppercase">Actives</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{activeKeys.length}</p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-xs text-foreground-muted font-semibold uppercase">Révoquées</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{revokedKeys.length}</p>
        </div>
      </div>

      {tableNotFound && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-sm text-amber-400">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          La table <code className="font-mono">api_keys</code> n'existe pas encore. Créez-la dans Supabase pour activer cette fonctionnalité.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Clé</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Créée le</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Dernière utilisation</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Statut</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(apiKeys ?? []).map((key) => (
                  <tr key={key.id} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{key.name}</td>
                    <td className="px-4 py-3 text-sm font-mono text-foreground-muted">{maskKey(key.key_prefix)}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                      {new Date(key.created_at).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                      {key.last_used_at ? relativeTime(key.last_used_at) : "Jamais"}
                    </td>
                    <td className="px-4 py-3">
                      {key.revoked_at ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/15 text-red-400">Révoquée</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/15 text-green-400">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!key.revoked_at && (
                        <button
                          onClick={() => setRevokeTarget(key)}
                          className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
                        >
                          Révoquer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {(apiKeys ?? []).length === 0 && !tableNotFound && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-foreground-muted">
                      Aucune clé API. Cliquez sur "Générer une clé API" pour commencer.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150]" onClick={closeCreateModal} />
          <div className="fixed inset-0 z-[151] flex items-center justify-center p-4">
            <div
              className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 pb-0">
                <h3 className="text-base font-heading font-bold text-foreground">Générer une clé API</h3>
                <button onClick={closeCreateModal} className="p-1 text-foreground-muted hover:text-foreground rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {!generatedKey ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted mb-1.5">Nom de la clé</label>
                      <input
                        type="text"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="Ex: Production API, Mobile App..."
                        className="w-full bg-surface-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") handleGenerate(); }}
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={closeCreateModal}
                        className="px-4 py-2.5 text-sm font-medium text-foreground-muted hover:text-foreground border border-border rounded-xl transition-colors"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={handleGenerate}
                        disabled={!newKeyName.trim() || generateMutation.isPending}
                        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white font-semibold rounded-xl text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {generateMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Key className="w-4 h-4" />
                        )}
                        Générer
                      </button>
                    </div>
                    {generateMutation.isError && (
                      <p className="text-xs text-red-400">Erreur: {(generateMutation.error as Error).message}</p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-sm text-amber-400">
                      <AlertTriangle className="w-4 h-4 inline mr-1.5" />
                      Copiez cette clé maintenant, elle ne sera plus visible.
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        value={generatedKey}
                        className="w-full bg-surface-elevated border border-border rounded-xl px-3.5 py-2.5 pr-12 text-sm font-mono text-foreground focus:outline-none"
                      />
                      <button
                        onClick={handleCopy}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-foreground-muted hover:text-foreground transition-colors"
                        title="Copier"
                      >
                        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={closeCreateModal}
                        className="px-5 py-2.5 bg-primary text-white font-semibold rounded-xl text-sm hover:bg-primary/90 transition-colors"
                      >
                        Fermer
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Revoke Confirm */}
      <ConfirmDialog
        open={!!revokeTarget}
        title="Révoquer cette clé API ?"
        description={`La clé "${revokeTarget?.name}" sera définitivement révoquée et ne pourra plus être utilisée.`}
        confirmLabel="Révoquer"
        variant="danger"
        loading={revokeMutation.isPending}
        loadingLabel="Révocation..."
        onConfirm={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Story 6.5b: Audit Log
// ══════════════════════════════════════════════════════════════

interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  profiles?: { full_name: string | null; email: string | null } | null;
}

const ACTION_TYPES = [
  { value: "", label: "Toutes les actions" },
  { value: "create", label: "Création" },
  { value: "update", label: "Modification" },
  { value: "delete", label: "Suppression" },
  { value: "login", label: "Connexion" },
  { value: "logout", label: "Déconnexion" },
  { value: "revoke", label: "Révocation" },
  { value: "export", label: "Export" },
];

function actionBadgeClasses(action: string): string {
  if (action.startsWith("create") || action === "insert") return "bg-green-500/15 text-green-400";
  if (action.startsWith("update") || action === "edit") return "bg-blue-500/15 text-blue-400";
  if (action.startsWith("delete") || action === "remove") return "bg-red-500/15 text-red-400";
  if (action.startsWith("login") || action === "auth") return "bg-purple-500/15 text-purple-400";
  if (action.startsWith("logout")) return "bg-orange-500/15 text-orange-400";
  if (action.startsWith("revoke")) return "bg-amber-500/15 text-amber-400";
  if (action.startsWith("export")) return "bg-cyan-500/15 text-cyan-400";
  return "bg-foreground-muted/10 text-foreground-muted";
}

function AuditLogSection() {
  const [filterAction, setFilterAction] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Fetch profiles for user filter dropdown
  const { data: profiles } = useQuery({
    queryKey: ["admin-audit-profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      return (data ?? []) as { id: string; full_name: string | null; email: string | null }[];
    },
  });

  // Fetch audit logs
  const { data: auditLogs, isLoading, error: fetchError } = useQuery({
    queryKey: ["admin-audit-logs", filterAction, filterUser, filterDateFrom, filterDateTo],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("*, profiles:user_id(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (filterAction) {
        query = query.ilike("action", `${filterAction}%`);
      }
      if (filterUser) {
        query = query.eq("user_id", filterUser);
      }
      if (filterDateFrom) {
        query = query.gte("created_at", `${filterDateFrom}T00:00:00`);
      }
      if (filterDateTo) {
        query = query.lte("created_at", `${filterDateTo}T23:59:59`);
      }

      const { data, error } = await query;
      if (error) {
        if (error.code === "42P01" || error.message?.includes("does not exist")) {
          return [] as AuditLog[];
        }
        throw error;
      }
      return (data ?? []) as AuditLog[];
    },
  });

  const tableNotFound = fetchError && (
    (fetchError as any)?.code === "42P01" ||
    (fetchError as any)?.message?.includes("does not exist")
  );

  // CSV export
  const handleExportCsv = () => {
    if (!auditLogs || auditLogs.length === 0) return;
    const headers = ["Date", "Utilisateur", "Email", "Action", "Entité", "ID Entité", "Détails"];
    const rows = auditLogs.map((log) => [
      new Date(log.created_at).toLocaleString("fr-FR"),
      log.profiles?.full_name ?? "",
      log.profiles?.email ?? "",
      log.action,
      log.entity_type,
      log.entity_id ?? "",
      log.details ? JSON.stringify(log.details) : "",
    ]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-base font-heading font-bold text-foreground">Journal d'audit</h2>
            <p className="text-xs text-foreground-muted">Historique de toutes les actions effectuées sur la plateforme</p>
          </div>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={!auditLogs || auditLogs.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 bg-surface border border-border text-foreground-muted rounded-xl text-sm font-medium hover:text-foreground hover:border-foreground-muted transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          Exporter CSV
        </button>
      </div>

      {tableNotFound && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-sm text-amber-400">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          La table <code className="font-mono">audit_logs</code> n'existe pas encore. Créez-la dans Supabase pour activer cette fonctionnalité.
        </div>
      )}

      {/* Filters */}
      <div className="bg-surface border border-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-foreground-muted" />
          <span className="text-xs font-semibold text-foreground-muted uppercase">Filtres</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* User filter */}
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">Utilisateur</label>
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="w-full bg-surface-elevated border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="">Tous</option>
              {(profiles ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.full_name || p.email || p.id}</option>
              ))}
            </select>
          </div>

          {/* Action type filter */}
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">Action</label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full bg-surface-elevated border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
            >
              {ACTION_TYPES.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>

          {/* Date from */}
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">Du</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="w-full bg-surface-elevated border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">Au</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="w-full bg-surface-elevated border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>
        {(filterAction || filterUser || filterDateFrom || filterDateTo) && (
          <button
            onClick={() => { setFilterAction(""); setFilterUser(""); setFilterDateFrom(""); setFilterDateTo(""); }}
            className="mt-3 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
          >
            Réinitialiser les filtres
          </button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Utilisateur</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Entité</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Détails</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(auditLogs ?? []).map((log) => (
                  <tr key={log.id} className="group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {(log.profiles?.full_name ?? log.profiles?.email ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{log.profiles?.full_name ?? "—"}</p>
                          <p className="text-xs text-foreground-muted">{log.profiles?.email ?? "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded text-xs font-medium", actionBadgeClasses(log.action))}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-foreground">{log.entity_type}</p>
                      {log.entity_id && (
                        <p className="text-xs text-foreground-muted font-mono">{log.entity_id.slice(0, 8)}...</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {log.details ? (
                        <div>
                          <button
                            onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                            className="text-xs text-primary hover:text-primary/80 transition-colors font-medium flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {expandedRow === log.id ? "Masquer" : "Voir"}
                          </button>
                          {expandedRow === log.id && (
                            <pre className="mt-2 text-xs font-mono text-foreground-muted whitespace-pre-wrap break-all max-h-48 overflow-y-auto bg-surface-elevated/30 rounded-lg p-2 border border-border">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-foreground-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                      {relativeTime(log.created_at)}
                    </td>
                  </tr>
                ))}
                {(auditLogs ?? []).length === 0 && !tableNotFound && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-foreground-muted">
                      Aucun log d'audit trouvé pour les filtres sélectionnés.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {(auditLogs ?? []).length > 0 && (
            <div className="px-4 py-3 border-t border-border">
              <p className="text-xs text-foreground-muted">{auditLogs?.length} entrée{(auditLogs?.length ?? 0) > 1 ? "s" : ""} affichée{(auditLogs?.length ?? 0) > 1 ? "s" : ""} (limite: 100)</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
