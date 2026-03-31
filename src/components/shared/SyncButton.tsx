// ============================================================
// SyncButton — Reusable button to trigger Edge Function syncs
// Shows loading state, success/error toast, result summary
// ============================================================

import { useState } from "react";
import { RefreshCw, Check, AlertTriangle } from "lucide-react";
import { useEdgeFunction } from "@/hooks/useEdgeFunction";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";

interface SyncButtonProps {
  /** Edge Function name (e.g. "road-cdr-sync") */
  functionName: string;
  /** Button label */
  label: string;
  /** Optional body to send */
  body?: Record<string, unknown>;
  /** Query keys to invalidate on success */
  invalidateKeys?: string[];
  /** Custom success message formatter */
  formatSuccess?: (data: Record<string, unknown>) => string;
  /** Button variant */
  variant?: "default" | "small" | "icon";
  /** Custom class */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Confirmation message (if set, shows confirm dialog) */
  confirmMessage?: string;
}

export function SyncButton({
  functionName,
  label,
  body,
  invalidateKeys = [],
  formatSuccess,
  variant = "default",
  className,
  disabled = false,
  confirmMessage,
}: SyncButtonProps) {
  const { invoke, loading } = useEdgeFunction(functionName, { invalidateKeys });
  const { toast } = useToast();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  async function handleClick() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    setStatus("idle");
    const result = await invoke(body);

    if (result.error) {
      setStatus("error");
      toast(`Erreur ${functionName}: ${result.error}`, "error");
      setTimeout(() => setStatus("idle"), 3000);
    } else {
      setStatus("success");
      const msg = formatSuccess
        ? formatSuccess(result.data as Record<string, unknown>)
        : `${label} — terminé`;
      toast(msg, "success");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  const Icon =
    status === "success"
      ? Check
      : status === "error"
        ? AlertTriangle
        : RefreshCw;

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || disabled}
        title={label}
        className={cn(
          "p-1.5 rounded-lg transition-colors",
          status === "success"
            ? "text-emerald-400"
            : status === "error"
              ? "text-red-400"
              : "text-foreground-muted hover:text-foreground hover:bg-surface-elevated",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          className
        )}
      >
        <Icon className={cn("w-4 h-4", loading && "animate-spin")} />
      </button>
    );
  }

  if (variant === "small") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || disabled}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
          status === "success"
            ? "text-emerald-400 border-emerald-500/25 bg-emerald-500/10"
            : status === "error"
              ? "text-red-400 border-red-500/25 bg-red-500/10"
              : "text-foreground-muted border-border hover:text-foreground hover:border-foreground-muted",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          className
        )}
      >
        <Icon className={cn("w-3 h-3", loading && "animate-spin")} />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading || disabled}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors",
        status === "success"
          ? "text-emerald-400 border-emerald-500/25 bg-emerald-500/10"
          : status === "error"
            ? "text-red-400 border-red-500/25 bg-red-500/10"
            : "text-foreground-muted border-border bg-surface hover:text-foreground hover:border-foreground-muted",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        className
      )}
    >
      <Icon className={cn("w-4 h-4", loading && "animate-spin")} />
      {loading ? "Synchronisation..." : label}
    </button>
  );
}
