// ============================================================
// EZDrive — Customers CRM Page
// eMSP customer management dashboard
// ============================================================

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  CreditCard,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Building2,
  UserX,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

// ── Types ────────────────────────────────────────────────────

interface ConsumerProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  user_type: string | null;
  is_company: boolean;
  company_name: string | null;
  created_at: string;
}

interface Customer extends ConsumerProfile {
  subscription_status: string | null;
  subscription_offer: string | null;
  session_count: number;
  total_energy_kwh: number;
}

type SortKey =
  | "full_name"
  | "email"
  | "user_type"
  | "subscription_status"
  | "session_count"
  | "total_energy_kwh"
  | "created_at";

type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;

// ── Formatters ───────────────────────────────────────────────

function formatEnergy(kwh: number): string {
  return kwh.toFixed(1) + " kWh";
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `Il y a ${weeks} sem.`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `Il y a ${months} mois`;
  }
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Deterministic hue from a string, for avatar backgrounds */
function nameToHue(name: string | null): number {
  if (!name) return 200;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

// ── Subscription badge ───────────────────────────────────────

function SubscriptionBadge({
  status,
  offer,
}: {
  status: string | null;
  offer: string | null;
}) {
  const config = getSubscriptionConfig(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold",
        config.bg,
        config.text,
        config.border
      )}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: config.dotColor }}
      />
      {offer ?? config.label}
    </span>
  );
}

function getSubscriptionConfig(status: string | null) {
  switch (status?.toUpperCase()) {
    case "ACTIVE":
      return {
        bg: "bg-emerald-500/10",
        text: "text-emerald-400",
        border: "border-emerald-500/25",
        dotColor: "#34D399",
        label: "Actif",
      };
    case "CANCELLED":
    case "CANCELED":
      return {
        bg: "bg-red-500/10",
        text: "text-red-400",
        border: "border-red-500/25",
        dotColor: "#F87171",
        label: "Annulé",
      };
    case "PAST_DUE":
      return {
        bg: "bg-amber-500/10",
        text: "text-amber-400",
        border: "border-amber-500/25",
        dotColor: "#FBBF24",
        label: "Impayé",
      };
    case "TRIALING":
      return {
        bg: "bg-blue-500/10",
        text: "text-blue-400",
        border: "border-blue-500/25",
        dotColor: "#60A5FA",
        label: "Essai",
      };
    default:
      return {
        bg: "bg-foreground-muted/5",
        text: "text-foreground-muted",
        border: "border-border",
        dotColor: "#8892B0",
        label: "Aucun",
      };
  }
}

// ── KPI Card (local, supports string values) ─────────────────

function CustomerKPICard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
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
      <div className="min-w-0">
        <p className="text-2xl font-heading font-bold text-foreground truncate">
          {value}
        </p>
        <p className="text-xs text-foreground-muted mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── Loading skeletons ────────────────────────────────────────

function CustomersKPISkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="bg-surface border border-border rounded-2xl p-5 space-y-3"
        >
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

function CustomersTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex gap-6">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3.5 flex items-center gap-6">
            <div className="flex items-center gap-3 flex-[2]">
              <Skeleton className="w-9 h-9 rounded-full" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page Component ──────────────────────────────────────

