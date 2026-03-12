import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/utils";

interface FaultDurationBadgeProps {
  hours: number;
}

export function FaultDurationBadge({ hours }: FaultDurationBadgeProps) {
  const severity =
    hours >= 24
      ? "critical"
      : hours >= 4
        ? "warning"
        : "recent";

  const config = {
    critical: {
      bg: "bg-status-faulted/15",
      text: "text-status-faulted",
      border: "border-status-faulted/40",
      label: "Critique",
    },
    warning: {
      bg: "bg-warning/15",
      text: "text-warning",
      border: "border-warning/40",
      label: "Attention",
    },
    recent: {
      bg: "bg-status-offline/15",
      text: "text-status-offline",
      border: "border-status-offline/40",
      label: "Récent",
    },
  }[severity];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold",
        config.bg,
        config.text,
        config.border
      )}
    >
      <span>{formatDuration(hours)}</span>
      <span className="opacity-60">•</span>
      <span>{config.label}</span>
    </div>
  );
}
