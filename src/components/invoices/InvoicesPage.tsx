import { useMemo, useCallback, useState, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHelp } from "@/components/ui/PageHelp";
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
  Loader2,
  Calendar,
  Send,
  Ban,
  BarChart3,
  Upload,
  BookOpen,
  AlertTriangle,
  RefreshCcw,
  Scale,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Skeleton, TableSkeleton } from "@/components/ui/Skeleton";
import { apiDownload, apiPost } from "@/lib/api";
import { todayISO } from "@/lib/export";
// ErrorState not needed — query never throws (returns [] on error)

// Lazy-loaded Sprint 3 billing components
const CreditNoteModal = lazy(() =>
  import("@/components/billing/CreditNoteModal").then((m) => ({ default: m.CreditNoteModal }))
);
const PaymentReminderModal = lazy(() =>
  import("@/components/billing/PaymentReminderModal").then((m) => ({ default: m.PaymentReminderModal }))
);

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
  all_consumers: { first_name: string | null; last_name: string | null; email: string | null } | null;
}

interface OcpiCdr {
  id: string;
  cdr_token_uid: string;
  total_cost: number;
  total_energy: number;
  currency: string;
  start_date_time: string;
  end_date_time: string;
  session_id: string | null;
  invoice_id: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type MainView = "invoices" | "reconciliation";
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
  const queryClient = useQueryClient();
  const [mainView, setMainView] = useState<MainView>("invoices");
  const [activeTab, setActiveTab] = useState<StatusFilter>("all");
  const [page, setPage] = useState(0);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Sprint 3 integration states
  const [creditNoteInvoice, setCreditNoteInvoice] = useState<Invoice | null>(null);
  const [reminderInvoice, setReminderInvoice] = useState<Invoice | null>(null);
  // Reconciliation period
  const [reconPeriodStart, setReconPeriodStart] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [reconPeriodEnd, setReconPeriodEnd] = useState(() => {
    const d = new Date();
    d.setDate(0); // last day of previous month
    return d.toISOString().slice(0, 10);
  });

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
          .select("*, all_consumers(first_name, last_name, email)")
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

  // --- Revenue chart data by month ---
  const revenueByMonth = useMemo(() => {
    if (!invoices?.length) return [];
    const grouped: Record<string, number> = {};
    for (const inv of invoices) {
      if (inv.status === "cancelled") continue;
      const month = new Date(inv.period_start).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
      grouped[month] = (grouped[month] ?? 0) + inv.total_cents;
    }
    return Object.entries(grouped)
      .map(([month, cents]) => ({ month, total: cents / 100 }))
      .reverse()
      .slice(-12);
  }, [invoices]);

