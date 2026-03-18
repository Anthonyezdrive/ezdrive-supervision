// ============================================================
// EZDrive — eMSP Networks Page (Merged)
// GreenFlux-style: list view + detail view with tabs
// Combines: emsp_networks, emsp_contracts, emsp_entities, roaming_agreements
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
  ArrowLeft,
  FileSignature,
  Handshake,
  Building2,
  ExternalLink,
  AlertCircle,
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
import { PageHelp } from "@/components/ui/PageHelp";

// ── Types ─────────────────────────────────────────────────────

interface EmspNetwork {
  id: string;
  type: "internal" | "external";
  name: string;
  remarks: string | null;
  emsp_contracts_count?: number;
  agreements_count?: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

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

interface RoamingAgreement {
  id: string;
  status: "active" | "expired" | "planned";
  management: string | null;
  cpo_network: { name: string } | null;
  emsp_contract: { name: string } | null;
  cpo_contract: { name: string } | null;
  connection_method: string | null;
  valid_from: string | null;
  valid_to: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  updated_at: string;
}

const EMPTY_NETWORK = {
  type: "internal" as EmspNetwork["type"],
  name: "",
  remarks: "",
  updated_by: "",
};

const EMPTY_CONTRACT = {
  type: "internal" as EmspContract["type"],
  name: "",
  network_id: "",
  country_code: "",
  party_id: "",
  contract_code: "",
  currency: "EUR",
  url: "",
  updated_by: "",
};

const EMPTY_EMSP = {
  type: "internal" as EmspEntity["type"],
  name: "",
  external_id: "",
  network_id: "",
  contract_id: "",
  crm_id: "",
  ocpi_url: "",
  updated_by: "",
};

const EMPTY_AGREEMENT = {
  management: "",
  status: "active" as RoamingAgreement["status"],
  emsp_network_id: "",
  emsp_contract_id: "",
  cpo_network_id: "",
  cpo_contract_id: "",
  connection_method: "",
  valid_from: "",
  valid_to: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
};

type SortKey = "name" | "type" | "emsp_contracts_count" | "updated_at";
type SortDir = "asc" | "desc";
type FilterTab = "all" | "internal" | "external";
type DetailTab = "details" | "contracts" | "emsps" | "agreements";

const PAGE_SIZE = 15;

// ── Badges ──────────────────────────────────────────────────

function TypeBadge({ type }: { type: "internal" | "external" }) {
  const config = {
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

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; border: string; label: string }> = {
    active: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/25", label: "Valide" },
    expired: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/25", label: "Expire" },
    planned: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/25", label: "Prevu" },
  };
  const c = config[status] ?? config.active;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold", c.bg, c.text, c.border)}>
      {c.label}
    </span>
  );
}

// ── Date formatter ──────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateFull(d: string | null) {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Skeletons ───────────────────────────────────────────────

function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex gap-6">
        {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className="h-3 w-20" />)}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3.5 flex items-center gap-6">
            {Array.from({ length: cols }).map((_, j) => <Skeleton key={j} className="h-4 w-24" />)}
          </div>
        ))}
      </div>
    </div>
  );
}

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

// ── Empty State ───────────────────────────────────────────────

function EmptyState({ icon: Icon, message }: { icon: typeof Network; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 bg-surface border border-border rounded-2xl">
      <div className="w-12 h-12 rounded-xl bg-surface-elevated flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-foreground-muted" />
      </div>
      <p className="text-sm text-foreground-muted">{message}</p>
    </div>
  );
}

// ── Detail Row ────────────────────────────────────────────────

function DetailRow({ label, value, isLink }: { label: string; value: string; isLink?: boolean }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
      <span className="text-sm font-medium text-foreground-muted">{label}</span>
      {isLink ? (
        <span className="text-sm text-primary">{value}</span>
      ) : (
        <span className="text-sm text-foreground">{value}</span>
      )}
    </div>
  );
}

// ── Main Page (2-level navigation) ────────────────────────────

export function EmspNetworksPage() {
  const [selectedNetwork, setSelectedNetwork] = useState<EmspNetwork | null>(null);

  // Level 2: Network detail
  if (selectedNetwork) {
    return (
      <NetworkDetailView
        network={selectedNetwork}
        onBack={() => setSelectedNetwork(null)}
      />
    );
  }

  // Level 1: Network list
  return <NetworkListView onSelect={setSelectedNetwork} />;
}

// ══════════════════════════════════════════════════════════════
// LIST VIEW
// ══════════════════════════════════════════════════════════════

