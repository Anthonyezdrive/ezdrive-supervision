import { useState, useMemo, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SyncButton } from "@/components/shared/SyncButton";
import {
  FileCheck,
  Calculator,
  History,
  Download,
  Eye,
  ChevronLeft,
  ChevronRight,
  Zap,
  Euro,
  Clock,
  Send,
  Banknote,
  AlertTriangle,
  CheckCircle2,
  FileDown,
  CreditCard,
  Wifi,
  BarChart2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { KPICard } from "@/components/ui/KPICard";
import {
  useXDriveB2BClient,
  useXDriveCDRs,
  computeXDriveKPIs,
} from "@/hooks/useXDriveCDRs";
import { exportPDF } from "@/lib/b2b-export";
import type {
  XDrivePartner,
  XDriveTheme,
  XDriveModule,
  XDrivePartnerInvoice,
  XDriveReconciliation,
  XDriveBPUInvoice,
} from "@/types/xdrive";

// ── Outlet context ─────────────────────────────────────────

interface XDriveOutletContext {
  partner: XDrivePartner | null;
  isEZDriveAdmin: boolean;
  theme: XDriveTheme;
  isReadOnly: (module: XDriveModule) => boolean;
}

// ── Tabs ────────────────────────────────────────────────────

type BillingTab = "recap" | "verification" | "facturation" | "historique";

const TABS: { key: BillingTab; label: string; icon: typeof FileCheck }[] = [
  { key: "recap", label: "Recap CA", icon: BarChart2 },
  { key: "verification", label: "Vérification", icon: Eye },
  { key: "facturation", label: "Facturation", icon: Calculator },
  { key: "historique", label: "Historique", icon: History },
];

// ── Formatting helpers ─────────────────────────────────────

function fmtEUR(n: number): string {
  return (
    n.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function fmtNumber(n: number, decimals = 1): string {
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtMonthLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split("-");
  const months = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
  ];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function monthOffset(yyyyMM: string, delta: number): string {
  const [y, m] = yyyyMM.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function previousMonth(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// ── Status badge ───────────────────────────────────────────

const INVOICE_STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string; icon: typeof Clock }
> = {
  brouillon: {
    label: "Brouillon",
    bg: "bg-surface-elevated",
    text: "text-foreground-muted",
    border: "border-border",
    icon: Clock,
  },
  generee: {
    label: "Générée",
    bg: "bg-blue-500/15",
    text: "text-blue-400",
    border: "border-blue-500/25",
    icon: FileCheck,
  },
  envoyee: {
    label: "Envoyée",
    bg: "bg-purple-500/15",
    text: "text-purple-400",
    border: "border-purple-500/25",
    icon: Send,
  },
  payee: {
    label: "Payée",
    bg: "bg-emerald-500/15",
    text: "text-emerald-400",
    border: "border-emerald-500/25",
    icon: Banknote,
  },
  contestee: {
    label: "Contestée",
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/25",
    icon: AlertTriangle,
  },
};

function InvoiceStatusBadge({ status }: { status: string }) {
  const cfg = INVOICE_STATUS_CONFIG[status] || INVOICE_STATUS_CONFIG.brouillon;
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text} border ${cfg.border}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}

// ── Loading skeleton ───────────────────────────────────────

function BillingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-surface border border-border rounded-2xl p-6 h-[60px]" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface border border-border rounded-2xl p-5 h-[88px]" />
        ))}
      </div>
      <div className="bg-surface border border-border rounded-2xl p-6 h-[300px]" />
    </div>
  );
}

// ── Payment color map ──────────────────────────────────────

const PAYMENT_COLORS: Record<string, string> = {
  CB: "#3498DB",
  RFID: "#9ACC0E",
  App: "#F39C12",
  QR: "#9B59B6",
};

// ── Main component ─────────────────────────────────────────

