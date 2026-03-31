// ============================================================
// EZDrive — eMSPs Page
// Manage eMSP partner entities (internal & external)
// ============================================================

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Search,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Globe,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/contexts/ToastContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SlideOver } from "@/components/ui/SlideOver";
import { KPICard } from "@/components/ui/KPICard";
import { PageHelp } from "@/components/ui/PageHelp";
import { useTranslation } from "react-i18next";

// ── Types ─────────────────────────────────────────────────────

interface EmspEntity {
  id: string;
  type: "internal" | "external";
  name: string;
  external_id: string | null;
  network_id: string | null;
  contract_id: string | null;
  crm_id: string | null;
  ocpi_url: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface EmspNetwork {
  id: string;
  name: string;
}

interface EmspContract {
  id: string;
  name: string;
}

const EMPTY_EMSP: {
  type: EmspEntity["type"];
  name: string;
  external_id: string;
  network_id: string;
  contract_id: string;
  crm_id: string;
  ocpi_url: string;
  updated_by: string;
} = {
  type: "internal",
  name: "",
  external_id: "",
  network_id: "",
  contract_id: "",
  crm_id: "",
  ocpi_url: "",
  updated_by: "",
};

type SortKey = "name" | "type" | "external_id" | "crm_id" | "updated_at";
type SortDir = "asc" | "desc";
type FilterTab = "all" | "internal" | "external";

const PAGE_SIZE = 20;

// ── Type badge ────────────────────────────────────────────────

function EmspTypeBadge({ type }: { type: string }) {
  const config: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
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

function EmspsKPISkeleton() {
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

function EmspsTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-20" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3.5 flex items-center gap-6">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export function EmspsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EmspEntity | null>(null);
  const [form, setForm] = useState(EMPTY_EMSP);
  const [confirmDelete, setConfirmDelete] = useState<EmspEntity | null>(null);

  // ── Related data for dropdowns ──
  const { data: networks } = useQuery<EmspNetwork[]>({
    queryKey: ["emsp-networks"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("emsp_networks").select("id, name").order("name");
        if (error) { console.warn("[EmspsPage] emsp_networks:", error.message); return []; }
        return (data ?? []) as EmspNetwork[];
      } catch { return []; }
    },
  });

  const { data: contracts } = useQuery<EmspContract[]>({
    queryKey: ["emsp-contracts"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("emsp_contracts").select("id, name").order("name");
        if (error) { console.warn("[EmspsPage] emsp_contracts:", error.message); return []; }
        return (data ?? []) as EmspContract[];
      } catch { return []; }
    },
  });

  // ── Lookup maps ──
  const networkMap = useMemo(() => {
    const m = new Map<string, string>();
    (networks ?? []).forEach((n) => m.set(n.id, n.name));
    return m;
  }, [networks]);

