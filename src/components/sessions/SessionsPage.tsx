import { useState, useMemo } from "react";
import {
  Activity,
  Zap,
  Clock,
  BatteryCharging,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  FileText,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Skeleton, TableSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { downloadCSV, todayISO } from "@/lib/export";

// ── Types ────────────────────────────────────────────────────

interface Transaction {
  id: string;
  transaction_id: number;
  chargepoint_id: string;
  connector_id: number;
  station_id: string;
  consumer_id: string | null;
  id_tag: string | null;
  status: "Active" | "Completed" | "Faulted" | "Timeout";
  started_at: string;
  stopped_at: string | null;
  meter_start: number;
  meter_stop: number | null;
  energy_kwh: number | null;
  stop_reason: string | null;
  stations: { name: string; city: string; address: string };
}

type StatusFilter = "all" | "Active" | "Completed" | "Faulted" | "Timeout";

const PAGE_SIZE = 20;

// ── Status config ────────────────────────────────────────────

const STATUS_CONFIG: Record<
  Transaction["status"],
  {
    label: string;
    color: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    pulse?: boolean;
  }
> = {
  Active: {
    label: "Active",
    color: "#00D4AA",
    bgClass: "bg-[#00D4AA]/10",
    textClass: "text-[#00D4AA]",
    borderClass: "border-[#00D4AA]/30",
    pulse: true,
  },
  Completed: {
    label: "Terminée",
    color: "#4ECDC4",
    bgClass: "bg-[#4ECDC4]/10",
    textClass: "text-[#4ECDC4]",
    borderClass: "border-[#4ECDC4]/30",
  },
  Faulted: {
    label: "Erreur",
    color: "#FF6B6B",
    bgClass: "bg-[#FF6B6B]/10",
    textClass: "text-[#FF6B6B]",
    borderClass: "border-[#FF6B6B]/30",
  },
  Timeout: {
    label: "Timeout",
    color: "#FFA726",
    bgClass: "bg-[#FFA726]/10",
    textClass: "text-[#FFA726]",
    borderClass: "border-[#FFA726]/30",
  },
};

const FILTER_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "Active", label: "Actives" },
  { key: "Completed", label: "Terminées" },
  { key: "Faulted", label: "En erreur" },
];

// ── Helpers ──────────────────────────────────────────────────

