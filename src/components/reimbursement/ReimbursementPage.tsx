// ============================================================
// EZDrive — Reimbursement Rules Page
// Manage inter-operator reimbursement tariffs
// ============================================================

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Receipt,
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

// ── Types ─────────────────────────────────────────────────────

interface ReimbursementRule {
  id: string;
  status: "active" | "expired" | "planned";
  cpo_network_id: string | null;
  cpo_contract_id: string | null;
  cpo_name: string | null;
  emsp_network_id: string | null;
  emsp_contract_id: string | null;
  emsp_name: string | null;
  agreement_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
  price_per_kwh: number;
  price_per_min: number;
  start_fee: number;
  idle_fee_per_min: number;
  currency: string;
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

interface AgreementRef {
  id: string;
  management: string | null;
  status: string;
}

const EMPTY_RULE: {
  status: ReimbursementRule["status"];
  cpo_network_id: string;
  cpo_contract_id: string;
  cpo_name: string;
  emsp_network_id: string;
  emsp_contract_id: string;
  emsp_name: string;
  agreement_id: string;
  valid_from: string;
  valid_to: string;
  price_per_kwh: number;
  price_per_min: number;
  start_fee: number;
  idle_fee_per_min: number;
  currency: string;
  remarks: string;
  updated_by: string;
} = {
  status: "active",
  cpo_network_id: "",
  cpo_contract_id: "",
  cpo_name: "",
  emsp_network_id: "",
  emsp_contract_id: "",
  emsp_name: "",
  agreement_id: "",
  valid_from: "",
  valid_to: "",
  price_per_kwh: 0,
  price_per_min: 0,
  start_fee: 0,
  idle_fee_per_min: 0,
  currency: "EUR",
  remarks: "",
  updated_by: "",
};

type SortKey = "status" | "cpo_name" | "emsp_name" | "valid_from" | "valid_to" | "price_per_kwh" | "price_per_min" | "start_fee" | "idle_fee_per_min" | "created_at";
type SortDir = "asc" | "desc";
type FilterTab = "all" | "active" | "expired" | "planned";

const PAGE_SIZE = 20;

// ── Status badge ──────────────────────────────────────────────

function RuleStatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
    active: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/25", dot: "#34D399", label: "Active" },
    expired: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/25", dot: "#F87171", label: "Expirée" },
    planned: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/25", dot: "#60A5FA", label: "Planifiée" },
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

function ReimbursementKPISkeleton() {
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

function ReimbursementTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex gap-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-16" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3.5 flex items-center gap-6">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export function ReimbursementPage() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReimbursementRule | null>(null);
  const [form, setForm] = useState(EMPTY_RULE);
  const [confirmDelete, setConfirmDelete] = useState<ReimbursementRule | null>(null);

  // ── Related data for dropdowns ──
  const { data: cpoNetworks } = useQuery<NetworkRef[]>({
    queryKey: ["cpo-networks"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("cpo_networks").select("id, name").order("name");
        if (error) { console.warn("[ReimbursementPage] cpo_networks:", error.message); return []; }
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
        if (error) { console.warn("[ReimbursementPage] cpo_contracts:", error.message); return []; }
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
        if (error) { console.warn("[ReimbursementPage] emsp_networks:", error.message); return []; }
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
        if (error) { console.warn("[ReimbursementPage] emsp_contracts:", error.message); return []; }
        return (data ?? []) as ContractRef[];
      } catch { return []; }
    },
  });

