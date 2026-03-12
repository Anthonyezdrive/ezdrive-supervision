// ============================================================
// EZDrive — Coupons / Credits Page
// Manage prepaid credits and promotional coupons for drivers
// ============================================================

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ticket,
  Search,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Euro,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/contexts/ToastContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SlideOver } from "@/components/ui/SlideOver";
import { KPICard } from "@/components/ui/KPICard";

// ── Types ─────────────────────────────────────────────────────

interface Coupon {
  id: string;
  code: string;
  label: string;
  description?: string;
  type: "credit" | "percentage" | "freecharge";
  initial_value: number;
  current_value: number;
  currency: string;
  status: "active" | "inactive" | "expired" | "exhausted";
  driver_id: string | null;
  driver_name: string | null;
  driver_email: string | null;
  max_uses: number | null;
  expires_at: string | null;
  created_at: string;
  used_count: number;
}

const EMPTY_COUPON: {
  code: string;
  label: string;
  description: string;
  type: Coupon["type"];
  initial_value: number;
  max_uses: number | null;
  expires_at: string;
  driver_name: string;
  driver_email: string;
} = {
  code: "",
  label: "",
  description: "",
  type: "credit",
  initial_value: 0,
  max_uses: null,
  expires_at: "",
  driver_name: "",
  driver_email: "",
};

type SortKey = "label" | "type" | "current_value" | "initial_value" | "status" | "created_at";
type SortDir = "asc" | "desc";
type FilterTab = "all" | "active" | "inactive" | "expired" | "exhausted";

const PAGE_SIZE = 20;

// ── Status badge ──────────────────────────────────────────────

function CouponStatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; border: string; dot: string; label: string; icon: React.ComponentType<{ className?: string }> }> = {
    active: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/25", dot: "#34D399", label: "Actif", icon: CheckCircle2 },
    inactive: { bg: "bg-foreground-muted/5", text: "text-foreground-muted", border: "border-border", dot: "#8892B0", label: "Inactif", icon: XCircle },
    expired: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/25", dot: "#F87171", label: "Expiré", icon: Clock },
    exhausted: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/25", dot: "#FBBF24", label: "Épuisé", icon: AlertCircle },
  };
  const c = config[status] ?? config.inactive;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold", c.bg, c.text, c.border)}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
      {c.label}
    </span>
  );
}

// ── Progress bar ──────────────────────────────────────────────

