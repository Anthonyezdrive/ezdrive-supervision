// ============================================================
// EZDrive — Customer Timeline
// Vertical timeline of recent customer events
// ============================================================

import { useMemo } from "react";
import { Zap, FileText, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CustomerSession,
  CustomerInvoice,
  CustomerTicket,
} from "@/hooks/useCustomerDetail";

// ── Types ────────────────────────────────────────────────────

interface TimelineEvent {
  id: string;
  date: string;
  type: "session" | "invoice" | "ticket";
  description: string;
  badge: string;
  badgeColor: string;
}

// ── Relative time formatter (French) ─────────────────────────

function formatRelativeTimeFr(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 0) return "maintenant";
  if (diffSec < 60) return `il y a ${diffSec}s`;
  if (diffSec < 3600) return `il y a ${Math.floor(diffSec / 60)}min`;
  if (diffSec < 86400) return `il y a ${Math.floor(diffSec / 3600)}h`;
  const days = Math.floor(diffSec / 86400);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days}j`;
  if (days < 30) return `il y a ${Math.floor(days / 7)} sem.`;
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`;
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Icon config ──────────────────────────────────────────────

const typeConfig: Record<
  TimelineEvent["type"],
  {
    icon: React.ComponentType<{ className?: string }>;
    dotBg: string;
    dotBorder: string;
  }
> = {
  session: {
    icon: Zap,
    dotBg: "bg-emerald-500/20",
    dotBorder: "border-emerald-500/50",
  },
  invoice: {
    icon: FileText,
    dotBg: "bg-blue-500/20",
    dotBorder: "border-blue-500/50",
  },
  ticket: {
    icon: Wrench,
    dotBg: "bg-amber-500/20",
    dotBorder: "border-amber-500/50",
  },
};

const badgeColors: Record<string, string> = {
  session: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  invoice: "bg-blue-500/10 text-blue-400 border-blue-500/25",
  ticket: "bg-amber-500/10 text-amber-400 border-amber-500/25",
};

// ── Component ────────────────────────────────────────────────

interface CustomerTimelineProps {
  sessions: CustomerSession[];
  invoices: CustomerInvoice[];
  tickets: CustomerTicket[];
}

export function CustomerTimeline({
  sessions,
  invoices,
  tickets,
}: CustomerTimelineProps) {
  const events = useMemo(() => {
    const all: TimelineEvent[] = [];

    // Sessions
    for (const s of sessions) {
      const stationName =
        s.ocpp_chargepoints?.stations?.name ??
        s.ocpp_chargepoints?.identity ??
        "Station inconnue";
      const energy = s.energy_kwh != null ? `${s.energy_kwh.toFixed(1)} kWh` : "";
      all.push({
        id: `session-${s.id}`,
        date: s.started_at,
        type: "session",
        description: `Charge sur ${stationName}${energy ? ` — ${energy}` : ""}`,
        badge: "Session",
        badgeColor: "session",
      });
    }

    // Invoices
    for (const inv of invoices) {
      const amount = (inv.total_cents / 100).toFixed(2);
      const statusLabel =
        inv.status === "paid"
          ? "payee"
          : inv.status === "issued"
          ? "emise"
          : inv.status === "cancelled"
          ? "annulee"
          : "brouillon";
      all.push({
        id: `invoice-${inv.id}`,
        date: inv.created_at,
        type: "invoice",
        description: `Facture ${inv.invoice_number} — ${amount} EUR (${statusLabel})`,
        badge: "Facture",
        badgeColor: "invoice",
      });
    }

    // Tickets
    for (const t of tickets) {
      all.push({
        id: `ticket-${t.id}`,
        date: t.created_at,
        type: "ticket",
        description: t.title,
        badge: "Ticket",
        badgeColor: "ticket",
      });
    }

    // Sort by date desc
    all.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return all.slice(0, 20);
  }, [sessions, invoices, tickets]);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <p className="text-sm text-foreground-muted">
          Aucun evenement recent
        </p>
      </div>
    );
  }

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

      <div className="space-y-4">
        {events.map((event) => {
          const config = typeConfig[event.type];
          const Icon = config.icon;

          return (
            <div key={event.id} className="relative flex gap-3">
              {/* Dot */}
              <div
                className={cn(
                  "absolute -left-6 top-0.5 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center shrink-0",
                  config.dotBg,
                  config.dotBorder
                )}
              >
                <Icon className="w-3 h-3 text-foreground-muted" />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                      badgeColors[event.badgeColor]
                    )}
                  >
                    {event.badge}
                  </span>
                  <span className="text-[11px] text-foreground-muted">
                    {formatRelativeTimeFr(event.date)}
                  </span>
                </div>
                <p className="text-sm text-foreground leading-snug">
                  {event.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
