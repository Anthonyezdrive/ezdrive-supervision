// ============================================================
// EZDrive — Drivers Page
// View and manage consumer/driver profiles
// ============================================================

import { useState, useMemo } from "react";
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
  CreditCard,
  Eye,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { KPICard } from "@/components/ui/KPICard";
import { Skeleton } from "@/components/ui/Skeleton";
import { SlideOver } from "@/components/ui/SlideOver";

// ── Types ─────────────────────────────────────────────────────

interface Driver {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  status: string | null;
  stripe_customer_id: string | null;
  is_company: boolean;
  company_name: string | null;
  created_at: string;
}

const TABS = ["Tous", "Actifs", "Inactifs"] as const;
type Tab = (typeof TABS)[number];

type SortKey = "full_name" | "email" | "country" | "status" | "created_at";
const PAGE_SIZE = 20;

// ── Component ─────────────────────────────────────────────────

export function DriversPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("Tous");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Driver | null>(null);

  // ── Fetch drivers ─────────────────────────────────────────

  const { data: drivers, isLoading } = useQuery<Driver[]>({
    queryKey: ["drivers"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("consumer_profiles")
          .select("id, full_name, email, phone, country, status, stripe_customer_id, is_company, company_name, created_at")
          .order("created_at", { ascending: false });
        if (error) {
          console.warn("[Drivers] consumer_profiles query:", error.message);
          return [];
        }
        return (data ?? []) as Driver[];
      } catch {
        return [];
      }
    },
  });

  // ── KPIs ──────────────────────────────────────────────────

  const kpis = useMemo(() => {
    if (!drivers) return { total: 0, active: 0, inactive: 0, withSubscription: 0 };
    return {
      total: drivers.length,
      active: drivers.filter((d) => d.status === "active").length,
      inactive: drivers.filter((d) => d.status !== "active").length,
      withSubscription: drivers.filter((d) => !!d.stripe_customer_id).length,
    };
  }, [drivers]);

  // ── Filtered + sorted ─────────────────────────────────────

  const filtered = useMemo(() => {
    if (!drivers) return [];
    let list = [...drivers];

    // Tab filter
    if (activeTab === "Actifs") list = list.filter((d) => d.status === "active");
    else if (activeTab === "Inactifs") list = list.filter((d) => d.status !== "active");

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          (d.full_name ?? "").toLowerCase().includes(q) ||
          (d.email ?? "").toLowerCase().includes(q) ||
          (d.phone ?? "").toLowerCase().includes(q) ||
          (d.company_name ?? "").toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      const av = (a[sortKey] ?? "") as string;
      const bv = (b[sortKey] ?? "") as string;
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    return list;
  }, [drivers, activeTab, search, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Sort handler ──────────────────────────────────────────

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  // ── Loading ───────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Conducteurs</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Gestion des profils conducteurs inscrits sur la plateforme
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total conducteurs" value={kpis.total} icon={Users} color="#6366f1" />
        <KPICard label="Actifs" value={kpis.active} icon={UserCheck} color="#10b981" />
        <KPICard label="Inactifs" value={kpis.inactive} icon={UserX} color="#ef4444" />
        <KPICard label="Avec abonnement" value={kpis.withSubscription} icon={CreditCard} color="#3b82f6" />
      </div>

      {/* Search + Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex gap-1 border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setPage(1); }}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors relative",
                activeTab === tab
                  ? "text-primary"
                  : "text-foreground-muted hover:text-foreground"
              )}
            >
              {tab}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            type="text"
            placeholder="Rechercher un conducteur..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-elevated/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground-muted">État</th>
                <ThSort label="Nom" col="full_name" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <ThSort label="Email" col="email" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <th className="text-left px-4 py-3 font-semibold text-foreground-muted">Téléphone</th>
                <ThSort label="Pays" col="country" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <th className="text-left px-4 py-3 font-semibold text-foreground-muted">Entreprise</th>
                <ThSort label="Inscrit le" col="created_at" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <th className="text-right px-4 py-3 font-semibold text-foreground-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-foreground-muted">
                    Aucun conducteur trouvé
                  </td>
                </tr>
              ) : (
                paged.map((d) => (
                  <tr key={d.id} className="border-b border-border/50 hover:bg-surface-elevated/30 transition-colors">
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex px-2 py-0.5 rounded-full text-xs font-semibold",
                          d.status === "active"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-red-500/10 text-red-400"
                        )}
                      >
                        {d.status === "active" ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{d.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground-muted">{d.email ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground-muted">{d.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground-muted">{d.country ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground-muted">{d.is_company ? d.company_name ?? "Oui" : "—"}</td>
                    <td className="px-4 py-3 text-foreground-muted">
                      {new Date(d.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setDetail(d)}
                        className="p-1.5 text-foreground-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Voir détail"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-xs text-foreground-muted">
            {filtered.length} conducteur{filtered.length > 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-border hover:bg-surface-elevated disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-foreground-muted">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-border hover:bg-surface-elevated disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Detail SlideOver */}
      <SlideOver
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Détail conducteur"
        subtitle={detail?.full_name ?? ""}
      >
        {detail && (
          <div className="p-6 space-y-6">
            <DetailSection title="Informations personnelles">
              <DetailRow label="Nom complet" value={detail.full_name ?? "—"} />
              <DetailRow label="Email" value={detail.email ?? "—"} />
              <DetailRow label="Téléphone" value={detail.phone ?? "—"} />
              <DetailRow label="Pays" value={detail.country ?? "—"} />
              <DetailRow
                label="Statut"
                value={
                  <span className={cn(
                    "inline-flex px-2 py-0.5 rounded-full text-xs font-semibold",
                    detail.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  )}>
                    {detail.status === "active" ? "Actif" : "Inactif"}
                  </span>
                }
              />
            </DetailSection>

            {detail.is_company && (
              <DetailSection title="Entreprise">
                <DetailRow label="Nom entreprise" value={detail.company_name ?? "—"} />
              </DetailSection>
            )}

            <DetailSection title="Facturation">
              <DetailRow label="Stripe Customer" value={detail.stripe_customer_id ?? "Non configuré"} />
            </DetailSection>

            <DetailSection title="Métadonnées">
              <DetailRow label="ID" value={detail.id} />
              <DetailRow
                label="Inscrit le"
                value={new Date(detail.created_at).toLocaleDateString("fr-FR", {
                  day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              />
            </DetailSection>
          </div>
        )}
      </SlideOver>
    </div>
  );
}

// ── Reusable sub-components ──────────────────────────────────

function ThSort({
  label,
  col,
  sortKey,
  sortAsc,
  onSort,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (key: SortKey) => void;
}) {
  return (
    <th
      className="text-left px-4 py-3 font-semibold text-foreground-muted cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === col ? (
          sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-foreground-muted">{label}</span>
      <span className="text-foreground font-medium text-right">{value}</span>
    </div>
  );
}
