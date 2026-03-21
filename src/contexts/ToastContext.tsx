// ============================================================
// EZDrive — Toast Notification System (Enhanced)
// Global toast notifications with progress bar, title+description
// ============================================================

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  description?: string;
  duration: number;
  createdAt: number;
}

interface ToastContextValue {
  /** Legacy API: toast("message", "type") */
  toast: (message: string, type?: ToastType) => void;
  /** Enhanced API: named helpers */
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  warning: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// ── Toast Bubble ──────────────────────────────────────────────

function ToastBubble({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const dismissedRef = useRef(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleDismiss = useCallback(() => {
    // Guard against double dismiss
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setIsExiting(true);
    exitTimerRef.current = setTimeout(onDismiss, 280);
  }, [onDismiss]);

  // Auto-dismiss with progress bar
  useEffect(() => {
    const startTime = item.createdAt;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / item.duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        handleDismiss();
      }
    }, 50);
    return () => clearInterval(interval);
  }, [item.duration, item.createdAt, handleDismiss]);

  // Cleanup exit timer on unmount
  useEffect(() => {
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, []);

  const config = {
    success: {
      icon: CheckCircle2,
      border: "border-emerald-500/30",
      iconColor: "text-emerald-400",
      barColor: "bg-emerald-400",
    },
    error: {
      icon: XCircle,
      border: "border-red-500/30",
      iconColor: "text-red-400",
      barColor: "bg-red-400",
    },
    warning: {
      icon: AlertTriangle,
      border: "border-amber-500/30",
      iconColor: "text-amber-400",
      barColor: "bg-amber-400",
    },
    info: {
      icon: Info,
      border: "border-blue-500/30",
      iconColor: "text-blue-400",
      barColor: "bg-blue-400",
    },
  };

  const c = config[item.type];

  return (
    <div
      className={cn(
        "pointer-events-auto relative overflow-hidden flex items-start gap-3 rounded-xl border bg-surface shadow-xl shadow-black/20",
        c.border,
        "transition-all duration-280 ease-out",
        isExiting
          ? "opacity-0 translate-x-[120%] scale-95"
          : "opacity-100 translate-x-0 scale-100 animate-toast-in"
      )}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3 px-4 py-3.5 w-full">
        <c.icon className={cn("w-4.5 h-4.5 shrink-0 mt-0.5", c.iconColor)} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground leading-snug">{item.message}</span>
          {item.description && (
            <p className="text-xs text-foreground-muted mt-0.5 leading-relaxed">{item.description}</p>
          )}
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Fermer la notification"
          className="text-foreground-muted/50 hover:text-foreground-muted transition-colors shrink-0 mt-0.5"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-border/20">
        <div
          className={cn("h-full rounded-full transition-[width] duration-100 ease-linear", c.barColor)}
          style={{ width: `${progress}%`, opacity: 0.5 }}
        />
      </div>
    </div>
  );
}

// ── Provider ──────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = "success", description?: string, duration = 4000) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-4), { id, type, message, description, duration, createdAt: Date.now() }]);
    },
    []
  );

  // Memoize context value to prevent unnecessary consumer re-renders
  const value: ToastContextValue = useMemo(
    () => ({
      toast: (message: string, type?: ToastType) => addToast(message, type ?? "success"),
      success: (message: string, description?: string) => addToast(message, "success", description),
      error: (message: string, description?: string) => addToast(message, "error", description),
      warning: (message: string, description?: string) => addToast(message, "warning", description),
      info: (message: string, description?: string) => addToast(message, "info", description),
    }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast container — always mounted so exit animations can play */}
      <div
        className={cn(
          "fixed bottom-4 right-4 z-[200] flex flex-col-reverse gap-2.5 w-[380px] max-w-[calc(100vw-2rem)] pointer-events-none",
          toasts.length === 0 && "hidden"
        )}
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <ToastBubble key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Hook to fire toasts from any component */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
