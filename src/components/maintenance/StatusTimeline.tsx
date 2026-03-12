import { useStationStatusHistory } from "@/hooks/useStationStatusHistory";
import { OCPP_STATUS_CONFIG } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/utils";
import type { OCPPStatus } from "@/types/station";

interface StatusTimelineProps {
  stationId: string;
}

export function StatusTimeline({ stationId }: StatusTimelineProps) {
  const { data: history, isLoading } = useStationStatusHistory(stationId);

  if (isLoading) {
    return (
      <p className="text-xs text-foreground-muted animate-pulse-dot">
        Chargement...
      </p>
    );
  }

  if (!history || history.length === 0) {
    return (
      <p className="text-xs text-foreground-muted">Aucun historique</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {history.slice(0, 6).map((entry) => {
        const newCfg =
          OCPP_STATUS_CONFIG[entry.new_status as OCPPStatus] ??
          OCPP_STATUS_CONFIG.Unknown;
        const prevCfg = entry.previous_status
          ? OCPP_STATUS_CONFIG[entry.previous_status as OCPPStatus] ??
            OCPP_STATUS_CONFIG.Unknown
          : null;

        return (
          <div key={entry.id} className="flex items-center gap-2 text-xs">
            <span className="w-14 text-foreground-muted shrink-0 text-right">
              {formatRelativeTime(entry.changed_at)}
            </span>

            <div
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: newCfg.color }}
            />

            <span className="text-foreground-muted">
              {prevCfg && (
                <>
                  <span style={{ color: prevCfg.color }}>
                    {prevCfg.label}
                  </span>
                  {" \u2192 "}
                </>
              )}
              <span style={{ color: newCfg.color }} className="font-medium">
                {newCfg.label}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
