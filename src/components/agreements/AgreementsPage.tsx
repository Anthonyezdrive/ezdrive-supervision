// ============================================================
// EZDrive — Roaming Agreements Page
// Manage CPO-eMSP interoperability agreements
// ============================================================

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Handshake,
  Search,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
import { PageHelp } from "@/components/ui/PageHelp";

// ── Types ─────────────────────────────────────────────────────

interface Agreement {
  id: string;
  status: "active" | "expired" | "planned";
  management: string | null;
  cpo_network_id: string | null;
  cpo_contract_id: string | null;
  emsp_network_id: string | null;
  emsp_contract_id: string | null;
  connection_method: string | null;
  valid_from: string | null;
  valid_to: string | null;
  professional_contact: string | null;
  technical_contact: string | null;
  remarks: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface NetworkRef {
  id: string;
  name: string;
}

interface ContractRef {
  id: string;
  name: string;
}

const EMPTY_AGREEMENT: {
  status: Agreement["status"];
  management: string;
  cpo_network_id: string;
  cpo_contract_id: string;
  emsp_network_id: string;
  emsp_contract_id: string;
  connection_method: string;
  valid_from: string;
  valid_to: string;
  professional_contact: string;
  technical_contact: string;
  remarks: string;
  updated_by: string;
} = {
  status: "active",
  management: "",
  cpo_network_id: "",
  cpo_contract_id: "",
  emsp_network_id: "",
  emsp_contract_id: "",
  connection_method: "",
  valid_from: "",
  valid_to: "",
  professional_contact: "",
  technical_contact: "",
  remarks: "",
  updated_by: "",
};

type SortKey = "status" | "management" | "connection_method" | "valid_from" | "valid_to" | "created_at";
type SortDir = "asc" | "desc";
type FilterTab = "all" | "active" | "expired" | "planned";

const PAGE_SIZE = 20;

// ── Status badge ──────────────────────────────────────────────

function AgreementStatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
    active: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/25", dot: "#34D399", label: "Actif" },
    expired: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/25", dot: "#F87171", label: "Expiré" },
    planned: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/25", dot: "#60A5FA", label: "Planifié" },
  };
  const c = config[status] ?? config.active;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold", c.bg, c.text, c.border)}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
      {c.label}
    </span>
  );
}

// ── Loading skeletons ─────────────────────────────────────────