function NetworkListView({ onSelect }: { onSelect: (n: EmspNetwork) => void }) {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EmspNetwork | null>(null);
  const [form, setForm] = useState(EMPTY_NETWORK);
  const [confirmDelete, setConfirmDelete] = useState<EmspNetwork | null>(null);
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  // ── Fetch networks ──
  const { data: networks, isLoading, isError, refetch } = useQuery<EmspNetwork[]>({
    queryKey: ["emsp-networks"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("emsp_networks")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) return [];
        return (data ?? []) as EmspNetwork[];
      } catch {
        return [];
      }
    },
  });

  // ── Fetch contract counts per network ──
  const { data: contractCounts } = useQuery({
    queryKey: ["emsp-contract-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("emsp_contracts").select("network_id");
      const counts = new Map<string, number>();
      (data ?? []).forEach((c: any) => {
        if (c.network_id) counts.set(c.network_id, (counts.get(c.network_id) ?? 0) + 1);
      });
      return counts;
    },
  });

  // ── Fetch emsp entity counts per network ──
  const { data: emspCounts } = useQuery({
    queryKey: ["emsp-entity-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("emsp_entities").select("network_id");
      const counts = new Map<string, number>();
      (data ?? []).forEach((e: any) => {
        if (e.network_id) counts.set(e.network_id, (counts.get(e.network_id) ?? 0) + 1);
      });
      return counts;
    },
  });

  // ── Fetch agreement counts per network ──
  const { data: agreementCounts } = useQuery({
    queryKey: ["emsp-agreement-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("roaming_agreements").select("emsp_network_id");
      const counts = new Map<string, number>();
      (data ?? []).forEach((a: any) => {
        if (a.emsp_network_id) counts.set(a.emsp_network_id, (counts.get(a.emsp_network_id) ?? 0) + 1);
      });
      return counts;
    },
  });

  // ── KPIs ──
  const stats = useMemo(() => {
    const list = networks ?? [];
    return {
      total: list.length,
      internal: list.filter((n) => n.type === "internal").length,
      external: list.filter((n) => n.type === "external").length,
      withContracts: list.filter((n) => (contractCounts?.get(n.id) ?? 0) > 0).length,
    };
  }, [networks, contractCounts]);

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_NETWORK) => {
      const { error } = await supabase.from("emsp_networks").insert({
        type: data.type, name: data.name.trim(),
        remarks: data.remarks || null, updated_by: data.updated_by || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-networks"] });
      closeModal();
      toastSuccess("Reseau cree", "Le reseau eMSP a ete ajoute");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<typeof EMPTY_NETWORK>) => {
      const { error } = await supabase.from("emsp_networks").update({
        type: data.type, name: data.name?.trim(),
        remarks: data.remarks || null, updated_by: data.updated_by || null,
      }).eq("id", id);
      if (error) throw error;
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

  function openEdit(e: React.MouseEvent, network: EmspNetwork) {
    e.stopPropagation();
    setEditing(network);
    setForm({ type: network.type, name: network.name, remarks: network.remarks ?? "", updated_by: network.updated_by ?? "" });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_NETWORK);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) updateMutation.mutate({ id: editing.id, ...form });
    else createMutation.mutate(form);
  }

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); return key; }
      setSortDir("asc");
      return key;
    });
    setPage(1);
  }, []);

  // ── Filter + Sort ──
  const processed = useMemo(() => {
    let list = networks ?? [];
    if (filterTab !== "all") list = list.filter((n) => n.type === filterTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((n) =>
        n.name?.toLowerCase().includes(q) || n.remarks?.toLowerCase().includes(q) || n.updated_by?.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "fr");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [networks, filterTab, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginated = processed.slice(start, start + PAGE_SIZE);

  const tabCounts = useMemo(() => {
    const list = networks ?? [];
    return { all: list.length, internal: list.filter((n) => n.type === "internal").length, external: list.filter((n) => n.type === "external").length };
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
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Network className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-bold text-foreground">
                Reseaux eMSP ({tabCounts.all})
              </h1>
              <p className="text-sm text-foreground-muted">
                Gerer les reseaux eMSP et accords roaming
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouveau reseau
        </button>
      </div>

      <PageHelp
        summary="Reseaux eMSP et accords de roaming avec les partenaires CPO"
        items={[
          { label: "Reseau eMSP", description: "Un reseau regroupe vos contrats eMSP et les accords de roaming avec les partenaires CPO." },
          { label: "Contrat eMSP", description: "Identifiant OCPI de votre activite eMSP (code pays, party ID, code contrat)." },
          { label: "eMSP", description: "Entite eMSP partenaire (ID externe, CRM, URL OCPI)." },
          { label: "Accord", description: "Convention de roaming avec un reseau CPO partenaire (methode de connexion, validite)." },
        ]}
      />

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mx-6 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span>Erreur lors du chargement des donnees. Veuillez reessayer.</span>
          </div>
          <button onClick={() => refetch()} className="text-red-700 hover:text-red-900 font-medium text-sm">
            Reessayer
          </button>
        </div>
      )}

      {/* KPIs */}
      {isLoading ? (
        <KPISkeleton />
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
            {tab.label} <span className="opacity-60">{tabCounts[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
        <input
          type="text"
          placeholder="Rechercher par nom, remarques..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={5} cols={8} />
      ) : processed.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-56 bg-surface border border-border rounded-2xl">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Network className="w-7 h-7 text-primary" />
          </div>
          <p className="text-foreground font-medium text-lg">Aucun reseau</p>
          <p className="text-sm text-foreground-muted mt-1">
            {search.trim() ? `Aucun resultat pour "${search}"` : "Creez votre premier reseau eMSP."}
          </p>
          {!search.trim() && (
            <button onClick={openCreate} className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" /> Creer un reseau
            </button>
          )}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <th className={thClass} onClick={() => handleSort("type")}>Type de reseau <SortIcon col="type" /></th>
                  <th className={thClass} onClick={() => handleSort("name")}>Nom <SortIcon col="name" /></th>
                  <th className={thClass} onClick={() => handleSort("emsp_contracts_count")}>Contrats eMSP <SortIcon col="emsp_contracts_count" /></th>
                  <th className={thClass}>eMSPs</th>
                  <th className={thClass}>Accords</th>
                  <th className={thClass} onClick={() => handleSort("updated_at")}>Derniere MaJ <SortIcon col="updated_at" /></th>
                  <th className={thClass}>Mis a jour par</th>
                  <th className={thClass}>Remarques</th>
                  <th className={cn(thClass, "text-right w-20")} />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((network) => (
                  <tr
                    key={network.id}
                    onClick={() => onSelect(network)}
                    className="hover:bg-surface-elevated/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3"><TypeBadge type={network.type} /></td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground hover:text-primary transition-colors">{network.name}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground tabular-nums">
                      {contractCounts?.get(network.id) ?? 0} contrats
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground tabular-nums">
                      {emspCounts?.get(network.id) ?? 0} eMSPs
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground tabular-nums">
                      {agreementCounts?.get(network.id) ?? 0} accords
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                      {formatDateFull(network.updated_at)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-foreground-muted truncate max-w-[180px]">{network.updated_by ?? "\u2014"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-foreground-muted truncate max-w-[200px]">{network.remarks ?? "\u2014"}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => openEdit(e, network)}
                          className="px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-primary border border-border hover:border-primary/30 rounded-lg transition-colors"
                        >
                          Editer
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(network); }}
                          className="p-1.5 text-foreground-muted hover:text-red-400 border border-border hover:border-red-400/30 rounded-lg transition-colors"
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
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated disabled:opacity-30 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-foreground-muted px-2">{safePage} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated disabled:opacity-30 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit SlideOver */}
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
              placeholder="Email de l'operateur"
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

      {/* Confirm Delete */}
      <ConfirmDialog
        open={!!confirmDelete}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
        title="Supprimer ce reseau ?"
        description={`Le reseau "${confirmDelete?.name}" sera definitivement supprime.`}
        confirmLabel="Supprimer"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// DETAIL VIEW (GreenFlux-style with tabs)
// ══════════════════════════════════════════════════════════════

function NetworkDetailView({
  network,
  onBack,
}: {
  network: EmspNetwork;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>("details");
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    type: network.type,
    name: network.name,
    remarks: network.remarks ?? "",
    updated_by: network.updated_by ?? "",
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof editForm) => {
      const { error } = await supabase.from("emsp_networks").update({
        type: data.type, name: data.name.trim(),
        remarks: data.remarks || null, updated_by: data.updated_by || null,
      }).eq("id", network.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-networks"] });
      setEditModalOpen(false);
      toastSuccess("Reseau modifie", "Les modifications ont ete enregistrees");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const DETAIL_TABS: { key: DetailTab; label: string; icon: typeof Network }[] = [
    { key: "details", label: "Details", icon: Network },
    { key: "contracts", label: "Contrats eMSP", icon: FileSignature },
    { key: "emsps", label: "eMSPs", icon: Building2 },
    { key: "agreements", label: "Accords", icon: Handshake },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-border hover:bg-surface-elevated transition-colors"
            title="Retour"
          >
            <ArrowLeft className="w-4 h-4 text-foreground-muted" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Network className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-bold text-foreground">{network.name}</h1>
              <p className="text-sm text-foreground-muted">Reseau eMSP</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <TypeBadge type={network.type} />
          <button
            onClick={() => setEditModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Editer
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap",
              activeTab === tab.key
                ? "text-primary"
                : "text-foreground-muted hover:text-foreground"
            )}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "details" && <DetailsTab network={network} />}
      {activeTab === "contracts" && <ContractsTab networkId={network.id} />}
      {activeTab === "emsps" && <EmspsTab networkId={network.id} />}
      {activeTab === "agreements" && <AgreementsTab networkId={network.id} />}

      {/* Edit SlideOver */}
      <SlideOver open={editModalOpen} onClose={() => setEditModalOpen(false)} title="Modifier le reseau">
        <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(editForm); }} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Type</label>
            <select
              value={editForm.type}
              onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value as EmspNetwork["type"] }))}
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="internal">Interne</option>
              <option value="external">Externe</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Nom</label>
            <input
              required
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Remarques</label>
            <textarea
              value={editForm.remarks}
              onChange={(e) => setEditForm((f) => ({ ...f, remarks: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Mis a jour par</label>
            <input
              value={editForm.updated_by}
              onChange={(e) => setEditForm((f) => ({ ...f, updated_by: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setEditModalOpen(false)} className="px-4 py-2 text-sm text-foreground-muted hover:text-foreground border border-border rounded-xl transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={updateMutation.isPending} className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {updateMutation.isPending ? "..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </SlideOver>
    </div>
  );
}

// ── Tab: Details ──────────────────────────────────────────────

function DetailsTab({ network }: { network: EmspNetwork }) {
  return (
    <div className="bg-surface border border-border rounded-2xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Details</h3>
        <TypeBadge type={network.type} />
      </div>
      <div className="px-6 py-5 space-y-4">
        <DetailRow label="Identifiant externe" value={network.id} />
        <DetailRow label="Type" value={network.type === "internal" ? "Interne" : "Externe"} />
        <DetailRow label="Nom" value={network.name} />
        <DetailRow label="Remarques" value={network.remarks ?? "\u2014"} />
        <DetailRow
          label="Derniere mise a jour"
          value={
            network.updated_at
              ? `${formatDateFull(network.updated_at)}${network.updated_by ? ` (${network.updated_by})` : ""}`
              : "\u2014"
          }
          isLink
        />
        <DetailRow label="Date de creation" value={formatDateFull(network.created_at)} />
      </div>
    </div>
  );
}

// ── Tab: Contrats eMSP ─────────────────────────────────────────

function ContractsTab({ networkId }: { networkId: string }) {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EmspContract | null>(null);
  const [form, setForm] = useState(EMPTY_CONTRACT);
  const [confirmDelete, setConfirmDelete] = useState<EmspContract | null>(null);

  const { data: contracts, isLoading } = useQuery<EmspContract[]>({
    queryKey: ["emsp-contracts-for-network", networkId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emsp_contracts")
        .select("*")
        .eq("network_id", networkId)
        .order("name");
      if (error) return [];
      return (data ?? []) as EmspContract[];
    },
  });

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_CONTRACT) => {
      const { error } = await supabase.from("emsp_contracts").insert({
        type: data.type, name: data.name.trim(),
        network_id: networkId,
        country_code: data.country_code.trim(),
        party_id: data.party_id.trim() || null,
        contract_code: data.contract_code.trim() || null,
        currency: data.currency.trim() || "EUR",
        url: data.url.trim() || null,
        updated_by: data.updated_by || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-contracts-for-network", networkId] });
      queryClient.invalidateQueries({ queryKey: ["emsp-contract-counts"] });
      closeModal();
      toastSuccess("Contrat cree", "Le contrat eMSP a ete ajoute");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<typeof EMPTY_CONTRACT>) => {
      const { error } = await supabase.from("emsp_contracts").update({
        type: data.type, name: data.name?.trim(),
        country_code: data.country_code?.trim(),
        party_id: data.party_id?.trim() || null,
        contract_code: data.contract_code?.trim() || null,
        currency: data.currency?.trim() || "EUR",
        url: data.url?.trim() || null,
        updated_by: data.updated_by || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-contracts-for-network", networkId] });
      closeModal();
      toastSuccess("Contrat modifie", "Les modifications ont ete enregistrees");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("emsp_contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-contracts-for-network", networkId] });
      queryClient.invalidateQueries({ queryKey: ["emsp-contract-counts"] });
      setConfirmDelete(null);
      toastSuccess("Contrat supprime", "Le contrat eMSP a ete supprime");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_CONTRACT);
    setModalOpen(true);
  }

  function openEdit(e: React.MouseEvent, contract: EmspContract) {
    e.stopPropagation();
    setEditing(contract);
    setForm({
      type: contract.type, name: contract.name,
      network_id: contract.network_id ?? "",
      country_code: contract.country_code,
      party_id: contract.party_id ?? "",
      contract_code: contract.contract_code ?? "",
      currency: contract.currency,
      url: contract.url ?? "",
      updated_by: contract.updated_by ?? "",
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
    if (editing) updateMutation.mutate({ id: editing.id, ...form });
    else createMutation.mutate(form);
  }

  const filtered = useMemo(() => {
    let list = contracts ?? [];
    if (filterTab !== "all") list = list.filter((c) => c.type === filterTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name?.toLowerCase().includes(q) || c.contract_code?.toLowerCase().includes(q) || c.party_id?.toLowerCase().includes(q));
    }
    return list;
  }, [contracts, filterTab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const tabCounts = useMemo(() => {
    const list = contracts ?? [];
    return { all: list.length, internal: list.filter((c) => c.type === "internal").length, external: list.filter((c) => c.type === "external").length };
  }, [contracts]);

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "Tout" },
    { key: "internal", label: "Interne" },
    { key: "external", label: "Externe" },
  ];

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSignature className="w-4 h-4 text-foreground-muted" />
          <h3 className="text-sm font-semibold text-foreground">Contrats eMSP ({tabCounts.all})</h3>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter un contrat
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setFilterTab(tab.key); setPage(1); }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              filterTab === tab.key ? "bg-primary/15 text-primary" : "text-foreground-muted hover:text-foreground hover:bg-surface-elevated"
            )}
          >
            {tab.label} <span className="opacity-60">{tabCounts[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
        <input
          type="text"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus"
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={3} cols={9} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileSignature} message="Aucun contrat eMSP lie a ce reseau" />
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Code pays</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">ID Groupe</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Code contrat</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Devise</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">URL</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Derniere MaJ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Mis a jour par</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3"><TypeBadge type={c.type} /></td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{c.name}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{c.country_code}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted font-mono">{c.party_id ?? "\u2014"}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted font-mono">{c.contract_code ?? "\u2014"}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{c.currency}</td>
                    <td className="px-4 py-3">
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                          Lien <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-sm text-foreground-muted">{"\u2014"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">{formatDateFull(c.updated_at)}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">{c.updated_by ?? "\u2014"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => openEdit(e, c)}
                          className="p-1.5 text-foreground-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(c)}
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-foreground-muted">
                {(safePage - 1) * PAGE_SIZE + 1}\u2013{Math.min(safePage * PAGE_SIZE, filtered.length)} sur {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="p-1.5 rounded-lg text-foreground-muted hover:bg-surface-elevated disabled:opacity-30 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-foreground-muted px-2">{safePage} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="p-1.5 rounded-lg text-foreground-muted hover:bg-surface-elevated disabled:opacity-30 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Contract SlideOver */}
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

      {/* Confirm Delete Contract */}
      <ConfirmDialog
        open={!!confirmDelete}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
        title="Supprimer ce contrat ?"
        description={`Le contrat "${confirmDelete?.name}" sera definitivement supprime.`}
        confirmLabel="Supprimer"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

// ── Tab: eMSPs ──────────────────────────────────────────────────

function EmspsTab({ networkId }: { networkId: string }) {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EmspEntity | null>(null);
  const [form, setForm] = useState(EMPTY_EMSP);
  const [confirmDelete, setConfirmDelete] = useState<EmspEntity | null>(null);

  const { data: entities, isLoading } = useQuery<EmspEntity[]>({
    queryKey: ["emsp-entities-for-network", networkId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emsp_entities")
        .select("*")
        .eq("network_id", networkId)
        .order("name");
      if (error) return [];
      return (data ?? []) as EmspEntity[];
    },
  });

  // Fetch contracts for this network (for dropdown + name resolution)
  const { data: networkContracts } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["emsp-contracts-select-for-network", networkId],
    queryFn: async () => {
      const { data, error } = await supabase.from("emsp_contracts").select("id, name").eq("network_id", networkId).order("name");
      if (error) return [];
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const contractMap = useMemo(() => {
    const m = new Map<string, string>();
    (networkContracts ?? []).forEach((c) => m.set(c.id, c.name));
    return m;
  }, [networkContracts]);

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_EMSP) => {
      const { error } = await supabase.from("emsp_entities").insert({
        type: data.type, name: data.name.trim(),
        external_id: data.external_id || null,
        network_id: networkId,
        contract_id: data.contract_id || null,
        crm_id: data.crm_id || null,
        ocpi_url: data.ocpi_url || null,
        updated_by: data.updated_by || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-entities-for-network", networkId] });
      queryClient.invalidateQueries({ queryKey: ["emsp-entity-counts"] });
      closeModal();
      toastSuccess("eMSP cree", "L'entite eMSP a ete ajoutee");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<typeof EMPTY_EMSP>) => {
      const { error } = await supabase.from("emsp_entities").update({
        type: data.type, name: data.name?.trim(),
        external_id: data.external_id || null,
        contract_id: data.contract_id || null,
        crm_id: data.crm_id || null,
        ocpi_url: data.ocpi_url || null,
        updated_by: data.updated_by || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-entities-for-network", networkId] });
      closeModal();
      toastSuccess("eMSP modifie", "Les modifications ont ete enregistrees");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("emsp_entities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-entities-for-network", networkId] });
      queryClient.invalidateQueries({ queryKey: ["emsp-entity-counts"] });
      setConfirmDelete(null);
      toastSuccess("eMSP supprime", "L'entite eMSP a ete supprimee");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_EMSP);
    setModalOpen(true);
  }

  function openEdit(e: React.MouseEvent, entity: EmspEntity) {
    e.stopPropagation();
    setEditing(entity);
    setForm({
      type: entity.type, name: entity.name,
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
    if (editing) updateMutation.mutate({ id: editing.id, ...form });
    else createMutation.mutate(form);
  }

  const filtered = useMemo(() => {
    let list = entities ?? [];
    if (filterTab !== "all") list = list.filter((e) => e.type === filterTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        e.name?.toLowerCase().includes(q) || e.external_id?.toLowerCase().includes(q) || e.crm_id?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [entities, filterTab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const tabCounts = useMemo(() => {
    const list = entities ?? [];
    return { all: list.length, internal: list.filter((e) => e.type === "internal").length, external: list.filter((e) => e.type === "external").length };
  }, [entities]);

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "Tout" },
    { key: "internal", label: "Interne" },
    { key: "external", label: "Externe" },
  ];

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-foreground-muted" />
          <h3 className="text-sm font-semibold text-foreground">eMSPs ({tabCounts.all})</h3>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter un eMSP
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setFilterTab(tab.key); setPage(1); }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              filterTab === tab.key ? "bg-primary/15 text-primary" : "text-foreground-muted hover:text-foreground hover:bg-surface-elevated"
            )}
          >
            {tab.label} <span className="opacity-60">{tabCounts[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
        <input
          type="text"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus"
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={3} cols={9} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Building2} message="Aucun eMSP lie a ce reseau" />
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">ID Externe</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Contrat eMSP</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">CRM Customer ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">URL OCPI</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Derniere MaJ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Mis a jour par</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((entity) => (
                  <tr key={entity.id} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3"><TypeBadge type={entity.type} /></td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{entity.name}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted font-mono">{entity.external_id ?? "\u2014"}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">
                      {entity.contract_id ? contractMap.get(entity.contract_id) ?? "\u2014" : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted font-mono">{entity.crm_id ?? "\u2014"}</td>
                    <td className="px-4 py-3">
                      {entity.ocpi_url ? (
                        <a href={entity.ocpi_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline truncate max-w-[180px]">
                          <Globe className="w-3 h-3 shrink-0" />
                          <span className="truncate">{entity.ocpi_url}</span>
                        </a>
                      ) : (
                        <span className="text-sm text-foreground-muted">{"\u2014"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">{formatDateFull(entity.updated_at)}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">{entity.updated_by ?? "\u2014"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => openEdit(e, entity)}
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-foreground-muted">
                {(safePage - 1) * PAGE_SIZE + 1}\u2013{Math.min(safePage * PAGE_SIZE, filtered.length)} sur {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="p-1.5 rounded-lg text-foreground-muted hover:bg-surface-elevated disabled:opacity-30 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-foreground-muted px-2">{safePage} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="p-1.5 rounded-lg text-foreground-muted hover:bg-surface-elevated disabled:opacity-30 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit eMSP SlideOver */}
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
                placeholder="Nom de l'entite"
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
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Contrat eMSP</label>
            <select
              value={form.contract_id}
              onChange={(e) => setForm((f) => ({ ...f, contract_id: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="">-- Aucun --</option>
              {(networkContracts ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">CRM Customer ID</label>
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
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Mis a jour par</label>
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
              {createMutation.isPending || updateMutation.isPending ? "..." : editing ? "Enregistrer" : "Creer"}
            </button>
          </div>
        </form>
      </SlideOver>

      {/* Confirm Delete eMSP */}
      <ConfirmDialog
        open={!!confirmDelete}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
        title="Supprimer cet eMSP ?"
        description={`L'entite "${confirmDelete?.name}" sera definitivement supprimee.`}
        confirmLabel="Supprimer"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

// ── Tab: Accords ──────────────────────────────────────────────

function AgreementsTab({ networkId }: { networkId: string }) {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "active" | "expired">("all");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoamingAgreement | null>(null);
  const [form, setForm] = useState(EMPTY_AGREEMENT);
  const [confirmDelete, setConfirmDelete] = useState<RoamingAgreement | null>(null);

  const { data: agreements, isLoading } = useQuery<RoamingAgreement[]>({
    queryKey: ["emsp-agreements-for-network", networkId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roaming_agreements")
        .select(`
          id, status, management, connection_method,
          valid_from, valid_to, contact_name, contact_email, contact_phone,
          updated_at,
          cpo_network:cpo_networks(name),
          emsp_contract:emsp_contracts(name),
          cpo_contract:cpo_contracts(name)
        `)
        .eq("emsp_network_id", networkId)
        .order("updated_at", { ascending: false });
      if (error) return [];
      return (data ?? []) as unknown as RoamingAgreement[];
    },
  });

  // Fetch related data for dropdowns
  const { data: cpoNetworks } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["cpo-networks-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cpo_networks").select("id, name").order("name");
      if (error) return [];
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: emspContracts } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["emsp-contracts-select-for-agreements", networkId],
    queryFn: async () => {
      const { data, error } = await supabase.from("emsp_contracts").select("id, name").eq("network_id", networkId).order("name");
      if (error) return [];
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: cpoContracts } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["cpo-contracts-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cpo_contracts").select("id, name").order("name");
      if (error) return [];
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_AGREEMENT) => {
      const { error } = await supabase.from("roaming_agreements").insert({
        status: data.status,
        management: data.management || null,
        emsp_network_id: networkId,
        emsp_contract_id: data.emsp_contract_id || null,
        cpo_network_id: data.cpo_network_id || null,
        cpo_contract_id: data.cpo_contract_id || null,
        connection_method: data.connection_method || null,
        valid_from: data.valid_from || null,
        valid_to: data.valid_to || null,
        contact_name: data.contact_name || null,
        contact_email: data.contact_email || null,
        contact_phone: data.contact_phone || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-agreements-for-network", networkId] });
      queryClient.invalidateQueries({ queryKey: ["emsp-agreement-counts"] });
      closeModal();
      toastSuccess("Accord cree", "L'accord de roaming a ete ajoute");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<typeof EMPTY_AGREEMENT>) => {
      const { error } = await supabase.from("roaming_agreements").update({
        status: data.status,
        management: data.management || null,
        emsp_contract_id: data.emsp_contract_id || null,
        cpo_network_id: data.cpo_network_id || null,
        cpo_contract_id: data.cpo_contract_id || null,
        connection_method: data.connection_method || null,
        valid_from: data.valid_from || null,
        valid_to: data.valid_to || null,
        contact_name: data.contact_name || null,
        contact_email: data.contact_email || null,
        contact_phone: data.contact_phone || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-agreements-for-network", networkId] });
      closeModal();
      toastSuccess("Accord modifie", "Les modifications ont ete enregistrees");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("roaming_agreements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emsp-agreements-for-network", networkId] });
      queryClient.invalidateQueries({ queryKey: ["emsp-agreement-counts"] });
      setConfirmDelete(null);
      toastSuccess("Accord supprime", "L'accord de roaming a ete supprime");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_AGREEMENT);
    setModalOpen(true);
  }

  function openEdit(e: React.MouseEvent, agreement: any) {
    e.stopPropagation();
    setEditing(agreement);
    setForm({
      management: agreement.management ?? "",
      status: agreement.status ?? "active",
      emsp_network_id: networkId,
      emsp_contract_id: agreement.emsp_contract_id ?? "",
      cpo_network_id: agreement.cpo_network_id ?? "",
      cpo_contract_id: agreement.cpo_contract_id ?? "",
      connection_method: agreement.connection_method ?? "",
      valid_from: agreement.valid_from ?? "",
      valid_to: agreement.valid_to ?? "",
      contact_name: agreement.contact_name ?? "",
      contact_email: agreement.contact_email ?? "",
      contact_phone: agreement.contact_phone ?? "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_AGREEMENT);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) updateMutation.mutate({ id: editing.id, ...form });
    else createMutation.mutate(form);
  }

  const filtered = useMemo(() => {
    let list = agreements ?? [];
    if (filterTab === "active") list = list.filter((a) => a.status === "active");
    else if (filterTab === "expired") list = list.filter((a) => a.status === "expired");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) =>
        a.cpo_network?.name?.toLowerCase().includes(q) ||
        a.management?.toLowerCase().includes(q) ||
        a.connection_method?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [agreements, filterTab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const tabCounts = useMemo(() => {
    const list = agreements ?? [];
    return {
      all: list.length,
      active: list.filter((a) => a.status === "active").length,
      expired: list.filter((a) => a.status === "expired").length,
    };
  }, [agreements]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Handshake className="w-4 h-4 text-foreground-muted" />
          <h3 className="text-sm font-semibold text-foreground">Accords ({tabCounts.all})</h3>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter un accord
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
        {[
          { key: "all" as const, label: "Tout" },
          { key: "active" as const, label: "Valide" },
          { key: "expired" as const, label: "Expire" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setFilterTab(tab.key); setPage(1); }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              filterTab === tab.key ? "bg-primary/15 text-primary" : "text-foreground-muted hover:text-foreground hover:bg-surface-elevated"
            )}
          >
            {tab.label} <span className="opacity-60">{tabCounts[tab.key]}</span>
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
        <input
          type="text"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus"
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={10} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Handshake} message="Aucun accord de roaming lie a ce reseau" />
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Validite</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Gestion des accords</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Reseau CPO</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Contrat eMSP</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Contrat CPO</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Methode connexion</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Valide a partir de</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Valable jusqu'au</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Pro. Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Pro. E-mail</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Pro. Telephone</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((a) => (
                  <tr key={a.id} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                    <td className="px-4 py-3 text-sm text-foreground">{a.management ?? "\u2014"}</td>
                    <td className="px-4 py-3 text-sm text-foreground font-medium">{a.cpo_network?.name ?? "\u2014"}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">{a.emsp_contract?.name ?? "\u2014"}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">{a.cpo_contract?.name ?? "\u2014"}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">{a.connection_method ?? "\u2014"}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">{formatDate(a.valid_from)}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                      {a.valid_to ? formatDate(a.valid_to) : "Indefinie"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">{a.contact_name ?? "\u2014"}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">{a.contact_email ?? "\u2014"}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">{a.contact_phone ?? "\u2014"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => openEdit(e, a)}
                          className="p-1.5 text-foreground-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(a)}
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-foreground-muted">
                {(safePage - 1) * PAGE_SIZE + 1}\u2013{Math.min(safePage * PAGE_SIZE, filtered.length)} sur {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="p-1.5 rounded-lg text-foreground-muted hover:bg-surface-elevated disabled:opacity-30 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-foreground-muted px-2">{safePage} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="p-1.5 rounded-lg text-foreground-muted hover:bg-surface-elevated disabled:opacity-30 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Agreement SlideOver */}
      <SlideOver open={modalOpen} onClose={closeModal} title={editing ? "Modifier l'accord" : "Nouvel accord de roaming"}>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Statut *</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as RoamingAgreement["status"] }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="active">Valide</option>
                <option value="expired">Expire</option>
                <option value="planned">Prevu</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Gestion des accords</label>
              <input
                value={form.management}
                onChange={(e) => setForm((f) => ({ ...f, management: e.target.value }))}
                placeholder="Ex: Direct, Hub..."
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Reseau CPO</label>
            <select
              value={form.cpo_network_id}
              onChange={(e) => setForm((f) => ({ ...f, cpo_network_id: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="">-- Aucun --</option>
              {(cpoNetworks ?? []).map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Contrat eMSP</label>
              <select
                value={form.emsp_contract_id}
                onChange={(e) => setForm((f) => ({ ...f, emsp_contract_id: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="">-- Aucun --</option>
                {(emspContracts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Contrat CPO</label>
              <select
                value={form.cpo_contract_id}
                onChange={(e) => setForm((f) => ({ ...f, cpo_contract_id: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="">-- Aucun --</option>
                {(cpoContracts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Methode de connexion</label>
            <input
              value={form.connection_method}
              onChange={(e) => setForm((f) => ({ ...f, connection_method: e.target.value }))}
              placeholder="Ex: OCPI, Hubject, Gireve..."
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Valide a partir de</label>
              <input
                type="date"
                value={form.valid_from}
                onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Valable jusqu'au</label>
              <input
                type="date"
                value={form.valid_to}
                onChange={(e) => setForm((f) => ({ ...f, valid_to: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Contact professionnel</label>
            <input
              value={form.contact_name}
              onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
              placeholder="Nom du contact"
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">E-mail professionnel</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                placeholder="contact@example.com"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Telephone professionnel</label>
              <input
                type="tel"
                value={form.contact_phone}
                onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                placeholder="+33 1 23 45 67 89"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
              />
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
              {createMutation.isPending || updateMutation.isPending ? "..." : editing ? "Enregistrer" : "Creer"}
            </button>
          </div>
        </form>
      </SlideOver>

      {/* Confirm Delete Agreement */}
      <ConfirmDialog
        open={!!confirmDelete}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
        title="Supprimer cet accord ?"
        description="Cet accord de roaming sera definitivement supprime."
        confirmLabel="Supprimer"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