  // --- CDR query for reconciliation ---
  const {
    data: cdrs,
    isLoading: cdrsLoading,
  } = useQuery<OcpiCdr[]>({
    queryKey: ["ocpi_cdrs", "recon", reconPeriodStart, reconPeriodEnd],
    enabled: mainView === "reconciliation",
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("ocpi_cdrs")
          .select("id, cdr_token_uid, total_cost, total_energy, currency, start_date_time, end_date_time, session_id, invoice_id")
          .gte("start_date_time", reconPeriodStart)
          .lte("start_date_time", reconPeriodEnd + "T23:59:59Z")
          .order("start_date_time", { ascending: false })
          .limit(500);
        if (error) {
          console.warn("[InvoicesPage] CDR query error:", error.code, error.message);
          return [];
        }
        return (data ?? []) as OcpiCdr[];
      } catch {
        return [];
      }
    },
  });

  // --- Reconciliation computation ---
  const reconciliation = useMemo(() => {
    if (!cdrs || !invoices) return null;

    // Filter invoices for the reconciliation period
    const periodInvoices = invoices.filter((inv) => {
      if (inv.status === "cancelled") return false;
      return inv.period_start >= reconPeriodStart && inv.period_start <= reconPeriodEnd;
    });

    const totalCdrAmount = cdrs.reduce((s, c) => s + (c.total_cost ?? 0), 0);
    const totalInvoicedCents = periodInvoices.reduce((s, i) => s + i.total_cents, 0);
    const totalInvoicedEuros = totalInvoicedCents / 100;
    const ecart = totalCdrAmount - totalInvoicedEuros;

    // CDRs without an invoice
    const cdrsWithoutInvoice = cdrs.filter((c) => !c.invoice_id);

    // Invoices without a matching CDR (session invoices only)
    const cdrInvoiceIds = new Set(cdrs.filter((c) => c.invoice_id).map((c) => c.invoice_id));
    const invoicesWithoutCdr = periodInvoices.filter(
      (inv) => inv.type === "session" && !cdrInvoiceIds.has(inv.id)
    );

    return {
      totalCdrs: cdrs.length,
      totalCdrAmount,
      totalInvoices: periodInvoices.length,
      totalInvoicedEuros,
      ecart,
      cdrsWithoutInvoice,
      invoicesWithoutCdr,
    };
  }, [cdrs, invoices, reconPeriodStart, reconPeriodEnd]);

  // --- Invoice action handlers ---
  const handleMarkPaid = useCallback(async (invoiceId: string) => {
    try {
      await supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", invoiceId);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    } catch (err) { console.error("[Invoice] mark paid error:", err); }
  }, [queryClient]);

  const handleSendInvoice = useCallback(async (invoiceId: string) => {
    try {
      await apiPost(`invoices/${invoiceId}/send`, {});
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      alert("Facture envoyee par email.");
    } catch (err) {
      console.error("[Invoice] send error:", err);
      alert("Erreur lors de l'envoi.");
    }
  }, [queryClient]);

  const handleCreditNote = useCallback(async (invoiceId: string) => {
    try {
      await supabase.from("invoices").update({ status: "cancelled" }).eq("id", invoiceId);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      alert("Avoir cree (facture annulee).");
    } catch (err) { console.error("[Invoice] credit note error:", err); }
  }, [queryClient]);

  const handleExportPennylane = useCallback(() => {
    if (!invoices?.length) return;
    const header = "Date,Numero,Client,Montant HT,TVA,Montant TTC,Compte,Journal\n";
    const rows = invoices.map((inv) =>
      [
        inv.issued_at ?? inv.created_at,
        inv.invoice_number,
        [inv.all_consumers?.first_name, inv.all_consumers?.last_name].filter(Boolean).join(" ") || "",
        (inv.subtotal_cents / 100).toFixed(2),
        (inv.vat_cents / 100).toFixed(2),
        (inv.total_cents / 100).toFixed(2),
        "706100",
        "VE",
      ].join(",")
    );
    const csv = header + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "export-pennylane-ezdrive.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [invoices]);

  // --- FEC Export (Fichier des Ecritures Comptables) ---
  const handleExportFEC = useCallback(() => {
    if (!invoices?.length) return;

    const fecRows: Record<string, unknown>[] = [];

    for (const inv of invoices) {
      if (inv.status === "cancelled" || inv.status === "draft") continue;

      const ecritureDate = inv.issued_at
        ? new Date(inv.issued_at).toISOString().slice(0, 10).replace(/-/g, "")
        : new Date(inv.created_at).toISOString().slice(0, 10).replace(/-/g, "");

      const totalEuros = (inv.total_cents / 100).toFixed(2);
      const subtotalEuros = (inv.subtotal_cents / 100).toFixed(2);
      const vatEuros = (inv.vat_cents / 100).toFixed(2);

      // Line 1: Debit client (total TTC)
      fecRows.push({
        JournalCode: "VE",
        JournalLib: "Journal des Ventes",
        EcritureNum: inv.invoice_number,
        EcritureDate: ecritureDate,
        CompteNum: "411000",
        CompteLib: "Clients",
        Debit: totalEuros,
        Credit: "0.00",
        EcritureLet: "",
        PieceRef: inv.invoice_number,
        PieceDate: ecritureDate,
        EcritureLib: `Facture ${inv.invoice_number}`,
      });

      // Line 2: Credit revenue (subtotal HT)
      fecRows.push({
        JournalCode: "VE",
        JournalLib: "Journal des Ventes",
        EcritureNum: inv.invoice_number,
        EcritureDate: ecritureDate,
        CompteNum: "706000",
        CompteLib: "Prestations de services",
        Debit: "0.00",
        Credit: subtotalEuros,
        EcritureLet: "",
        PieceRef: inv.invoice_number,
        PieceDate: ecritureDate,
        EcritureLib: `Facture ${inv.invoice_number}`,
      });

      // Line 3: Credit VAT
      fecRows.push({
        JournalCode: "VE",
        JournalLib: "Journal des Ventes",
        EcritureNum: inv.invoice_number,
        EcritureDate: ecritureDate,
        CompteNum: "445710",
        CompteLib: "TVA collectee",
        Debit: "0.00",
        Credit: vatEuros,
        EcritureLet: "",
        PieceRef: inv.invoice_number,
        PieceDate: ecritureDate,
        EcritureLib: `Facture ${inv.invoice_number}`,
      });
    }

    if (fecRows.length === 0) return;

    // FEC standard uses tab separator — build manually
    const headers = Object.keys(fecRows[0]);
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      if (s.includes("\t") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const tsvLines = [
      headers.join("\t"),
      ...fecRows.map((row) => headers.map((h) => escape(row[h])).join("\t")),
    ];
    const tsv = tsvLines.join("\n");

    const blob = new Blob(["\uFEFF" + tsv], { type: "text/tab-separated-values;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FEC-EZDrive-${todayISO()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
        [inv.all_consumers?.first_name, inv.all_consumers?.last_name].filter(Boolean).join(" ") || "",
        inv.all_consumers?.email ?? "",
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

  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  const handleDownloadPDF = useCallback(async (invoiceId: string) => {
    setPdfLoading(invoiceId);
    try {
      const { blob, filename } = await apiDownload(`invoices/${invoiceId}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[InvoicesPage] PDF download error:", err);
      alert("Erreur lors du téléchargement du PDF.");
    } finally {
      setPdfLoading(null);
    }
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
      </div>

      <PageHelp
        summary="Facturation des sessions de charge — suivi des paiements et relances"
        items={[
          { label: "Facture", description: "Document généré automatiquement après chaque session ou en fin de mois selon le mode de facturation." },
          { label: "Statut", description: "Draft (brouillon), Sent (envoyée), Paid (payée), Overdue (en retard), Cancelled (annulée)." },
          { label: "Montant", description: "Calculé à partir de l'énergie consommée × tarif applicable + TVA." },
          { label: "Export comptable", description: "Téléchargez les factures au format CSV ou PDF pour votre logiciel comptable." },
        ]}
      />

      {/* ── Main View Toggle ────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
        <button
          onClick={() => setMainView("invoices")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            mainView === "invoices"
              ? "bg-surface-elevated text-foreground shadow-sm"
              : "text-foreground-muted hover:text-foreground"
          )}
        >
          <FileText className="w-4 h-4" />
          Factures
        </button>
        <button
          onClick={() => setMainView("reconciliation")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            mainView === "reconciliation"
              ? "bg-surface-elevated text-foreground shadow-sm"
              : "text-foreground-muted hover:text-foreground"
          )}
        >
          <Scale className="w-4 h-4" />
          Reconciliation
        </button>
      </div>

      {/* ── Header Actions ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCSV}
            disabled={isLoading || !invoices?.length}
            className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Exporter CSV
          </button>
          <button
            onClick={handleExportFEC}
            disabled={isLoading || !invoices?.length}
            className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Export FEC (Fichier des Ecritures Comptables) — format reglementaire"
          >
            <BookOpen className="w-4 h-4" />
            Export FEC
          </button>
          <button
            onClick={handleExportPennylane}
            disabled={isLoading || !invoices?.length}
            className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Upload className="w-4 h-4" />
            Pennylane
          </button>
          <button
            disabled
            title="Necessite la configuration de l'API Zoho"
            className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground-muted transition-colors opacity-40 cursor-not-allowed"
          >
            <Upload className="w-4 h-4" />
            Sync Zoho
          </button>
          <button
            onClick={() => setShowGenerateModal(true)}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 text-primary rounded-xl text-sm font-medium hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Receipt className="w-4 h-4" />
            Generer factures
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── INVOICES VIEW ─────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {mainView === "invoices" && <>
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

      {/* ── Revenue Chart ─────────────────────────────────────────── */}
      {revenueByMonth.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-heading font-bold text-foreground">Revenu par mois</h3>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={revenueByMonth}>
              <XAxis dataKey="month" tick={{ fill: "#8892B0", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#8892B0", fontSize: 10 }} axisLine={false} tickLine={false} width={60} tickFormatter={(v: number) => `${v.toFixed(0)}€`} />
              <RechartsTooltip
                contentStyle={{ background: "#161B22", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#ccc" }}
                formatter={(value: number) => [`${value.toFixed(2)} €`, "Revenu"]}
              />
              <Bar dataKey="total" fill="#00D4AA" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

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
                          {[inv.all_consumers?.first_name, inv.all_consumers?.last_name].filter(Boolean).join(" ") || "—"}
                        </p>
                        {inv.all_consumers?.email && (
                          <p className="text-xs text-foreground-muted truncate max-w-[180px]">
                            {inv.all_consumers.email}
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

                    {/* Actions */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => handleDownloadPDF(inv.id)}
                          disabled={pdfLoading === inv.id}
                          title="Telecharger PDF"
                          className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-all disabled:opacity-50"
                        >
                          {pdfLoading === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                        </button>
                        {inv.status === "draft" && (
                          <button
                            onClick={() => handleSendInvoice(inv.id)}
                            title="Envoyer par email"
                            className="p-1.5 rounded-lg text-foreground-muted hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {(inv.status === "issued" || inv.status === "draft") && (
                          <button
                            onClick={() => handleMarkPaid(inv.id)}
                            title="Marquer comme payee"
                            className="p-1.5 rounded-lg text-foreground-muted hover:text-status-available hover:bg-status-available/10 transition-all"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        {/* Avoir — only on paid/issued invoices */}
                        {(inv.status === "paid" || inv.status === "issued") && (
                          <button
                            onClick={() => setCreditNoteInvoice(inv)}
                            title="Creer un avoir"
                            className="p-1.5 rounded-lg text-foreground-muted hover:text-danger hover:bg-danger/10 transition-all"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                        {/* Relancer — only on issued (pending) invoices */}
                        {inv.status === "issued" && (
                          <button
                            onClick={() => setReminderInvoice(inv)}
                            title="Envoyer une relance"
                            className="p-1.5 rounded-lg text-foreground-muted hover:text-orange-400 hover:bg-orange-500/10 transition-all"
                          >
                            <RefreshCcw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
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

      </>}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── RECONCILIATION VIEW ───────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {mainView === "reconciliation" && (
        <div className="space-y-6">
          {/* Period selector */}
          <div className="bg-surface border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Scale className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-heading font-bold text-foreground">
                Reconciliation CDR / Factures
              </h3>
            </div>
            <p className="text-xs text-foreground-muted mb-4">
              Compare les CDR (Charge Detail Records) OCPI avec les factures generees sur la periode selectionnee.
            </p>
            <div className="flex items-end gap-4 flex-wrap">
              <div>
                <label className="block text-xs font-medium text-foreground-muted mb-1">Debut</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted pointer-events-none" />
                  <input
                    type="date"
                    value={reconPeriodStart}
                    onChange={(e) => setReconPeriodStart(e.target.value)}
                    className="pl-10 pr-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-muted mb-1">Fin</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted pointer-events-none" />
                  <input
                    type="date"
                    value={reconPeriodEnd}
                    onChange={(e) => setReconPeriodEnd(e.target.value)}
                    className="pl-10 pr-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Reconciliation summary */}
          {cdrsLoading ? (
            <div className="bg-surface border border-border rounded-2xl p-8 flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-foreground-muted">Chargement des CDR...</span>
            </div>
          ) : reconciliation ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-surface border border-border rounded-2xl p-5">
                  <p className="text-xs text-foreground-muted mb-1">Total CDRs</p>
                  <p className="text-xl font-heading font-bold text-foreground">{reconciliation.totalCdrs}</p>
                  <p className="text-sm text-foreground-muted mt-1">
                    {reconciliation.totalCdrAmount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                  </p>
                </div>
                <div className="bg-surface border border-border rounded-2xl p-5">
                  <p className="text-xs text-foreground-muted mb-1">Total facture</p>
                  <p className="text-xl font-heading font-bold text-foreground">{reconciliation.totalInvoices}</p>
                  <p className="text-sm text-foreground-muted mt-1">
                    {reconciliation.totalInvoicedEuros.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                  </p>
                </div>
                <div className={cn(
                  "bg-surface border rounded-2xl p-5",
                  Math.abs(reconciliation.ecart) > 0.01
                    ? "border-orange-500/40"
                    : "border-status-available/40"
                )}>
                  <p className="text-xs text-foreground-muted mb-1">Ecart</p>
                  <p className={cn(
                    "text-xl font-heading font-bold",
                    Math.abs(reconciliation.ecart) > 0.01 ? "text-orange-400" : "text-status-available"
                  )}>
                    {reconciliation.ecart.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                  </p>
                  <p className="text-xs mt-1">
                    {Math.abs(reconciliation.ecart) <= 0.01 ? (
                      <span className="text-status-available">Aucun ecart</span>
                    ) : (
                      <span className="text-orange-400">Ecart detecte</span>
                    )}
                  </p>
                </div>
              </div>

              {/* CDRs without invoice */}
              <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-400" />
                    <h4 className="text-sm font-heading font-bold text-foreground">CDRs sans facture</h4>
                  </div>
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    reconciliation.cdrsWithoutInvoice.length > 0
                      ? "bg-orange-500/10 text-orange-400"
                      : "bg-emerald-500/10 text-status-available"
                  )}>
                    {reconciliation.cdrsWithoutInvoice.length}
                  </span>
                </div>
                {reconciliation.cdrsWithoutInvoice.length === 0 ? (
                  <div className="px-5 py-6 text-center text-sm text-foreground-muted">
                    Tous les CDR sont rattaches a une facture.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left text-xs font-semibold text-foreground-muted px-5 py-2">CDR ID</th>
                          <th className="text-left text-xs font-semibold text-foreground-muted px-4 py-2">Token</th>
                          <th className="text-left text-xs font-semibold text-foreground-muted px-4 py-2">Date</th>
                          <th className="text-right text-xs font-semibold text-foreground-muted px-4 py-2">Energie (kWh)</th>
                          <th className="text-right text-xs font-semibold text-foreground-muted px-5 py-2">Montant</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {reconciliation.cdrsWithoutInvoice.slice(0, 50).map((cdr) => (
                          <tr key={cdr.id} className="hover:bg-surface-elevated/50 transition-colors">
                            <td className="px-5 py-2 text-xs font-mono text-foreground truncate max-w-[120px]">{cdr.id.slice(0, 12)}...</td>
                            <td className="px-4 py-2 text-xs text-foreground-muted">{cdr.cdr_token_uid ?? "—"}</td>
                            <td className="px-4 py-2 text-xs text-foreground-muted whitespace-nowrap">
                              {new Date(cdr.start_date_time).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                            </td>
                            <td className="px-4 py-2 text-xs text-foreground tabular-nums text-right">{(cdr.total_energy ?? 0).toFixed(2)}</td>
                            <td className="px-5 py-2 text-xs text-foreground font-medium tabular-nums text-right">
                              {(cdr.total_cost ?? 0).toLocaleString("fr-FR", { style: "currency", currency: cdr.currency || "EUR" })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {reconciliation.cdrsWithoutInvoice.length > 50 && (
                      <div className="px-5 py-2 text-xs text-foreground-muted border-t border-border">
                        ... et {reconciliation.cdrsWithoutInvoice.length - 50} de plus
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Invoices without CDR */}
              <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <h4 className="text-sm font-heading font-bold text-foreground">Factures sans CDR correspondant</h4>
                  </div>
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    reconciliation.invoicesWithoutCdr.length > 0
                      ? "bg-red-500/10 text-red-400"
                      : "bg-emerald-500/10 text-status-available"
                  )}>
                    {reconciliation.invoicesWithoutCdr.length}
                  </span>
                </div>
                {reconciliation.invoicesWithoutCdr.length === 0 ? (
                  <div className="px-5 py-6 text-center text-sm text-foreground-muted">
                    Toutes les factures session ont un CDR correspondant.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left text-xs font-semibold text-foreground-muted px-5 py-2">N° Facture</th>
                          <th className="text-left text-xs font-semibold text-foreground-muted px-4 py-2">Client</th>
                          <th className="text-left text-xs font-semibold text-foreground-muted px-4 py-2">Periode</th>
                          <th className="text-right text-xs font-semibold text-foreground-muted px-4 py-2">TTC</th>
                          <th className="text-left text-xs font-semibold text-foreground-muted px-5 py-2">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {reconciliation.invoicesWithoutCdr.slice(0, 50).map((inv) => (
                          <tr key={inv.id} className="hover:bg-surface-elevated/50 transition-colors">
                            <td className="px-5 py-2 text-xs font-mono text-foreground">{inv.invoice_number}</td>
                            <td className="px-4 py-2 text-xs text-foreground-muted">
                              {[inv.all_consumers?.first_name, inv.all_consumers?.last_name].filter(Boolean).join(" ") || "—"}
                            </td>
                            <td className="px-4 py-2 text-xs text-foreground-muted whitespace-nowrap">
                              {formatPeriod(inv.period_start, inv.period_end)}
                            </td>
                            <td className="px-4 py-2 text-xs text-foreground font-medium tabular-nums text-right">
                              {formatEuros(inv.total_cents)}
                            </td>
                            <td className="px-5 py-2">
                              <StatusBadge status={inv.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-surface border border-border rounded-2xl p-8 text-center">
              <Scale className="w-8 h-8 text-foreground-muted mx-auto mb-2" />
              <p className="text-sm text-foreground-muted">Selectionnez une periode pour lancer la reconciliation.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Generate Invoices Modal ────────────────────────────── */}
      {showGenerateModal && (
        <GenerateInvoicesModal
          generating={generating}
          onClose={() => setShowGenerateModal(false)}
          onGenerate={async (periodStart, periodEnd) => {
            setGenerating(true);
            try {
              const result = await apiPost<{ generated: number }>("invoices/generate", {
                period_start: periodStart,
                period_end: periodEnd,
              });
              setShowGenerateModal(false);
              queryClient.invalidateQueries({ queryKey: ["invoices"] });
              alert(`${result.generated} facture(s) générée(s) avec succès.`);
            } catch (err) {
              console.error("[InvoicesPage] Generate error:", err);
              alert("Erreur lors de la génération des factures.");
            } finally {
              setGenerating(false);
            }
          }}
        />
      )}

      {/* ── Credit Note Modal (Sprint 3) ─────────────────────────── */}
      {creditNoteInvoice && (
        <Suspense fallback={null}>
          <CreditNoteModal
            invoice={{
              id: creditNoteInvoice.id,
              invoice_number: creditNoteInvoice.invoice_number,
              total_cents: creditNoteInvoice.total_cents,
              currency: creditNoteInvoice.currency,
              user_id: creditNoteInvoice.user_id,
            }}
            onClose={() => setCreditNoteInvoice(null)}
            onCreated={() => {
              setCreditNoteInvoice(null);
              queryClient.invalidateQueries({ queryKey: ["invoices"] });
            }}
          />
        </Suspense>
      )}

      {/* ── Payment Reminder Modal (Sprint 3) ────────────────────── */}
      {reminderInvoice && (
        <Suspense fallback={null}>
          <PaymentReminderModal
            invoice={{
              id: reminderInvoice.id,
              invoice_number: reminderInvoice.invoice_number,
              total_cents: reminderInvoice.total_cents,
              currency: reminderInvoice.currency,
              user_id: reminderInvoice.user_id,
              period_end: reminderInvoice.period_end,
            }}
            onClose={() => setReminderInvoice(null)}
            onSent={() => {
              setReminderInvoice(null);
              queryClient.invalidateQueries({ queryKey: ["invoices"] });
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generate Invoices Modal
// ---------------------------------------------------------------------------

function GenerateInvoicesModal({
  generating,
  onClose,
  onGenerate,
}: {
  generating: boolean;
  onClose: () => void;
  onGenerate: (periodStart: string, periodEnd: string) => void;
}) {
  // Default: previous month
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(firstOfMonth);
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const endLastMonth = new Date(firstOfMonth);
  endLastMonth.setDate(endLastMonth.getDate() - 1);

  const [periodStart, setPeriodStart] = useState(
    lastMonth.toISOString().slice(0, 10)
  );
  const [periodEnd, setPeriodEnd] = useState(
    endLastMonth.toISOString().slice(0, 10)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-heading font-bold text-foreground mb-1">
          Générer les factures
        </h2>
        <p className="text-sm text-foreground-muted mb-5">
          Génère automatiquement les factures pour toutes les sessions complétées sur la période sélectionnée.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">
              Début de période
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted pointer-events-none" />
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">
              Fin de période
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted pointer-events-none" />
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={generating}
            className="px-4 py-2 text-sm text-foreground-muted hover:text-foreground transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => onGenerate(periodStart, periodEnd)}
            disabled={generating || !periodStart || !periodEnd}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <Receipt className="w-4 h-4" />
                Générer
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
