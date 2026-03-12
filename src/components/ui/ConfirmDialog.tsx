// ============================================================
// EZDrive — Confirm Dialog
// Styled confirmation modal replacing window.confirm()
// ============================================================

import { useEffect, useRef, useState, useCallback } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  loading?: boolean;
  /** Loading text shown while the confirm action is pending (default: "Suppression...") */
  loadingLabel?: string;
}

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  variant = "danger",
  loading = false,
  loadingLabel = "Suppression...",
}: ConfirmDialogProps) {
  // `mounted` keeps the DOM alive during exit animation
  const [mounted, setMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const dialogContainerRef = useRef<HTMLDivElement>(null);

  // Stable cancel handler that checks loading state
  const handleCancel = useCallback(() => {
    if (loading) return;
    onCancel();
  }, [loading, onCancel]);

  // Mount/unmount with animation support
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Enter animation after mount
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      // Focus confirm button
      focusTimeoutRef.current = setTimeout(() => confirmRef.current?.focus(), 100);
    } else {
      // Exit animation, then unmount
      setIsVisible(false);
      const timer = setTimeout(() => setMounted(false), 220);
      return () => clearTimeout(timer);
    }
    return () => {
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
    };
  }, [open]);

  // Close on Escape (only when not loading)
  useEffect(() => {
    if (!mounted) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [mounted, loading, onCancel]);

  // Focus trap
  useEffect(() => {
    if (!mounted) return;
    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab" || !dialogContainerRef.current) return;
      const focusable = dialogContainerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [mounted]);

  if (!mounted) return null;

  const variantConfig = {
    danger: {
      icon: Trash2,
      iconBg: "bg-red-500/10",
      iconColor: "text-red-400",
      confirmBg: "bg-red-500 hover:bg-red-600",
    },
    warning: {
      icon: AlertTriangle,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-400",
      confirmBg: "bg-amber-500 hover:bg-amber-600",
    },
    default: {
      icon: AlertTriangle,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      confirmBg: "bg-primary hover:bg-primary/90",
    },
  };

  const vc = variantConfig[variant];

  return (
    <>
      {/* Backdrop — not clickable during loading */}
      <div
        className={cn(
          "fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] transition-opacity duration-200",
          isVisible ? "opacity-100" : "opacity-0"
        )}
        onClick={handleCancel}
        aria-hidden="true"
      />
      {/* Dialog */}
      <div
        className="fixed inset-0 z-[151] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? "confirm-dialog-desc" : undefined}
        ref={dialogContainerRef}
      >
        <div
          className={cn(
            "bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-md",
            "transition-all duration-200 ease-out",
            isVisible
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-0 scale-95 translate-y-2"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start gap-4 p-6 pb-0">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", vc.iconBg)}>
              <vc.icon className={cn("w-6 h-6", vc.iconColor)} />
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <h3 id="confirm-dialog-title" className="text-base font-heading font-bold text-foreground">{title}</h3>
              {description && (
                <p id="confirm-dialog-desc" className="text-sm text-foreground-muted mt-1.5 leading-relaxed">{description}</p>
              )}
            </div>
            <button
              onClick={handleCancel}
              disabled={loading}
              aria-label="Fermer"
              className="p-1 text-foreground-muted hover:text-foreground rounded-lg transition-colors shrink-0 -mt-1 -mr-1 disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 p-6">
            <button
              onClick={handleCancel}
              disabled={loading}
              className="px-4 py-2.5 text-sm font-medium text-foreground-muted hover:text-foreground border border-border rounded-xl transition-colors disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              onClick={onConfirm}
              disabled={loading}
              className={cn(
                "px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-50 min-w-[100px]",
                vc.confirmBg
              )}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {loadingLabel}
                </span>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