  const { data: agreements } = useQuery<AgreementRef[]>({
    queryKey: ["roaming-agreements-ref"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("roaming_agreements").select("id, management, status").order("created_at", { ascending: false });
        if (error) { console.warn("[ReimbursementPage] roaming_agreements:", error.message); return []; }
        return (data ?? []) as AgreementRef[];
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
    mutationFn: async (data: typeof EMPTY_RULE) => {
      const { data: result, error } = await supabase.from("reimbursement_rules").insert({
        status: data.status,
        cpo_network_id: data.cpo_network_id || null,
        cpo_contract_id: data.cpo_contract_id || null,
        cpo_name: data.cpo_name || null,
        emsp_network_id: data.emsp_network_id || null,
        emsp_contract_id: data.emsp_contract_id || null,
        emsp_name: data.emsp_name || null,
        agreement_id: data.agreement_id || null,
        valid_from: data.valid_from || null,
        valid_to: data.valid_to || null,
        price_per_kwh: Number(data.price_per_kwh) || 0,
        price_per_min: Number(data.price_per_min) || 0,
        start_fee: Number(data.start_fee) || 0,
        idle_fee_per_min: Number(data.idle_fee_per_min) || 0,
        currency: data.currency || "EUR",
        remarks: data.remarks || null,
        updated_by: data.updated_by || null,
      }).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reimbursement-rules"] });
      closeModal();
      toastSuccess("Règle créée", "La règle de remboursement a été ajoutée avec succès");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<typeof EMPTY_RULE>) => {
      const { data: result, error } = await supabase.from("reimbursement_rules").update({
        status: data.status,
        cpo_network_id: data.cpo_network_id || null,
        cpo_contract_id: data.cpo_contract_id || null,
        cpo_name: data.cpo_name || null,
        emsp_network_id: data.emsp_network_id || null,
        emsp_contract_id: data.emsp_contract_id || null,
        emsp_name: data.emsp_name || null,
        agreement_id: data.agreement_id || null,
        valid_from: data.valid_from || null,
        valid_to: data.valid_to || null,
        price_per_kwh: Number(data.price_per_kwh) || 0,
        price_per_min: Number(data.price_per_min) || 0,
        start_fee: Number(data.start_fee) || 0,
        idle_fee_per_min: Number(data.idle_fee_per_min) || 0,
        currency: data.currency || "EUR",
        remarks: data.remarks || null,
        updated_by: data.updated_by || null,
      }).eq("id", id).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reimbursement-rules"] });
      closeModal();
      toastSuccess("Règle modifiée", "Les modifications ont été enregistrées");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reimbursement_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reimbursement-rules"] });
      setConfirmDelete(null);
      toastSuccess("Règle supprimée", "La règle de remboursement a été supprimée");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_RULE);
    setModalOpen(true);
  }

  function openEdit(rule: ReimbursementRule) {
    setEditing(rule);
    setForm({
      status: rule.status,
      cpo_network_id: rule.cpo_network_id ?? "",
      cpo_contract_id: rule.cpo_contract_id ?? "",
      cpo_name: rule.cpo_name ?? "",
      emsp_network_id: rule.emsp_network_id ?? "",
      emsp_contract_id: rule.emsp_contract_id ?? "",
      emsp_name: rule.emsp_name ?? "",
      agreement_id: rule.agreement_id ?? "",
      valid_from: rule.valid_from ? rule.valid_from.slice(0, 10) : "",
      valid_to: rule.valid_to ? rule.valid_to.slice(0, 10) : "",
      price_per_kwh: rule.price_per_kwh,
      price_per_min: rule.price_per_min,
      start_fee: rule.start_fee,
      idle_fee_per_min: rule.idle_fee_per_min,
      currency: rule.currency,
      remarks: rule.remarks ?? "",
      updated_by: rule.updated_by ?? "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_RULE);
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
  const { data: rules, isLoading } = useQuery<ReimbursementRule[]>({
    queryKey: ["reimbursement-rules"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("reimbursement_rules")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) {
          console.warn("[ReimbursementPage] Table not found:", error.message);
          return [];
        }
        return (data ?? []) as ReimbursementRule[];
      } catch {
        return [];
      }
    },
  });

  // ── KPIs ──
  const stats = useMemo(() => {
    const list = rules ?? [];
    return {
      total: list.length,
      active: list.filter((r) => r.status === "active").length,
      expired: list.filter((r) => r.status === "expired").length,
      planned: list.filter((r) => r.status === "planned").length,
    };
  }, [rules]);

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
    let list = rules ?? [];
    if (filterTab !== "all") list = list.filter((r) => r.status === filterTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.cpo_name?.toLowerCase().includes(q) ||
          r.emsp_name?.toLowerCase().includes(q) ||
          r.remarks?.toLowerCase().includes(q) ||
          r.currency?.toLowerCase().includes(q) ||
          (r.cpo_network_id && cpoNetworkMap.get(r.cpo_network_id)?.toLowerCase().includes(q)) ||
          (r.emsp_network_id && emspNetworkMap.get(r.emsp_network_id)?.toLowerCase().includes(q))
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
  }, [rules, filterTab, search, sortKey, sortDir, cpoNetworkMap, emspNetworkMap]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginated = processed.slice(start, start + PAGE_SIZE);

  // ── Tab counts ──
  const tabCounts = useMemo(() => {
    const list = rules ?? [];
    return {
      all: list.length,
      active: list.filter((r) => r.status === "active").length,
      expired: list.filter((r) => r.status === "expired").length,
      planned: list.filter((r) => r.status === "planned").length,
    };
  }, [rules]);

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "Toutes" },
    { key: "active", label: "Actives" },
    { key: "expired", label: "Expirées" },
    { key: "planned", label: "Planifiées" },
  ];

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5" />;
  };

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap";

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "\u2014";

