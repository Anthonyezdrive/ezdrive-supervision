import { X, MapPin, Plug, Clock, Zap } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDuration, formatRelativeTime } from "@/lib/utils";
import { useStationStatusHistory } from "@/hooks/useStationStatusHistory";
import { OCPP_STATUS_CONFIG } from "@/lib/constants";
import type { Station, OCPPStatus } from "@/types/station";

interface Props {
  station: Station;
  onClose: () => void;
}

export function StationDetailDrawer({ station, onClose }: Props) {
  const { data: history } = useStationStatusHistory(station.id);

  // connectors may come as JSON string from Supabase
  const connectors: Array<{
    id: string;
    type: string;
    status: string;
    max_power_kw: number;
    evse_uid?: string;
    format?: string;
  }> = (() => {
    if (!station.connectors) return [];
    if (Array.isArray(station.connectors)) return station.connectors;
    if (typeof station.connectors === "string") {
      try {
        return JSON.parse(station.connectors);
      } catch {
        return [];
      }
    }
    return [];
  })();

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-surface border-l border-border z-50 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-heading font-bold text-lg">{station.name}</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-surface-elevated rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-foreground-muted" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Status */}
          <div className="flex items-center gap-3">
            <StatusBadge status={station.ocpp_status as OCPPStatus} />
            <span className="text-sm text-foreground-muted">
              depuis {formatDuration(station.hours_in_status)}
            </span>
          </div>

          {/* Info */}
          <div className="space-y-3">
            <InfoRow
              icon={MapPin}
              label="Localisation"
              value={
                [station.address, station.city, station.postal_code]
                  .filter(Boolean)
                  .join(", ") || "—"
              }
            />
            <InfoRow
              icon={Zap}
              label="CPO"
              value={station.cpo_name ?? "Non assigné"}
            />
            <InfoRow
              icon={MapPin}
              label="Territoire"
              value={station.territory_name ?? "Non assigné"}
            />
            <InfoRow
              icon={Plug}
              label="Puissance max"
              value={
                station.max_power_kw
                  ? `${station.max_power_kw} kW`
                  : "—"
              }
            />
            <InfoRow
              icon={Clock}
              label="Dernière sync"
              value={formatRelativeTime(station.last_synced_at)}
            />
          </div>

          {/* Connectors */}
          {connectors.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground-muted mb-3">
                Connecteurs ({connectors.length})
              </h3>
              <div className="space-y-2">
                {connectors.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-surface-elevated border border-border rounded-xl px-4 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <Plug className="w-4 h-4 text-foreground-muted" />
                      <span className="text-sm">{c.type}</span>
                      {c.max_power_kw > 0 && (
                        <span className="text-xs text-foreground-muted">
                          {c.max_power_kw} kW
                        </span>
                      )}
                    </div>
                    <StatusBadge status={c.status as OCPPStatus} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status History */}
          {history && history.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground-muted mb-3">
                Historique des statuts
              </h3>
              <div className="space-y-2">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <div className="w-16 text-xs text-foreground-muted shrink-0">
                      {formatRelativeTime(entry.changed_at)}
                    </div>
                    {entry.previous_status && (
                      <>
                        <span
                          className="text-xs"
                          style={{
                            color:
                              OCPP_STATUS_CONFIG[
                                entry.previous_status as OCPPStatus
                              ]?.color ?? "#8892B0",
                          }}
                        >
                          {OCPP_STATUS_CONFIG[
                            entry.previous_status as OCPPStatus
                          ]?.label ?? entry.previous_status}
                        </span>
                        <span className="text-foreground-muted">→</span>
                      </>
                    )}
                    <span
                      className="text-xs font-medium"
                      style={{
                        color:
                          OCPP_STATUS_CONFIG[entry.new_status as OCPPStatus]
                            ?.color ?? "#8892B0",
                      }}
                    >
                      {OCPP_STATUS_CONFIG[entry.new_status as OCPPStatus]
                        ?.label ?? entry.new_status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GFX ID */}
          <div className="pt-4 border-t border-border">
            <p className="text-xs text-foreground-muted">
              GreenFlux ID:{" "}
              <span className="font-mono text-foreground">{station.gfx_id}</span>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-foreground-muted mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-foreground-muted">{label}</p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}
