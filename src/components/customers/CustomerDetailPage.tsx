// ============================================================
// EZDrive — Customer Detail Page (Vue 360)
// Full customer view with KPIs, tabs, and timeline
// ============================================================

import { useState, useMemo } from "react";
import {
  X,
  Zap,
  Euro,
  AlertTriangle,
  Receipt,
  KeyRound,
  CreditCard,
  Wrench,
  Clock,
  Activity,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SlideOver } from "@/components/ui/SlideOver";
import { useCustomerDetail } from "@/hooks/useCustomerDetail";
import { CustomerTimeline } from "@/components/customers/CustomerTimeline";

// ── Types ────────────────────────────────────────────────────

type TabKey = "sessions" | "factures" | "tokens" | "abonnements" | "tickets";

interface CustomerDetailPageProps {
  customerId: string; // driver_external_id
  onClose: () => void;
}

// ── Helpers ──────────────────────────────────────────────────

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

function formatDateFr(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTimeFr(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startStr: string, stopStr: string | null): string {
  if (!stopStr) return "En cours";
  const diffMs = new Date(stopStr).getTime() - new Date(startStr).getTime();
  const totalMin = Math.floor(diffMs / 60000);
  if (totalMin < 60) return `${totalMin}min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2) + " \u20AC";
}

// ── Status badges ────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "").toLowerCase();
  let classes = "bg-foreground-muted/10 text-foreground-muted border-border";
  let label = status ?? "Inconnu";

  if (s === "active" || s === "actif") {
    classes = "bg-emerald-500/10 text-emerald-400 border-emerald-500/25";
    label = "Actif";
  } else if (s === "inactive" || s === "inactif") {
    classes = "bg-red-500/10 text-red-400 border-red-500/25";
    label = "Inactif";
  } else if (s === "suspended" || s === "suspendu") {
    classes = "bg-amber-500/10 text-amber-400 border-amber-500/25";
    label = "Suspendu";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold",
        classes
      )}
    >
      {label}
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { classes: string; label: string }> = {
    paid: {
      classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
      label: "Payee",
    },
    issued: {
      classes: "bg-blue-500/10 text-blue-400 border-blue-500/25",
      label: "Emise",
    },
    draft: {
      classes: "bg-foreground-muted/10 text-foreground-muted border-border",
      label: "Brouillon",
    },
    cancelled: {
      classes: "bg-red-500/10 text-red-400 border-red-500/25",
      label: "Annulee",
    },
  };
  const cfg = map[status] ?? map.draft;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold",
        cfg.classes
      )}
    >
      {cfg.label}
    </span>
  );
}

function TokenStatusBadge({ valid }: { valid: boolean }) {
  return valid ? (
    <span className="inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
      Valide
    </span>
  ) : (
    <span className="inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold bg-red-500/10 text-red-400 border-red-500/25">
      Invalide
    </span>
  );
}

function SubscriptionStatusBadge({ status }: { status: string }) {
  const s = status?.toUpperCase();
  const map: Record<string, { classes: string; label: string }> = {
    ACTIVE: {
      classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
      label: "Actif",
    },
    CANCELLED: {
      classes: "bg-red-500/10 text-red-400 border-red-500/25",
      label: "Annule",
    },
    CANCELED: {
      classes: "bg-red-500/10 text-red-400 border-red-500/25",
      label: "Annule",
    },
    PAST_DUE: {
      classes: "bg-amber-500/10 text-amber-400 border-amber-500/25",
      label: "Impaye",
    },
    TRIALING: {
      classes: "bg-blue-500/10 text-blue-400 border-blue-500/25",
      label: "Essai",
    },
  };
  const cfg = map[s] ?? {
    classes: "bg-foreground-muted/10 text-foreground-muted border-border",
    label: status ?? "Inconnu",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold",
        cfg.classes
      )}
    >
      {cfg.label}
    </span>
  );
}

function TicketStatusBadge({ status }: { status: string }) {
  const s = (status ?? "").toLowerCase();
  let classes = "bg-foreground-muted/10 text-foreground-muted border-border";
  let label = status ?? "Inconnu";

  if (s === "open" || s === "ouvert") {
    classes = "bg-amber-500/10 text-amber-400 border-amber-500/25";
    label = "Ouvert";
  } else if (s === "in_progress" || s === "en_cours") {
    classes = "bg-blue-500/10 text-blue-400 border-blue-500/25";
    label = "En cours";
  } else if (s === "closed" || s === "ferme" || s === "resolved") {
    classes = "bg-emerald-500/10 text-emerald-400 border-emerald-500/25";
    label = "Ferme";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold",
        classes
      )}
    >
      {label}
    </span>
  );
}

// ── KPI Card ─────────────────────────────────────────────────

function KPICard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
}) {
  return (
    <div className="bg-surface-elevated border border-border rounded-2xl p-4 flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-heading font-bold text-foreground truncate">
          {value}
        </p>
        <p className="text-[11px] text-foreground-muted mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-12 h-12 rounded-xl bg-foreground-muted/10 flex items-center justify-center mb-3">
        <Activity className="w-6 h-6 text-foreground-muted" />
      </div>
      <p className="text-sm text-foreground-muted">{message}</p>
    </div>
  );
}

// ── Tab definitions ──────────────────────────────────────────

const tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "sessions", label: "Sessions", icon: Zap },
  { key: "factures", label: "Factures", icon: Receipt },
  { key: "tokens", label: "Tokens", icon: KeyRound },
  { key: "abonnements", label: "Abonnements", icon: CreditCard },
  { key: "tickets", label: "Tickets", icon: Wrench },
];

// ── Main Component ───────────────────────────────────────────

export function CustomerDetailPage({
  customerId,
  onClose,
}: CustomerDetailPageProps) {
  const { data, isLoading, error } = useCustomerDetail(customerId);
  const [activeTab, setActiveTab] = useState<TabKey>("sessions");

  // Computed KPIs
  const kpis = useMemo(() => {
    if (!data) return null;
    const totalSessions = data.sessions.length;
    const totalEnergy = data.sessions.reduce(
      (sum, s) => sum + (s.energy_kwh ?? 0),
      0
    );
    const totalSpent = data.invoices.reduce(
      (sum, inv) => sum + inv.total_cents,
      0
    );
    const outstandingDebt = data.invoices
      .filter((inv) => inv.status === "issued" || inv.status === "draft")
      .reduce((sum, inv) => sum + inv.total_cents, 0);

    return { totalSessions, totalEnergy, totalSpent, outstandingDebt };
  }, [data]);

  const profile = data?.profile ?? null;
  const displayName =
    profile?.full_name || profile?.driver_external_id || customerId;

  return (
    <SlideOver
      open={true}
      onClose={onClose}
      title="Fiche client"
      subtitle="Vue 360\u00B0"
      maxWidth="max-w-3xl"
    >
      <div className="p-6 space-y-6">
        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
            <p className="text-sm text-foreground-muted">
              Chargement des donnees client...
            </p>
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <p className="text-sm text-foreground font-medium">
              Erreur de chargement
            </p>
            <p className="text-xs text-foreground-muted mt-1">
              Impossible de charger les donnees de ce client.
            </p>
          </div>
        )}

        {/* Data loaded */}
        {data && profile && (
          <>
            {/* ── Header ── */}
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-primary text-lg font-bold shrink-0">
                {getInitials(profile.full_name ?? profile.driver_external_id)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-lg font-heading font-bold text-foreground truncate">
                    {displayName}
                  </h3>
                  <StatusBadge status={profile.status} />
                </div>
                {profile.email && (
                  <p className="text-sm text-foreground-muted mt-0.5 truncate">
                    {profile.email}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-1 text-xs text-foreground-muted">
                  {profile.phone && <span>{profile.phone}</span>}
                  {profile.customer_name && (
                    <span>Groupe : {profile.customer_name}</span>
                  )}
                  <span>
                    Inscrit le {formatDateFr(profile.created_at)}
                  </span>
                </div>
                <p className="text-[11px] text-foreground-muted/60 font-mono mt-1">
                  {profile.driver_external_id}
                </p>
              </div>
            </div>

            {/* ── KPIs ── */}
            {kpis && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard
                  label="Sessions totales"
                  value={kpis.totalSessions.toLocaleString("fr-FR")}
                  icon={Zap}
                  color="#4ECDC4"
                />
                <KPICard
                  label="Energie totale"
                  value={`${kpis.totalEnergy.toFixed(1)} kWh`}
                  icon={Activity}
                  color="#A78BFA"
                />
                <KPICard
                  label="Total depense"
                  value={formatCents(kpis.totalSpent)}
                  icon={Euro}
                  color="#00D4AA"
                />
                <KPICard
                  label="Solde impaye"
                  value={formatCents(kpis.outstandingDebt)}
                  icon={AlertTriangle}
                  color={kpis.outstandingDebt > 0 ? "#F87171" : "#8892B0"}
                />
              </div>
            )}

            {/* ── Timeline preview ── */}
            <div className="bg-surface-elevated border border-border rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-foreground-muted" />
                <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                  Activite recente
                </p>
              </div>
              <CustomerTimeline
                sessions={data.sessions.slice(0, 5)}
                invoices={data.invoices.slice(0, 5)}
                tickets={data.tickets.slice(0, 5)}
              />
            </div>

            {/* ── Tabs ── */}
            <div>
              {/* Tab bar */}
              <div className="flex gap-1 border-b border-border mb-4 overflow-x-auto">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
                        isActive
                          ? "border-primary text-primary"
                          : "border-transparent text-foreground-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <div className="bg-surface-elevated border border-border rounded-2xl overflow-hidden">
                {/* Sessions tab */}
                {activeTab === "sessions" && (
                  data.sessions.length === 0 ? (
                    <EmptyTab message="Aucune session de charge enregistree" />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="border-b border-border">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Date
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Station
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Energie
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Duree
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Statut
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {data.sessions.map((s) => (
                            <tr
                              key={s.id}
                              className="hover:bg-surface/50 transition-colors"
                            >
                              <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                                {formatDateTimeFr(s.started_at)}
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground-muted truncate max-w-[200px]">
                                {s.ocpp_chargepoints?.stations?.name ??
                                  s.ocpp_chargepoints?.identity ??
                                  "\u2014"}
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground-muted text-right tabular-nums">
                                {s.energy_kwh != null
                                  ? `${s.energy_kwh.toFixed(1)} kWh`
                                  : "\u2014"}
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground-muted text-right tabular-nums whitespace-nowrap">
                                {formatDuration(s.started_at, s.stopped_at)}
                              </td>
                              <td className="px-4 py-3">
                                <StatusBadge status={s.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                {/* Factures tab */}
                {activeTab === "factures" && (
                  data.invoices.length === 0 ? (
                    <EmptyTab message="Aucune facture trouvee" />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="border-b border-border">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              N\u00B0
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Date
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Montant
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Statut
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {data.invoices.map((inv) => (
                            <tr
                              key={inv.id}
                              className="hover:bg-surface/50 transition-colors"
                            >
                              <td className="px-4 py-3 text-sm text-foreground font-mono">
                                {inv.invoice_number}
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                                {formatDateFr(inv.created_at)}
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground text-right tabular-nums font-medium">
                                {formatCents(inv.total_cents)}
                              </td>
                              <td className="px-4 py-3">
                                <InvoiceStatusBadge status={inv.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                {/* Tokens tab */}
                {activeTab === "tokens" && (
                  data.tokens.length === 0 ? (
                    <EmptyTab message="Aucun token OCPI associe" />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="border-b border-border">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              UID
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Type
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Statut
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Cree le
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {data.tokens.map((token) => (
                            <tr
                              key={token.id}
                              className="hover:bg-surface/50 transition-colors"
                            >
                              <td className="px-4 py-3 text-sm text-foreground font-mono">
                                {token.uid}
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground-muted">
                                {token.type}
                              </td>
                              <td className="px-4 py-3">
                                <TokenStatusBadge valid={token.valid} />
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                                {formatDateFr(token.created_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                {/* Abonnements tab */}
                {activeTab === "abonnements" && (
                  data.subscriptions.length === 0 ? (
                    <EmptyTab message="Aucun abonnement trouve" />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="border-b border-border">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Offre
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Statut
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Debut
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Fin
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {data.subscriptions.map((sub) => (
                            <tr
                              key={sub.id}
                              className="hover:bg-surface/50 transition-colors"
                            >
                              <td className="px-4 py-3 text-sm text-foreground font-medium">
                                {sub.offer_name ?? "\u2014"}
                              </td>
                              <td className="px-4 py-3">
                                <SubscriptionStatusBadge
                                  status={sub.status}
                                />
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                                {formatDateFr(sub.started_at)}
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                                {formatDateFr(sub.ends_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                {/* Tickets tab */}
                {activeTab === "tickets" && (
                  data.tickets.length === 0 ? (
                    <EmptyTab message="Aucun ticket de maintenance" />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="border-b border-border">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Titre
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Statut
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                              Cree le
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {data.tickets.map((ticket) => (
                            <tr
                              key={ticket.id}
                              className="hover:bg-surface/50 transition-colors"
                            >
                              <td className="px-4 py-3 text-sm text-foreground truncate max-w-[300px]">
                                {ticket.title}
                              </td>
                              <td className="px-4 py-3">
                                <TicketStatusBadge status={ticket.status} />
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                                {formatDateFr(ticket.created_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </SlideOver>
  );
}