  const fmt4 = (n: number) => n.toFixed(4);
  const fmt2 = (n: number) => n.toFixed(2);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">
            Règles de Remboursement
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Gérer les tarifs de remboursement interopérateurs
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouvelle règle
        </button>
      </div>

      {/* KPIs */}
      {isLoading ? (
        <ReimbursementKPISkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Total règles" value={stats.total} icon={Receipt} color="#8892B0" />
          <KPICard label="Actives" value={stats.active} icon={CheckCircle2} color="#00D4AA" />
          <KPICard label="Expirées" value={stats.expired} icon={XCircle} color="#F87171" />
          <KPICard label="Planifiées" value={stats.planned} icon={Clock} color="#60A5FA" />
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
          placeholder="Rechercher par CPO, eMSP, réseau..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <ReimbursementTableSkeleton />
      ) : processed.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-56 bg-surface border border-border rounded-2xl">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Receipt className="w-7 h-7 text-primary" />
          </div>
          <p className="text-foreground font-medium text-lg">Aucune règle</p>
          <p className="text-sm text-foreground-muted mt-1 max-w-sm text-center">
            {search.trim()
              ? `Aucune règle ne correspond à « ${search} »`
              : "Créez votre première règle de remboursement pour définir les tarifs interopérateurs."}
          </p>
          <button
            onClick={openCreate}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Créer une règle
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
                  <th className={thClass}>Réseau CPO</th>
                  <th className={thClass}>Contrat CPO</th>
                  <th className={thClass} onClick={() => handleSort("cpo_name")}>
                    CPO <SortIcon col="cpo_name" />
                  </th>
                  <th className={thClass}>Réseau eMSP</th>
                  <th className={thClass}>Contrat eMSP</th>
                  <th className={thClass} onClick={() => handleSort("emsp_name")}>
                    eMSP <SortIcon col="emsp_name" />
                  </th>
                  <th className={thClass} onClick={() => handleSort("valid_from")}>
                    Valide du <SortIcon col="valid_from" />
                  </th>
                  <th className={thClass} onClick={() => handleSort("valid_to")}>
                    Valide au <SortIcon col="valid_to" />
                  </th>
                  <th className={cn(thClass, "text-right")} onClick={() => handleSort("price_per_kwh")}>
                    Prix/kWh <SortIcon col="price_per_kwh" />
                  </th>
                  <th className={cn(thClass, "text-right")} onClick={() => handleSort("price_per_min")}>
                    Prix/min <SortIcon col="price_per_min" />
                  </th>
                  <th className={cn(thClass, "text-right")} onClick={() => handleSort("start_fee")}>
                    Frais démarrage <SortIcon col="start_fee" />
                  </th>
                  <th className={cn(thClass, "text-right")} onClick={() => handleSort("idle_fee_per_min")}>
                    Frais idle <SortIcon col="idle_fee_per_min" />
                  </th>
                  <th className={cn(thClass, "text-right w-20")}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((rule) => (
                  <tr key={rule.id} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3">
                      <RuleStatusBadge status={rule.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[130px]">
                      {rule.cpo_network_id ? cpoNetworkMap.get(rule.cpo_network_id) ?? rule.cpo_network_id : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[130px]">
                      {rule.cpo_contract_id ? cpoContractMap.get(rule.cpo_contract_id) ?? rule.cpo_contract_id : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground truncate max-w-[130px]">
                      {rule.cpo_name ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[130px]">
                      {rule.emsp_network_id ? emspNetworkMap.get(rule.emsp_network_id) ?? rule.emsp_network_id : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[130px]">
                      {rule.emsp_contract_id ? emspContractMap.get(rule.emsp_contract_id) ?? rule.emsp_contract_id : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground truncate max-w-[130px]">
                      {rule.emsp_name ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                      {formatDate(rule.valid_from)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                      {formatDate(rule.valid_to)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-right tabular-nums font-semibold">
                      {fmt4(rule.price_per_kwh)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-right tabular-nums font-semibold">
                      {fmt4(rule.price_per_min)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-right tabular-nums font-semibold">
                      {fmt2(rule.start_fee)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-right tabular-nums font-semibold">
                      {fmt4(rule.idle_fee_per_min)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(rule)}
                          className="p-1.5 text-foreground-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(rule)}
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
      <SlideOver open={modalOpen} onClose={closeModal} title={editing ? "Modifier la règle" : "Nouvelle règle"} maxWidth="max-w-xl">
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Statut *</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ReimbursementRule["status"] }))}
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="active">Active</option>
              <option value="expired">Expirée</option>
              <option value="planned">Planifiée</option>
            </select>
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
            <div className="mt-3">
              <label className="block text-xs text-foreground-muted mb-1">Nom CPO</label>
              <input
                value={form.cpo_name}
                onChange={(e) => setForm((f) => ({ ...f, cpo_name: e.target.value }))}
                placeholder="Nom du CPO"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
              />
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
            <div className="mt-3">
              <label className="block text-xs text-foreground-muted mb-1">Nom eMSP</label>
              <input
                value={form.emsp_name}
                onChange={(e) => setForm((f) => ({ ...f, emsp_name: e.target.value }))}
                placeholder="Nom de l'eMSP"
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Accord de roaming</label>
            <select
              value={form.agreement_id}
              onChange={(e) => setForm((f) => ({ ...f, agreement_id: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="">-- Aucun --</option>
              {(agreements ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.management ?? a.id.slice(0, 8)} ({a.status})</option>
              ))}
            </select>
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

          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-foreground-muted mb-3">Tarification</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-foreground-muted mb-1">Prix par kWh</label>
                <input
                  type="number"
                  min={0}
                  step={0.0001}
                  value={form.price_per_kwh}
                  onChange={(e) => setForm((f) => ({ ...f, price_per_kwh: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs text-foreground-muted mb-1">Prix par minute</label>
                <input
                  type="number"
                  min={0}
                  step={0.0001}
                  value={form.price_per_min}
                  onChange={(e) => setForm((f) => ({ ...f, price_per_min: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs text-foreground-muted mb-1">Frais de démarrage</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.start_fee}
                  onChange={(e) => setForm((f) => ({ ...f, start_fee: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs text-foreground-muted mb-1">Frais idle par minute</label>
                <input
                  type="number"
                  min={0}
                  step={0.0001}
                  value={form.idle_fee_per_min}
                  onChange={(e) => setForm((f) => ({ ...f, idle_fee_per_min: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50 tabular-nums"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Devise</label>
            <input
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              placeholder="EUR"
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 uppercase font-mono"
            />
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
        title="Supprimer cette règle ?"
        description="Cette règle de remboursement sera définitivement supprimée. Cette action est irréversible."
        confirmLabel="Supprimer"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