export function CustomersPage() {
  // ── Data fetching (direct Supabase) ──
  const {
    data: customers,
    isLoading,
    isError,
    refetch,
  } = useQuery<Customer[]>({
    queryKey: ["customers"],
    retry: 1,
    queryFn: async () => {
      // 1. Fetch all consumer profiles
      const { data: profiles, error: profErr } = await supabase
        .from("consumer_profiles")
        .select("id, email, full_name, phone, user_type, is_company, company_name, created_at")
        .order("created_at", { ascending: false });
      if (profErr) throw profErr;

      // 2. Fetch active subscriptions
      const { data: subs } = await supabase
        .from("user_subscriptions")
        .select("user_id, status, subscription_offers(name)")
        .eq("status", "active");

      // 3. Fetch session stats per user
      const { data: sessions } = await supabase
        .from("ocpp_transactions")
        .select("consumer_id, energy_kwh");

      // Build subscription map
      const subMap = new Map<string, { status: string; offer: string | null }>();
      for (const s of subs ?? []) {
        const offer = Array.isArray(s.subscription_offers)
          ? (s.subscription_offers as Record<string, unknown>[])[0]?.name as string | null
          : (s.subscription_offers as Record<string, unknown> | null)?.name as string | null;
        subMap.set(s.user_id, { status: s.status, offer });
      }

      // Build session stats map
      const sessionMap = new Map<string, { count: number; energy: number }>();
      for (const t of sessions ?? []) {
        const existing = sessionMap.get(t.consumer_id) ?? { count: 0, energy: 0 };
        existing.count += 1;
        existing.energy += t.energy_kwh ?? 0;
        sessionMap.set(t.consumer_id, existing);
      }

      // Merge all data
      return (profiles ?? []).map((p): Customer => {
        const sub = subMap.get(p.id);
        const sess = sessionMap.get(p.id) ?? { count: 0, energy: 0 };
        return {
          ...p,
          subscription_status: sub?.status ?? null,
          subscription_offer: sub?.offer ?? null,
          session_count: sess.count,
          total_energy_kwh: sess.energy,
        };
      });
    },
  });

  // Computed KPIs
  const stats = useMemo(() => {
    if (!customers) return null;
    return {
      total_customers: customers.length,
      active_subscribers: customers.filter((c) => c.subscription_status === "active").length,
      total_sessions: customers.reduce((s, c) => s + c.session_count, 0),
      total_energy: customers.reduce((s, c) => s + c.total_energy_kwh, 0),
    };
  }, [customers]);

  // ── Local state ──
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  // ── Sorting handler ──
  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
      setPage(1);
    },
    [sortKey]
  );

  // ── Search filter ──
  const filtered = useMemo(() => {
    if (!customers) return [];
    if (!search.trim()) return customers;

    const q = search.toLowerCase().trim();
    return customers.filter((c) => {
      return (
        c.full_name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.company_name?.toLowerCase().includes(q)
      );
    });
  }, [customers, search]);

  // ── Sort ──
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];

      // Handle null
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv), "fr");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginated = sorted.slice(start, start + PAGE_SIZE);

  // Reset page when search changes
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">
            Gestion Clients
          </h1>
          <p className="text-sm text-foreground-muted mt-1">
            Base de données clients eMSP
          </p>
        </div>
        <ErrorState
          message="Impossible de charger les données clients"
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  // ── Sort icon helper ──
  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="w-3.5 h-3.5 inline ml-0.5" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 inline ml-0.5" />
    );
  };

  const thClass =
    "px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap";

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="font-heading text-xl font-bold text-foreground">
              Gestion Clients
            </h1>
            <p className="text-sm text-foreground-muted mt-0.5">
              Base de données clients eMSP
            </p>
          </div>
        </div>
        {!isLoading && customers && (
          <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/25 rounded-lg px-3 py-1.5 text-xs font-semibold">
            <Users className="w-3.5 h-3.5" />
            {customers.length} client{customers.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── KPI Row ── */}
      {isLoading ? (
        <CustomersKPISkeleton />
      ) : stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <CustomerKPICard
            label="Total clients"
            value={stats.total_customers.toLocaleString("fr-FR")}
            icon={Users}
            color="#8892B0"
          />
          <CustomerKPICard
            label="Abonnés actifs"
            value={stats.active_subscribers.toLocaleString("fr-FR")}
            icon={CreditCard}
            color="#00D4AA"
          />
          <CustomerKPICard
            label="Total sessions"
            value={stats.total_sessions.toLocaleString("fr-FR")}
            icon={Zap}
            color="#4ECDC4"
          />
          <CustomerKPICard
            label="Énergie totale"
            value={formatEnergy(stats.total_energy)}
            icon={Zap}
            color="#A78BFA"
          />
        </div>
      ) : null}

      {/* ── Search bar ── */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
        <input
          type="text"
          placeholder="Rechercher par nom, email, téléphone..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors"
        />
      </div>

      {/* ── Data table ── */}
      {isLoading ? (
        <CustomersTableSkeleton rows={10} />
      ) : sorted.length === 0 && search.trim() ? (
        /* Empty search results */
        <div className="flex flex-col items-center justify-center h-48 bg-surface border border-border rounded-2xl">
          <div className="w-12 h-12 rounded-xl bg-foreground-muted/10 flex items-center justify-center mb-3">
            <Search className="w-6 h-6 text-foreground-muted" />
          </div>
          <p className="text-foreground font-medium">Aucun résultat</p>
          <p className="text-sm text-foreground-muted mt-1">
            Aucun client ne correspond à « {search} »
          </p>
        </div>
      ) : sorted.length === 0 ? (
        /* No customers at all */
        <div className="flex flex-col items-center justify-center h-56 bg-surface border border-border rounded-2xl">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <UserX className="w-7 h-7 text-primary" />
          </div>
          <p className="text-foreground font-medium text-lg">
            Aucun client enregistré
          </p>
          <p className="text-sm text-foreground-muted mt-1 max-w-sm text-center">
            Les clients apparaîtront ici dès qu'ils s'inscriront sur
            la plateforme eMSP.
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <th
                    className={thClass}
                    onClick={() => handleSort("full_name")}
                  >
                    Client <SortIcon col="full_name" />
                  </th>
                  <th className={thClass} onClick={() => handleSort("email")}>
                    Email <SortIcon col="email" />
                  </th>
                  <th
                    className={thClass}
                    onClick={() => handleSort("user_type")}
                  >
                    Type <SortIcon col="user_type" />
                  </th>
                  <th
                    className={thClass}
                    onClick={() => handleSort("subscription_status")}
                  >
                    Abonnement <SortIcon col="subscription_status" />
                  </th>
                  <th
                    className={cn(thClass, "text-right")}
                    onClick={() => handleSort("session_count")}
                  >
                    Sessions <SortIcon col="session_count" />
                  </th>
                  <th
                    className={cn(thClass, "text-right")}
                    onClick={() => handleSort("total_energy_kwh")}
                  >
                    Énergie <SortIcon col="total_energy_kwh" />
                  </th>
                  <th
                    className={thClass}
                    onClick={() => handleSort("created_at")}
                  >
                    Inscrit le <SortIcon col="created_at" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((customer) => {
                  const hue = nameToHue(customer.full_name);
                  const displayName =
                    customer.full_name || customer.email || "Client anonyme";

                  return (
                    <tr
                      key={customer.id}
                      className="hover:bg-surface-elevated/50 transition-colors"
                    >
                      {/* Client */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{
                              backgroundColor: `hsl(${hue}, 45%, 25%)`,
                              color: `hsl(${hue}, 70%, 75%)`,
                            }}
                          >
                            {getInitials(customer.full_name)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground truncate">
                                {displayName}
                              </p>
                              {customer.is_company && (
                                <span className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-400 border border-blue-500/25 rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0">
                                  <Building2 className="w-2.5 h-2.5" />
                                  Entreprise
                                </span>
                              )}
                            </div>
                            {customer.company_name && (
                              <p className="text-xs text-foreground-muted truncate">
                                {customer.company_name}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[200px]">
                        {customer.email ?? "\u2014"}
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3 text-sm text-foreground-muted capitalize">
                        {customer.user_type ?? "\u2014"}
                      </td>

                      {/* Subscription */}
                      <td className="px-4 py-3">
                        <SubscriptionBadge
                          status={customer.subscription_status}
                          offer={customer.subscription_offer}
                        />
                      </td>

                      {/* Sessions */}
                      <td className="px-4 py-3 text-sm text-foreground-muted text-right tabular-nums">
                        {customer.session_count.toLocaleString("fr-FR")}
                      </td>

                      {/* Energy */}
                      <td className="px-4 py-3 text-sm text-foreground-muted text-right tabular-nums">
                        {formatEnergy(customer.total_energy_kwh)}
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                        {formatRelativeDate(customer.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination footer ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-foreground-muted">
                {start + 1}\u2013
                {Math.min(start + PAGE_SIZE, sorted.length)} sur{" "}
                {sorted.length} client{sorted.length !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Page précédente"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(
                    (p) =>
                      p === 1 ||
                      p === totalPages ||
                      Math.abs(p - safePage) <= 1
                  )
                  .reduce<(number | "\u2026")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1)
                      acc.push("\u2026");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "\u2026" ? (
                      <span
                        key={"e" + i}
                        className="px-1.5 text-xs text-foreground-muted"
                      >
                        \u2026
                      </span>
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