function CouponProgress({ current, initial }: { current: number; initial: number }) {
  const pct = initial > 0 ? Math.min(100, (current / initial) * 100) : 0;
  const color = pct > 50 ? "#34D399" : pct > 20 ? "#FBBF24" : "#F87171";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs text-foreground-muted tabular-nums whitespace-nowrap">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────

function CouponsKPISkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-surface border border-border rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="w-12 h-12 rounded-xl" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CouponsTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex gap-6">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-20" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3.5 flex items-center gap-6">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export function CouponsPage() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState(EMPTY_COUPON);
  const [confirmDelete, setConfirmDelete] = useState<Coupon | null>(null);

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_COUPON) => {
      const { data: result, error } = await supabase.from("coupons").insert({
        code: data.code.toUpperCase().trim(),
        label: data.label,
        description: data.description || null,
        type: data.type,
        initial_value: Number(data.initial_value) || 0,
        current_value: Number(data.initial_value) || 0,
        max_uses: data.max_uses ? Number(data.max_uses) : null,
        expires_at: data.expires_at || null,
        driver_name: data.driver_name || null,
        driver_email: data.driver_email || null,
      }).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
      closeModal();
      toastSuccess("Coupon créé", "Le coupon a été ajouté avec succès");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<typeof EMPTY_COUPON>) => {
      const { data: result, error } = await supabase.from("coupons").update({
        label: data.label,
        description: data.description || null,
        type: data.type,
        initial_value: Number(data.initial_value) || 0,
        max_uses: data.max_uses ? Number(data.max_uses) : null,
        expires_at: data.expires_at || null,
        driver_name: data.driver_name || null,
        driver_email: data.driver_email || null,
      }).eq("id", id).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
      closeModal();
      toastSuccess("Coupon modifié", "Les modifications ont été enregistrées");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coupons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
      setConfirmDelete(null);
      toastSuccess("Coupon supprimé", "Le coupon a été supprimé");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_COUPON);
    setModalOpen(true);
  }

  function openEdit(coupon: Coupon) {
    setEditing(coupon);
    setForm({
      code: coupon.code,
      label: coupon.label,
      description: coupon.description ?? "",
      type: coupon.type,
      initial_value: coupon.initial_value,
      max_uses: coupon.max_uses,
      expires_at: coupon.expires_at ? coupon.expires_at.slice(0, 16) : "",
      driver_name: coupon.driver_name ?? "",
      driver_email: coupon.driver_email ?? "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_COUPON);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...form });
    } else {
      createMutation.mutate(form);
    }
  }

  // ── Data fetching ──
  const { data: coupons, isLoading } = useQuery<Coupon[]>({
    queryKey: ["coupons"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("coupons")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) {
          console.warn("[CouponsPage] Table not found:", error.message);
          return [];
        }
        return (data ?? []) as Coupon[];
      } catch {
        return [];
      }
    },
  });

  // ── KPIs ──
  const stats = useMemo(() => {
    const list = coupons ?? [];
    return {
      total: list.length,
      active: list.filter((c) => c.status === "active").length,
      totalCredits: list.reduce((s, c) => s + (c.current_value ?? 0), 0),
      exhausted: list.filter((c) => c.status === "exhausted").length,
    };
  }, [coupons]);

  // ── Local state ──
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
    setPage(1);
  }, []);

  // ── Filter + Search + Sort ──
  const processed = useMemo(() => {
    let list = coupons ?? [];
    if (filterTab !== "all") list = list.filter((c) => c.status === filterTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.label?.toLowerCase().includes(q) ||
          c.code?.toLowerCase().includes(q) ||
          c.driver_name?.toLowerCase().includes(q) ||
          c.driver_email?.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), "fr");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [coupons, filterTab, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginated = processed.slice(start, start + PAGE_SIZE);

  // ── Tab counts ──
  const tabCounts = useMemo(() => {
    const list = coupons ?? [];
    return {
      all: list.length,
      active: list.filter((c) => c.status === "active").length,
      inactive: list.filter((c) => c.status === "inactive").length,
      expired: list.filter((c) => c.status === "expired").length,
      exhausted: list.filter((c) => c.status === "exhausted").length,
    };
  }, [coupons]);

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "Tous" },
    { key: "active", label: "Actifs" },
    { key: "inactive", label: "Inactifs" },
    { key: "expired", label: "Expirés" },
    { key: "exhausted", label: "Épuisés" },
  ];

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5" />;
  };

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">
            Coupons & Crédits
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Gestion des coupons prépayés et crédits promotionnels
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouveau coupon
        </button>
      </div>

      {/* KPIs */}
      {isLoading ? (
        <CouponsKPISkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Total coupons" value={stats.total} icon={Ticket} color="#8892B0" />
          <KPICard label="Coupons actifs" value={stats.active} icon={CheckCircle2} color="#00D4AA" />
          <KPICard
            label="Crédits disponibles"
            value={`${stats.totalCredits.toFixed(2)} \u20AC`}
            icon={Euro}
            color="#4ECDC4"
          />
          <KPICard label="Coupons épuisés" value={stats.exhausted} icon={AlertCircle} color="#FBBF24" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setFilterTab(tab.key); setPage(1); }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              filterTab === tab.key
                ? "bg-primary/15 text-primary"
                : "text-foreground-muted hover:text-foreground hover:bg-surface-elevated"
            )}
          >
            {tab.label}{" "}
            <span className="opacity-60">{tabCounts[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
        <input
          type="text"
          placeholder="Rechercher par nom, code, conducteur..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <CouponsTableSkeleton />
      ) : processed.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-56 bg-surface border border-border rounded-2xl">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Ticket className="w-7 h-7 text-primary" />
          </div>
          <p className="text-foreground font-medium text-lg">Aucun coupon</p>
          <p className="text-sm text-foreground-muted mt-1 max-w-sm text-center">
            {search.trim()
              ? `Aucun coupon ne correspond à « ${search} »`
              : "Créez votre premier coupon pour offrir des crédits de recharge à vos conducteurs."}
          </p>
          <button
            onClick={openCreate}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Créer un coupon
          </button>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <th className={thClass} onClick={() => handleSort("label")}>
                    Coupon <SortIcon col="label" />
                  </th>
                  <th className={thClass} onClick={() => handleSort("type")}>
                    Type <SortIcon col="type" />
                  </th>
                  <th className={cn(thClass, "text-right")} onClick={() => handleSort("current_value")}>
                    Solde actuel <SortIcon col="current_value" />
                  </th>
                  <th className={cn(thClass, "text-right")} onClick={() => handleSort("initial_value")}>
                    Solde initial <SortIcon col="initial_value" />
                  </th>
                  <th className={thClass}>Progression</th>
                  <th className={thClass} onClick={() => handleSort("status")}>
                    Statut <SortIcon col="status" />
                  </th>
                  <th className={thClass}>Conducteur</th>
                  <th className={thClass} onClick={() => handleSort("created_at")}>
                    Créé le <SortIcon col="created_at" />
                  </th>
                  <th className={cn(thClass, "text-right w-20")}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((coupon) => (
                  <tr key={coupon.id} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{coupon.label || coupon.code}</p>
                        {coupon.code && coupon.label && (
                          <p className="text-xs text-foreground-muted font-mono">{coupon.code}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold",
                        coupon.type === "credit" ? "bg-emerald-500/10 text-emerald-400" :
                        coupon.type === "percentage" ? "bg-blue-500/10 text-blue-400" :
                        "bg-purple-500/10 text-purple-400"
                      )}>
                        {coupon.type === "credit" ? "Crédit" : coupon.type === "percentage" ? "%" : "Gratuit"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-right tabular-nums font-semibold">
                      {coupon.current_value?.toFixed(2)} {coupon.currency ?? "\u20AC"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted text-right tabular-nums">
                      {coupon.initial_value?.toFixed(2)} {coupon.currency ?? "\u20AC"}
                    </td>
                    <td className="px-4 py-3">
                      <CouponProgress current={coupon.current_value ?? 0} initial={coupon.initial_value ?? 1} />
                    </td>
                    <td className="px-4 py-3">
                      <CouponStatusBadge status={coupon.status} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-foreground-muted truncate max-w-[150px]">
                        {coupon.driver_name ?? "\u2014"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                      {coupon.created_at
                        ? new Date(coupon.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(coupon)}
                          className="p-1.5 text-foreground-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(coupon)}
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-foreground-muted">
                {start + 1}\u2013{Math.min(start + PAGE_SIZE, processed.length)} sur {processed.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-foreground-muted px-2">
                  {safePage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Create / Edit SlideOver ── */}
      <SlideOver open={modalOpen} onClose={closeModal} title={editing ? "Modifier le coupon" : "Nouveau coupon"}>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Code *</label>
              <input
                required
                disabled={!!editing}
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="WELCOME50"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 disabled:opacity-50 font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Type *</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Coupon["type"] }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="credit">Crédit (montant €)</option>
                <option value="percentage">Pourcentage (%)</option>
                <option value="freecharge">Session gratuite</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Libellé *</label>
            <input
              required
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Bienvenue 50€"
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">
                {form.type === "percentage" ? "Réduction (%)" : form.type === "freecharge" ? "Nb sessions" : "Montant (€)"}
              </label>
              <input
                type="number"
                min={0}
                step={form.type === "percentage" ? 1 : 0.01}
                value={form.initial_value}
                onChange={(e) => setForm((f) => ({ ...f, initial_value: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Utilisations max</label>
              <input
                type="number"
                min={0}
                value={form.max_uses ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value ? Number(e.target.value) : null }))}
                placeholder="Illimité"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Date d'expiration</label>
            <input
              type="datetime-local"
              value={form.expires_at}
              onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-foreground-muted mb-3">Assignation conducteur (optionnel)</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-foreground-muted mb-1">Nom</label>
                <input
                  value={form.driver_name}
                  onChange={(e) => setForm((f) => ({ ...f, driver_name: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs text-foreground-muted mb-1">Email</label>
                <input
                  type="email"
                  value={form.driver_email}
                  onChange={(e) => setForm((f) => ({ ...f, driver_email: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
          </div>
          {(createMutation.error || updateMutation.error) && (
            <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-400">
              {((createMutation.error || updateMutation.error) as Error)?.message}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={closeModal} className="px-4 py-2 text-sm text-foreground-muted hover:text-foreground border border-border rounded-xl transition-colors">
              Annuler
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending || updateMutation.isPending ? "..." : editing ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </form>
      </SlideOver>

      {/* ── Confirm Delete Dialog ── */}
      <ConfirmDialog
        open={!!confirmDelete}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
        title="Supprimer ce coupon ?"
        description={`Le coupon "${confirmDelete?.code}" sera définitivement supprimé. Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