  const contractMap = useMemo(() => {
    const m = new Map<string, string>();
    (contracts ?? []).forEach((c) => m.set(c.id, c.name));
    return m;
  }, [contracts]);

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_EMSP) => {
      const { data: result, error } = await supabase.from("emsp_entities").insert({
        type: data.type,
        name: data.name.trim(),
        external_id: data.external_id || null,
        network_id: data.network_id || null,
        contract_id: data.contract_id || null,
        crm_id: data.crm_id || null,
        ocpi_url: data.ocpi_url || null,
        updated_by: data.updated_by || null,
      }).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-entities"] });
      closeModal();
      toastSuccess("eMSP créé", "L'entité eMSP a été ajoutée avec succès");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<typeof EMPTY_EMSP>) => {
      const { data: result, error } = await supabase.from("emsp_entities").update({
        type: data.type,
        name: data.name?.trim(),
        external_id: data.external_id || null,
        network_id: data.network_id || null,
        contract_id: data.contract_id || null,
        crm_id: data.crm_id || null,
        ocpi_url: data.ocpi_url || null,
        updated_by: data.updated_by || null,
      }).eq("id", id).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-entities"] });
      closeModal();
      toastSuccess("eMSP modifié", "Les modifications ont été enregistrées");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("emsp_entities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-entities"] });
      setConfirmDelete(null);
      toastSuccess("eMSP supprimé", "L'entité eMSP a été supprimée");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_EMSP);
    setModalOpen(true);
  }

  function openEdit(entity: EmspEntity) {
    setEditing(entity);
    setForm({
      type: entity.type,
      name: entity.name,
      external_id: entity.external_id ?? "",
      network_id: entity.network_id ?? "",
      contract_id: entity.contract_id ?? "",
      crm_id: entity.crm_id ?? "",
      ocpi_url: entity.ocpi_url ?? "",
      updated_by: entity.updated_by ?? "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_EMSP);
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
  const { data: emsps, isLoading } = useQuery<EmspEntity[]>({
    queryKey: ["emsp-entities"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("emsp_entities")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) {
          console.warn("[EmspsPage] Table not found:", error.message);
          return [];
        }
        return (data ?? []) as EmspEntity[];
      } catch {
        return [];
      }
    },
  });

  // ── KPIs ──
  const stats = useMemo(() => {
    const list = emsps ?? [];
    return {
      total: list.length,
      internal: list.filter((e) => e.type === "internal").length,
      external: list.filter((e) => e.type === "external").length,
      withOcpi: list.filter((e) => !!e.ocpi_url).length,
    };
  }, [emsps]);

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
    let list = emsps ?? [];
    if (filterTab !== "all") list = list.filter((e) => e.type === filterTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.name?.toLowerCase().includes(q) ||
          e.external_id?.toLowerCase().includes(q) ||
          e.crm_id?.toLowerCase().includes(q) ||
          e.ocpi_url?.toLowerCase().includes(q)
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
  }, [emsps, filterTab, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginated = processed.slice(start, start + PAGE_SIZE);

  // ── Tab counts ──
  const tabCounts = useMemo(() => {
    const list = emsps ?? [];
    return {
      all: list.length,
      internal: list.filter((e) => e.type === "internal").length,
      external: list.filter((e) => e.type === "external").length,
    };
  }, [emsps]);

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
            eMSPs
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Gérer les entités eMSP partenaires
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouvel eMSP
        </button>
      </div>

      <PageHelp
        summary="Liste des eMSP (fournisseurs de mobilité) connectés à votre réseau"
        items={[
          { label: "eMSP", description: "Opérateur qui gère des clients conducteurs et leur donne accès à votre réseau de bornes." },
          { label: "Tokens", description: "Badges et identifiants émis par l'eMSP pour authentifier ses clients sur vos bornes." },
          { label: "Sessions", description: "Historique des charges effectuées par les clients de cet eMSP sur vos bornes." },
          { label: "Facturation", description: "Montants facturés à cet eMSP pour l'utilisation de vos bornes par ses clients." },
        ]}
      />

      {/* KPIs */}
      {isLoading ? (
        <EmspsKPISkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Total eMSPs" value={stats.total} icon={Building2} color="#8892B0" />
          <KPICard label="Internes" value={stats.internal} icon={Building2} color="#60A5FA" />
          <KPICard label="Externes" value={stats.external} icon={ExternalLink} color="#FBBF24" />
          <KPICard label="Avec URL OCPI" value={stats.withOcpi} icon={Globe} color="#00D4AA" />
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
          placeholder="Rechercher par nom, ID externe, CRM..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <EmspsTableSkeleton />
      ) : processed.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-56 bg-surface border border-border rounded-2xl">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Building2 className="w-7 h-7 text-primary" />
          </div>
          <p className="text-foreground font-medium text-lg">Aucun eMSP</p>
          <p className="text-sm text-foreground-muted mt-1 max-w-sm text-center">
            {search.trim()
              ? `Aucun eMSP ne correspond à « ${search} »`
              : "Créez votre première entité eMSP pour gérer vos partenaires."}
          </p>
          <button
            onClick={openCreate}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Créer un eMSP
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
                  <th className={thClass} onClick={() => handleSort("external_id")}>
                    ID Externe <SortIcon col="external_id" />
                  </th>
                  <th className={thClass}>Réseau</th>
                  <th className={thClass}>Contrat</th>
                  <th className={thClass} onClick={() => handleSort("crm_id")}>
                    CRM ID <SortIcon col="crm_id" />
                  </th>
                  <th className={thClass}>URL OCPI</th>
                  <th className={thClass} onClick={() => handleSort("updated_at")}>
                    Dernière MAJ <SortIcon col="updated_at" />
                  </th>
                  <th className={thClass}>Mis à jour par</th>
                  <th className={cn(thClass, "text-right w-20")}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((entity) => (
                  <tr key={entity.id} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3">
                      <EmspTypeBadge type={entity.type} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground truncate max-w-[200px]">{entity.name}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted font-mono">
                      {entity.external_id ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[150px]">
                      {entity.network_id ? networkMap.get(entity.network_id) ?? entity.network_id : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[150px]">
                      {entity.contract_id ? contractMap.get(entity.contract_id) ?? entity.contract_id : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted font-mono">
                      {entity.crm_id ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3">
                      {entity.ocpi_url ? (
                        <a
                          href={entity.ocpi_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline truncate max-w-[180px]"
                        >
                          <Globe className="w-3 h-3 shrink-0" />
                          <span className="truncate">{entity.ocpi_url}</span>
                        </a>
                      ) : (
                        <span className="text-sm text-foreground-muted">{"\u2014"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                      {entity.updated_at
                        ? new Date(entity.updated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[120px]">
                      {entity.updated_by ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(entity)}
                          className="p-1.5 text-foreground-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(entity)}
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
      <SlideOver open={modalOpen} onClose={closeModal} title={editing ? "Modifier l'eMSP" : "Nouvel eMSP"}>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Type *</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as EmspEntity["type"] }))}
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
                placeholder="Nom de l'entité"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">ID Externe</label>
            <input
              value={form.external_id}
              onChange={(e) => setForm((f) => ({ ...f, external_id: e.target.value }))}
              placeholder="Identifiant externe"
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Réseau</label>
              <select
                value={form.network_id}
                onChange={(e) => setForm((f) => ({ ...f, network_id: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="">-- Aucun --</option>
                {(networks ?? []).map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Contrat</label>
              <select
                value={form.contract_id}
                onChange={(e) => setForm((f) => ({ ...f, contract_id: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="">-- Aucun --</option>
                {(contracts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">CRM ID</label>
            <input
              value={form.crm_id}
              onChange={(e) => setForm((f) => ({ ...f, crm_id: e.target.value }))}
              placeholder="Identifiant CRM"
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">URL OCPI</label>
            <input
              type="url"
              value={form.ocpi_url}
              onChange={(e) => setForm((f) => ({ ...f, ocpi_url: e.target.value }))}
              placeholder="https://ocpi.example.com/..."
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Mis à jour par</label>
            <input
              value={form.updated_by}
              onChange={(e) => setForm((f) => ({ ...f, updated_by: e.target.value }))}
              placeholder="Nom de l'utilisateur"
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
        title="Supprimer cet eMSP ?"
        description={`L'entité "${confirmDelete?.name}" sera définitivement supprimée. Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
