// ============================================================
// EZDrive — Drivers Page
// View and manage consumer/driver profiles (from GFX CDR sync)
// ============================================================

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
  Zap,
  X,
  Eye,
  Activity,
  Plus,
  Download,
  Pencil,
  Building2,
  GitMerge,
  Clock,
  Loader2,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { KPICard } from "@/components/ui/KPICard";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHelp } from "@/components/ui/PageHelp";
import { useCpo } from "@/contexts/CpoContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { downloadCSV, todayISO } from "@/lib/export";

// ── Types ─────────────────────────────────────────────────────

interface Driver {
  id: string;
  driver_external_id: string;
  full_name: string | null; // computed from first_name + last_name
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  status: string | null;
  retail_package: string | null;
  emsp_contract: string | null;
  customer_name: string | null;
  cpo_name: string | null;
  total_sessions: number;
  total_energy_kwh: number;
  first_session_at: string | null;
  last_session_at: string | null;
  source: string | null;
  created_at: string;
}

const TABS = ["Tous", "Actifs", "Inactifs"] as const;
type Tab = (typeof TABS)[number];

type SortKey =
  | "full_name"
  | "customer_name"
  | "total_sessions"
  | "total_energy_kwh"
  | "last_session_at"
  | "first_session_at";

type SortDir = "asc" | "desc";
const PAGE_SIZE = 25;

// ── Formatters ───────────────────────────────────────────────

