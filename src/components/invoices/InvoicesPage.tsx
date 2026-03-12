import { useMemo, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Download,
  Euro,
  Clock,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Receipt,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Skeleton, TableSkeleton } from "@/components/ui/Skeleton";
// ErrorState not needed — query never throws (returns [] on error)

interface Invoice {
  id: string;
  invoice_number: string;
  user_id: string;
  period_start: string;
  period_end: string;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  currency: string;
  vat_rate: number;
  type: "session" | "subscription" | "rfid";
  status: "draft" | "issued" | "paid" | "cancelled";
  issued_at: string | null;
  paid_at: string | null;
  created_at: string;
  consumer_profiles: { full_name: string | null; email: string | null } | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type StatusFilter = "all" | "draft" | "issued" | "paid" | "cancelled";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "draft", label: "Brouillon" },
  { key: "issued", label: "Émises" },
  { key: "paid", label: "Payées" },
  { key: "cancelled", label: "Annulées" },
];

const STATUS_CONFIG: Record<
  Invoice["status"],
  { label: string; bg: string; text: string; dot: string }
> = {
  draft: {
    label: "Brouillon",
    bg: "bg-gray-500/10",
    text: "text-gray-400",
    dot: "bg-gray-400",
  },
  issued: {
    label: "Émise",
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    dot: "bg-blue-400",
  },
  paid: {
    label: "Payée",
    bg: "bg-emerald-500/10",
    text: "text-status-available",
    dot: "bg-status-available",
  },
  cancelled: {
    label: "Annulée",
    bg: "bg-red-500/10",
    text: "text-danger",
    dot: "bg-danger",
  },
};

const TYPE_CONFIG: Record<
  Invoice["type"],
  { label: string; bg: string; text: string }
> = {
  session: {
    label: "Session",
    bg: "bg-teal-500/10",
    text: "text-teal-400",
  },
  subscription: {
    label: "Abonnement",
    bg: "bg-purple-500/10",
    text: "text-purple-400",
  },
  rfid: {
    label: "RFID",
    bg: "bg-orange-500/10",
    text: "text-orange-400",
  },
};

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
  const e = new Date(end).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${s} – ${e}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: Invoice["status"] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        cfg.bg,
        cfg.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function TypeBadge({ type }: { type: Invoice["type"] }) {
  const cfg = TYPE_CONFIG[type];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        cfg.bg,
        cfg.text
      )}
    >
      {cfg.label}
    </span>
  );
}

