import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { PageHelp } from "@/components/ui/PageHelp";
import {
  Nfc,
  ShieldCheck,
  ShieldOff,
  ShieldAlert,
  Clock,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Loader2,
  Trash2,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

type RfidStatus = "ACTIVE" | "BLOCKED" | "REVOKED" | "EXPIRED";

interface RfidCard {
  id: string;
  user_id: string;
  uid: string;
  visual_number: string | null;
  label: string | null;
  status: RfidStatus;
  issued_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  consumer_profiles: { full_name: string | null; email: string | null } | null;
}

// ============================================================
// Status config
// ============================================================

const STATUS_CONFIG: Record<
  RfidStatus,
  { label: string; color: string; bgClass: string; textClass: string; borderClass: string }
> = {
  ACTIVE: {
    label: "Actif",
    color: "#00D4AA",
    bgClass: "bg-green-500/10",
    textClass: "text-green-400",
    borderClass: "border-green-500/30",
  },
  BLOCKED: {
    label: "Bloqué",
    color: "#FF9500",
    bgClass: "bg-orange-500/10",
    textClass: "text-orange-400",
    borderClass: "border-orange-500/30",
  },
  REVOKED: {
    label: "Révoqué",
    color: "#FF6B6B",
    bgClass: "bg-red-500/10",
    textClass: "text-red-400",
    borderClass: "border-red-500/30",
  },
  EXPIRED: {
    label: "Expiré",
    color: "#8892B0",
    bgClass: "bg-gray-500/10",
    textClass: "text-gray-400",
    borderClass: "border-gray-500/30",
  },
};

const STATUS_TABS: { key: RfidStatus | "ALL"; label: string }[] = [
  { key: "ALL", label: "Tous" },
  { key: "ACTIVE", label: "Actifs" },
  { key: "BLOCKED", label: "Bloqués" },
  { key: "REVOKED", label: "Révoqués" },
  { key: "EXPIRED", label: "Expirés" },
];

const PAGE_SIZE = 20;

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================
// Component
// ============================================================

export function RfidPage() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RfidStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  async function updateCardStatus(cardId: string, newStatus: RfidStatus) {
    setActionLoading(cardId);
    try {
      await supabase.from("rfid_cards").update({ status: newStatus }).eq("id", cardId);
      queryClient.invalidateQueries({ queryKey: ["rfid-cards"] });
    } finally {
      setActionLoading(null);
    }
  }

  // --- Query ---
  const {
    data: cards,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["rfid-cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfid_cards")
        .select("*, consumer_profiles(full_name, email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RfidCard[];
    },
  });

  // --- Filtering ---
  const filtered = useMemo(() => {
    if (!cards) return [];
    return cards.filter((c) => {
      if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const uid = c.uid.toLowerCase();
        const visual = c.visual_number?.toLowerCase() ?? "";
        const label = c.label?.toLowerCase() ?? "";
        const name = c.consumer_profiles?.full_name?.toLowerCase() ?? "";
        const email = c.consumer_profiles?.email?.toLowerCase() ?? "";
        return (
          uid.includes(q) ||
          visual.includes(q) ||
          label.includes(q) ||
          name.includes(q) ||
          email.includes(q)
        );
      }
      return true;
    });
  }, [cards, statusFilter, search]);

  // --- KPIs ---
  const kpis = useMemo(() => {
    if (!cards) return { total: 0, active: 0, blocked: 0, expired: 0 };
    return {
      total: cards.length,
      active: cards.filter((c) => c.status === "ACTIVE").length,
      blocked: cards.filter((c) => c.status === "BLOCKED").length,
      expired: cards.filter((c) => c.status === "EXPIRED").length,
    };
  }, [cards]);

  // --- Pagination ---
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when filters change
  useMemo(() => setPage(0), [statusFilter, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">Tokens RFID</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Gestion des cartes et tokens d'identification
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-background rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Créer token
        </button>
      </div>

      <PageHelp
        summary="Gestion des cartes et badges RFID pour l'authentification sur les bornes"
        items={[
          { label: "Token RFID", description: "Identifiant unique du badge (UID) utilisé pour démarrer une charge sans application." },
          { label: "Statut", description: "Accepted (autorisé), Blocked (bloqué), Expired (expiré), Invalid (non reconnu)." },
          { label: "Association client", description: "Chaque carte RFID est liée à un client. Un client peut avoir plusieurs cartes." },
          { label: "Whitelist", description: "Liste des badges autorisés, synchronisée automatiquement avec les bornes via OCPP." },
        ]}
        tips={["Les badges bloqués sont immédiatement refusés par les bornes lors de la prochaine synchronisation."]}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPIBox label="Total tokens" value={kpis.total} icon={Nfc} color="#8892B0" />
        <KPIBox label="Actifs" value={kpis.active} icon={ShieldCheck} color="#00D4AA" />
        <KPIBox label="Bloqués" value={kpis.blocked} icon={ShieldOff} color="#FF9500" />
        <KPIBox label="Expirés" value={kpis.expired} icon={Clock} color="#FF6B6B" />
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              statusFilter === tab.key
                ? "bg-primary/15 text-primary"
                : "text-foreground-muted hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.key !== "ALL" && cards && (
              <span className="ml-1.5 text-xs opacity-70">
                {cards.filter((c) => c.status === tab.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
        <input
          type="text"
          placeholder="Rechercher par UID, numéro visuel, label, client..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 transition-colors"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center h-48 bg-surface border border-border rounded-2xl gap-3">
          <ShieldAlert className="w-8 h-8 text-foreground-muted/40" />
          <p className="text-sm font-medium text-foreground">
            Impossible de charger les tokens RFID
          </p>
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground bg-surface-elevated border border-border rounded-lg transition-colors"
          >
            Réessayer
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 bg-surface border border-border rounded-2xl">
          <Nfc className="w-8 h-8 text-foreground-muted/40 mb-2" />
          <p className="text-foreground-muted">Aucun token trouvé</p>
          <p className="text-sm text-foreground-muted/60 mt-1">
            Ajustez vos filtres pour afficher des résultats.
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-elevated border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-foreground-muted">
                    UID
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-foreground-muted">
                    N° Visuel
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-foreground-muted">
                    Label
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-foreground-muted">
                    Client
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-foreground-muted">
                    Statut
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-foreground-muted">
                    Émis le
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-foreground-muted">
                    Dernière utilisation
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-foreground-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((card) => {
                  const statusCfg = STATUS_CONFIG[card.status] ?? STATUS_CONFIG.EXPIRED;
                  return (
                    <tr
                      key={card.id}
                      className="border-b border-border last:border-0 hover:bg-surface-elevated/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-foreground">
                        {card.uid}
                      </td>
                      <td className="px-4 py-3 text-foreground-muted text-xs">
                        {card.visual_number ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-foreground text-sm">
                        {card.label ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {card.consumer_profiles?.full_name ?? "—"}
                          </p>
                          {card.consumer_profiles?.email && (
                            <p className="text-xs text-foreground-muted">
                              {card.consumer_profiles.email}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold",
                            statusCfg.bgClass,
                            statusCfg.textClass,
                            statusCfg.borderClass
                          )}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: statusCfg.color }}
                          />
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground-muted">
                        {formatDate(card.issued_at)}
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground-muted">
                        {formatDateTime(card.last_used_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {card.status !== "ACTIVE" && (
                            <button
                              onClick={() => updateCardStatus(card.id, "ACTIVE")}
                              disabled={actionLoading === card.id}
                              className="p-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-40"
                              title="Activer"
                            >
                              {actionLoading === card.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {card.status === "ACTIVE" && (
                            <button
                              onClick={() => updateCardStatus(card.id, "BLOCKED")}
                              disabled={actionLoading === card.id}
                              className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors disabled:opacity-40"
                              title="Bloquer"
                            >
                              {actionLoading === card.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {card.status !== "REVOKED" && (
                            <button
                              onClick={() => updateCardStatus(card.id, "REVOKED")}
                              disabled={actionLoading === card.id}
                              className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40"
                              title="Révoquer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-foreground-muted">
                {filtered.length} résultat{filtered.length > 1 ? "s" : ""} — Page{" "}
                {page + 1} / {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showAddModal && (
        <AddRfidModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            queryClient.invalidateQueries({ queryKey: ["rfid-cards"] });
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function KPIBox({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 flex items-center gap-4 transition-all hover:border-opacity-80">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="w-6 h-6" style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-heading font-bold text-foreground">{value}</p>
        <p className="text-xs text-foreground-muted mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex gap-6">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-3 w-16 rounded-lg bg-surface-elevated animate-pulse" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="px-4 py-3.5 flex items-center gap-6">
            <div className="h-3.5 w-32 rounded-lg bg-surface-elevated animate-pulse" />
            <div className="h-3 w-20 rounded-lg bg-surface-elevated animate-pulse" />
            <div className="h-3 w-24 rounded-lg bg-surface-elevated animate-pulse" />
            <div className="h-3.5 w-28 rounded-lg bg-surface-elevated animate-pulse" />
            <div className="h-6 w-20 rounded-full bg-surface-elevated animate-pulse" />
            <div className="h-3 w-20 rounded-lg bg-surface-elevated animate-pulse" />
            <div className="h-3 w-24 rounded-lg bg-surface-elevated animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

function AddRfidModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    uid: "",
    label: "",
    visual_number: "",
    expires_at: "",
    user_search: "",
    user_id: "",
    user_name: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search consumers for assignment
  const { data: consumers } = useQuery({
    queryKey: ["consumers-search", form.user_search],
    enabled: form.user_search.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("consumer_profiles")
        .select("id, full_name, email")
        .or(`full_name.ilike.%${form.user_search}%,email.ilike.%${form.user_search}%`)
        .limit(5);
      return data ?? [];
    },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.uid.trim()) { setError("L'UID est obligatoire"); return; }
    if (!form.user_id) { setError("Veuillez sélectionner un conducteur"); return; }
    setLoading(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from("rfid_cards").insert({
        uid: form.uid.trim().toUpperCase(),
        label: form.label.trim() || null,
        visual_number: form.visual_number.trim() || null,
        user_id: form.user_id,
        status: "ACTIVE" as RfidStatus,
        issued_at: new Date().toISOString(),
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      });
      if (insertError) throw new Error(insertError.message);
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
            <h2 className="font-heading font-bold text-lg">Créer un token RFID</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-surface-elevated rounded-lg transition-colors">
              <X className="w-5 h-5 text-foreground-muted" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-xs text-foreground-muted mb-1.5">UID du badge * (ex: 04:AB:CD:12:34)</label>
              <input
                type="text"
                value={form.uid}
                onChange={(e) => setForm({ ...form, uid: e.target.value })}
                placeholder="04:AB:CD:12:34:56:78"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm font-mono focus:outline-none focus:border-primary/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-foreground-muted mb-1.5">Label (nom affiché)</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Badge principal"
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs text-foreground-muted mb-1.5">N° Visuel</label>
                <input
                  type="text"
                  value={form.visual_number}
                  onChange={(e) => setForm({ ...form, visual_number: e.target.value })}
                  placeholder="EZD-001"
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-foreground-muted mb-1.5">Date d'expiration (optionnel)</label>
              <input
                type="date"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs text-foreground-muted mb-1.5">Conducteur *</label>
              {form.user_id ? (
                <div className="flex items-center justify-between px-3 py-2 bg-primary/10 border border-primary/30 rounded-xl">
                  <span className="text-sm text-primary font-medium">{form.user_name}</span>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, user_id: "", user_name: "", user_search: "" })}
                    className="text-foreground-muted hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={form.user_search}
                    onChange={(e) => setForm({ ...form, user_search: e.target.value })}
                    placeholder="Rechercher un conducteur par nom ou email..."
                    className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm focus:outline-none focus:border-primary/50"
                  />
                  {consumers && consumers.length > 0 && form.user_search.length >= 2 && !form.user_id && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-lg z-10 overflow-hidden">
                      {consumers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setForm({ ...form, user_id: c.id, user_name: c.full_name ?? c.email ?? c.id, user_search: "" })}
                          className="w-full text-left px-4 py-2.5 hover:bg-surface-elevated transition-colors text-sm"
                        >
                          <span className="font-medium text-foreground">{c.full_name ?? "Sans nom"}</span>
                          <span className="text-foreground-muted ml-2 text-xs">{c.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
                disabled={loading}
                className="flex-1 py-2.5 bg-primary text-background rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Créer le token
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
