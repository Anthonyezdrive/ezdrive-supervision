import { useState } from "react";
import { X, MapPin, Plug, Clock, Zap, Wifi, WifiOff, Cpu, Server, Radio, Shield, RotateCcw, Trash2, Loader2, Terminal, Pencil, AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDuration, formatRelativeTime } from "@/lib/utils";
import { useStationStatusHistory } from "@/hooks/useStationStatusHistory";
import { OCPP_STATUS_CONFIG } from "@/lib/constants";
import { apiPost, apiDelete } from "@/lib/api";
import type { Station, OCPPStatus } from "@/types/station";

interface Props {
  station: Station;
  onClose: () => void;
  onEdit?: (station: Station) => void;
  onDeleted?: () => void;
}

export function StationDetailDrawer({ station, onClose, onEdit, onDeleted }: Props) {
  const { data: history } = useStationStatusHistory(station.id);
  const [cmdLoading, setCmdLoading] = useState<string | null>(null);
  const [cmdResult, setCmdResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function handleDelete() {
    setDeleteLoading(true);
    try {
      await apiDelete(`admin-stations/${station.id}`);
      onDeleted?.();
    } catch (err) {
      setCmdResult({ ok: false, msg: err instanceof Error ? err.message : "Erreur suppression" });
    } finally {
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
    }
  }

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

  async function sendCommand(command: string, payload?: Record<string, unknown>) {
    setCmdLoading(command);
    setCmdResult(null);
    try {
      const res = await apiPost("ocpp/command", {
        command,
        chargepoint_id: (station as any).ocpp_identity ?? station.gfx_id,
        ...(payload ? { payload } : {}),
      });
      setCmdResult({ ok: true, msg: `Commande envoyée — ID: ${(res as any)?.command_id ?? "OK"}` });
    } catch (err) {
      setCmdResult({ ok: false, msg: err instanceof Error ? err.message : "Erreur inconnue" });
    } finally {
      setCmdLoading(null);
    }
  }

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
          <div className="flex items-center gap-1.5">
            {onEdit && (
              <button
                onClick={() => onEdit(station)}
                className="p-1.5 hover:bg-primary/10 text-foreground-muted hover:text-primary rounded-lg transition-colors"
                title="Modifier"
              >
                <Pencil className="w-4.5 h-4.5" />
              </button>
            )}
            {onDeleted && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 hover:bg-red-500/10 text-foreground-muted hover:text-red-400 rounded-lg transition-colors"
                title="Désactiver"
              >
                <Trash2 className="w-4.5 h-4.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-surface-elevated rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-foreground-muted" />
            </button>
          </div>
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="mx-5 mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-400">Désactiver cette borne ?</p>
                <p className="text-xs text-foreground-muted mt-1">La borne sera marquée comme indisponible et hors ligne. Cette action est réversible.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-1.5 border border-border rounded-lg text-xs text-foreground-muted hover:text-foreground transition-colors">
                Annuler
              </button>
              <button onClick={handleDelete} disabled={deleteLoading}
                className="flex-1 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                {deleteLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                Confirmer
              </button>
            </div>
          </div>
        )}

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

          {/* Hardware & Connectivity */}
          {(station.charge_point_vendor || station.connectivity_status || station.protocol_version) && (
            <div>
              <h3 className="text-sm font-semibold text-foreground-muted mb-3">
                Hardware & Connectivité
              </h3>
              <div className="space-y-3">
                {station.connectivity_status && (
                  <InfoRow
                    icon={station.connectivity_status === "Online" ? Wifi : WifiOff}
                    label="Connectivité"
                    value={
                      <span className={station.connectivity_status === "Online" ? "text-success" : "text-danger"}>
                        {station.connectivity_status}
                        {station.heartbeat_interval ? ` (heartbeat ${station.heartbeat_interval}s)` : ""}
                      </span>
                    }
                  />
                )}
                {(station.charge_point_vendor || station.charge_point_model) && (
                  <InfoRow
                    icon={Cpu}
                    label="Matériel"
                    value={[station.charge_point_vendor, station.charge_point_model].filter(Boolean).join(" — ")}
                  />
                )}
                {station.firmware_version && (
                  <InfoRow
                    icon={Server}
                    label="Firmware"
                    value={station.firmware_version}
                  />
                )}
                {station.protocol_version && (
                  <InfoRow
                    icon={Radio}
                    label="Protocole"
                    value={`${station.protocol_version}${station.remote_manageable ? " • Remote Start/Stop" : ""}`}
                  />
                )}
                {station.charger_type && (
                  <InfoRow
                    icon={Zap}
                    label="Type / Vitesse"
                    value={[station.charger_type, station.charging_speed].filter(Boolean).join(" • ")}
                  />
                )}
                {station.iso_15118_enabled && (
                  <InfoRow
                    icon={Shield}
                    label="ISO 15118"
                    value="Plug & Charge activé"
                  />
                )}
              </div>
            </div>
          )}

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

          {/* Remote Commands */}
          <div className="pt-4 border-t border-border space-y-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-foreground-muted" />
              <h3 className="text-sm font-semibold text-foreground-muted">Télécommande</h3>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => sendCommand("Reset", { type: "Soft" })}
                disabled={!!cmdLoading}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#F39C12]/15 text-[#F39C12] border border-[#F39C12]/30 text-xs font-semibold hover:bg-[#F39C12]/25 transition-colors disabled:opacity-40"
              >
                {cmdLoading === "Reset" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Redémarrer
              </button>
              <button
                onClick={() => sendCommand("ClearCache")}
                disabled={!!cmdLoading}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#8892B0]/15 text-[#8892B0] border border-[#8892B0]/30 text-xs font-semibold hover:bg-[#8892B0]/25 transition-colors disabled:opacity-40"
              >
                {cmdLoading === "ClearCache" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Vider cache
              </button>
            </div>
            {cmdResult && (
              <p className={`text-xs px-3 py-2 rounded-lg ${cmdResult.ok ? "bg-[#00D4AA]/10 text-[#00D4AA]" : "bg-[#FF6B6B]/10 text-[#FF6B6B]"}`}>
                {cmdResult.msg}
              </p>
            )}
          </div>

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
  value: React.ReactNode;
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