export function XDriveBilling() {
  const { partner, isEZDriveAdmin, theme, isReadOnly: _isReadOnly } =
    useOutletContext<XDriveOutletContext>();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const primaryColor = theme?.primaryColor ?? "#9ACC0E";
  const partnerId = partner?.id ?? null;

  // Active tab
  const [activeTab, setActiveTab] = useState<BillingTab>("recap");

  // Month selector
  const [selectedMonth, setSelectedMonth] = useState<string>(previousMonth);

  // ── Fetch B2B client ──────────────────────────────────────
  const { data: b2bClient } = useXDriveB2BClient(partner?.b2b_client_id);
  const customerExternalIds = useMemo(
    () => b2bClient?.customer_external_ids ?? [],
    [b2bClient]
  );

  // ── Fetch CDRs for selected month ─────────────────────────
  const cdrFilters = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return {
      dateFrom: `${selectedMonth}-01T00:00:00Z`,
      dateTo: `${selectedMonth}-${String(lastDay).padStart(2, "0")}T23:59:59Z`,
      paymentTypes: ["CB", "RFID", "App", "QR"] as Array<"CB" | "RFID" | "App" | "QR">,
      operatorType: "all" as const,
    };
  }, [selectedMonth]);

  const { data: cdrs, isLoading: cdrsLoading } = useXDriveCDRs(customerExternalIds, cdrFilters);
  const kpis = useMemo(() => computeXDriveKPIs(cdrs ?? [], "GFX"), [cdrs]);

  // ── Fetch reconciliation for selected month ───────────────
  const { data: reconciliation, isLoading: reconLoading } = useQuery({
    queryKey: ["xdrive-reconciliation", partnerId, selectedMonth],
    queryFn: async () => {
      if (!partnerId) return null;
      const { data, error } = await supabase
        .from("xdrive_reconciliations")
        .select("*")
        .eq("partner_id", partnerId)
        .eq("period_month", selectedMonth)
        .maybeSingle();
      if (error) throw error;
      return data as XDriveReconciliation | null;
    },
    enabled: !!partnerId,
  });

  // ── Fetch BPU invoice for cross-reference ─────────────────
  const { data: bpuInvoice, isLoading: bpuLoading } = useQuery({
    queryKey: ["xdrive-bpu-invoice-month", partnerId, selectedMonth],
    queryFn: async () => {
      if (!partnerId) return null;
      const { data, error } = await supabase
        .from("xdrive_bpu_invoices")
        .select("id, invoice_number, total_ht, total_ttc")
        .eq("partner_id", partnerId)
        .eq("period_month", selectedMonth)
        .maybeSingle();
      if (error) throw error;
      return data as Pick<XDriveBPUInvoice, "id" | "invoice_number" | "total_ht" | "total_ttc"> | null;
    },
    enabled: !!partnerId,
  });

  // ── Fetch partner invoices (history) ──────────────────────
  const { data: partnerInvoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ["xdrive-partner-invoices", partnerId],
    queryFn: async () => {
      if (!partnerId) return [];
      const { data, error } = await supabase
        .from("xdrive_partner_invoices")
        .select("*, xdrive_bpu_invoices(invoice_number, total_ht)")
        .eq("partner_id", partnerId)
        .order("period_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as XDrivePartnerInvoice[];
    },
    enabled: !!partnerId,
  });

  // ── Fetch existing invoice for selected month ─────────────
  const existingInvoice = useMemo(
    () => partnerInvoices?.find((inv) => inv.period_month === selectedMonth) ?? null,
    [partnerInvoices, selectedMonth]
  );

  // ── Invoice form state ────────────────────────────────────
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");

  const soldeNet = kpis.caTTC - (bpuInvoice?.total_ht ?? 0);

  // ── Generate invoice mutation ─────────────────────────────
  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!partnerId) throw new Error("Aucun partenaire sélectionné");
      if (!invoiceNumber.trim()) throw new Error("Numéro de facture requis");

      const invoiceData = {
        partner_id: partnerId,
        invoice_number: invoiceNumber.trim(),
        period_month: selectedMonth,
        ca_reseau_ht: kpis.caHT,
        ca_reseau_ttc: kpis.caTTC,
        sessions_count: kpis.sessionCount,
        energy_kwh: kpis.totalEnergy,
        bpu_invoice_id: bpuInvoice?.id ?? null,
        bpu_invoice_number: bpuInvoice?.invoice_number ?? null,
        bpu_amount_ht: bpuInvoice?.total_ht ?? 0,
        solde_net: soldeNet,
        notes: invoiceNotes.trim() || null,
        status: "generee" as const,
        generated_by: (profile as unknown as Record<string, unknown>)?.id as string ?? null,
        generated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("xdrive_partner_invoices")
        .insert(invoiceData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xdrive-partner-invoices"] });
      setInvoiceNumber("");
      setInvoiceNotes("");
    },
  });

  // ── PDF export ────────────────────────────────────────────
  const handleExportPDF = useCallback(
    (invoice: XDrivePartnerInvoice) => {
      const partnerName = partner?.display_name ?? "Partenaire";
      exportPDF(
        `Facture ${partnerName} → EZDrive/SURAYA`,
        `Période : ${fmtMonthLabel(invoice.period_month)}`,
        [
          { key: "ligne", label: "Ligne", width: 3 },
          { key: "montant", label: "Montant", align: "right", width: 2 },
        ],
        [
          { ligne: `CA réseau TTC (${invoice.sessions_count} sessions, ${fmtNumber(invoice.energy_kwh)} kWh)`, montant: fmtEUR(invoice.ca_reseau_ttc) },
          { ligne: `Référence BPU : ${invoice.bpu_invoice_number ?? "N/A"}`, montant: fmtEUR(invoice.bpu_amount_ht) },
          { ligne: "Solde net (CA TTC - BPU HT)", montant: fmtEUR(invoice.solde_net) },
        ],
        `facture-${partnerName.toLowerCase().replace(/\s+/g, "-")}-${invoice.period_month}.pdf`,
        {
          kpis: [
            { label: "N° Facture", value: invoice.invoice_number },
            { label: "Période", value: fmtMonthLabel(invoice.period_month) },
            { label: "Solde net", value: fmtEUR(invoice.solde_net) },
          ],
        }
      );
    },
    [partner]
  );

  // ── Guard: no partner ─────────────────────────────────────
  if (!partner) {
    return (
      <div className="rounded-2xl border border-border bg-surface-elevated p-8 text-center">
        <p className="text-sm text-foreground-muted">Aucun partenaire sélectionné.</p>
      </div>
    );
  }

  const isLoading = cdrsLoading || reconLoading || bpuLoading || invoicesLoading;

  if (isLoading) {
    return <BillingSkeleton />;
  }

  // Read-only: EZDrive admins see generated invoices but cannot generate for partner
  // Partner users (Total) can generate invoices
  const canGenerate = !isEZDriveAdmin;

  return (
    <div className="space-y-6">
      {/* ── Month selector ──────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl p-4 flex items-center justify-between">
        <button
          onClick={() => setSelectedMonth((m) => monthOffset(m, -1))}
          className="p-2 rounded-xl border border-border hover:bg-surface-elevated transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-foreground-muted" />
        </button>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-heading font-bold text-foreground">
            {fmtMonthLabel(selectedMonth)}
          </h2>
          <SyncButton functionName="xdrive-stripe-reconciliation" label="Réconciliation Stripe" invalidateKeys={["xdrive-billing"]} variant="small" confirmMessage="Lancer la réconciliation Stripe ?" />
        </div>
        <button
          onClick={() => setSelectedMonth((m) => monthOffset(m, 1))}
          className="p-2 rounded-xl border border-border hover:bg-surface-elevated transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-foreground-muted" />
        </button>
      </div>

      {/* ── Tab navigation (in-page, not URL) ───────────────── */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-[1px] ${
              activeTab === tab.key
                ? "border-b-2"
                : "text-foreground-muted border-transparent hover:text-foreground hover:border-foreground-muted/30"
            }`}
            style={
              activeTab === tab.key
                ? { color: primaryColor, borderBottomColor: primaryColor }
                : {}
            }
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ─────────────────────────────────────── */}
      {activeTab === "recap" && (
        <RecapTab kpis={kpis} primaryColor={primaryColor} />
      )}

      {activeTab === "verification" && (
        <VerificationTab reconciliation={reconciliation} />
      )}

      {activeTab === "facturation" && (
        <FacturationTab
          kpis={kpis}
          bpuInvoice={bpuInvoice}
          soldeNet={soldeNet}
          existingInvoice={existingInvoice}
          invoiceNumber={invoiceNumber}
          invoiceNotes={invoiceNotes}
          onInvoiceNumberChange={setInvoiceNumber}
          onInvoiceNotesChange={setInvoiceNotes}
          onGenerate={() => generateMutation.mutate()}
          isGenerating={generateMutation.isPending}
          generateError={generateMutation.error}
          canGenerate={canGenerate}
          isEZDriveAdmin={isEZDriveAdmin}
          partnerName={partner.display_name}
          selectedMonth={selectedMonth}
          onExportPDF={handleExportPDF}
          primaryColor={primaryColor}
        />
      )}

      {activeTab === "historique" && (
        <HistoriqueTab
          invoices={partnerInvoices ?? []}
          onExportPDF={handleExportPDF}
        />
      )}
    </div>
  );
}

// ── Tab 1: Recap CA ──────────────────────────────────────────

interface RecapTabProps {
  kpis: ReturnType<typeof computeXDriveKPIs>;
  primaryColor: string;
}

function RecapTab({ kpis, primaryColor }: RecapTabProps) {
  // Payment ventilation data
  const paymentRows = useMemo(
    () =>
      Object.entries(kpis.caByPayment)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([method, ca]) => ({
          method,
          sessions: kpis.sessionsByPayment[method] ?? 0,
          ca,
        })),
    [kpis]
  );

  // eMSP ventilation data
  const emspRows = useMemo(
    () =>
      Object.entries(kpis.caByEmsp)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([emsp, ca]) => ({
          emsp,
          sessions: kpis.sessionsByEmsp[emsp] ?? 0,
          ca,
        })),
    [kpis]
  );

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Sessions complétées"
          value={kpis.sessionCount.toLocaleString("fr-FR")}
          icon={Zap}
          color={primaryColor}
        />
        <KPICard
          label="Énergie totale"
          value={`${fmtNumber(kpis.totalEnergy)} kWh`}
          icon={Zap}
          color="#9ACC0E"
        />
        <KPICard
          label="CA brut HT"
          value={fmtEUR(kpis.caHT)}
          icon={Euro}
          color="#F39C12"
        />
        <KPICard
          label="CA brut TTC"
          value={fmtEUR(kpis.caTTC)}
          icon={CreditCard}
          color="#E74C3C"
        />
      </div>

      {/* Ventilation par type de paiement */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-4 h-4 text-foreground-muted" />
          <h3 className="text-base font-semibold text-foreground">
            Ventilation par type de paiement
          </h3>
        </div>
        {paymentRows.length === 0 ? (
          <p className="text-sm text-foreground-muted text-center py-4">Aucune donnée</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-foreground-muted text-xs uppercase tracking-wider">
                  <th className="text-left py-2 px-3">Type</th>
                  <th className="text-right py-2 px-3">Sessions</th>
                  <th className="text-right py-2 px-3">CA HT</th>
                  <th className="text-right py-2 px-3">% CA</th>
                </tr>
              </thead>
              <tbody>
                {paymentRows.map((row) => (
                  <tr key={row.method} className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-foreground flex items-center gap-2">
                      <span
                        className="inline-block w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: PAYMENT_COLORS[row.method] ?? "#888" }}
                      />
                      {row.method}
                    </td>
                    <td className="py-2.5 px-3 text-right text-foreground-muted">
                      {row.sessions.toLocaleString("fr-FR")}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-foreground">
                      {fmtEUR(row.ca)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-foreground-muted">
                      {kpis.caHT > 0 ? fmtNumber((row.ca / kpis.caHT) * 100) + " %" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold text-foreground">
                  <td className="py-2.5 px-3">Total</td>
                  <td className="py-2.5 px-3 text-right">{kpis.sessionCount.toLocaleString("fr-FR")}</td>
                  <td className="py-2.5 px-3 text-right">{fmtEUR(kpis.caHT)}</td>
                  <td className="py-2.5 px-3 text-right">100 %</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Ventilation par opérateur eMSP */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Wifi className="w-4 h-4 text-foreground-muted" />
          <h3 className="text-base font-semibold text-foreground">
            Ventilation par opérateur eMSP
          </h3>
        </div>
        {emspRows.length === 0 ? (
          <p className="text-sm text-foreground-muted text-center py-4">Aucune donnée</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-foreground-muted text-xs uppercase tracking-wider">
                  <th className="text-left py-2 px-3">Opérateur</th>
                  <th className="text-right py-2 px-3">Sessions</th>
                  <th className="text-right py-2 px-3">CA HT</th>
                  <th className="text-right py-2 px-3">% CA</th>
                </tr>
              </thead>
              <tbody>
                {emspRows.map((row) => (
                  <tr key={row.emsp} className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-foreground">{row.emsp}</td>
                    <td className="py-2.5 px-3 text-right text-foreground-muted">
                      {row.sessions.toLocaleString("fr-FR")}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-foreground">
                      {fmtEUR(row.ca)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-foreground-muted">
                      {kpis.caHT > 0 ? fmtNumber((row.ca / kpis.caHT) * 100) + " %" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold text-foreground">
                  <td className="py-2.5 px-3">Total</td>
                  <td className="py-2.5 px-3 text-right">{kpis.sessionCount.toLocaleString("fr-FR")}</td>
                  <td className="py-2.5 px-3 text-right">{fmtEUR(kpis.caHT)}</td>
                  <td className="py-2.5 px-3 text-right">100 %</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Link to CDR details */}
      <div className="text-center">
        <a
          href="/xdrive/cdrs"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
        >
          <FileCheck className="w-4 h-4" />
          Voir les CDR détaillés
        </a>
      </div>
    </div>
  );
}

// ── Tab 2: Vérification ──────────────────────────────────────

interface VerificationTabProps {
  reconciliation: XDriveReconciliation | null | undefined;
}

function VerificationTab({ reconciliation }: VerificationTabProps) {
  if (!reconciliation) {
    return (
      <div className="rounded-2xl border border-border bg-surface-elevated p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-yellow-400" />
          </div>
        </div>
        <h3 className="text-lg font-heading font-bold text-foreground mb-2">
          Données non disponibles
        </h3>
        <p className="text-sm text-foreground-muted max-w-md mx-auto">
          En attente de saisie par EZDrive. Les données de rapprochement
          pour cette période n'ont pas encore été renseignées.
        </p>
      </div>
    );
  }

  const statusLabel =
    reconciliation.status === "approved"
      ? "Approuvé"
      : reconciliation.status === "verified"
      ? "Vérifié"
      : "Brouillon";

  const statusColor =
    reconciliation.status === "approved"
      ? "text-green-400"
      : reconciliation.status === "verified"
      ? "text-yellow-400"
      : "text-foreground-muted";

  return (
    <div className="space-y-6">
      {/* Read-only banner */}
      <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
        <Eye className="w-4 h-4 text-blue-400 shrink-0" />
        <p className="text-sm text-blue-300">
          Vue en lecture seule — les données sont saisies et vérifiées par EZDrive.
        </p>
      </div>

      {/* Reconciliation summary */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">
            Rapprochement encaissements
          </h3>
          <span className={`text-xs font-medium ${statusColor}`}>
            {statusLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-surface-elevated rounded-xl p-4 border border-border">
            <p className="text-xs text-foreground-muted mb-1">CB / PSP</p>
            <p className="text-xl font-heading font-bold text-foreground">
              {fmtEUR(reconciliation.encaissements_cb)}
            </p>
          </div>
          <div className="bg-surface-elevated rounded-xl p-4 border border-border">
            <p className="text-xs text-foreground-muted mb-1">eMSP (reversements)</p>
            <p className="text-xl font-heading font-bold text-foreground">
              {fmtEUR(reconciliation.encaissements_emsp)}
            </p>
          </div>
          <div className="bg-surface-elevated rounded-xl p-4 border border-border">
            <p className="text-xs text-foreground-muted mb-1">App / QR</p>
            <p className="text-xl font-heading font-bold text-foreground">
              {fmtEUR(reconciliation.encaissements_app)}
            </p>
          </div>
        </div>

        {/* CA vs Encaissements */}
        <div className="bg-surface-elevated rounded-xl p-4 border border-border">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-foreground-muted mb-1">CA réseau TTC</p>
              <p className="text-lg font-heading font-bold text-foreground">
                {fmtEUR(reconciliation.ca_cdrs_ttc)}
              </p>
            </div>
            <div>
              <p className="text-xs text-foreground-muted mb-1">Total encaissé</p>
              <p className="text-lg font-heading font-bold text-foreground">
                {fmtEUR(reconciliation.total_encaisse)}
              </p>
            </div>
            <div>
              <p className="text-xs text-foreground-muted mb-1">Écart</p>
              <p
                className={`text-lg font-heading font-bold ${
                  reconciliation.ecart_brut === 0
                    ? "text-green-400"
                    : reconciliation.ecart_brut > 0
                    ? "text-yellow-400"
                    : "text-red-400"
                }`}
              >
                {fmtEUR(reconciliation.ecart_brut)}
              </p>
            </div>
          </div>
        </div>

        {/* Gap decomposition */}
        {reconciliation.ecart_details && Object.keys(reconciliation.ecart_details).length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-foreground mb-2">Décomposition de l'écart</h4>
            <div className="space-y-1">
              {Object.entries(reconciliation.ecart_details).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-surface-elevated/50">
                  <span className="text-sm text-foreground-muted capitalize">
                    {key.replace(/_/g, " ")}
                  </span>
                  <span className="text-sm font-medium text-foreground">{fmtEUR(val)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {reconciliation.notes && (
          <div className="mt-4 p-3 rounded-xl bg-surface-elevated/50 border border-border">
            <p className="text-xs text-foreground-muted mb-1">Notes</p>
            <p className="text-sm text-foreground">{reconciliation.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab 3: Facturation ───────────────────────────────────────

interface FacturationTabProps {
  kpis: ReturnType<typeof computeXDriveKPIs>;
  bpuInvoice: Pick<XDriveBPUInvoice, "id" | "invoice_number" | "total_ht" | "total_ttc"> | null | undefined;
  soldeNet: number;
  existingInvoice: XDrivePartnerInvoice | null;
  invoiceNumber: string;
  invoiceNotes: string;
  onInvoiceNumberChange: (v: string) => void;
  onInvoiceNotesChange: (v: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  generateError: Error | null;
  canGenerate: boolean;
  isEZDriveAdmin: boolean;
  partnerName: string;
  selectedMonth: string;
  onExportPDF: (invoice: XDrivePartnerInvoice) => void;
  primaryColor: string;
}

function FacturationTab({
  kpis,
  bpuInvoice,
  soldeNet,
  existingInvoice,
  invoiceNumber,
  invoiceNotes,
  onInvoiceNumberChange,
  onInvoiceNotesChange,
  onGenerate,
  isGenerating,
  generateError,
  canGenerate: _canGenerate,
  isEZDriveAdmin,
  partnerName,
  selectedMonth,
  onExportPDF,
  primaryColor,
}: FacturationTabProps) {
  // If invoice already exists for this month, show preview
  if (existingInvoice) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
          <p className="text-sm text-green-300">
            Une facture a déjà été générée pour cette période.
          </p>
        </div>

        {/* Invoice preview */}
        <div className="bg-surface border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-semibold text-foreground">
              Facture {existingInvoice.invoice_number}
            </h3>
            <InvoiceStatusBadge status={existingInvoice.status} />
          </div>

          <div className="bg-surface-elevated rounded-xl p-5 border border-border mb-4">
            <p className="text-xs text-foreground-muted mb-3 uppercase tracking-wider">
              {partnerName} → EZDrive / SURAYA
            </p>
            <p className="text-sm text-foreground mb-4">
              Période : {fmtMonthLabel(existingInvoice.period_month)}
            </p>

            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-border/50">
                <span className="text-sm text-foreground">
                  CA réseau TTC ({existingInvoice.sessions_count} sessions,{" "}
                  {fmtNumber(existingInvoice.energy_kwh)} kWh)
                </span>
                <span className="text-sm font-medium text-foreground">
                  {fmtEUR(existingInvoice.ca_reseau_ttc)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/50">
                <span className="text-sm text-foreground">
                  Référence BPU : {existingInvoice.bpu_invoice_number ?? "N/A"}
                </span>
                <span className="text-sm font-medium text-foreground">
                  - {fmtEUR(existingInvoice.bpu_amount_ht)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-t-2 border-border">
                <span className="text-sm font-bold text-foreground">Solde net</span>
                <span
                  className="text-lg font-heading font-bold"
                  style={{ color: primaryColor }}
                >
                  {fmtEUR(existingInvoice.solde_net)}
                </span>
              </div>
            </div>

            {existingInvoice.notes && (
              <div className="mt-4 p-3 rounded-lg bg-surface/50 border border-border/50">
                <p className="text-xs text-foreground-muted">Notes : {existingInvoice.notes}</p>
              </div>
            )}

            <p className="text-[11px] text-foreground-muted/50 mt-4">
              Annexe CDR disponible en téléchargement PDF
            </p>
          </div>

          <button
            onClick={() => onExportPDF(existingInvoice)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border border-border hover:bg-surface-elevated text-foreground"
          >
            <Download className="w-4 h-4" />
            Télécharger PDF
          </button>
        </div>
      </div>
    );
  }

  // No invoice yet — show generation form (or read-only for EZDrive)
  if (isEZDriveAdmin) {
    return (
      <div className="rounded-2xl border border-border bg-surface-elevated p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
            <Eye className="w-7 h-7 text-blue-400" />
          </div>
        </div>
        <h3 className="text-lg font-heading font-bold text-foreground mb-2">
          Aucune facture pour cette période
        </h3>
        <p className="text-sm text-foreground-muted max-w-md mx-auto">
          La facture partenaire pour {fmtMonthLabel(selectedMonth)} n'a pas encore été générée.
          Cette action est à l'initiative du partenaire.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Auto-calculated summary */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <h3 className="text-base font-semibold text-foreground mb-4">
          Génération de facture — {fmtMonthLabel(selectedMonth)}
        </h3>

        <div className="space-y-4 mb-6">
          {/* CA réseau */}
          <div className="flex items-center justify-between py-3 px-4 bg-surface-elevated rounded-xl border border-border">
            <div>
              <p className="text-sm font-medium text-foreground">CA réseau TTC</p>
              <p className="text-xs text-foreground-muted">
                {kpis.sessionCount} sessions · {fmtNumber(kpis.totalEnergy)} kWh
              </p>
            </div>
            <p className="text-lg font-heading font-bold text-foreground">
              {fmtEUR(kpis.caTTC)}
            </p>
          </div>

          {/* BPU cross-reference */}
          <div className="flex items-center justify-between py-3 px-4 bg-surface-elevated rounded-xl border border-border">
            <div>
              <p className="text-sm font-medium text-foreground">Facture BPU du mois</p>
              <p className="text-xs text-foreground-muted">
                {bpuInvoice ? `Ref: ${bpuInvoice.invoice_number}` : "Aucune facture BPU trouvée"}
              </p>
            </div>
            <p className="text-lg font-heading font-bold text-foreground">
              - {fmtEUR(bpuInvoice?.total_ht ?? 0)}
            </p>
          </div>

          {/* Solde net */}
          <div className="flex items-center justify-between py-3 px-4 rounded-xl border-2" style={{ borderColor: `${primaryColor}40`, backgroundColor: `${primaryColor}08` }}>
            <p className="text-sm font-bold text-foreground">Solde net (CA TTC - BPU HT)</p>
            <p className="text-xl font-heading font-bold" style={{ color: primaryColor }}>
              {fmtEUR(soldeNet)}
            </p>
          </div>
        </div>

        {/* Invoice form */}
        <div className="space-y-4 border-t border-border pt-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Numéro de facture *
            </label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => onInvoiceNumberChange(e.target.value)}
              placeholder="Ex: FACT-TOTAL-2026-03"
              className="w-full px-4 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Notes (optionnel)
            </label>
            <textarea
              value={invoiceNotes}
              onChange={(e) => onInvoiceNotesChange(e.target.value)}
              placeholder="Commentaires ou précisions..."
              rows={3}
              className="w-full px-4 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus resize-none"
            />
          </div>

          {generateError && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-300">
                {generateError.message}
              </p>
            </div>
          )}

          <button
            onClick={onGenerate}
            disabled={isGenerating || !invoiceNumber.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: primaryColor }}
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <FileCheck className="w-4 h-4" />
                Générer la facture
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab 4: Historique ────────────────────────────────────────

interface HistoriqueTabProps {
  invoices: XDrivePartnerInvoice[];
  onExportPDF: (invoice: XDrivePartnerInvoice) => void;
}

function HistoriqueTab({ invoices, onExportPDF }: HistoriqueTabProps) {
  if (invoices.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface-elevated p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center border border-border">
            <History className="w-7 h-7 text-foreground-muted" />
          </div>
        </div>
        <h3 className="text-lg font-heading font-bold text-foreground mb-2">
          Aucune facture
        </h3>
        <p className="text-sm text-foreground-muted max-w-md mx-auto">
          Aucune facture partenaire n'a été générée pour le moment.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-elevated/50">
              <th className="text-left py-3 px-4 text-xs text-foreground-muted uppercase tracking-wider font-medium">
                Mois
              </th>
              <th className="text-left py-3 px-4 text-xs text-foreground-muted uppercase tracking-wider font-medium">
                N° Facture
              </th>
              <th className="text-right py-3 px-4 text-xs text-foreground-muted uppercase tracking-wider font-medium">
                CA Réseau
              </th>
              <th className="text-left py-3 px-4 text-xs text-foreground-muted uppercase tracking-wider font-medium">
                BPU Réf
              </th>
              <th className="text-right py-3 px-4 text-xs text-foreground-muted uppercase tracking-wider font-medium">
                Solde Net
              </th>
              <th className="text-center py-3 px-4 text-xs text-foreground-muted uppercase tracking-wider font-medium">
                Statut
              </th>
              <th className="text-center py-3 px-4 text-xs text-foreground-muted uppercase tracking-wider font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-border/50 hover:bg-surface-elevated/30 transition-colors">
                <td className="py-3 px-4 text-foreground font-medium">
                  {fmtMonthLabel(inv.period_month)}
                </td>
                <td className="py-3 px-4 text-foreground font-mono text-xs">
                  {inv.invoice_number}
                </td>
                <td className="py-3 px-4 text-right text-foreground">
                  {fmtEUR(inv.ca_reseau_ttc)}
                </td>
                <td className="py-3 px-4 text-foreground-muted text-xs">
                  {inv.bpu_invoice_number ?? "—"}
                </td>
                <td className="py-3 px-4 text-right font-bold text-foreground">
                  {fmtEUR(inv.solde_net)}
                </td>
                <td className="py-3 px-4 text-center">
                  <InvoiceStatusBadge status={inv.status} />
                </td>
                <td className="py-3 px-4 text-center">
                  <button
                    onClick={() => onExportPDF(inv)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
                    title="Télécharger PDF"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