function AgreementsKPISkeleton() {
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

function AgreementsTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex gap-6">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-20" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3.5 flex items-center gap-6">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export function AgreementsPage() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Agreement | null>(null);
  const [form, setForm] = useState(EMPTY_AGREEMENT);
  const [confirmDelete, setConfirmDelete] = useState<Agreement | null>(null);

  // ── Related data for dropdowns ──
  const { data: cpoNetworks } = useQuery<NetworkRef[]>({
    queryKey: ["cpo-networks"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("cpo_networks").select("id, name").order("name");
        if (error) { console.warn("[AgreementsPage] cpo_networks:", error.message); return []; }
        return (data ?? []) as NetworkRef[];
      } catch { return []; }
    },
  });

  const { data: cpoContracts } = useQuery<ContractRef[]>({
    queryKey: ["cpo-contracts"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("cpo_contracts").select("id, name").order("name");
        if (error) { console.warn("[AgreementsPage] cpo_contracts:", error.message); return []; }
        return (data ?? []) as ContractRef[];
      } catch { return []; }
    },
  });

  const { data: emspNetworks } = useQuery<NetworkRef[]>({
    queryKey: ["emsp-networks"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("emsp_networks").select("id, name").order("name");
        if (error) { console.warn("[AgreementsPage] emsp_networks:", error.message); return []; }
        return (data ?? []) as NetworkRef[];
      } catch { return []; }
    },
  });

  const { data: emspContracts } = useQuery<ContractRef[]>({
    queryKey: ["emsp-contracts"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("emsp_contracts").select("id, name").order("name");
        if (error) { console.warn("[AgreementsPage] emsp_contracts:", error.message); return []; }
        return (data ?? []) as ContractRef[];
      } catch { return []; }
    },
  });

  // ── Lookup maps ──
  const cpoNetworkMap = useMemo(() => {
    const m = new Map<string, string>();
    (cpoNetworks ?? []).forEach((n) => m.set(n.id, n.name));
    return m;
  }, [cpoNetworks]);

  const cpoContractMap = useMemo(() => {
    const m = new Map<string, string>();
    (cpoContracts ?? []).forEach((c) => m.set(c.id, c.name));
    return m;
  }, [cpoContracts]);

  const emspNetworkMap = useMemo(() => {
    const m = new Map<string, string>();
    (emspNetworks ?? []).forEach((n) => m.set(n.id, n.name));
    return m;
  }, [emspNetworks]);

  const emspContractMap = useMemo(() => {
    const m = new Map<string, string>();
    (emspContracts ?? []).forEach((c) => m.set(c.id, c.name));
    return m;
  }, [emspContracts]);

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_AGREEMENT) => {
      const { data: result, error } = await supabase.from("roaming_agreements").insert({
        status: data.status,
        management: data.management || null,
        cpo_network_id: data.cpo_network_id || null,
        cpo_contract_id: data.cpo_contract_id || null,
        emsp_network_id: data.emsp_network_id || null,
        emsp_contract_id: data.emsp_contract_id || null,
        connection_method: data.connection_method || null,
        valid_from: data.valid_from || null,
        valid_to: data.valid_to || null,
        professional_contact: data.professional_contact || null,
        technical_contact: data.technical_contact || null,
        remarks: data.remarks || null,
        updated_by: data.updated_by || null,
      }).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roaming-agreements"] });
      closeModal();
      toastSuccess("Accord créé", "L'accord de roaming a été ajouté avec succès");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<typeof EMPTY_AGREEMENT>) => {
      const { data: result, error } = await supabase.from("roaming_agreements").update({
        status: data.status,
        management: data.management || null,
        cpo_network_id: data.cpo_network_id || null,
        cpo_contract_id: data.cpo_contract_id || null,
        emsp_network_id: data.emsp_network_id || null,
        emsp_contract_id: data.emsp_contract_id || null,
        connection_method: data.connection_method || null,
        valid_from: data.valid_from || null,
        valid_to: data.valid_to || null,
        professional_contact: data.professional_contact || null,
        technical_contact: data.technical_contact || null,
        remarks: data.remarks || null,
        updated_by: data.updated_by || null,
      }).eq("id", id).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roaming-agreements"] });
      closeModal();
      toastSuccess("Accord modifié", "Les modifications ont été enregistrées");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("roaming_agreements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roaming-agreements"] });
      setConfirmDelete(null);
      toastSuccess("Accord supprimé", "L'accord de roaming a été supprimé");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_AGREEMENT);
    setModalOpen(true);
  }

  function openEdit(agreement: Agreement) {
    setEditing(agreement);
    setForm({
      status: agreement.status,
      management: agreement.management ?? "",
      cpo_network_id: agreement.cpo_network_id ?? "",
      cpo_contract_id: agreement.cpo_contract_id ?? "",
      emsp_network_id: agreement.emsp_network_id ?? "",
      emsp_contract_id: agreement.emsp_contract_id ?? "",
      connection_method: agreement.connection_method ?? "",
      valid_from: agreement.valid_from ? agreement.valid_from.slice(0, 10) : "",
      valid_to: agreement.valid_to ? agreement.valid_to.slice(0, 10) : "",
      professional_contact: agreement.professional_contact ?? "",
      technical_contact: agreement.technical_contact ?? "",
      remarks: agreement.remarks ?? "",
      updated_by: agreement.updated_by ?? "",
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
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...form });
    } else {
      createMutation.mutate(form);
    }
  }

  // ── Data fetching ──
  const { data: agreements, isLoading } = useQuery<Agreement[]>({
    queryKey: ["roaming-agreements"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("roaming_agreements")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) {
          console.warn("[AgreementsPage] Table not found:", error.message);
          return [];
        }
        return (data ?? []) as Agreement[];
      } catch {
        return [];
      }
    },
  });

  // ── KPIs ──
  const stats = useMemo(() => {
    const list = agreements ?? [];
    return {
      total: list.length,
      active: list.filter((a) => a.status === "active").length,
      expired: list.filter((a) => a.status === "expired").length,
      planned: list.filter((a) => a.status === "planned").length,
    };
  }, [agreements]);

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
    let list = agreements ?? [];
    if (filterTab !== "all") list = list.filter((a) => a.status === filterTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.management?.toLowerCase().includes(q) ||
          a.connection_method?.toLowerCase().includes(q) ||
          a.professional_contact?.toLowerCase().includes(q) ||
          a.technical_contact?.toLowerCase().includes(q) ||
          a.remarks?.toLowerCase().includes(q) ||
          (a.cpo_network_id && cpoNetworkMap.get(a.cpo_network_id)?.toLowerCase().includes(q)) ||
          (a.emsp_network_id && emspNetworkMap.get(a.emsp_network_id)?.toLowerCase().includes(q))
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
  }, [agreements, filterTab, search, sortKey, sortDir, cpoNetworkMap, emspNetworkMap]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginated = processed.slice(start, start + PAGE_SIZE);

  // ── Tab counts ──
  const tabCounts = useMemo(() => {
    const list = agreements ?? [];
    return {
      all: list.length,
      active: list.filter((a) => a.status === "active").length,
      expired: list.filter((a) => a.status === "expired").length,
      planned: list.filter((a) => a.status === "planned").length,
    };
  }, [agreements]);

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "Tous" },
    { key: "active", label: "Actifs" },
    { key: "expired", label: "Expirés" },
    { key: "planned", label: "Planifiés" },
  ];

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5" />;
  };

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap";

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "\u2014";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">
            Accords de Roaming
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Gérer les accords d'interopérabilité CPO-eMSP
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouvel accord
        </button>
      </div>

      <PageHelp
        summary="Accords et conventions cadres avec les plateformes de roaming"
        items={[
          { label: "Accord", description: "Convention signée avec une plateforme de roaming (Gireve, Hubject, etc.) ou un opérateur." },
          { label: "Type", description: "Bilatéral (direct entre 2 opérateurs) ou Hub (via une plateforme centralisée)." },
          { label: "Couverture", description: "Zones géographiques et types de bornes couverts par l'accord." },
          { label: "Conditions", description: "Tarifs négociés, SLA, pénalités et durée de l'accord." },
        ]}
      />

      {/* KPIs */}
      {isLoading ? (
        <AgreementsKPISkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Total accords" value={stats.total} icon={Handshake} color="#8892B0" />
          <KPICard label="Actifs" value={stats.active} icon={CheckCircle2} color="#00D4AA" />
          <KPICard label="Expirés" value={stats.expired} icon={XCircle} color="#F87171" />
          <KPICard label="Planifiés" value={stats.planned} icon={Clock} color="#60A5FA" />
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
          placeholder="Rechercher par gestion, contact, réseau..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <AgreementsTableSkeleton />
      ) : processed.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-56 bg-surface border border-border rounded-2xl">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Handshake className="w-7 h-7 text-primary" />
          </div>
          <p className="text-foreground font-medium text-lg">Aucun accord</p>
          <p className="text-sm text-foreground-muted mt-1 max-w-sm text-center">
            {search.trim()
              ? `Aucun accord ne correspond à « ${search} »`
              : "Créez votre premier accord de roaming pour gérer l'interopérabilité."}
          </p>
          <button
            onClick={openCreate}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Créer un accord
          </button>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <th className={thClass} onClick={() => handleSort("status")}>
                    Statut <SortIcon col="status" />
                  </th>
                  <th className={thClass} onClick={() => handleSort("management")}>
                    Gestion <SortIcon col="management" />
                  </th>
                  <th className={thClass}>Réseau CPO</th>
                  <th className={thClass}>Contrat CPO</th>
                  <th className={thClass}>Réseau eMSP</th>
                  <th className={thClass}>Contrat eMSP</th>
                  <th className={thClass} onClick={() => handleSort("connection_method")}>
                    Méthode connexion <SortIcon col="connection_method" />
                  </th>
                  <th className={thClass} onClick={() => handleSort("valid_from")}>
                    Valide du <SortIcon col="valid_from" />
                  </th>
                  <th className={thClass} onClick={() => handleSort("valid_to")}>
                    Valide au <SortIcon col="valid_to" />
                  </th>
                  <th className={thClass}>Contact Pro</th>
                  <th className={thClass}>Contact Tech</th>
                  <th className={cn(thClass, "text-right w-20")}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((agreement) => (
                  <tr key={agreement.id} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3">
                      <AgreementStatusBadge status={agreement.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground truncate max-w-[150px]">
                      {agreement.management ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[150px]">
                      {agreement.cpo_network_id ? cpoNetworkMap.get(agreement.cpo_network_id) ?? agreement.cpo_network_id : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[150px]">
                      {agreement.cpo_contract_id ? cpoContractMap.get(agreement.cpo_contract_id) ?? agreement.cpo_contract_id : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[150px]">
                      {agreement.emsp_network_id ? emspNetworkMap.get(agreement.emsp_network_id) ?? agreement.emsp_network_id : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[150px]">
                      {agreement.emsp_contract_id ? emspContractMap.get(agreement.emsp_contract_id) ?? agreement.emsp_contract_id : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">
                      {agreement.connection_method ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                      {formatDate(agreement.valid_from)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                      {formatDate(agreement.valid_to)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[150px]">
                      {agreement.professional_contact ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[150px]">
                      {agreement.technical_contact ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(agreement)}
                          className="p-1.5 text-foreground-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(agreement)}
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
      <SlideOver open={modalOpen} onClose={closeModal} title={editing ? "Modifier l'accord" : "Nouvel accord"} maxWidth="max-w-xl">
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Statut *</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Agreement["status"] }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="active">Actif</option>
                <option value="expired">Expiré</option>
                <option value="planned">Planifié</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Gestion</label>
              <input
                value={form.management}
                onChange={(e) => setForm((f) => ({ ...f, management: e.target.value }))}
                placeholder="Mode de gestion"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-foreground-muted mb-3">CPO</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-foreground-muted mb-1">Réseau CPO</label>
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
              <div>
                <label className="block text-xs text-foreground-muted mb-1">Contrat CPO</label>
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
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-foreground-muted mb-3">eMSP</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-foreground-muted mb-1">Réseau eMSP</label>
                <select
                  value={form.emsp_network_id}
                  onChange={(e) => setForm((f) => ({ ...f, emsp_network_id: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
                >
                  <option value="">-- Aucun --</option>
                  {(emspNetworks ?? []).map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-foreground-muted mb-1">Contrat eMSP</label>
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
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Méthode de connexion</label>
            <input
              value={form.connection_method}
              onChange={(e) => setForm((f) => ({ ...f, connection_method: e.target.value }))}
              placeholder="OCPI, OICP, eMIP..."
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Valide du</label>
              <input
                type="date"
                value={form.valid_from}
                onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Valide au</label>
              <input
                type="date"
                value={form.valid_to}
                onChange={(e) => setForm((f) => ({ ...f, valid_to: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Contact professionnel</label>
              <input
                value={form.professional_contact}
                onChange={(e) => setForm((f) => ({ ...f, professional_contact: e.target.value }))}
                placeholder="Nom ou email"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Contact technique</label>
              <input
                value={form.technical_contact}
                onChange={(e) => setForm((f) => ({ ...f, technical_contact: e.target.value }))}
                placeholder="Nom ou email"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Remarques</label>
            <textarea
              value={form.remarks}
              onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
              rows={3}
              placeholder="Notes additionnelles..."
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 resize-none"
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
        title="Supprimer cet accord ?"
        description="Cet accord de roaming sera définitivement supprimé. Cette action est irréversible."
        confirmLabel="Supprimer"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