function formatEnergy(kwh: number): string {
  if (kwh >= 1000) return (kwh / 1000).toFixed(1) + " MWh";
  return kwh.toFixed(1) + " kWh";
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} sem.`;
  if (diffDays < 365) return `Il y a ${Math.floor(diffDays / 30)} mois`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function nameToHue(name: string | null): number {
  if (!name) return 200;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}

// ── Main Page ─────────────────────────────────────────────────

export function DriversPage() {
  const { selectedCpoId } = useCpo();

  const {
    data: drivers,
    isLoading,
    isError,
    refetch,
  } = useQuery<Driver[]>({
    queryKey: ["drivers", selectedCpoId ?? "all"],
    retry: 1,
    queryFn: async () => {
      const PAGE = 1000;
      let allRows: Driver[] = [];
      let from = 0;
      let hasMore = true;

      // Resolve CPO name for filtering if needed
      let cpoName: string | null = null;
      if (selectedCpoId) {
        const { data: cpo } = await supabase.from("cpos").select("name").eq("id", selectedCpoId).single();
        cpoName = cpo?.name ?? null;
      }

      while (hasMore) {
        let query = supabase
          .from("all_consumers")
          .select("id, driver_external_id, first_name, last_name, email, phone, country, status, retail_package, emsp_contract, customer_name, cpo_name, total_sessions, total_energy_kwh, first_session_at, last_session_at, source, created_at")
          .order("total_sessions", { ascending: false })
          .range(from, from + PAGE - 1);

        if (cpoName) {
          query = query.eq("cpo_name", cpoName);
        }

        const { data, error } = await query;
        if (error) throw error;
        const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
          ...r,
          full_name: [r.first_name, r.last_name].filter(Boolean).join(" ") || null,
        })) as Driver[];
        allRows = allRows.concat(rows);
        from += PAGE;
        hasMore = rows.length === PAGE;
      }

      return allRows;
    },
  });

  // ── State ──
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("Tous");
  const [sortKey, setSortKey] = useState<SortKey>("total_sessions");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Driver | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // ── KPIs ──
  const kpis = useMemo(() => {
    if (!drivers) return null;
    const identified = drivers.filter((d) => d.full_name);
    const active30d = drivers.filter((d) => {
      if (!d.last_session_at) return false;
      const diff = Date.now() - new Date(d.last_session_at).getTime();
      return diff < 30 * 24 * 60 * 60 * 1000;
    });
    return {
      total: drivers.length,
      identified: identified.length,
      active30d: active30d.length,
      totalEnergy: drivers.reduce((s, d) => s + (Number(d.total_energy_kwh) || 0), 0),
    };
  }, [drivers]);

  // ── Sorting ──
  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else { setSortKey(key); setSortDir("desc"); }
      setPage(1);
    },
    [sortKey]
  );

  // ── Filter ──
  const filtered = useMemo(() => {
    if (!drivers) return [];
    let list = [...drivers];

    // Tab filter
    if (activeTab === "Actifs") {
      list = list.filter((d) => {
        if (!d.last_session_at) return false;
        return Date.now() - new Date(d.last_session_at).getTime() < 90 * 24 * 60 * 60 * 1000;
      });
    } else if (activeTab === "Inactifs") {
      list = list.filter((d) => {
        if (!d.last_session_at) return true;
        return Date.now() - new Date(d.last_session_at).getTime() >= 90 * 24 * 60 * 60 * 1000;
      });
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((d) =>
        (d.full_name ?? "").toLowerCase().includes(q) ||
        d.driver_external_id.toLowerCase().includes(q) ||
        (d.customer_name ?? "").toLowerCase().includes(q) ||
        (d.email ?? "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [drivers, activeTab, search]);

  // ── Sort ──
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
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
  }, [filtered, sortKey, sortDir]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginated = sorted.slice(start, start + PAGE_SIZE);

  const handleSearchChange = useCallback((value: string) => { setSearch(value); setPage(1); }, []);

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">Conducteurs</h1>
          <p className="text-sm text-foreground-muted mt-1">Profils des conducteurs extraits des sessions de charge</p>
        </div>
        <ErrorState message="Impossible de charger les conducteurs" onRetry={() => refetch()} />
      </div>
    );
  }

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
          <h1 className="font-heading text-xl font-bold text-foreground">Conducteurs</h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Profils extraits des sessions de charge (CDRs)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isLoading && drivers && (
            <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/25 rounded-lg px-3 py-1.5 text-xs font-semibold">
              <Users className="w-3.5 h-3.5" />
              {drivers.length.toLocaleString("fr-FR")} conducteur{drivers.length !== 1 ? "s" : ""}
            </span>
          )}
          {/* Story 71: Export CSV */}
          <button
            onClick={() => {
              if (!filtered.length) return;
              const rows = filtered.map((d) => ({
                nom: d.full_name ?? "",
                email: d.email ?? "",
                phone: d.phone ?? "",
                groupe: d.customer_name ?? "",
                sessions: d.total_sessions,
                energy_kwh: Number(d.total_energy_kwh).toFixed(1),
                derniere_charge: d.last_session_at ?? "",
              }));
              downloadCSV(rows, `conducteurs-${todayISO()}.csv`);
            }}
            disabled={!filtered.length}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-elevated border border-border rounded-lg text-xs font-medium text-foreground-muted hover:text-foreground hover:bg-surface transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            Exporter CSV
          </button>
          {/* Story 67: Create driver */}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Nouveau conducteur
          </button>
        </div>
      </div>

      <PageHelp
        summary="Gestion des conducteurs (utilisateurs finaux) identifiés via les sessions de charge"
        items={[
          { label: "Conducteur", description: "Identifié par son driver_external_id dans les CDRs (nom, UUID, ou ID GFX App)." },
          { label: "Token", description: "Badge RFID ou identifiant d'application utilisé pour s'authentifier sur les bornes." },
          { label: "Groupe", description: "Client B2B ou customer_external_id rattaché au conducteur." },
          { label: "Actif/Inactif", description: "Un conducteur est considéré actif s'il a chargé dans les 90 derniers jours." },
        ]}
      />

      {/* KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-surface border border-border rounded-2xl p-5 h-[88px] animate-pulse" />
          ))}
        </div>
      ) : kpis ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Total conducteurs" value={kpis.total.toLocaleString("fr-FR")} icon={Users} color="#6366f1" />
          <KPICard label="Identifiés" value={kpis.identified.toLocaleString("fr-FR")} icon={UserCheck} color="#10b981" />
          <KPICard label="Actifs (30j)" value={kpis.active30d.toLocaleString("fr-FR")} icon={Activity} color="#f59e0b" />
          <KPICard label="Énergie totale" value={formatEnergy(kpis.totalEnergy)} icon={Zap} color="#8b5cf6" />
        </div>
      ) : null}

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex gap-1 border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setPage(1); }}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors relative",
                activeTab === tab ? "text-primary" : "text-foreground-muted hover:text-foreground"
              )}
            >
              {tab}
              {activeTab === tab && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            type="text"
            placeholder="Rechercher par nom, token, groupe..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="bg-surface border border-border rounded-2xl p-6 h-[400px] animate-pulse" />
      ) : sorted.length === 0 && search.trim() ? (
        <div className="flex flex-col items-center justify-center h-48 bg-surface border border-border rounded-2xl">
          <Search className="w-8 h-8 text-foreground-muted mb-3" />
          <p className="text-foreground font-medium">Aucun résultat</p>
          <p className="text-sm text-foreground-muted mt-1">Aucun conducteur ne correspond à « {search} »</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-56 bg-surface border border-border rounded-2xl">
          <UserX className="w-10 h-10 text-foreground-muted mb-4" />
          <p className="text-foreground font-medium text-lg">Aucun conducteur</p>
          <p className="text-sm text-foreground-muted mt-1">Les conducteurs apparaîtront après synchronisation des CDRs.</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">État</th>
                  <th className={thClass} onClick={() => handleSort("full_name")}>Conducteur <SortIcon col="full_name" /></th>
                  <th className={thClass} onClick={() => handleSort("customer_name")}>Forfait / Groupe <SortIcon col="customer_name" /></th>
                  <th className={thClass}>Pays</th>
                  <th className={cn(thClass, "text-right")} onClick={() => handleSort("total_sessions")}>Sessions <SortIcon col="total_sessions" /></th>
                  <th className={cn(thClass, "text-right")} onClick={() => handleSort("total_energy_kwh")}>Énergie <SortIcon col="total_energy_kwh" /></th>
                  <th className={thClass} onClick={() => handleSort("last_session_at")}>Dernière charge <SortIcon col="last_session_at" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((driver) => {
                  const hue = nameToHue(driver.full_name ?? driver.driver_external_id);
                  const displayName = driver.full_name || driver.driver_external_id;
                  const isActive = driver.last_session_at
                    ? Date.now() - new Date(driver.last_session_at).getTime() < 90 * 24 * 60 * 60 * 1000
                    : false;

                  return (
                    <tr
                      key={driver.id}
                      className="hover:bg-surface-elevated/50 transition-colors cursor-pointer"
                      onClick={() => setDetail(driver)}
                    >
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex px-2 py-0.5 rounded-full text-xs font-semibold",
                          isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-foreground-muted/10 text-foreground-muted"
                        )}>
                          {isActive ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ backgroundColor: `hsl(${hue}, 45%, 25%)`, color: `hsl(${hue}, 70%, 75%)` }}
                          >
                            {getInitials(driver.full_name ?? driver.driver_external_id)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate max-w-[200px]">{displayName}</p>
                            <p className="text-xs text-foreground-muted truncate max-w-[200px]">
                              {driver.email ?? driver.driver_external_id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[180px]">
                        {driver.retail_package ?? driver.customer_name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">
                        {driver.country ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted text-right tabular-nums">
                        {driver.total_sessions.toLocaleString("fr-FR")}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted text-right tabular-nums">
                        {formatEnergy(Number(driver.total_energy_kwh))}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                        {driver.last_session_at ? formatRelativeDate(driver.last_session_at) : "—"}
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
                {start + 1}–{Math.min(start + PAGE_SIZE, sorted.length)} sur {sorted.length} conducteur{sorted.length !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "…" ? (
                      <span key={"e" + i} className="px-1.5 text-xs text-foreground-muted">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        className={`min-w-[2rem] h-8 px-2 rounded-lg text-xs font-medium transition-colors ${
                          safePage === p
                            ? "bg-primary/15 text-primary border border-primary/30"
                            : "text-foreground-muted hover:text-foreground hover:bg-surface-elevated"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Drawer */}
      {detail && <DriverDetailDrawer driver={detail} onClose={() => setDetail(null)} onRefresh={() => refetch()} />}

      {/* Story 67: Create Driver Modal */}
      {showCreate && <CreateDriverModal onClose={() => setShowCreate(false)} cpoId={selectedCpoId} onCreated={() => { setShowCreate(false); refetch(); }} />}
    </div>
  );
}

