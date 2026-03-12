// ============================================================
// EZDrive — eMSP Networks Page
// Manage eMSP networks (internal and external)
// ============================================================

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Network,
  Search,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Globe,
  Home,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/contexts/ToastContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SlideOver } from "@/components/ui/SlideOver";
import { KPICard } from "@/components/ui/KPICard";

// ── Types ─────────────────────────────────────────────────────

interface EmspNetwork {
  id: string;
  type: "internal" | "external";
  name: string;
  remarks: string | null;
  emsp_contracts_count: number;
  agreements_count: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

const EMPTY_NETWORK: {
  type: EmspNetwork["type"];
  name: string;
  remarks: string;
  updated_by: string;
} = {
  type: "internal",
  name: "",
  remarks: "",
  updated_by: "",
};

type SortKey = "name" | "type" | "emsp_contracts_count" | "updated_at";
type SortDir = "asc" | "desc";
type FilterTab = "all" | "internal" | "external";

const PAGE_SIZE = 15;

// ── Type badge ────────────────────────────────────────────────

function TypeBadge({ type }: { type: EmspNetwork["type"] }) {
  const config: Record<EmspNetwork["type"], { bg: string; text: string; border: string; dot: string; label: string }> = {
    internal: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/25", dot: "#60A5FA", label: "Interne" },
    external: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/25", dot: "#FBBF24", label: "Externe" },
  };
  const c = config[type] ?? config.internal;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold", c.bg, c.text, c.border)}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
      {c.label}
    </span>
  );
}

// ── Loading skeletons ─────────────────────────────────────────