function formatSessionDuration(
  startedAt: string,
  stoppedAt: string | null
): string {
  if (!stoppedAt) {
    const now = new Date();
    const start = new Date(startedAt);
    const diffMs = now.getTime() - start.getTime();
    const totalMin = Math.floor(diffMs / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  }
  const start = new Date(startedAt);
  const stop = new Date(stoppedAt);
  const diffMs = stop.getTime() - start.getTime();
  const totalMin = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEnergy(kwh: number | null): string {
  if (kwh === null || kwh === undefined) return "—";
  return `${kwh.toFixed(1)} kWh`;
}

// ── Component ────────────────────────────────────────────────

export function SessionsPage() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Main sessions query (server-side paginated) ──
  const {
    data: sessionsData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["sessions", page, statusFilter],
    retry: false,
    queryFn: async () => {
      try {
        let query = supabase
          .from("ocpp_transactions")
          .select("*, stations(name, city, address)", { count: "exact" })
          .order("started_at", { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (statusFilter !== "all") query = query.eq("status", statusFilter);
        const { data, error, count } = await query;
        if (error) { console.warn("[Sessions] main query:", error.message); return { data: [] as Transaction[], total: 0 }; }
        return { data: (data ?? []) as Transaction[], total: count ?? 0 };
      } catch { return { data: [] as Transaction[], total: 0 }; }
    },
  });

  // ── Aggregate: total sessions ──
  const { data: totalCount } = useQuery({
    queryKey: ["sessions-total"],
    retry: false,
    queryFn: async () => {
      try {
        const { count, error } = await supabase
          .from("ocpp_transactions")
          .select("*", { count: "exact", head: true });
        if (error) return 0;
        return count ?? 0;
      } catch { return 0; }
    },
  });

  // ── Aggregate: active sessions ──
  const { data: activeCount } = useQuery({
    queryKey: ["sessions-active"],
    retry: false,
    queryFn: async () => {
      try {
        const { count, error } = await supabase
          .from("ocpp_transactions")
          .select("*", { count: "exact", head: true })
          .eq("status", "Active");
        if (error) return 0;
        return count ?? 0;
      } catch { return 0; }
    },
  });

  // ── Aggregate: total energy ──
  const { data: totalEnergy } = useQuery({
    queryKey: ["sessions-energy"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("ocpp_transactions")
          .select("energy_kwh")
          .not("energy_kwh", "is", null);
        if (error) return 0;
        return data?.reduce((sum, r) => sum + (r.energy_kwh ?? 0), 0) ?? 0;
      } catch { return 0; }
    },
  });

  // ── Aggregate: average duration ──
  const { data: avgDuration } = useQuery({
    queryKey: ["sessions-avg-duration"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("ocpp_transactions")
          .select("started_at, stopped_at")
          .not("stopped_at", "is", null)
          .limit(1000);
        if (error || !data || data.length === 0) return 0;
        const totalMinutes = data.reduce((sum, r) => {
          const start = new Date(r.started_at).getTime();
          const stop = new Date(r.stopped_at!).getTime();
          return sum + (stop - start) / 60000;
        }, 0);
        return Math.round(totalMinutes / data.length);
      } catch { return 0; }
    },
  });

  // ── Client-side search filter on displayed page ──
  const filteredSessions = useMemo(() => {
    if (!sessionsData?.data) return [];
    if (!searchQuery.trim()) return sessionsData.data;
    const q = searchQuery.toLowerCase();
    return sessionsData.data.filter(
      (t) =>
        String(t.transaction_id).includes(q) ||
        t.chargepoint_id.toLowerCase().includes(q) ||
        t.stations.name.toLowerCase().includes(q) ||
        t.stations.city.toLowerCase().includes(q) ||
        (t.id_tag?.toLowerCase().includes(q) ?? false)
    );
  }, [sessionsData?.data, searchQuery]);

  const totalPages = Math.max(
    1,
    Math.ceil((sessionsData?.total ?? 0) / PAGE_SIZE)
  );

  function handleFilterChange(filter: StatusFilter) {
    setStatusFilter(filter);
    setPage(0);
  }

  function handleExport() {
    const rows = (filteredSessions ?? []).map((t) => ({
      "ID Transaction": t.transaction_id,
      Borne: t.stations.name,
      Ville: t.stations.city,
      Connecteur: t.connector_id,
      "Tag RFID": t.id_tag ?? "",
      Début: t.started_at,
      Fin: t.stopped_at ?? "",
      Durée: formatSessionDuration(t.started_at, t.stopped_at),
      "Énergie (kWh)": t.energy_kwh ?? "",
      Statut: t.status,
      "Raison arrêt": t.stop_reason ?? "",
    }));
    downloadCSV(rows, `ezdrive-sessions-cdr-${todayISO()}.csv`);
  }

  function formatAvgDuration(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  // ── Pagination helpers ──
  function getPaginationRange(): (number | "...")[] {
    const pages: (number | "...")[] = [];
    const total = totalPages;

    if (total <= 7) {
      for (let i = 0; i < total; i++) pages.push(i);
      return pages;
    }

    pages.push(0);
    if (page > 2) pages.push("...");

    const start = Math.max(1, page - 1);
    const end = Math.min(total - 2, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);

    if (page < total - 3) pages.push("...");
    pages.push(total - 1);

    return pages;
  }

  // ── KPI loading state ──
  const kpiLoading =
    totalCount === undefined ||
    activeCount === undefined ||
    totalEnergy === undefined ||
    avgDuration === undefined;

  // ── Header th class ──
  const thClass =
    "px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider whitespace-nowrap";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">
            Sessions CDR
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Historique des sessions de charge
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={!filteredSessions.length}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border rounded-xl text-xs text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* KPI Row */}
      {kpiLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-surface border border-border rounded-2xl p-5 space-y-3"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="space-y-1.5">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total sessions */}
          <div className="bg-surface border border-border rounded-2xl p-5 flex items-center gap-4 transition-all hover:border-opacity-80">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#8892B015" }}
            >
              <FileText className="w-6 h-6" style={{ color: "#8892B0" }} />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">
                {(totalCount ?? 0).toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-foreground-muted mt-0.5">
                Total sessions
              </p>
            </div>
          </div>

          {/* Active sessions */}
          <div className="bg-surface border border-[#00D4AA]/30 rounded-2xl p-5 flex items-center gap-4 transition-all hover:border-opacity-80">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#00D4AA15" }}
            >
              <Activity className="w-6 h-6" style={{ color: "#00D4AA" }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-heading font-bold text-foreground">
                  {activeCount ?? 0}
                </p>
                {(activeCount ?? 0) > 0 && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00D4AA] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#00D4AA]" />
                  </span>
                )}
              </div>
              <p className="text-xs text-foreground-muted mt-0.5">
                Sessions actives
              </p>
            </div>
          </div>

          {/* Total energy */}
          <div className="bg-surface border border-[#4ECDC4]/30 rounded-2xl p-5 flex items-center gap-4 transition-all hover:border-opacity-80">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#4ECDC415" }}
            >
              <Zap className="w-6 h-6" style={{ color: "#4ECDC4" }} />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">
                {totalEnergy !== undefined
                  ? totalEnergy >= 1000
                    ? `${(totalEnergy / 1000).toFixed(1)} MWh`
                    : `${totalEnergy.toFixed(0)} kWh`
                  : "—"}
              </p>
              <p className="text-xs text-foreground-muted mt-0.5">
                Énergie totale
              </p>
            </div>
          </div>

          {/* Average duration */}
          <div className="bg-surface border border-border rounded-2xl p-5 flex items-center gap-4 transition-all hover:border-opacity-80">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#FFA72615" }}
            >
              <Clock className="w-6 h-6" style={{ color: "#FFA726" }} />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">
                {avgDuration !== undefined
                  ? formatAvgDuration(avgDuration)
                  : "—"}
              </p>
              <p className="text-xs text-foreground-muted mt-0.5">
                Durée moyenne
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Status filter tabs */}
        <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleFilterChange(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === tab.key
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.key === "Active" && (activeCount ?? 0) > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-[#00D4AA]/15 text-[#00D4AA] text-[10px] font-bold">
                  {activeCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted" />
          <input
            type="text"
            placeholder="Rechercher ID, borne, tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>
      </div>

      {/* Data Table */}
      {isLoading ? (
        <TableSkeleton rows={10} />
      ) : isError ? (
        <ErrorState
          message="Impossible de charger les sessions"
          onRetry={() => refetch()}
        />
      ) : filteredSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 bg-surface border border-border rounded-2xl">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
            <BatteryCharging className="w-6 h-6 text-primary" />
          </div>
          <p className="text-foreground font-medium">Aucune session trouvée</p>
          <p className="text-sm text-foreground-muted mt-1">
            {statusFilter !== "all"
              ? "Aucune session avec ce filtre. Essayez un autre statut."
              : "Aucune session de charge enregistrée."}
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <th className={thClass}>ID Transaction</th>
                  <th className={thClass}>Borne</th>
                  <th className={thClass}>Connecteur</th>
                  <th className={thClass}>Tag RFID</th>
                  <th className={thClass}>Début</th>
                  <th className={thClass}>Fin</th>
                  <th className={thClass}>Durée</th>
                  <th className={thClass}>Énergie</th>
                  <th className={thClass}>Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredSessions.map((tx) => {
                  const config = STATUS_CONFIG[tx.status];
                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-surface-elevated/50 transition-colors"
                    >
                      {/* Transaction ID */}
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono font-medium text-foreground">
                          #{tx.transaction_id}
                        </span>
                      </td>

                      {/* Station */}
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {tx.stations.name}
                          </p>
                          <p className="text-xs text-foreground-muted">
                            {tx.stations.city}
                          </p>
                        </div>
                      </td>

                      {/* Connector */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-surface-elevated text-xs font-semibold text-foreground-muted border border-border">
                          {tx.connector_id}
                        </span>
                      </td>

                      {/* RFID Tag */}
                      <td className="px-4 py-3">
                        {tx.id_tag ? (
                          <span className="text-xs font-mono px-2 py-1 rounded-md bg-surface-elevated border border-border text-foreground-muted">
                            {tx.id_tag}
                          </span>
                        ) : (
                          <span className="text-xs text-foreground-muted/50">
                            —
                          </span>
                        )}
                      </td>

                      {/* Start */}
                      <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                        {formatDateTime(tx.started_at)}
                      </td>

                      {/* End */}
                      <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                        {tx.stopped_at ? (
                          formatDateTime(tx.stopped_at)
                        ) : (
                          <span className="text-[#00D4AA] text-xs font-medium">
                            En cours...
                          </span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="px-4 py-3">
                        <span
                          className={`text-sm font-medium ${
                            tx.status === "Active"
                              ? "text-[#00D4AA]"
                              : "text-foreground"
                          }`}
                        >
                          {formatSessionDuration(tx.started_at, tx.stopped_at)}
                        </span>
                      </td>

                      {/* Energy */}
                      <td className="px-4 py-3">
                        <span
                          className={`text-sm font-semibold ${
                            tx.energy_kwh !== null
                              ? "text-[#00D4AA]"
                              : "text-foreground-muted/50"
                          }`}
                        >
                          {formatEnergy(tx.energy_kwh)}
                        </span>
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${config.bgClass} ${config.textClass} ${config.borderClass}`}
                        >
                          {config.pulse ? (
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: config.color }} />
                              <span
                                className="relative inline-flex rounded-full h-1.5 w-1.5"
                                style={{ backgroundColor: config.color }}
                              />
                            </span>
                          ) : (
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: config.color }}
                            />
                          )}
                          {config.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-foreground-muted">
                {page * PAGE_SIZE + 1}–
                {Math.min((page + 1) * PAGE_SIZE, sessionsData?.total ?? 0)} sur{" "}
                {(sessionsData?.total ?? 0).toLocaleString("fr-FR")} sessions
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Page précédente"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {getPaginationRange().map((p, i) =>
                  p === "..." ? (
                    <span
                      key={`ellipsis-${i}`}
                      className="px-1.5 text-xs text-foreground-muted"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`min-w-[2rem] h-8 px-2 rounded-lg text-xs font-medium transition-colors ${
                        page === p
                          ? "bg-primary/15 text-primary border border-primary/30"
                          : "text-foreground-muted hover:text-foreground hover:bg-surface-elevated"
                      }`}
                    >
                      {(p as number) + 1}
                    </button>
                  )
                )}

                <button
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Page suivante"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
