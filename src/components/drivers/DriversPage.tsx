// ============================================================
// EZDrive — Drivers Page
// View and manage consumer/driver profiles
// ============================================================

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
  CreditCard,
  Eye,
  Plus,
  X,
  Loader2,
  Pencil,
} from "lucide-react";
import { apiPost, apiPut } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { KPICard } from "@/components/ui/KPICard";
import { Skeleton } from "@/components/ui/Skeleton";
import { SlideOver } from "@/components/ui/SlideOver";
import { PageHelp } from "@/components/ui/PageHelp";

// ── Types ─────────────────────────────────────────────────────

interface Driver {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  status: string | null;
  stripe_customer_id: string | null;
  is_company: boolean;
  company_name: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  account_manager: string | null;
  validity_date: string | null;
  cost_center: string | null;
  siret: string | null;
  billing_mode: string | null;
  admin_notes: string | null;
  created_at: string;
}

const TABS = ["Tous", "Actifs", "Inactifs"] as const;
type Tab = (typeof TABS)[number];

type SortKey = "full_name" | "email" | "country" | "status" | "created_at";
const PAGE_SIZE = 20;

// ── Component ─────────────────────────────────────────────────

export function DriversPage() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("Tous");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Driver | null>(null);
  const [editDriver, setEditDriver] = useState<Driver | null>(null);

  // ── Fetch drivers ─────────────────────────────────────────

  const { data: drivers, isLoading } = useQuery<Driver[]>({
    queryKey: ["drivers"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("consumer_profiles")
          .select("id, full_name, email, phone, country, status, stripe_customer_id, is_company, company_name, address, postal_code, city, account_manager, validity_date, cost_center, siret, billing_mode, admin_notes, created_at")
          .order("created_at", { ascending: false });
        if (error) {
          console.warn("[Drivers] consumer_profiles query:", error.message);
          return [];
        }
        return (data ?? []) as Driver[];
      } catch {
        return [];
      }
    },
  });

  // ── KPIs ──────────────────────────────────────────────────

  const kpis = useMemo(() => {
    if (!drivers) return { total: 0, active: 0, inactive: 0, withSubscription: 0 };
    return {
      total: drivers.length,
      active: drivers.filter((d) => d.status === "active").length,
      inactive: drivers.filter((d) => d.status !== "active").length,
      withSubscription: drivers.filter((d) => !!d.stripe_customer_id).length,
    };
  }, [drivers]);

  // ── Filtered + sorted ─────────────────────────────────────

  const filtered = useMemo(() => {
    if (!drivers) return [];
    let list = [...drivers];

    // Tab filter
    if (activeTab === "Actifs") list = list.filter((d) => d.status === "active");
    else if (activeTab === "Inactifs") list = list.filter((d) => d.status !== "active");

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          (d.full_name ?? "").toLowerCase().includes(q) ||
          (d.email ?? "").toLowerCase().includes(q) ||
          (d.phone ?? "").toLowerCase().includes(q) ||
          (d.company_name ?? "").toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      const av = (a[sortKey] ?? "") as string;
      const bv = (b[sortKey] ?? "") as string;
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    return list;
  }, [drivers, activeTab, search, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Sort handler ──────────────────────────────────────────

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  // ── Loading ───────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Conducteurs</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Gestion des profils conducteurs inscrits sur la plateforme
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-background rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ajouter conducteur
        </button>
      </div>

      <PageHelp
        summary="Gestion des conducteurs (utilisateurs finaux) pour le roaming eMSP"
        items={[
          { label: "Conducteur", description: "Un utilisateur final qui charge son véhicule, identifié par un token (badge RFID ou app)." },
          { label: "Token", description: "Moyen d'identification du conducteur : badge RFID, QR code, ou identifiant d'application." },
          { label: "Autorisations", description: "Bornes et réseaux sur lesquels ce conducteur est autorisé à charger." },
          { label: "Historique", description: "Sessions de charge effectuées par ce conducteur sur tous les réseaux accessibles." },
        ]}
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total conducteurs" value={kpis.total} icon={Users} color="#6366f1" />
        <KPICard label="Actifs" value={kpis.active} icon={UserCheck} color="#10b981" />
        <KPICard label="Inactifs" value={kpis.inactive} icon={UserX} color="#ef4444" />
        <KPICard label="Avec abonnement" value={kpis.withSubscription} icon={CreditCard} color="#3b82f6" />
      </div>

      {/* Search + Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex gap-1 border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setPage(1); }}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors relative",
                activeTab === tab
                  ? "text-primary"
                  : "text-foreground-muted hover:text-foreground"
              )}
            >
              {tab}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            type="text"
            placeholder="Rechercher un conducteur..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-elevated/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground-muted">État</th>
                <ThSort label="Nom" col="full_name" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <ThSort label="Email" col="email" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <th className="text-left px-4 py-3 font-semibold text-foreground-muted">Téléphone</th>
                <ThSort label="Pays" col="country" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <th className="text-left px-4 py-3 font-semibold text-foreground-muted">Entreprise</th>
                <ThSort label="Inscrit le" col="created_at" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <th className="text-right px-4 py-3 font-semibold text-foreground-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-foreground-muted">
                    Aucun conducteur trouvé
                  </td>
                </tr>
              ) : (
                paged.map((d) => (
                  <tr key={d.id} className="border-b border-border/50 hover:bg-surface-elevated/30 transition-colors">
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex px-2 py-0.5 rounded-full text-xs font-semibold",
                          d.status === "active"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-red-500/10 text-red-400"
                        )}
                      >
                        {d.status === "active" ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{d.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground-muted">{d.email ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground-muted">{d.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground-muted">{d.country ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground-muted">{d.is_company ? d.company_name ?? "Oui" : "—"}</td>
                    <td className="px-4 py-3 text-foreground-muted">
                      {new Date(d.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditDriver(d)}
                          className="p-1.5 text-foreground-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDetail(d)}
                          className="p-1.5 text-foreground-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Voir détail"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-xs text-foreground-muted">
            {filtered.length} conducteur{filtered.length > 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-border hover:bg-surface-elevated disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-foreground-muted">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-border hover:bg-surface-elevated disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {showAddModal && (
        <AddDriverModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            queryClient.invalidateQueries({ queryKey: ["drivers"] });
          }}
        />
      )}

      {/* Detail SlideOver */}
      <SlideOver
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Détail conducteur"
        subtitle={detail?.full_name ?? ""}
      >
        {detail && (
          <div className="p-6 space-y-6">
            <DetailSection title="Informations personnelles">
              <DetailRow label="Nom complet" value={detail.full_name ?? "—"} />
              <DetailRow label="Email" value={detail.email ?? "—"} />
              <DetailRow label="Téléphone" value={detail.phone ?? "—"} />
              <DetailRow label="Pays" value={detail.country ?? "—"} />
              <DetailRow
                label="Statut"
                value={
                  <span className={cn(
                    "inline-flex px-2 py-0.5 rounded-full text-xs font-semibold",
                    detail.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  )}>
                    {detail.status === "active" ? "Actif" : "Inactif"}
                  </span>
                }
              />
            </DetailSection>

            {detail.is_company && (
              <DetailSection title="Entreprise">
                <DetailRow label="Nom entreprise" value={detail.company_name ?? "—"} />
              </DetailSection>
            )}

            <DetailSection title="Facturation">
              <DetailRow label="Stripe Customer" value={detail.stripe_customer_id ?? "Non configuré"} />
            </DetailSection>

            <DetailSection title="Métadonnées">
              <DetailRow label="ID" value={detail.id} />
              <DetailRow
                label="Inscrit le"
                value={new Date(detail.created_at).toLocaleDateString("fr-FR", {
                  day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              />
            </DetailSection>
          </div>
        )}
      </SlideOver>

      {/* Edit Driver Modal */}
      {editDriver && (
        <EditDriverModal
          driver={editDriver}
          onClose={() => setEditDriver(null)}
          onSaved={() => {
            setEditDriver(null);
            queryClient.invalidateQueries({ queryKey: ["drivers"] });
          }}
        />
      )}
    </div>
  );
}

// ── Reusable sub-components ──────────────────────────────────

function ThSort({
  label,
  col,
  sortKey,
  sortAsc,
  onSort,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (key: SortKey) => void;
}) {
  return (
    <th
      className="text-left px-4 py-3 font-semibold text-foreground-muted cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === col ? (
          sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-foreground-muted">{label}</span>
      <span className="text-foreground font-medium text-right">{value}</span>
    </div>
  );
}

function AddDriverModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    country: "FR",
    is_company: false,
    company_name: "",
    user_type: "INDIVIDUAL" as "INDIVIDUAL" | "BUSINESS" | "FLEET_MANAGER",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email.trim()) { setError("L'email est obligatoire"); return; }
    if (!form.full_name.trim()) { setError("Le nom est obligatoire"); return; }
    setLoading(true);
    setError(null);
    try {
      await apiPost("admin/consumer", {
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        user_type: form.user_type,
        is_company: form.is_company,
        company_name: form.company_name.trim() || null,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl">
          <div className="flex items-center justify-between p-5 border-b border-border">
            <h2 className="font-heading font-bold text-lg">Ajouter un conducteur</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-surface-elevated rounded-lg transition-colors">
              <X className="w-5 h-5 text-foreground-muted" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-foreground-muted mb-1.5">Nom complet *</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="Jean Dupont"
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs text-foreground-muted mb-1.5">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="jean@exemple.fr"
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-foreground-muted mb-1.5">Téléphone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+33 6 00 00 00 00"
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs text-foreground-muted mb-1.5">Pays</label>
                <select
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm focus:outline-none focus:border-primary/50"
                >
                  <option value="FR">France</option>
                  <option value="RE">La Réunion</option>
                  <option value="GP">Guadeloupe</option>
                  <option value="MQ">Martinique</option>
                  <option value="BE">Belgique</option>
                  <option value="CH">Suisse</option>
                  <option value="LU">Luxembourg</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-foreground-muted mb-1.5">Type</label>
              <select
                value={form.user_type}
                onChange={(e) => setForm({ ...form, user_type: e.target.value as typeof form.user_type })}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm focus:outline-none focus:border-primary/50"
              >
                <option value="INDIVIDUAL">Particulier</option>
                <option value="BUSINESS">Entreprise</option>
                <option value="FLEET_MANAGER">Gestionnaire de flotte</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="drv_is_company"
                checked={form.is_company}
                onChange={(e) => setForm({ ...form, is_company: e.target.checked })}
                className="w-4 h-4 accent-primary"
              />
              <label htmlFor="drv_is_company" className="text-sm text-foreground">Compte entreprise</label>
            </div>
            {form.is_company && (
              <div>
                <label className="block text-xs text-foreground-muted mb-1.5">Nom de l'entreprise</label>
                <input
                  type="text"
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  placeholder="Nom de la société"
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
            )}
            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-foreground-muted hover:text-foreground transition-colors">
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 bg-primary text-background rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Créer le conducteur
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ── Edit Driver Modal ─────────────────────────────────────────

function EditDriverModal({
  driver,
  onClose,
  onSaved,
}: {
  driver: Driver;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    full_name: driver.full_name ?? "",
    phone: driver.phone ?? "",
    country: driver.country ?? "FR",
    user_type: "INDIVIDUAL" as "INDIVIDUAL" | "BUSINESS" | "FLEET_MANAGER",
    is_company: driver.is_company,
    company_name: driver.company_name ?? "",
    address: driver.address ?? "",
    postal_code: driver.postal_code ?? "",
    city: driver.city ?? "",
    account_manager: driver.account_manager ?? "",
    validity_date: driver.validity_date ? driver.validity_date.slice(0, 10) : "",
    cost_center: driver.cost_center ?? "",
    siret: driver.siret ?? "",
    billing_mode: (driver.billing_mode ?? "POSTPAID") as "PREPAID" | "POSTPAID",
    status: (driver.status ?? "active") as "active" | "inactive" | "suspended",
    admin_notes: driver.admin_notes ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputClass = "w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm focus:outline-none focus:border-primary/50";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiPut(`customers/${driver.id}`, {
        full_name: form.full_name.trim() || null,
        phone: form.phone.trim() || null,
        is_company: form.is_company,
        company_name: form.company_name.trim() || null,
        address: form.address.trim() || null,
        postal_code: form.postal_code.trim() || null,
        city: form.city.trim() || null,
        country: form.country || null,
        account_manager: form.account_manager.trim() || null,
        validity_date: form.validity_date || null,
        cost_center: form.cost_center.trim() || null,
        siret: form.siret.trim() || null,
        billing_mode: form.billing_mode,
        status: form.status,
        admin_notes: form.admin_notes.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
            <h2 className="font-heading font-bold text-lg">Modifier le conducteur</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-surface-elevated rounded-lg transition-colors">
              <X className="w-5 h-5 text-foreground-muted" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-foreground-muted mb-1.5">Nom complet</label>
                <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-foreground-muted mb-1.5">Téléphone</label>
                <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-foreground-muted mb-1.5">Pays</label>
                <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className={inputClass}>
                  <option value="FR">France</option>
                  <option value="RE">La Réunion</option>
                  <option value="GP">Guadeloupe</option>
                  <option value="MQ">Martinique</option>
                  <option value="GF">Guyane</option>
                  <option value="BE">Belgique</option>
                  <option value="CH">Suisse</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-foreground-muted mb-1.5">Statut</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })} className={inputClass}>
                  <option value="active">Actif</option>
                  <option value="inactive">Inactif</option>
                  <option value="suspended">Suspendu</option>
                </select>
              </div>
            </div>
            {/* Adresse */}
            <div>
              <label className="block text-xs text-foreground-muted mb-1.5">Adresse</label>
              <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-foreground-muted mb-1.5">Code postal</label>
                <input type="text" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-foreground-muted mb-1.5">Ville</label>
                <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputClass} />
              </div>
            </div>
            {/* Gestion */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-foreground-muted mb-1.5">Gestionnaire</label>
                <input type="text" value={form.account_manager} onChange={(e) => setForm({ ...form, account_manager: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-foreground-muted mb-1.5">Validité</label>
                <input type="date" value={form.validity_date} onChange={(e) => setForm({ ...form, validity_date: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-foreground-muted mb-1.5">Centre de coût</label>
                <input type="text" value={form.cost_center} onChange={(e) => setForm({ ...form, cost_center: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-foreground-muted mb-1.5">Facturation</label>
                <select value={form.billing_mode} onChange={(e) => setForm({ ...form, billing_mode: e.target.value as typeof form.billing_mode })} className={inputClass}>
                  <option value="POSTPAID">Post-payé</option>
                  <option value="PREPAID">Prépayé</option>
                </select>
              </div>
            </div>
            {/* Entreprise */}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="edit_drv_company" checked={form.is_company}
                onChange={(e) => setForm({ ...form, is_company: e.target.checked })} className="w-4 h-4 accent-primary" />
              <label htmlFor="edit_drv_company" className="text-sm text-foreground">Compte entreprise</label>
            </div>
            {form.is_company && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-foreground-muted mb-1.5">Entreprise</label>
                  <input type="text" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs text-foreground-muted mb-1.5">SIRET</label>
                  <input type="text" value={form.siret} onChange={(e) => setForm({ ...form, siret: e.target.value })} className={inputClass} />
                </div>
              </div>
            )}
            {/* Notes */}
            <div>
              <label className="block text-xs text-foreground-muted mb-1.5">Notes</label>
              <textarea value={form.admin_notes} onChange={(e) => setForm({ ...form, admin_notes: e.target.value })}
                rows={2} className={`${inputClass} resize-none`} />
            </div>
            {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-foreground-muted hover:text-foreground transition-colors">Annuler</button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 bg-primary text-background rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
