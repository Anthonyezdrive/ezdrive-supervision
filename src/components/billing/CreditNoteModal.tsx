// ============================================================
// EZDrive — Credit Note Modal
// Create a credit note (avoir) linked to an existing invoice
// ============================================================

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Receipt, X, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";

// ── Types ─────────────────────────────────────────────────────

interface CreditNoteModalProps {
  invoice: {
    id: string;
    invoice_number: string;
    total_cents: number;
    currency: string;
    user_id: string;
    vat_rate?: number;
  };
  onClose: () => void;
  onCreated: () => void;
}

// ── Reason options ────────────────────────────────────────────

const REASONS = [
  { value: "billing_error", label: "Erreur de facturation" },
  { value: "customer_refund", label: "Remboursement client" },
  { value: "commercial_gesture", label: "Geste commercial" },
  { value: "other", label: "Autre" },
] as const;

// ── Helpers ───────────────────────────────────────────────────

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency || "EUR",
  }).format(cents / 100);
}

function generateCreditNoteNumber(invoiceNumber: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  return `AV-${invoiceNumber}-${ts}`;
}

// ── Component ─────────────────────────────────────────────────

export function CreditNoteModal({
  invoice,
  onClose,
  onCreated,
}: CreditNoteModalProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const [isFullRefund, setIsFullRefund] = useState(true);
  const [amountCents, setAmountCents] = useState(invoice.total_cents);
  const [reason, setReason] = useState<string>(REASONS[0].value);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const amountValid =
    amountCents > 0 && amountCents <= invoice.total_cents;

  // ── Submit ────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amountValid || submitting) return;

    setSubmitting(true);

    try {
      const creditNoteNumber = generateCreditNoteNumber(invoice.invoice_number);
      const reasonLabel =
        REASONS.find((r) => r.value === reason)?.label ?? reason;

      const notesContent = [
        `Avoir pour facture ${invoice.invoice_number}`,
        `Motif : ${reasonLabel}`,
        note ? `Note : ${note}` : null,
        `parent_invoice_id:${invoice.id}`,
      ]
        .filter(Boolean)
        .join("\n");

      // Compute VAT from original invoice rate
      const vatRate = invoice.vat_rate ?? 20;
      const subtotalCents = Math.round(amountCents / (1 + vatRate / 100));
      const vatCents = amountCents - subtotalCents;

      const { error } = await supabase.from("invoices").insert({
        invoice_number: creditNoteNumber,
        user_id: invoice.user_id,
        total_cents: -Math.abs(amountCents),
        subtotal_cents: -Math.abs(subtotalCents),
        vat_cents: -Math.abs(vatCents),
        vat_rate: vatRate,
        currency: invoice.currency,
        type: "credit_note",
        status: "issued",
        issued_at: new Date().toISOString(),
        notes: notesContent,
        parent_invoice_id: invoice.id,
        period_start: new Date().toISOString(),
        period_end: new Date().toISOString(),
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["invoices"] });

      toastSuccess(
        "Avoir créé",
        `L'avoir ${creditNoteNumber} a été émis pour ${formatCents(amountCents, invoice.currency)}`
      );
      onCreated();
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
          className="bg-surface border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-orange-500/10">
                <Receipt className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h2 className="font-heading font-bold text-lg text-foreground">
                  Créer un avoir
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

          {/* Invoice info */}
          <div className="bg-surface-elevated rounded-xl p-4 mb-5 border border-border">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground-muted">Facture originale</span>
              <span className="font-mono font-semibold text-foreground">
                {invoice.invoice_number}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-foreground-muted">Montant total</span>
              <span className="font-semibold text-foreground">
                {formatCents(invoice.total_cents, invoice.currency)}
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Refund type toggle */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Type de remboursement
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsFullRefund(true);
                    setAmountCents(invoice.total_cents);
                  }}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors border",
                    isFullRefund
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-surface-elevated border-border text-foreground-muted hover:border-foreground-muted"
                  )}
                >
                  <CheckCircle
                    className={cn(
                      "w-4 h-4 inline-block mr-1.5 -mt-0.5",
                      isFullRefund ? "opacity-100" : "opacity-30"
                    )}
                  />
                  Remboursement total
                </button>
                <button
                  type="button"
                  onClick={() => setIsFullRefund(false)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors border",
                    !isFullRefund
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-surface-elevated border-border text-foreground-muted hover:border-foreground-muted"
                  )}
                >
                  Remboursement partiel
                </button>
              </div>
            </div>

            {/* Amount input */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Montant de l'avoir
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={(invoice.total_cents / 100).toFixed(2)}
                  value={(amountCents / 100).toFixed(2)}
                  disabled={isFullRefund}
                  onChange={(e) => {
                    const val = Math.round(parseFloat(e.target.value) * 100);
                    if (!isNaN(val)) setAmountCents(val);
                  }}
                  className={cn(
                    "w-full bg-surface-elevated border border-border rounded-xl px-4 py-2.5 pr-12 text-foreground",
                    "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    !amountValid && !isFullRefund && "border-red-500/50"
                  )}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-foreground-muted">
                  {(invoice.currency || "EUR").toUpperCase()}
                </span>
              </div>
              {!isFullRefund && amountCents > invoice.total_cents && (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Le montant ne peut pas dépasser le total de la facture
                </p>
              )}
            </div>

            {/* Reason dropdown */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Motif
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={cn(
                  "w-full bg-surface-elevated border border-border rounded-xl px-4 py-2.5 text-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary",
                  "appearance-none cursor-pointer"
                )}
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Note textarea */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Note{" "}
                <span className="text-foreground-muted font-normal">
                  (optionnel)
                </span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Détails supplémentaires..."
                rows={3}
                className={cn(
                  "w-full bg-surface-elevated border border-border rounded-xl px-4 py-2.5 text-foreground resize-none",
                  "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary",
                  "placeholder:text-foreground-muted/50"
                )}
              />
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
                disabled={!amountValid || submitting}
                className={cn(
                  "px-5 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center gap-2",
                  "bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                )}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Receipt className="w-4 h-4" />
                )}
                {submitting ? "Création..." : "Créer l'avoir"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
