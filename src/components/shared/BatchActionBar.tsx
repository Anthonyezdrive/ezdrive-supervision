// ============================================================
// EZDrive — Batch Action Bar
// Floating bar at bottom when items are selected
// ============================================================

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BatchAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
}

interface BatchActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  actions: BatchAction[];
}

export function BatchActionBar({ selectedCount, onClearSelection, actions }: BatchActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
        "flex items-center gap-4 px-5 py-3 rounded-2xl",
        "bg-gray-900/90 backdrop-blur-lg border border-white/10 shadow-2xl",
        "animate-in slide-in-from-bottom-4 fade-in duration-300"
      )}
    >
      {/* Selection count */}
      <span className="text-sm font-semibold text-white whitespace-nowrap">
        {selectedCount} sélectionné{selectedCount > 1 ? "s" : ""}
      </span>

      {/* Separator */}
      <div className="w-px h-6 bg-white/20" />

      {/* Actions */}
      <div className="flex items-center gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap",
              action.variant === "destructive"
                ? "bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30"
                : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
            )}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-white/20" />

      {/* Clear */}
      <button
        onClick={onClearSelection}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap"
      >
        <X className="w-3.5 h-3.5" />
        Tout désélectionner
      </button>
    </div>
  );
}