function NetworksKPISkeleton() {
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

function NetworksTableSkeleton({ rows = 8 }: { rows?: number }) {
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
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export function EmspNetworksPage() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EmspNetwork | null>(null);
  const [form, setForm] = useState(EMPTY_NETWORK);
  const [confirmDelete, setConfirmDelete] = useState<EmspNetwork | null>(null);

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_NETWORK) => {
      const { data: result, error } = await supabase.from("emsp_networks").insert({
        type: data.type,
        name: data.name.trim(),
        remarks: data.remarks || null,
        updated_by: data.updated_by || null,
      }).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-networks"] });
      closeModal();
      toastSuccess("Reseau cree", "Le reseau eMSP a ete ajoute avec succes");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<typeof EMPTY_NETWORK>) => {
      const { data: result, error } = await supabase.from("emsp_networks").update({
        type: data.type,
        name: data.name?.trim(),
        remarks: data.remarks || null,
        updated_by: data.updated_by || null,
      }).eq("id", id).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-networks"] });
      closeModal();
      toastSuccess("Reseau modifie", "Les modifications ont ete enregistrees");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("emsp_networks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-networks"] });
      setConfirmDelete(null);
      toastSuccess("Reseau supprime", "Le reseau eMSP a ete supprime");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_NETWORK);
    setModalOpen(true);
  }

  function openEdit(network: EmspNetwork) {
    setEditing(network);
    setForm({
      type: network.type,
      name: network.name,
      remarks: network.remarks ?? "",
      updated_by: network.updated_by ?? "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_NETWORK);
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
  const { data: networks, isLoading } = useQuery<EmspNetwork[]>({
    queryKey: ["emsp-networks"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("emsp_networks")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) {
          console.warn("[EmspNetworksPage] Table not found:", error.message);
          return [];
        }
        return (data ?? []) as EmspNetwork[];
      } catch {
        return [];
      }
    },
  });

  // ── KPIs ──
  const stats = useMemo(() => {
    const list = networks ?? [];
    return {
      total: list.length,
      internal: list.filter((n) => n.type === "internal").length,
      external: list.filter((n) => n.type === "external").length,
      withContracts: list.filter((n) => n.emsp_contracts_count > 0).length,
    };
  }, [networks]);

  // ── Local state ──
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
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
    let list = networks ?? [];
    if (filterTab !== "all") list = list.filter((n) => n.type === filterTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (n) =>
          n.name?.toLowerCase().includes(q) ||
          n.remarks?.toLowerCase().includes(q) ||
          n.updated_by?.toLowerCase().includes(q)
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
  }, [networks, filterTab, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginated = processed.slice(start, start + PAGE_SIZE);

  // ── Tab counts ──
  const tabCounts = useMemo(() => {
    const list = networks ?? [];
    return {
      all: list.length,
      internal: list.filter((n) => n.type === "internal").length,
      external: list.filter((n) => n.type === "external").length,
    };
  }, [networks]);

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "Tout" },
    { key: "internal", label: "Interne" },
    { key: "external", label: "Externe" },
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
            Reseaux eMSP
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Gerer les reseaux eMSP (internes et externes)
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouveau reseau
        </button>
      </div>

      {/* KPIs */}
      {isLoading ? (
        <NetworksKPISkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Total reseaux" value={stats.total} icon={Network} color="#8892B0" />
          <KPICard label="Internes" value={stats.internal} icon={Home} color="#60A5FA" />
          <KPICard label="Externes" value={stats.external} icon={Globe} color="#FBBF24" />
          <KPICard label="Avec contrats" value={stats.withContracts} icon={Network} color="#00D4AA" />
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
          placeholder="Rechercher par nom, remarques, mis a jour par..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <NetworksTableSkeleton />
      ) : processed.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-56 bg-surface border border-border rounded-2xl">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Network className="w-7 h-7 text-primary" />
          </div>
          <p className="text-foreground font-medium text-lg">Aucun reseau</p>
          <p className="text-sm text-foreground-muted mt-1 max-w-sm text-center">
            {search.trim()
              ? `Aucun reseau ne correspond a \u00AB ${search} \u00BB`
              : "Creez votre premier reseau eMSP pour gerer vos partenaires de mobilite."}
          </p>
          <button
            onClick={openCreate}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Creer un reseau
          </button>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <th className={thClass} onClick={() => handleSort("type")}>
                    Type <SortIcon col="type" />
                  </th>
                  <th className={thClass} onClick={() => handleSort("name")}>
                    Nom <SortIcon col="name" />
                  </th>
                  <th className={thClass} onClick={() => handleSort("emsp_contracts_count")}>
                    Contrats eMSP <SortIcon col="emsp_contracts_count" />
                  </th>
                  <th className={thClass}>Accords</th>
                  <th className={thClass} onClick={() => handleSort("updated_at")}>
                    Derniere MAJ <SortIcon col="updated_at" />
                  </th>
                  <th className={thClass}>Mis a jour par</th>
                  <th className={thClass}>Remarques</th>
                  <th className={cn(thClass, "text-right w-20")}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((network) => (
                  <tr key={network.id} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3">
                      <TypeBadge type={network.type} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground truncate max-w-[200px]">{network.name}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground tabular-nums">
                      {network.emsp_contracts_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground tabular-nums">
                      {network.agreements_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                      {network.updated_at
                        ? new Date(network.updated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-foreground-muted truncate max-w-[150px]">
                        {network.updated_by ?? "\u2014"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-foreground-muted truncate max-w-[200px]">
                        {network.remarks ?? "\u2014"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(network)}
                          className="p-1.5 text-foreground-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(network)}
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
      <SlideOver open={modalOpen} onClose={closeModal} title={editing ? "Modifier le reseau" : "Nouveau reseau eMSP"}>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Type *</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as EmspNetwork["type"] }))}
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="internal">Interne</option>
              <option value="external">Externe</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Nom *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nom du reseau"
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Remarques</label>
            <textarea
              value={form.remarks}
              onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
              rows={3}
              placeholder="Notes ou remarques..."
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Mis a jour par</label>
            <input
              value={form.updated_by}
              onChange={(e) => setForm((f) => ({ ...f, updated_by: e.target.value }))}
              placeholder="Nom de l'operateur"
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
            />
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
              {createMutation.isPending || updateMutation.isPending ? "..." : editing ? "Enregistrer" : "Creer"}
            </button>
          </div>
        </form>
      </SlideOver>

      {/* ── Confirm Delete Dialog ── */}
      <ConfirmDialog
        open={!!confirmDelete}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
        title="Supprimer ce reseau ?"
        description={`Le reseau "${confirmDelete?.name}" sera definitivement supprime. Cette action est irreversible.`}
        confirmLabel="Supprimer"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
