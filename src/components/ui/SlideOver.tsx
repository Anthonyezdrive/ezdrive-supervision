// ============================================================
// EZDrive — Slide-Over Panel
// Reusable animated slide-over panel for create/edit forms
// ============================================================

import { useEffect, useState, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Max width class (default: max-w-lg) */
  maxWidth?: string;
  children: React.ReactNode;
}

export function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = "max-w-lg",
  children,
}: SlideOverProps) {
  // `mounted` keeps the DOM alive during exit animation
  const [mounted, setMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Mount/unmount with animation + body scroll lock
  useEffect(() => {
    if (open) {
      setMounted(true);
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
    } else {
      setIsVisible(false);
      // Delay unmount and scroll-lock release for exit animation
      const timer = setTimeout(() => {
        setMounted(false);
        document.body.style.overflow = "";
      }, 320);
      return () => {
        clearTimeout(timer);
        document.body.style.overflow = "";
      };
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on Escape — uses capture phase so ConfirmDialog can stopPropagation first
  useEffect(() => {
    if (!mounted) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Don't close if a ConfirmDialog is open on top (z-[150])
        const confirmDialogBackdrop = document.querySelector('[class*="z-[150]"]');
        if (confirmDialogBackdrop) return;
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mounted, onClose]);

  // Focus trap
  useEffect(() => {
    if (!mounted) return;
    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab" || !panelRef.current) return;
      // Don't trap if a ConfirmDialog is open
      const confirmDialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      if (confirmDialog && !panelRef.current.contains(confirmDialog)) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
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

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity duration-300",
          isVisible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          "fixed inset-y-0 right-0 z-[101] flex",
          "w-full",
          maxWidth,
          "transition-transform duration-300 ease-out",
          isVisible ? "translate-x-0" : "translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="slideover-title"
      >
        <div className="w-full bg-surface border-l border-border shadow-2xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <div>
              <h2 id="slideover-title" className="text-lg font-heading font-bold text-foreground">
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs text-foreground-muted mt-0.5">{subtitle}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 text-foreground-muted hover:text-foreground hover:bg-surface-elevated rounded-xl transition-colors"
              title="Fermer (Echap)"
              aria-label="Fermer le panneau"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
