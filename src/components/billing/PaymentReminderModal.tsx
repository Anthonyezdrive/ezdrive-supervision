// ============================================================
// EZDrive — Payment Reminder Modal
// Send a payment reminder email for an overdue invoice
// ============================================================

import { useState } from "react";
import { Send, X, Loader2, Mail, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";

// ── Types ─────────────────────────────────────────────────────

interface PaymentReminderModalProps {
  invoice: {
    id: string;
    invoice_number: string;
    total_cents: number;
    currency: string;
    user_id: string;
    period_end: string;
  };
  onClose: () => void;
  onSent: () => void;
}

// ── Helpers ───────────────────────────────────────────────────

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency || "EUR",
  }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Helpers (XSS) ────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── Email preview template ────────────────────────────────────

function buildEmailPreview(
  invoiceNumber: string,
  amount: string,
  dueDate: string
): string {
  const safeInvoice = escapeHtml(invoiceNumber);
  const safeAmount = escapeHtml(amount);
  const safeDueDate = escapeHtml(dueDate);

  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#1a1a2e;border-radius:12px;color:#e0e0e0;">
  <div style="text-align:center;margin-bottom:20px;">
    <div style="font-size:24px;font-weight:700;color:#ffffff;">EZDrive</div>
    <div style="font-size:12px;color:#888;">Relance de paiement</div>
  </div>
  <hr style="border:none;border-top:1px solid #333;margin:16px 0;" />
  <p style="margin:0 0 12px;">Bonjour,</p>
  <p style="margin:0 0 12px;">Nous vous informons que la facture <strong style="color:#fff;">${safeInvoice}</strong> d'un montant de <strong style="color:#60a5fa;">${safeAmount}</strong> reste impayée.</p>
  <p style="margin:0 0 12px;">Date d'échéance : <strong style="color:#fbbf24;">${safeDueDate}</strong></p>
  <p style="margin:0 0 16px;">Nous vous invitons à procéder au règlement dans les meilleurs délais.</p>
  <div style="text-align:center;margin:20px 0;">
    <span style="display:inline-block;background:#3b82f6;color:#fff;padding:10px 24px;border-radius:8px;font-weight:600;font-size:14px;">Régler ma facture</span>
  </div>
  <hr style="border:none;border-top:1px solid #333;margin:16px 0;" />
  <p style="font-size:12px;color:#666;text-align:center;margin:0;">Cet email a été envoyé automatiquement par EZDrive.</p>
</div>`;
}

// ── Component ─────────────────────────────────────────────────

export function PaymentReminderModal({
  invoice,
  onClose,
  onSent,
}: PaymentReminderModalProps) {
  const { success: toastSuccess, warning: toastWarning, error: toastError } = useToast();

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const emailValid = isValidEmail(email);

  const amountFormatted = formatCents(invoice.total_cents, invoice.currency);
  const dueDateFormatted = formatDate(invoice.period_end);

  // ── Submit ────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailValid || submitting) return;

    setSubmitting(true);

    try {
      // 1. Call edge function to send the reminder email
      const { error: fnError } = await supabase.functions.invoke("api", {
        body: {
          action: "send_reminder",
          invoice_id: invoice.id,
          email,
        },
      });

      let emailFailed = false;
      if (fnError) {
        console.warn(
          "Edge function send_reminder not available:",
          fnError.message
        );
        emailFailed = true;
      }

      // 2. Log the reminder (check { error } return instead of try/catch)
      const { error: insertError } = await supabase.from("invoice_reminders").insert({
        invoice_id: invoice.id,
        sent_to: email,
        sent_at: new Date().toISOString(),
      });

      if (insertError) {
        console.warn("invoice_reminders insert error:", insertError.message);
      }

      if (emailFailed) {
        toastWarning(
          "Relance enregistree",
          "La relance a ete enregistree mais l'email n'a peut-etre pas ete envoye"
        );
      } else {
        toastSuccess(
          "Relance envoyée",
          `Un rappel de paiement a été envoyé à ${email}`
        );
      }
      onSent();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Une erreur est survenue";
      toastError("Erreur", message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-surface border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl pointer-events-auto max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500/10">
                <Send className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="font-heading font-bold text-lg text-foreground">
                  Relance de paiement
                </h2>
                <p className="text-sm text-foreground-muted">
                  Facture {invoice.invoice_number}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-surface-elevated rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-foreground-muted" />
            </button>
          </div>

          {/* Invoice summary */}
          <div className="bg-surface-elevated rounded-xl p-4 mb-5 border border-border space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground-muted">Facture</span>
              <span className="font-mono font-semibold text-foreground">
                {invoice.invoice_number}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground-muted">Montant dû</span>
              <span className="font-semibold text-foreground">
                {amountFormatted}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground-muted">Échéance</span>
              <span className="font-semibold text-yellow-400">
                {dueDateFormatted}
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email input */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                <Mail className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-foreground-muted" />
                Adresse email du destinataire
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                className={cn(
                  "w-full bg-surface-elevated border border-border rounded-xl px-4 py-2.5 text-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary",
                  "placeholder:text-foreground-muted/50",
                  email && !emailValid && "border-red-500/50"
                )}
              />
              {email && !emailValid && (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Adresse email invalide
                </p>
              )}
            </div>

            {/* Email preview */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Aperçu de l'email
              </label>
              <div
                className="bg-surface-elevated border border-border rounded-xl p-3 overflow-hidden"
                style={{ maxHeight: 260, overflowY: "auto" }}
              >
                <div
                  dangerouslySetInnerHTML={{
                    __html: buildEmailPreview(
                      invoice.invoice_number,
                      amountFormatted,
                      dueDateFormatted
                    ),
                  }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors rounded-xl hover:bg-surface-elevated"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!emailValid || submitting}
                className={cn(
                  "px-5 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center gap-2",
                  "bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                )}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {submitting ? "Envoi..." : "Envoyer la relance"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
