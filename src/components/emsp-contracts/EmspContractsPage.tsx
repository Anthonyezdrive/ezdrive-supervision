// ============================================================
// EZDrive — eMSP Contracts Page
// Manage eMSP contracts and their attributes
// ============================================================

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileSignature,
  Plus,
  Pencil,
  Trash2,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Globe,
  Home,
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

// -- Types ----------------------------------------------------

interface EmspContract {
  id: string;
  type: "internal" | "external";
  name: string;
  network_id: string | null;
  country_code: string;
  party_id: string | null;
  contract_code: string | null;
  currency: string;
  url: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

const EMPTY_CONTRACT: {
  type: EmspContract["type"];
  name: string;
  network_id: string;
  country_code: string;
  party_id: string;
  contract_code: string;
  currency: string;
  url: string;
} = {
  type: "internal",
  name: "",
  network_id: "",
  country_code: "",
  party_id: "",
  contract_code: "",
  currency: "EUR",
  url: "",
};

type SortKey = "name" | "type" | "country_code" | "updated_at";
type SortDir = "asc" | "desc";
type FilterTab = "all" | "internal" | "external";

const PAGE_SIZE = 15;

// -- Type badge -----------------------------------------------

function ContractTypeBadge({ type }: { type: EmspContract["type"] }) {
  const config: Record<EmspContract["type"], { bg: string; text: string; border: string; dot: string; label: string }> = {
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

// -- Loading skeletons ----------------------------------------

function KPISkeleton() {
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

function TableSkeleton({ rows = 8 }: { rows?: number }) {
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
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

// -- Main Page ------------------------------------------------

export function EmspContractsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EmspContract | null>(null);
  const [form, setForm] = useState(EMPTY_CONTRACT);
  const [confirmDelete, setConfirmDelete] = useState<EmspContract | null>(null);

  // -- Networks for select dropdown --
  const { data: networks } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["emsp-networks-select"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("emsp_networks")
          .select("id, name")
          .order("name", { ascending: true });
        if (error) {
          console.warn("[EmspContractsPage] emsp_networks fetch error:", error.message);
          return [];
        }
        return (data ?? []) as { id: string; name: string }[];
      } catch {
        return [];
      }
    },
  });

  // -- Mutations --
  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_CONTRACT) => {
      const { data: result, error } = await supabase.from("emsp_contracts").insert({
        type: data.type,
        name: data.name.trim(),
        network_id: data.network_id || null,
        country_code: data.country_code.trim(),
        party_id: data.party_id.trim() || null,
        contract_code: data.contract_code.trim() || null,
        currency: data.currency.trim() || "EUR",
        url: data.url.trim() || null,
      }).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-contracts"] });
      closeModal();
      toastSuccess("Contrat cr\u00e9\u00e9", "Le contrat eMSP a \u00e9t\u00e9 ajout\u00e9 avec succ\u00e8s");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<typeof EMPTY_CONTRACT>) => {
      const { data: result, error } = await supabase.from("emsp_contracts").update({
        type: data.type,
        name: data.name?.trim(),
        network_id: data.network_id || null,
        country_code: data.country_code?.trim(),
        party_id: data.party_id?.trim() || null,
        contract_code: data.contract_code?.trim() || null,
        currency: data.currency?.trim() || "EUR",
        url: data.url?.trim() || null,
      }).eq("id", id).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-contracts"] });
      closeModal();
      toastSuccess("Contrat modifi\u00e9", "Les modifications ont \u00e9t\u00e9 enregistr\u00e9es");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("emsp_contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-contracts"] });
      setConfirmDelete(null);
      toastSuccess("Contrat supprim\u00e9", "Le contrat eMSP a \u00e9t\u00e9 supprim\u00e9");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_CONTRACT);
    setModalOpen(true);
  }

  function openEdit(contract: EmspContract) {
    setEditing(contract);
    setForm({
      type: contract.type,
      name: contract.name,
      network_id: contract.network_id ?? "",
      country_code: contract.country_code,
      party_id: contract.party_id ?? "",
      contract_code: contract.contract_code ?? "",
      currency: contract.currency,
      url: contract.url ?? "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_CONTRACT);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...form });
    } else {
      createMutation.mutate(form);
    }
  }

  // -- Data fetching --
  const { data: contracts, isLoading } = useQuery<EmspContract[]>({
    queryKey: ["emsp-contracts"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("emsp_contracts")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) {
          console.warn("[EmspContractsPage] Table not found:", error.message);
          return [];
        }
        return (data ?? []) as EmspContract[];
      } catch {
        return [];
      }
    },
  });

  // -- KPIs --
  const stats = useMemo(() => {
    const list = contracts ?? [];
    return {
      total: list.length,
      internal: list.filter((c) => c.type === "internal").length,
      external: list.filter((c) => c.type === "external").length,
      eur: list.filter((c) => c.currency === "EUR").length,
    };
  }, [contracts]);

  // -- Local state --
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

  // -- Filter + Search + Sort --
  const processed = useMemo(() => {
    let list = contracts ?? [];
    if (filterTab !== "all") list = list.filter((c) => c.type === filterTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.party_id?.toLowerCase().includes(q) ||
          c.contract_code?.toLowerCase().includes(q) ||
          c.updated_by?.toLowerCase().includes(q)
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
  }, [contracts, filterTab, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginated = processed.slice(start, start + PAGE_SIZE);

  // -- Tab counts --
  const tabCounts = useMemo(() => {
    const list = contracts ?? [];
    return {
      all: list.length,
      internal: list.filter((c) => c.type === "internal").length,
      external: list.filter((c) => c.type === "external").length,
    };
  }, [contracts]);

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "Tout" },
    { key: "internal", label: "Interne" },
    { key: "external", label: "Externe" },
  ];

  // -- Network name resolver --
  const networkMap = useMemo(() => {
    const map = new Map<string, string>();
    (networks ?? []).forEach((n) => map.set(n.id, n.name));
    return map;
  }, [networks]);

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
            Contrats eMSP
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            G&eacute;rer les contrats eMSP et leurs attributs
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouveau contrat
        </button>
      </div>

      <PageHelp
        summary="Contrats avec les CPO partenaires pour l'accès roaming de vos clients"
        items={[
          { label: "Contrat eMSP", description: "Accord vous permettant d'offrir l'accès aux bornes d'un CPO partenaire à vos clients." },
          { label: "Coût d'accès", description: "Tarif que vous payez au CPO pour chaque kWh consommé par vos clients sur ses bornes." },
          { label: "Marge", description: "Différence entre ce que vous facturez à vos clients et ce que vous payez au CPO." },
          { label: "Volume", description: "Nombre de sessions et énergie totale consommée par vos clients sur ce réseau." },
        ]}
      />

      {/* KPIs */}
      {isLoading ? (
        <KPISkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Total contrats" value={stats.total} icon={FileSignature} color="#8892B0" />
          <KPICard label="Internes" value={stats.internal} icon={Home} color="#60A5FA" />
          <KPICard label="Externes" value={stats.external} icon={Globe} color="#FBBF24" />
          <KPICard label="Devises EUR" value={stats.eur} icon={ExternalLink} color="#4ECDC4" />
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
          placeholder="Rechercher par nom, ID groupe, code contrat, mis \u00e0 jour par..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : processed.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-56 bg-surface border border-border rounded-2xl">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <FileSignature className="w-7 h-7 text-primary" />
          </div>
          <p className="text-foreground font-medium text-lg">Aucun contrat</p>
          <p className="text-sm text-foreground-muted mt-1 max-w-sm text-center">
            {search.trim()
              ? `Aucun contrat ne correspond \u00e0 \u00ab ${search} \u00bb`
              : "Cr\u00e9ez votre premier contrat eMSP pour commencer."}
          </p>
          <button
            onClick={openCreate}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Cr&eacute;er un contrat
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
                  <th className={thClass}>R&eacute;seau eMSP</th>
                  <th className={thClass} onClick={() => handleSort("country_code")}>
                    Code Pays <SortIcon col="country_code" />
                  </th>
                  <th className={thClass}>ID Groupe</th>
                  <th className={thClass}>Code Contrat</th>
                  <th className={thClass}>Devise</th>
                  <th className={thClass}>URL</th>
                  <th className={thClass} onClick={() => handleSort("updated_at")}>
                    Derni&egrave;re MAJ <SortIcon col="updated_at" />
                  </th>
                  <th className={thClass}>Mis &agrave; jour par</th>
                  <th className={cn(thClass, "text-right w-20")}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((contract) => (
                  <tr key={contract.id} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3">
                      <ContractTypeBadge type={contract.type} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground truncate max-w-[200px]">{contract.name}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[150px]">
                      {contract.network_id ? (networkMap.get(contract.network_id) ?? "\u2014") : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">
                      {contract.country_code}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted font-mono">
                      {contract.party_id ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted font-mono">
                      {contract.contract_code ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">
                      {contract.currency}
                    </td>
                    <td className="px-4 py-3">
                      {contract.url ? (
                        <a
                          href={contract.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline truncate max-w-[150px]"
                        >
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          Lien
                        </a>
                      ) : (
                        <span className="text-sm text-foreground-muted">{"\u2014"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                      {contract.updated_at
                        ? new Date(contract.updated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[120px]">
                      {contract.updated_by ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(contract)}
                          className="p-1.5 text-foreground-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(contract)}
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
                {start + 1}&ndash;{Math.min(start + PAGE_SIZE, processed.length)} sur {processed.length}
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
                  Page {safePage} sur {totalPages}
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

      {/* -- Create / Edit SlideOver -- */}
      <SlideOver open={modalOpen} onClose={closeModal} title={editing ? "Modifier le contrat" : "Nouveau contrat eMSP"}>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Type *</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as EmspContract["type"] }))}
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
                placeholder="Nom du contrat"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">R&eacute;seau eMSP</label>
            <select
              value={form.network_id}
              onChange={(e) => setForm((f) => ({ ...f, network_id: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="">-- Aucun r&eacute;seau --</option>
              {(networks ?? []).map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Code Pays *</label>
              <input
                required
                value={form.country_code}
                onChange={(e) => setForm((f) => ({ ...f, country_code: e.target.value }))}
                placeholder="FR"
                maxLength={2}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">ID Groupe</label>
              <input
                value={form.party_id}
                onChange={(e) => setForm((f) => ({ ...f, party_id: e.target.value }))}
                placeholder="EZD"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Code Contrat</label>
              <input
                value={form.contract_code}
                onChange={(e) => setForm((f) => ({ ...f, contract_code: e.target.value }))}
                placeholder="EMSP-001"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Devise</label>
              <input
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                placeholder="EUR"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 uppercase"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">URL</label>
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://..."
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
              {createMutation.isPending || updateMutation.isPending ? "..." : editing ? "Enregistrer" : "Cr\u00e9er"}
            </button>
          </div>
        </form>
      </SlideOver>

      {/* -- Confirm Delete Dialog -- */}
      <ConfirmDialog
        open={!!confirmDelete}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
        title="Supprimer ce contrat ?"
        description={`Le contrat "${confirmDelete?.name}" sera d\u00e9finitivement supprim\u00e9. Cette action est irr\u00e9versible.`}
        confirmLabel="Supprimer"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
