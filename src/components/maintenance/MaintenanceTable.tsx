import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FaultDurationBadge } from "./FaultDurationBadge";
import { StatusTimeline } from "./StatusTimeline";
import { formatRelativeTime } from "@/lib/utils";
import type { MaintenanceStation } from "@/hooks/useMaintenanceStations";
import type { OCPPStatus } from "@/types/station";

interface MaintenanceTableProps {
  stations: MaintenanceStation[];
}

export function MaintenanceTable({ stations }: MaintenanceTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = [...stations].sort(
    (a, b) => b.hours_in_fault - a.hours_in_fault
  );

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <th className="w-8" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                Borne
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                Statut
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                Durée panne
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                CPO
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                Territoire
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                Dernière sync
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((station) => {
              const isExpanded = expandedId === station.id;
              return (
                <tr key={station.id} className="group">
                  <td colSpan={7} className="p-0">
                    {/* Main row */}
                    <div
                      className="flex items-center cursor-pointer hover:bg-surface-elevated/50 transition-colors"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : station.id)
                      }
                    >
                      <div className="w-8 flex items-center justify-center pl-2">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-foreground-muted" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-foreground-muted" />
                        )}
                      </div>
                      <div className="flex-1 grid grid-cols-6 gap-0">
                        <div className="px-4 py-3">
                          <p className="text-sm font-medium text-foreground">
                            {station.name}
                          </p>
                          <p className="text-xs text-foreground-muted">
                            {station.city ?? station.address ?? station.gfx_id}
                          </p>
                        </div>
                        <div className="px-4 py-3 flex items-center">
                          <StatusBadge
                            status={station.ocpp_status as OCPPStatus}
                          />
                        </div>
                        <div className="px-4 py-3 flex items-center">
                          <FaultDurationBadge hours={station.hours_in_fault} />
                        </div>
                        <div className="px-4 py-3 flex items-center text-sm text-foreground-muted">
                          {station.cpo_name ?? "—"}
                        </div>
                        <div className="px-4 py-3 flex items-center text-sm text-foreground-muted">
                          {station.territory_name ?? "—"}
                        </div>
                        <div className="px-4 py-3 flex items-center text-sm text-foreground-muted">
                          {formatRelativeTime(station.last_synced_at)}
                        </div>
                      </div>
                    </div>

                    {/* Expanded: Status Timeline */}
                    {isExpanded && (
                      <div className="px-12 pb-4 pt-1 bg-surface-elevated/30 border-t border-border/50">
                        <p className="text-xs font-semibold text-foreground-muted mb-2 uppercase tracking-wider">
                          Historique des statuts
                        </p>
                        <StatusTimeline stationId={station.id} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