// ── Driver Detail Drawer ──────────────────────────────────────

function DriverDetailDrawer({ driver, onClose, onRefresh }: { driver: Driver; onClose: () => void; onRefresh: () => void }) {
  const hue = nameToHue(driver.full_name ?? driver.driver_external_id);
  const displayName = driver.full_name || driver.driver_external_id;
  const isActive = driver.last_session_at
    ? Date.now() - new Date(driver.last_session_at).getTime() < 90 * 24 * 60 * 60 * 1000
    : false;

  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: driver.first_name ?? "", last_name: driver.last_name ?? "", email: driver.email ?? "", phone: driver.phone ?? "" });
  const [showB2BAssign, setShowB2BAssign] = useState(false);
  const [b2bSearch, setB2bSearch] = useState("");
  const [showMerge, setShowMerge] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeTarget, setMergeTarget] = useState<Driver | null>(null);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);

  // Story 68: Edit mutation
  const editMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("gfx_consumers").update({
        first_name: editForm.first_name || null,
        last_name: editForm.last_name || null,
        email: editForm.email || null,
        phone: editForm.phone || null,
      }).eq("id", driver.id);
      if (error) throw error;
    },
    onSuccess: () => { setEditing(false); onRefresh(); },
  });

  // Story 69: B2B clients list
  const { data: b2bClients } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["b2b-clients-list"],
    enabled: showB2BAssign,
    queryFn: async () => {
      const { data } = await supabase.from("b2b_clients").select("id, name").order("name");
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const b2bAssignMutation = useMutation({
    mutationFn: async (clientName: string) => {
      const { error } = await supabase.from("gfx_consumers").update({ customer_name: clientName }).eq("id", driver.id);
      if (error) throw error;
    },
    onSuccess: () => { setShowB2BAssign(false); onRefresh(); },
  });

  // Story 70: Session history
  const { data: sessionHistory } = useQuery<Array<{ id: string; start_date_time: string; location_name: string; total_energy: number; total_cost: number }>>({
    queryKey: ["driver-sessions", driver.driver_external_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ocpi_cdrs")
        .select("id, start_date_time, location_name, total_energy, total_cost")
        .eq("driver_external_id", driver.driver_external_id)
        .order("start_date_time", { ascending: false })
        .limit(20);
      return (data ?? []) as Array<{ id: string; start_date_time: string; location_name: string; total_energy: number; total_cost: number }>;
    },
  });

  // Story 72: Merge - search duplicates
  const { data: mergeCandidates } = useQuery<Driver[]>({
    queryKey: ["merge-driver-search", mergeSearch],
    enabled: mergeSearch.length >= 2 && showMerge,
    queryFn: async () => {
      const { data } = await supabase
        .from("all_consumers")
        .select("id, driver_external_id, first_name, last_name, email, phone, country, status, retail_package, emsp_contract, customer_name, cpo_name, total_sessions, total_energy_kwh, first_session_at, last_session_at, source, created_at")
        .or(`first_name.ilike.%${mergeSearch}%,last_name.ilike.%${mergeSearch}%,driver_external_id.ilike.%${mergeSearch}%`)
        .neq("id", driver.id)
        .limit(10);
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ ...r, full_name: [r.first_name, r.last_name].filter(Boolean).join(" ") || null })) as Driver[];
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async () => {
      if (!mergeTarget) throw new Error("Sélectionnez un conducteur");
      // Transfer tokens from mergeTarget to current driver
      await supabase.from("gfx_tokens").update({ driver_external_id: driver.driver_external_id, driver_name: displayName }).eq("driver_external_id", mergeTarget.driver_external_id);
      // Delete the duplicate
      await supabase.from("gfx_consumers").delete().eq("id", mergeTarget.id);
    },
    onSuccess: () => { setShowMerge(false); setShowMergeConfirm(false); onRefresh(); },
  });

  const inputClass = "w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-border-focus transition-colors";

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-surface border-l border-border z-50 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{ backgroundColor: `hsl(${hue}, 45%, 25%)`, color: `hsl(${hue}, 70%, 75%)` }}
            >
              {getInitials(driver.full_name ?? driver.driver_external_id)}
            </div>
            <div>
              <h2 className="font-heading font-bold text-base">{displayName}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={cn(
                  "inline-flex px-2 py-0.5 rounded-full text-xs font-semibold",
                  isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-foreground-muted/10 text-foreground-muted"
                )}>
                  {isActive ? "Actif" : "Inactif"}
                </span>
                {driver.customer_name && (
                  <span className="text-xs text-foreground-muted">{driver.customer_name}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Story 68: Edit button */}
            <button onClick={() => setEditing(!editing)} className="p-1.5 hover:bg-surface-elevated rounded-lg transition-colors" title="Modifier">
              <Pencil className="w-4 h-4 text-foreground-muted" />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-surface-elevated rounded-lg transition-colors">
              <X className="w-5 h-5 text-foreground-muted" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Story 68: Edit form */}
          {editing ? (
            <div className="space-y-3 p-4 bg-surface-elevated border border-border rounded-xl">
              <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-2">Modifier le conducteur</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-foreground-muted mb-1 block">Prénom</label>
                  <input type="text" value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-foreground-muted mb-1 block">Nom</label>
                  <input type="text" value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="text-xs text-foreground-muted mb-1 block">Email</label>
                <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-foreground-muted mb-1 block">Téléphone</label>
                <input type="tel" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className={inputClass} />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setEditing(false)} className="flex-1 px-3 py-2 text-sm text-foreground-muted hover:text-foreground transition-colors">Annuler</button>
                <button onClick={() => editMutation.mutate()} disabled={editMutation.isPending} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {editMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Enregistrer
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Activité */}
              <div>
                <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-2">Activité</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface-elevated border border-border rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-foreground">{driver.total_sessions.toLocaleString("fr-FR")}</p>
                    <p className="text-xs text-foreground-muted mt-0.5">Sessions</p>
                  </div>
                  <div className="bg-surface-elevated border border-border rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-foreground">{formatEnergy(Number(driver.total_energy_kwh))}</p>
                    <p className="text-xs text-foreground-muted mt-0.5">Énergie</p>
                  </div>
                </div>
              </div>

              {/* Informations personnelles */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-2">Informations</p>
                {driver.first_name && <DetailItem label="Prénom" value={driver.first_name} />}
                {driver.last_name && <DetailItem label="Nom" value={driver.last_name} />}
                {driver.email && <DetailItem label="Email" value={driver.email} />}
                {driver.phone && <DetailItem label="Téléphone" value={driver.phone} />}
                <DetailItem label="Pays" value={driver.country ?? "—"} />
                <DetailItem label="Statut GFX" value={driver.status ?? "—"} />
              </div>

              {/* Abonnement & rattachement */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">Forfait & Rattachement</p>
                  {/* Story 69: B2B association button */}
                  <button onClick={() => setShowB2BAssign(!showB2BAssign)} className="text-xs text-primary hover:underline flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> Client B2B
                  </button>
                </div>
                <DetailItem label="Forfait" value={driver.retail_package ?? "—"} />
                <DetailItem label="Contrat eMSP" value={driver.emsp_contract ?? "—"} />
                <DetailItem label="Groupe / Client" value={driver.customer_name ?? "—"} />
                <DetailItem label="CPO" value={driver.cpo_name ?? "—"} />

                {/* Story 69: B2B assign dropdown */}
                {showB2BAssign && (
                  <div className="mt-2 p-3 bg-surface-elevated border border-border rounded-xl space-y-2">
                    <label className="text-xs text-foreground-muted">Associer à un client B2B</label>
                    <select
                      onChange={(e) => { if (e.target.value) b2bAssignMutation.mutate(e.target.value); }}
                      className={inputClass}
                      defaultValue=""
                    >
                      <option value="" disabled>Sélectionner un client...</option>
                      {(b2bClients ?? []).map((c) => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Charge dates */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-2">Historique de charge</p>
                {driver.first_session_at && <DetailItem label="Première charge" value={formatDate(driver.first_session_at)} />}
                {driver.last_session_at && <DetailItem label="Dernière charge" value={formatRelativeDate(driver.last_session_at)} />}
              </div>

              {/* Story 70: Session History */}
              {sessionHistory && sessionHistory.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-2">
                    <Clock className="w-3.5 h-3.5 inline mr-1" />
                    Sessions récentes
                  </p>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {sessionHistory.map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-xs py-2 px-3 bg-surface-elevated border border-border rounded-lg">
                        <div className="min-w-0 flex-1">
                          <p className="text-foreground font-medium truncate">{s.location_name ?? "Station"}</p>
                          <p className="text-foreground-muted">{new Date(s.start_date_time).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</p>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-foreground font-medium">{Number(s.total_energy).toFixed(1)} kWh</p>
                          <p className="text-foreground-muted">{Number(s.total_cost).toFixed(2)} €</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2 pt-3 border-t border-border">
                <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-2">Actions</p>
                {/* Story 72: Merge */}
                <button onClick={() => setShowMerge(!showMerge)} className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-xs font-medium hover:bg-amber-500/20 transition-colors">
                  <GitMerge className="w-3.5 h-3.5" /> Fusionner
                </button>
                {showMerge && (
                  <div className="p-3 bg-surface-elevated border border-border rounded-xl space-y-2">
                    <label className="text-xs text-foreground-muted">Rechercher un doublon à fusionner</label>
                    <input
                      type="text"
                      placeholder="Rechercher par nom..."
                      value={mergeTarget ? (mergeTarget.full_name ?? mergeTarget.driver_external_id) : mergeSearch}
                      onChange={(e) => { setMergeSearch(e.target.value); setMergeTarget(null); }}
                      className={inputClass}
                    />
                    {mergeCandidates && mergeCandidates.length > 0 && !mergeTarget && (
                      <div className="max-h-36 overflow-y-auto border border-border rounded-lg">
                        {mergeCandidates.map((d) => (
                          <button key={d.id} onClick={() => setMergeTarget(d)} className="w-full px-3 py-2 text-left hover:bg-surface text-sm text-foreground">
                            {d.full_name ?? d.driver_external_id} <span className="text-foreground-muted">({d.total_sessions} sessions)</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {mergeTarget && (
                      <button onClick={() => setShowMergeConfirm(true)} className="w-full px-3 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-500 transition-colors">
                        Fusionner avec {mergeTarget.full_name ?? mergeTarget.driver_external_id}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ID externe */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-2">Identifiants</p>
            <p className="text-xs text-foreground font-mono bg-surface-elevated border border-border rounded-lg px-3 py-2 break-all">
              {driver.driver_external_id}
            </p>
            {driver.source && (
              <p className="text-xs text-foreground-muted">
                Source: <span className="font-medium">{driver.source === "gfx_crm" ? "API GreenFlux CRM" : "Extraction CDRs"}</span>
              </p>
            )}
          </div>

          {/* ID technique */}
          <div className="pt-3 border-t border-border">
            <p className="text-xs text-foreground-muted">
              ID: <span className="font-mono text-foreground">{driver.id}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Story 72: Merge confirmation */}
      <ConfirmDialog
        open={showMergeConfirm}
        onConfirm={() => mergeMutation.mutate()}
        onCancel={() => setShowMergeConfirm(false)}
        title="Fusionner les conducteurs"
        description={`Les tokens et sessions de "${mergeTarget?.full_name ?? mergeTarget?.driver_external_id ?? ""}" seront transférés vers "${displayName}". Le doublon sera supprimé.`}
        confirmLabel="Fusionner"
        variant="warning"
        loading={mergeMutation.isPending}
        loadingLabel="Fusion..."
      />
    </>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
      <span className="text-foreground-muted">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}

// ── Story 67: Create Driver Modal ─────────────────────────────

function CreateDriverModal({ onClose, cpoId, onCreated }: { onClose: () => void; cpoId: string | null; onCreated: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", customer_group: "" });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.first_name.trim() || !form.last_name.trim()) throw new Error("Prénom et nom requis");
      const driverExternalId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { error } = await supabase.from("gfx_consumers").insert({
        id: crypto.randomUUID(),
        driver_external_id: driverExternalId,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        full_name: `${form.first_name.trim()} ${form.last_name.trim()}`,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        customer_name: form.customer_group.trim() || null,
        cpo_id: cpoId,
        status: "active",
        total_sessions: 0,
        total_energy_kwh: 0,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      onCreated();
    },
  });

  const inputClass = "w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors";

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-x-4 top-[10%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[520px] bg-surface border border-border rounded-2xl z-50 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-lg">Nouveau conducteur</h2>
              <p className="text-xs text-foreground-muted">Créer un profil manuellement</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-surface-elevated rounded-lg transition-colors">
            <X className="w-5 h-5 text-foreground-muted" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Prénom *</label>
              <input type="text" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="Jean" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nom *</label>
              <input type="text" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Dupont" className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jean.dupont@email.com" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Téléphone</label>
            <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+33 6 12 34 56 78" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Groupe client</label>
            <input type="text" value={form.customer_group} onChange={(e) => setForm({ ...form, customer_group: e.target.value })} placeholder="Nom du client B2B" className={inputClass} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors">Annuler</button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !form.first_name.trim() || !form.last_name.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Créer
          </button>
        </div>
        {saveMutation.isError && (
          <p className="px-6 pb-3 text-xs text-red-400">{(saveMutation.error as Error)?.message ?? "Erreur"}</p>
        )}
      </div>
    </>
  );
}
