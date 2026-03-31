import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  FileText,
  CreditCard,
  RefreshCcw,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  X,
  ExternalLink,
  Search,
  Wallet,
  TrendingUp,
  BarChart3,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SessionsPage } from "@/components/sessions/SessionsPage";
import { InvoicesPage } from "@/components/invoices/InvoicesPage";
import { useSettlements, useSettlementDetail } from "@/hooks/useSettlements";
import { SyncButton } from "@/components/shared/SyncButton";
import { supabase } from "@/lib/supabase";
import { apiPost } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { useTranslation } from "react-i18next";

const TABS = [
  { key: "sessions", label: "Sessions CDR", icon: Activity },
  { key: "invoices", label: "Factures", icon: FileText },
  { key: "revenue", label: "Chiffre d'affaires", icon: TrendingUp },
  { key: "payments", label: "Paiements Stripe", icon: CreditCard },
  { key: "disputes", label: "Litiges", icon: AlertTriangle },
  { key: "methods", label: "Methodes de paiement", icon: Wallet },
  { key: "transfers", label: "Virements", icon: ArrowRightLeft },
  { key: "settlements", label: "Settlements", icon: CalendarDays },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function BillingPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>("sessions");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-xl font-bold text-foreground">CDRs & Factures</h1>
        <p className="text-sm text-foreground-muted mt-0.5">Sessions de charge et facturation</p>
      </div>
      {/* Sync toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-foreground-muted whitespace-nowrap">Synchronisations :</span>
        <SyncButton functionName="gfx-cdr-sync" label="Sync CDR GreenFlux" invalidateKeys={["billing", "sessions", "cdrs"]} variant="small" formatSuccess={(d) => `GFX: ${d.total_ingested ?? 0} CDR importés`} />
        <SyncButton functionName="gfx-cdr-bulk-import" label="Import CDR GFX (bulk)" invalidateKeys={["billing", "sessions", "cdrs"]} variant="small" confirmMessage="Importer tous les CDR GreenFlux ? Cette opération peut prendre du temps." formatSuccess={(d) => `GFX bulk: ${d.total_upserted ?? 0} CDR importés`} />
        <SyncButton functionName="road-cdr-sync" label="Sync CDR Road.io" invalidateKeys={["billing", "sessions", "cdrs"]} variant="small" formatSuccess={(d) => `Road: ${d.total_ingested ?? 0} CDR importés`} />
        <SyncButton functionName="settlement-engine" label="Settlement mensuel" invalidateKeys={["billing", "invoices"]} variant="small" confirmMessage="Lancer le settlement mensuel ? Cela va générer les factures." />
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap",
              tab === t.key ? "text-primary" : "text-foreground-muted hover:text-foreground"
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {tab === t.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
          </button>
        ))}
      </div>
      {tab === "sessions" && <SessionsPage />}
      {tab === "invoices" && <InvoicesPage />}
      {tab === "revenue" && <RevenueByPeriodSection />}
      {tab === "payments" && <StripePaymentsSection />}
      {tab === "disputes" && <StripeDisputesSection />}
      {tab === "methods" && <PaymentMethodsConfigSection />}
      {tab === "transfers" && <TransfersSection />}
      {tab === "settlements" && <SettlementsSection />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Story 97: View Stripe payments in real-time
// ══════════════════════════════════════════════════════════════

interface StripePayment {
  id: string;
  created_at: string;
  amount: number;
  currency: string;
  customer_email: string | null;
  customer_name: string | null;
  status: string;
  payment_method: string | null;
  invoice_id: string | null;
}

function StripePaymentsSection() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [refundPayment, setRefundPayment] = useState<StripePayment | null>(null);

  const { data: payments, isLoading } = useQuery({
    queryKey: ["stripe-payments"],
    queryFn: async () => {
      // Query from invoices table with payment status, or a dedicated payments table
      const { data, error } = await supabase
        .from("invoices")
        .select("id, created_at, total_amount, currency, customer_email, customer_name, payment_status, payment_method, stripe_invoice_id")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((inv: any) => ({
        id: inv.id,
        created_at: inv.created_at,
        amount: inv.total_amount ?? 0,
        currency: inv.currency ?? "EUR",
        customer_email: inv.customer_email,
        customer_name: inv.customer_name,
        status: inv.payment_status ?? "pending",
        payment_method: inv.payment_method ?? "card",
        invoice_id: inv.stripe_invoice_id,
      })) as StripePayment[];
    },
    refetchInterval: 30000, // Auto-refresh every 30s
  });

  const filtered = useMemo(() => {
    let result = payments ?? [];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        (p.customer_email ?? "").toLowerCase().includes(q) ||
        (p.customer_name ?? "").toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    }
    if (statusFilter) {
      result = result.filter((p) => p.status === statusFilter);
    }
    return result;
  }, [payments, search, statusFilter]);

  const statusConfig: Record<string, { label: string; bg: string; text: string; icon: typeof CheckCircle }> = {
    succeeded: { label: "Reussi", bg: "bg-emerald-500/15", text: "text-emerald-400", icon: CheckCircle },
    paid: { label: "Paye", bg: "bg-emerald-500/15", text: "text-emerald-400", icon: CheckCircle },
    failed: { label: "Echoue", bg: "bg-red-500/15", text: "text-red-400", icon: XCircle },
    pending: { label: "En attente", bg: "bg-yellow-500/15", text: "text-yellow-400", icon: Clock },
    refunded: { label: "Rembourse", bg: "bg-blue-500/15", text: "text-blue-400", icon: RefreshCcw },
  };

  // Facturation P1: KPIs for payments
  const kpis = useMemo(() => {
    if (!payments) return null;
    const succeeded = payments.filter((p) => p.status === "succeeded" || p.status === "paid");
    const failed = payments.filter((p) => p.status === "failed");
    const pending = payments.filter((p) => p.status === "pending");
    const totalRevenue = succeeded.reduce((s, p) => s + p.amount, 0);
    return {
      total: payments.length,
      succeeded: succeeded.length,
      failed: failed.length,
      pending: pending.length,
      revenue: totalRevenue,
    };
  }, [payments]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <CreditCard className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-base font-heading font-bold text-foreground">Paiements Stripe</h2>
          <p className="text-xs text-foreground-muted">Rafraichissement automatique toutes les 30s</p>
        </div>
      </div>

      {/* Facturation P1: Payment KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-surface border border-border rounded-xl p-3">
            <p className="text-lg font-bold text-foreground">{kpis.total}</p>
            <p className="text-xs text-foreground-muted">Total</p>
          </div>
          <div className="bg-surface border border-emerald-500/20 rounded-xl p-3">
            <p className="text-lg font-bold text-emerald-400">{kpis.succeeded}</p>
            <p className="text-xs text-foreground-muted">Réussis</p>
          </div>
          <div className="bg-surface border border-yellow-500/20 rounded-xl p-3">
            <p className="text-lg font-bold text-yellow-400">{kpis.pending}</p>
            <p className="text-xs text-foreground-muted">En attente</p>
          </div>
          <div className="bg-surface border border-red-500/20 rounded-xl p-3">
            <p className="text-lg font-bold text-red-400">{kpis.failed}</p>
            <p className="text-xs text-foreground-muted">Échoués</p>
          </div>
          <div className="bg-surface border border-primary/20 rounded-xl p-3">
            <p className="text-lg font-bold text-primary">{(kpis.revenue / 100).toFixed(2)} €</p>
            <p className="text-xs text-foreground-muted">CA encaissé</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par client, email..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-surface border border-border rounded-xl focus:outline-none focus:border-primary/50 placeholder:text-foreground-muted"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-surface border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
        >
          <option value="">Tous les statuts</option>
          <option value="succeeded">Reussi</option>
          <option value="paid">Paye</option>
          <option value="pending">En attente</option>
          <option value="failed">Echoue</option>
          <option value="refunded">Rembourse</option>
        </select>
        <span className="text-xs text-foreground-muted">{filtered.length} paiement(s)</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Client</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase">Montant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Methode</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((payment) => {
                  const sc = statusConfig[payment.status] ?? statusConfig.pending;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={payment.id} className="hover:bg-surface-elevated/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                        {new Date(payment.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-foreground">{payment.customer_name ?? "\u2014"}</p>
                        <p className="text-xs text-foreground-muted">{payment.customer_email ?? "\u2014"}</p>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">
                        {(payment.amount / 100).toFixed(2)} {payment.currency.toUpperCase()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium", sc.bg, sc.text)}>
                          <StatusIcon className="w-3 h-3" />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted capitalize">{payment.payment_method ?? "\u2014"}</td>
                      <td className="px-4 py-3 text-right">
                        {(payment.status === "succeeded" || payment.status === "paid") && (
                          <button
                            onClick={() => setRefundPayment(payment)}
                            className="text-xs text-primary hover:text-primary/80 font-medium"
                          >
                            Rembourser
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-foreground-muted">Aucun paiement</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Story 98: Refund dialog */}
      {refundPayment && (
        <RefundDialog
          payment={refundPayment}
          onClose={() => setRefundPayment(null)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Story 98: Refund a payment
// ══════════════════════════════════════════════════════════════

function RefundDialog({ payment, onClose }: { payment: StripePayment; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [partialAmount, setPartialAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  async function handleRefund() {
    setLoading(true);
    setResult(null);
    try {
      const amount = refundType === "full" ? payment.amount : Math.round(parseFloat(partialAmount) * 100);
      await apiPost("stripe/refund", {
        payment_id: payment.id,
        invoice_id: payment.invoice_id,
        amount,
      });
      setResult({ success: true, message: "Remboursement effectue avec succes" });
      queryClient.invalidateQueries({ queryKey: ["stripe-payments"] });
    } catch (err) {
      setResult({ success: false, message: `Erreur: ${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/15 flex items-center justify-center">
              <RefreshCcw className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Rembourser</h2>
              <p className="text-xs text-foreground-muted">{payment.customer_name ?? payment.customer_email ?? "Client"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {result ? (
            <div className={cn(
              "rounded-xl px-4 py-3 text-sm font-medium border",
              result.success
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-red-500/10 text-red-400 border-red-500/30"
            )}>
              {result.message}
            </div>
          ) : (
            <>
              <div className="bg-surface-elevated rounded-xl p-4">
                <p className="text-xs text-foreground-muted">Montant original</p>
                <p className="text-xl font-bold text-foreground">{(payment.amount / 100).toFixed(2)} {payment.currency.toUpperCase()}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setRefundType("full")}
                  className={cn(
                    "flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all",
                    refundType === "full"
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "text-foreground-muted border-border hover:border-foreground-muted"
                  )}
                >
                  Remboursement total
                </button>
                <button
                  onClick={() => setRefundType("partial")}
                  className={cn(
                    "flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all",
                    refundType === "partial"
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "text-foreground-muted border-border hover:border-foreground-muted"
                  )}
                >
                  Remboursement partiel
                </button>
              </div>

              {refundType === "partial" && (
                <div>
                  <label className="block text-xs font-medium text-foreground-muted mb-1.5">Montant a rembourser ({payment.currency.toUpperCase()})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={(payment.amount / 100).toFixed(2)}
                    value={partialAmount}
                    onChange={(e) => setPartialAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-surface-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-foreground-muted/10 text-foreground-muted font-semibold text-sm hover:bg-foreground-muted/20">
                  Annuler
                </button>
                <button
                  onClick={handleRefund}
                  disabled={loading || (refundType === "partial" && (!partialAmount || parseFloat(partialAmount) <= 0))}
                  className="flex-1 py-2.5 rounded-xl bg-yellow-500 text-background font-semibold text-sm hover:bg-yellow-500/90 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                  Rembourser
                </button>
              </div>
            </>
          )}

          {result && (
            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-foreground-muted/10 text-foreground-muted font-semibold text-sm hover:bg-foreground-muted/20">
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Story 99: View Stripe disputes
// ══════════════════════════════════════════════════════════════

function StripeDisputesSection() {
  const { data: disputes, isLoading } = useQuery({
    queryKey: ["stripe-disputes"],
    queryFn: async () => {
      // Query from a disputes table or fallback to invoices with disputed status
      const { data, error } = await supabase
        .from("stripe_disputes")
        .select("id, created_at, amount, currency, reason, status, payment_id, customer_email")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        // If table doesn't exist, return empty
        return [];
      }
      return data ?? [];
    },
  });

  const statusColors: Record<string, string> = {
    needs_response: "bg-red-500/15 text-red-400",
    under_review: "bg-yellow-500/15 text-yellow-400",
    won: "bg-emerald-500/15 text-emerald-400",
    lost: "bg-foreground-muted/15 text-foreground-muted",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          <div>
            <h2 className="text-base font-heading font-bold text-foreground">Litiges Stripe</h2>
            <p className="text-xs text-foreground-muted">Paiements contestes par les clients</p>
          </div>
        </div>
        <a
          href="https://dashboard.stripe.com/disputes"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-primary font-medium hover:bg-primary/10 rounded-xl transition-colors"
        >
          Stripe Dashboard <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (disputes ?? []).length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-foreground-muted mx-auto mb-3" />
          <p className="text-foreground font-medium">Aucun litige</p>
          <p className="text-sm text-foreground-muted mt-1">Les litiges Stripe apparaitront ici lorsqu'un client conteste un paiement.</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Client</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase">Montant</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Raison</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(disputes ?? []).map((d: any) => (
                <tr key={d.id} className="hover:bg-surface-elevated/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-foreground-muted">{new Date(d.created_at).toLocaleDateString("fr-FR")}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{d.customer_email ?? "\u2014"}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">{((d.amount ?? 0) / 100).toFixed(2)} {(d.currency ?? "EUR").toUpperCase()}</td>
                  <td className="px-4 py-3 text-sm text-foreground-muted capitalize">{(d.reason ?? "unknown").replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2 py-0.5 rounded text-xs font-medium", statusColors[d.status] ?? statusColors.needs_response)}>
                      {d.status?.replace(/_/g, " ") ?? "inconnu"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Story 100: Configure accepted payment methods
// ══════════════════════════════════════════════════════════════

const PAYMENT_METHODS = [
  { key: "card", label: "Carte bancaire (CB/Visa/MC)", description: "Paiement par carte de credit ou debit" },
  { key: "apple_pay", label: "Apple Pay", description: "Paiement via Apple Pay sur iOS/macOS" },
  { key: "google_pay", label: "Google Pay", description: "Paiement via Google Pay sur Android" },
  { key: "sepa_debit", label: "Prelevement SEPA", description: "Prelevement bancaire europeen" },
];

function PaymentMethodsConfigSection() {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ["payment-methods-config"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("accepted_payment_methods")
        .eq("id", "default")
        .maybeSingle();
      return (data?.accepted_payment_methods as string[] | null) ?? ["card"];
    },
  });

  const [methods, setMethods] = useState<string[]>(["card"]);

  // Sync config -> state
  useState(() => {
    if (config) setMethods(config);
  });

  // Keep in sync
  useMemo(() => {
    if (config) setMethods(config);
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("platform_settings")
        .upsert({ id: "default", accepted_payment_methods: methods });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-methods-config"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  function toggleMethod(key: string) {
    setMethods((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Wallet className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-base font-heading font-bold text-foreground">Methodes de paiement acceptees</h2>
          <p className="text-xs text-foreground-muted">Configurez les moyens de paiement disponibles pour les conducteurs</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
          {PAYMENT_METHODS.map((pm) => (
            <label key={pm.key} className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-surface-elevated/30 transition-colors">
              <input
                type="checkbox"
                checked={methods.includes(pm.key)}
                onChange={() => toggleMethod(pm.key)}
                className="w-5 h-5 rounded border-border text-primary focus:ring-primary"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{pm.label}</p>
                <p className="text-xs text-foreground-muted">{pm.description}</p>
              </div>
              {methods.includes(pm.key) && (
                <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-400 text-xs font-medium rounded">Actif</span>
              )}
            </label>
          ))}

          <div className="px-5 py-4">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-background font-semibold rounded-xl text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : null}
              {saved ? "Sauvegarde !" : "Sauvegarder"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Facturation P1: Revenue by period (CA par période)
// ══════════════════════════════════════════════════════════════

type RevenuePeriod = "day" | "week" | "month" | "year";

interface RevenueRow {
  period: string;
  label: string;
  sessions: number;
  energy_kwh: number;
  revenue_ht: number;
  revenue_ttc: number;
  vat: number;
}

function RevenueByPeriodSection() {
  const [granularity, setGranularity] = useState<RevenuePeriod>("month");
  const [year, setYear] = useState(new Date().getFullYear());

  const { data: revenueData, isLoading } = useQuery<RevenueRow[]>({
    queryKey: ["revenue-by-period", granularity, year],
    queryFn: async () => {
      // Fetch all CDRs for the selected year
      const { data, error } = await supabase
        .from("ocpi_cdrs")
        .select("start_date_time, total_energy, total_cost, total_cost_incl_vat, total_vat")
        .gte("start_date_time", `${year}-01-01`)
        .lt("start_date_time", `${year + 1}-01-01`)
        .order("start_date_time", { ascending: true });

      if (error) throw error;
      const cdrs = (data ?? []) as Array<{
        start_date_time: string;
        total_energy: number;
        total_cost: number;
        total_cost_incl_vat: number | null;
        total_vat: number | null;
      }>;

      // Group by period
      const groups = new Map<string, { sessions: number; energy: number; ht: number; ttc: number; vat: number }>();

      for (const cdr of cdrs) {
        const d = new Date(cdr.start_date_time);
        let key: string;

        if (granularity === "day") {
          key = d.toISOString().slice(0, 10);
        } else if (granularity === "week") {
          // ISO week
          const jan1 = new Date(d.getFullYear(), 0, 1);
          const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
          key = `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
        } else if (granularity === "month") {
          key = d.toISOString().slice(0, 7);
        } else {
          key = String(d.getFullYear());
        }

        const g = groups.get(key) ?? { sessions: 0, energy: 0, ht: 0, ttc: 0, vat: 0 };
        g.sessions += 1;
        g.energy += Number(cdr.total_energy) || 0;
        g.ht += Number(cdr.total_cost) || 0;
        g.ttc += Number(cdr.total_cost_incl_vat) || Number(cdr.total_cost) || 0;
        g.vat += Number(cdr.total_vat) || 0;
        groups.set(key, g);
      }

      return Array.from(groups.entries()).map(([period, g]) => ({
        period,
        label: groups.size > 0 ? (() => {
          const d2 = new Date(period + (granularity === "month" ? "-01" : granularity === "day" ? "" : ""));
          if (granularity === "month") return d2.toLocaleDateString("fr-FR", { month: "long" });
          if (granularity === "day") return d2.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
          if (granularity === "week") return period.replace(`${year}-`, "");
          return period;
        })() : period,
        sessions: g.sessions,
        energy_kwh: g.energy,
        revenue_ht: g.ht,
        revenue_ttc: g.ttc,
        vat: g.vat,
      }));
    },
  });

  // Totals
  const totals = useMemo(() => {
    if (!revenueData) return null;
    return {
      sessions: revenueData.reduce((s, r) => s + r.sessions, 0),
      energy: revenueData.reduce((s, r) => s + r.energy_kwh, 0),
      ht: revenueData.reduce((s, r) => s + r.revenue_ht, 0),
      ttc: revenueData.reduce((s, r) => s + r.revenue_ttc, 0),
      vat: revenueData.reduce((s, r) => s + r.vat, 0),
    };
  }, [revenueData]);

  // Max revenue for bar chart scaling
  const maxRevenue = useMemo(() => {
    if (!revenueData?.length) return 1;
    return Math.max(...revenueData.map((r) => r.revenue_ttc), 1);
  }, [revenueData]);

  const granularities: { key: RevenuePeriod; label: string }[] = [
    { key: "day", label: "Jour" },
    { key: "week", label: "Semaine" },
    { key: "month", label: "Mois" },
    { key: "year", label: "Année" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-base font-heading font-bold text-foreground">Chiffre d'affaires</h2>
            <p className="text-xs text-foreground-muted">Revenus agrégés par période depuis les CDRs</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setYear(year - 1)} className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors">
            <CalendarDays className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-foreground">{year}</span>
          <button onClick={() => setYear(year + 1)} disabled={year >= new Date().getFullYear()} className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-30">
            <CalendarDays className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Granularity selector */}
      <div className="flex gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
        {granularities.map((g) => (
          <button
            key={g.key}
            onClick={() => setGranularity(g.key)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              granularity === g.key ? "bg-primary/15 text-primary" : "text-foreground-muted hover:text-foreground"
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* KPI totals */}
      {totals && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-surface border border-primary/20 rounded-xl p-4">
            <p className="text-2xl font-bold text-primary">{totals.ttc.toFixed(2)} €</p>
            <p className="text-xs text-foreground-muted">CA TTC</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{totals.ht.toFixed(2)} €</p>
            <p className="text-xs text-foreground-muted">CA HT</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{totals.vat.toFixed(2)} €</p>
            <p className="text-xs text-foreground-muted">TVA collectée</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{totals.sessions.toLocaleString("fr-FR")}</p>
            <p className="text-xs text-foreground-muted">Sessions</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{totals.energy >= 1000 ? `${(totals.energy / 1000).toFixed(1)} MWh` : `${totals.energy.toFixed(0)} kWh`}</p>
            <p className="text-xs text-foreground-muted">Énergie</p>
          </div>
        </div>
      )}

      {/* Chart + Table */}
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : !revenueData?.length ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <BarChart3 className="w-8 h-8 text-foreground-muted mx-auto mb-3" />
          <p className="text-foreground font-medium">Aucune donnée</p>
          <p className="text-sm text-foreground-muted mt-1">Pas de CDRs pour {year}.</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          {/* Visual bar chart */}
          <div className="p-4 border-b border-border">
            <div className="flex items-end gap-1 h-32">
              {revenueData.map((row) => (
                <div key={row.period} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                  <div
                    className="w-full bg-primary/20 hover:bg-primary/30 rounded-t-md transition-colors min-h-[2px]"
                    style={{ height: `${Math.max(2, (row.revenue_ttc / maxRevenue) * 100)}%` }}
                  />
                  <p className="text-[9px] text-foreground-muted mt-1 truncate w-full text-center">{row.label}</p>
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-surface border border-border rounded-lg px-3 py-2 shadow-lg z-10 whitespace-nowrap">
                    <p className="text-xs font-bold text-foreground">{row.revenue_ttc.toFixed(2)} € TTC</p>
                    <p className="text-[10px] text-foreground-muted">{row.sessions} sessions · {row.energy_kwh.toFixed(1)} kWh</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Période</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase">Sessions</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase">Énergie</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase">CA HT</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase">TVA</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase">CA TTC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {revenueData.map((row) => (
                  <tr key={row.period} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-foreground capitalize">{row.label}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted text-right tabular-nums">{row.sessions.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted text-right tabular-nums">{row.energy_kwh.toFixed(1)} kWh</td>
                    <td className="px-4 py-3 text-sm text-foreground text-right tabular-nums font-medium">{row.revenue_ht.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted text-right tabular-nums">{row.vat.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-sm text-primary text-right tabular-nums font-bold">{row.revenue_ttc.toFixed(2)} €</td>
                  </tr>
                ))}
                {/* Total row */}
                {totals && (
                  <tr className="bg-surface-elevated/50 font-bold">
                    <td className="px-4 py-3 text-sm text-foreground">TOTAL</td>
                    <td className="px-4 py-3 text-sm text-foreground text-right tabular-nums">{totals.sessions.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-3 text-sm text-foreground text-right tabular-nums">{totals.energy >= 1000 ? `${(totals.energy / 1000).toFixed(1)} MWh` : `${totals.energy.toFixed(0)} kWh`}</td>
                    <td className="px-4 py-3 text-sm text-foreground text-right tabular-nums">{totals.ht.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-sm text-foreground text-right tabular-nums">{totals.vat.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-sm text-primary text-right tabular-nums">{totals.ttc.toFixed(2)} €</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Story 101: View transfers to connected accounts
// ══════════════════════════════════════════════════════════════

function TransfersSection() {
  const { data: transfers, isLoading } = useQuery({
    queryKey: ["stripe-transfers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stripe_transfers")
        .select("id, created_at, amount, currency, destination_name, destination_account, status")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        // Table may not exist yet — return empty
        return [];
      }
      return data ?? [];
    },
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "paid":
      case "succeeded":
        return <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-400 text-xs font-medium rounded">Effectue</span>;
      case "pending":
        return <span className="px-2 py-0.5 bg-yellow-500/15 text-yellow-400 text-xs font-medium rounded">En attente</span>;
      case "failed":
        return <span className="px-2 py-0.5 bg-red-500/15 text-red-400 text-xs font-medium rounded">Echoue</span>;
      default:
        return <span className="px-2 py-0.5 bg-foreground-muted/10 text-foreground-muted text-xs font-medium rounded">{status}</span>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ArrowRightLeft className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-base font-heading font-bold text-foreground">Virements</h2>
            <p className="text-xs text-foreground-muted">Transferts vers les comptes connectes (CPOs)</p>
          </div>
        </div>
        <a
          href="https://dashboard.stripe.com/connect/transfers"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-primary font-medium hover:bg-primary/10 rounded-xl transition-colors"
        >
          Stripe Dashboard <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (transfers ?? []).length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <ArrowRightLeft className="w-8 h-8 text-foreground-muted mx-auto mb-3" />
          <p className="text-foreground font-medium">Aucun virement</p>
          <p className="text-sm text-foreground-muted mt-1">Les virements vers les comptes connectes apparaitront ici.</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Destination</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase">Montant</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(transfers ?? []).map((t: any) => (
                <tr key={t.id} className="hover:bg-surface-elevated/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-foreground-muted">{new Date(t.created_at).toLocaleDateString("fr-FR")}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{t.destination_name ?? "\u2014"}</p>
                    <p className="text-xs text-foreground-muted font-mono">{t.destination_account ?? "\u2014"}</p>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">
                    {((t.amount ?? 0) / 100).toFixed(2)} {(t.currency ?? "EUR").toUpperCase()}
                  </td>
                  <td className="px-4 py-3">{statusBadge(t.status ?? "pending")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Settlements Section
// ══════════════════════════════════════════════════════════════

const SETTLEMENT_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  completed: { label: "Terminé", bg: "bg-green-500/10", text: "text-green-400" },
  processing: { label: "En cours", bg: "bg-blue-500/10", text: "text-blue-400" },
  failed: { label: "Échoué", bg: "bg-red-500/10", text: "text-red-400" },
  pending: { label: "En attente", bg: "bg-amber-500/10", text: "text-amber-400" },
  cancelled: { label: "Annulé", bg: "bg-gray-500/10", text: "text-gray-400" },
};

function SettlementsSection() {
  const { data: settlements, isLoading, error } = useSettlements();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: lineItems, isLoading: detailLoading } = useSettlementDetail(selectedId);

  const fmtAmount = (cents: number) => (cents / 100).toFixed(2) + " \u20AC";
  const fmtEnergy = (kwh: number) => kwh.toFixed(1) + " kWh";
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
  const fmtPeriod = (start: string, end: string) =>
    `${new Date(start).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })} — ${new Date(end).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}`;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-300">Erreur lors du chargement des settlements</p>
        <p className="text-xs text-foreground-muted mt-1">{(error as Error).message}</p>
      </div>
    );
  }

  if (!settlements || settlements.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-12 text-center">
        <CalendarDays className="w-10 h-10 text-foreground-muted mx-auto mb-3" />
        <p className="text-sm text-foreground-muted">Aucun settlement trouvé</p>
        <p className="text-xs text-foreground-muted mt-1">Les settlements apparaîtront ici après exécution du moteur de settlement.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wider">Période</th>
                <th className="px-4 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wider">Statut</th>
                <th className="px-4 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wider text-right">Sessions</th>
                <th className="px-4 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wider text-right">Énergie (kWh)</th>
                <th className="px-4 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wider text-right">Montant HT</th>
                <th className="px-4 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wider text-right">TVA</th>
                <th className="px-4 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wider text-right">Commission</th>
                <th className="px-4 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wider text-right">Net à verser</th>
                <th className="px-4 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wider">Date traitement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {settlements.map((s) => {
                const cfg = SETTLEMENT_STATUS_CONFIG[s.status] ?? SETTLEMENT_STATUS_CONFIG.pending;
                const isSelected = selectedId === s.id;
                return (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedId(isSelected ? null : s.id)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-surface-hover",
                      isSelected && "bg-surface-hover"
                    )}
                  >
                    <td className="px-4 py-3 text-sm text-foreground font-medium">{fmtPeriod(s.period_start, s.period_end)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", cfg.bg, cfg.text)}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground tabular-nums text-right">{s.total_sessions}</td>
                    <td className="px-4 py-3 text-sm text-foreground tabular-nums text-right">{fmtEnergy(s.total_energy_kwh)}</td>
                    <td className="px-4 py-3 text-sm text-foreground tabular-nums text-right">{fmtAmount(s.total_amount_cents)}</td>
                    <td className="px-4 py-3 text-sm text-foreground tabular-nums text-right">{fmtAmount(s.total_vat_cents)}</td>
                    <td className="px-4 py-3 text-sm text-foreground tabular-nums text-right">{fmtAmount(s.commission_cents)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground tabular-nums text-right">{fmtAmount(s.net_payout_cents)}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">{fmtDate(s.processed_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expandable detail section */}
      {selectedId && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Détail des lignes — Settlement</h3>
            <button onClick={() => setSelectedId(null)} className="text-foreground-muted hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {detailLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : !lineItems || lineItems.length === 0 ? (
            <div className="p-8 text-center text-sm text-foreground-muted">Aucune ligne pour ce settlement</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 text-xs font-semibold text-foreground-muted uppercase tracking-wider">Date session</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-foreground-muted uppercase tracking-wider">Station</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-foreground-muted uppercase tracking-wider text-right">Énergie</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-foreground-muted uppercase tracking-wider text-right">Durée (min)</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-foreground-muted uppercase tracking-wider text-right">Montant</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-foreground-muted uppercase tracking-wider">Tarif</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-foreground-muted uppercase tracking-wider">Driver</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-foreground-muted uppercase tracking-wider">Token</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lineItems.map((li) => (
                    <tr key={li.id} className="hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-2.5 text-sm text-foreground">{fmtDate(li.session_date)}</td>
                      <td className="px-4 py-2.5 text-sm text-foreground font-medium">{li.station_name}</td>
                      <td className="px-4 py-2.5 text-sm text-foreground tabular-nums text-right">{fmtEnergy(li.energy_kwh)}</td>
                      <td className="px-4 py-2.5 text-sm text-foreground tabular-nums text-right">{li.duration_minutes}</td>
                      <td className="px-4 py-2.5 text-sm text-foreground tabular-nums text-right">{fmtAmount(li.amount_cents)}</td>
                      <td className="px-4 py-2.5 text-sm text-foreground-muted">{li.tariff_type}</td>
                      <td className="px-4 py-2.5 text-sm text-foreground-muted font-mono text-xs">{li.driver_id}</td>
                      <td className="px-4 py-2.5 text-sm text-foreground-muted font-mono text-xs">{li.token_uid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
