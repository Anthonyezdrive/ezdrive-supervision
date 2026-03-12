import { cn } from "@/lib/utils";
import { OCPP_STATUS_CONFIG } from "@/lib/constants";
import type { OCPPStatus } from "@/types/station";

export function StatusBadge({ status }: { status: OCPPStatus }) {
  const config = OCPP_STATUS_CONFIG[status] ?? OCPP_STATUS_CONFIG.Unknown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold",
        config.bgClass,
        config.textClass,
        config.borderClass
      )}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: config.color }}
      />
      {config.label}
    </span>
  );
}