function KPIStatCard({
  label,
  value,
  icon: Icon,
  color,
  borderColor,
}: {
  label: string;
  value: string;
  icon: typeof FileText;
  color: string;
  borderColor?: string;
}) {
  return (
    <div
      className={cn(
        "bg-surface border rounded-2xl p-5 flex items-center gap-4 transition-all hover:border-opacity-80",
        borderColor ?? "border-border"
      )}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="w-6 h-6" style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-heading font-bold text-foreground">
          {value}
        </p>
        <p className="text-xs text-foreground-muted mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function InvoiceKPISkeleton() {
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
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function InvoicesPage() {
  const [activeTab, setActiveTab] = useState<StatusFilter>("all");
  const [page, setPage] = useState(0);

  // --- Data fetching (direct Supabase) --------------------------------
  // NOTE: The 'invoices' table has not yet been created (pending migration 022).
  // We attempt to fetch; if it fails we gracefully show an empty state.

  const {
    data: invoices,
    isLoading,
    isError,
    refetch,
  } = useQuery<Invoice[]>({
    queryKey: ["invoices", "list"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("invoices")
          .select("*, consumer_profiles(full_name, email)")
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) {
          // Table doesn't exist or relation error → return empty
          console.warn("[InvoicesPage] Supabase error:", error.code, error.message);
          return [];
        }
        return (data ?? []) as Invoice[];
      } catch {
        // Network or unexpected error → return empty
        return [];
      }
    },
  });

  // Compute stats from data
  const stats = useMemo(() => {
    if (!invoices) return null;
    return {
      total_invoices: invoices.length,
      total_revenue_cents: invoices.reduce((s, i) => s + i.total_cents, 0),
      outstanding_cents: invoices
        .filter((i) => i.status === "issued" || i.status === "draft")
        .reduce((s, i) => s + i.total_cents, 0),
      paid_count: invoices.filter((i) => i.status === "paid").length,
    };
  }, [invoices]);

  // --- Filtering & Pagination -----------------------------------------

  const filtered = useMemo(() => {
    if (!invoices) return [];
    if (activeTab === "all") return invoices;
    return invoices.filter((inv) => inv.status === activeTab);
  }, [invoices, activeTab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page]
  );

  // Reset page when filter changes
  const handleTabChange = useCallback((tab: StatusFilter) => {
    setActiveTab(tab);
    setPage(0);
  }, []);

  // --- Tab counts -----------------------------------------------------

  const tabCounts = useMemo(() => {
    if (!invoices) return {} as Record<StatusFilter, number>;
    return {
      all: invoices.length,
      draft: invoices.filter((i) => i.status === "draft").length,
      issued: invoices.filter((i) => i.status === "issued").length,
      paid: invoices.filter((i) => i.status === "paid").length,
      cancelled: invoices.filter((i) => i.status === "cancelled").length,
    };
  }, [invoices]);

  // --- Actions --------------------------------------------------------

  const handleExportCSV = useCallback(async () => {
    if (!invoices?.length) return;
    const header = "N° Facture,Client,Email,Type,Période,HT,TVA,TTC,Statut,Date\n";
    const rows = invoices.map((inv) =>
      [
        inv.invoice_number,
        inv.consumer_profiles?.full_name ?? "",
        inv.consumer_profiles?.email ?? "",
        inv.type,
        `${inv.period_start} - ${inv.period_end}`,
        (inv.subtotal_cents / 100).toFixed(2),
        (inv.vat_cents / 100).toFixed(2),
        (inv.total_cents / 100).toFixed(2),
        inv.status,
        inv.issued_at ?? inv.created_at,
      ].join(",")
    );
    const csv = header + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "factures-ezdrive.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [invoices]);

  const handleDownloadPDF = useCallback(async (_invoiceId: string) => {
    // TODO: Implement PDF generation via Edge Function
    alert("La génération PDF sera disponible prochainement.");
  }, []);

  // --- Render ---------------------------------------------------------

  // isError should never happen now (query catches all errors), but just in case:
  void isError;
  void refetch;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-bold">Factures</h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Gestion de la facturation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={isLoading || !invoices?.length}
            className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Exporter CSV
          </button>
          <button
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 text-primary rounded-xl text-sm font-medium hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Receipt className="w-4 h-4" />
            Générer factures
          </button>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────── */}
      {isLoading ? (
        <InvoiceKPISkeleton />
      ) : stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPIStatCard
            label="Total factures"
            value={stats.total_invoices.toLocaleString("fr-FR")}
            icon={FileText}
            color="#8892B0"
            borderColor="border-border"
          />
          <KPIStatCard
            label="Revenu total"
            value={formatEuros(stats.total_revenue_cents)}
            icon={Euro}
            color="#00D4AA"
            borderColor="border-status-available/30"
          />
          <KPIStatCard
            label="En attente"
            value={formatEuros(stats.outstanding_cents)}
            icon={Clock}
            color="#F39C12"
            borderColor="border-warning/30"
          />
          <KPIStatCard
            label="Payées"
            value={stats.paid_count.toLocaleString("fr-FR")}
            icon={CheckCircle}
            color="#00D4AA"
            borderColor="border-status-available/30"
          />
        </div>
      ) : null}

      {/* ── Tab Filters ────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1">
        {STATUS_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = tabCounts[tab.key];
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-surface-elevated text-foreground shadow-sm"
                  : "text-foreground-muted hover:text-foreground"
              )}
            >
              {tab.label}
              {count !== undefined && (
                <span
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums leading-none",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "bg-surface-elevated text-foreground-muted"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Data Table ─────────────────────────────────────────────── */}
      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 bg-surface border border-border rounded-2xl">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
            <FileText className="w-6 h-6 text-primary" />
          </div>
          <p className="text-foreground font-medium">Aucune facture</p>
          <p className="text-sm text-foreground-muted mt-1">
            {activeTab === "all"
              ? "Aucune facture trouvée."
              : `Aucune facture avec le statut « ${STATUS_TABS.find((t) => t.key === activeTab)?.label} ».`}
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-semibold text-foreground-muted px-5 py-3">
                    N° Facture
                  </th>
                  <th className="text-left text-xs font-semibold text-foreground-muted px-4 py-3">
                    Client
                  </th>
                  <th className="text-left text-xs font-semibold text-foreground-muted px-4 py-3">
                    Type
                  </th>
                  <th className="text-left text-xs font-semibold text-foreground-muted px-4 py-3">
                    Période
                  </th>
                  <th className="text-right text-xs font-semibold text-foreground-muted px-4 py-3">
                    HT
                  </th>
                  <th className="text-right text-xs font-semibold text-foreground-muted px-4 py-3">
                    TVA
                  </th>
                  <th className="text-right text-xs font-semibold text-foreground-muted px-4 py-3">
                    TTC
                  </th>
                  <th className="text-left text-xs font-semibold text-foreground-muted px-4 py-3">
                    Statut
                  </th>
                  <th className="text-left text-xs font-semibold text-foreground-muted px-4 py-3">
                    Date
                  </th>
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((inv) => (
                  <tr
                    key={inv.id}
                    className="group hover:bg-surface-elevated/50 transition-colors"
                  >
                    {/* Invoice number */}
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-medium text-foreground font-mono">
                        {inv.invoice_number}
                      </span>
                    </td>

                    {/* Client */}
                    <td className="px-4 py-3.5">
                      <div>
                        <p className="text-sm font-medium text-foreground truncate max-w-[180px]">
                          {inv.consumer_profiles?.full_name ?? "—"}
                        </p>
                        {inv.consumer_profiles?.email && (
                          <p className="text-xs text-foreground-muted truncate max-w-[180px]">
                            {inv.consumer_profiles.email}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3.5">
                      <TypeBadge type={inv.type} />
                    </td>

                    {/* Period */}
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-foreground-muted whitespace-nowrap">
                        {formatPeriod(inv.period_start, inv.period_end)}
                      </span>
                    </td>

                    {/* Subtotal HT */}
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-sm tabular-nums text-foreground">
                        {formatEuros(inv.subtotal_cents)}
                      </span>
                    </td>

                    {/* VAT */}
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-sm tabular-nums text-foreground-muted">
                        {formatEuros(inv.vat_cents)}
                      </span>
                    </td>

                    {/* Total TTC */}
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-sm tabular-nums font-semibold text-foreground">
                        {formatEuros(inv.total_cents)}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <StatusBadge status={inv.status} />
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-foreground-muted whitespace-nowrap">
                        {formatDate(
                          inv.paid_at ?? inv.issued_at ?? inv.created_at
                        )}
                      </span>
                    </td>

                    {/* PDF action */}
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => handleDownloadPDF(inv.id)}
                        title="Télécharger PDF"
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-all"
                      >
                        <FileDown className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border">
              <p className="text-xs text-foreground-muted">
                {page * PAGE_SIZE + 1}–
                {Math.min((page + 1) * PAGE_SIZE, filtered.length)} sur{" "}
                {filtered.length} facture{filtered.length > 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    className={cn(
                      "min-w-[28px] h-7 rounded-lg text-xs font-medium transition-colors",
                      i === page
                        ? "bg-primary/15 text-primary"
                        : "text-foreground-muted hover:text-foreground hover:bg-surface-elevated"
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
