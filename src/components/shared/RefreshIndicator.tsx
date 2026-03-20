// ============================================================
// RefreshIndicator — subtle "last updated X ago" pill
// Uses dataUpdatedAt from React Query to show elapsed time
// ============================================================

import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface RefreshIndicatorProps {
  dataUpdatedAt: number | undefined;
  className?: string;
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `il y a ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `il y a ${hours}h`;
}

export function RefreshIndicator({ dataUpdatedAt, className }: RefreshIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!dataUpdatedAt) return;
    // Reset immediately when dataUpdatedAt changes
    setElapsed(Date.now() - dataUpdatedAt);

    const interval = setInterval(() => {
      setElapsed(Date.now() - dataUpdatedAt);
    }, 1000);

    return () => clearInterval(interval);
  }, [dataUpdatedAt]);

  if (!dataUpdatedAt) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-surface-elevated border border-border px-2.5 py-1 text-[11px] text-foreground-muted select-none",
        className,
      )}
    >
      <RefreshCw className="w-3 h-3 opacity-50" />
      <span>Mis à jour {formatElapsed(elapsed)}</span>
    </span>
  );
}
