// ============================================================
// EZDrive — Realtime Load Chart (Gauge + EVSEs + Sparkline)
// ============================================================

import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Zap, Activity } from "lucide-react";
import { useSmartChargingRealtime } from "@/hooks/useSmartChargingRealtime";
import { cn } from "@/lib/utils";

// ── Tooltip style ────────────────────────────────────────────
const TOOLTIP_STYLE = {
  backgroundColor: "#111638",
  border: "1px solid #2A2F5A",
  borderRadius: "12px",
  color: "#F7F9FC",
  fontSize: "12px",
};

// ── Gauge colors ─────────────────────────────────────────────
function getGaugeColor(ratio: number) {
  if (ratio < 0.6) return "#10B981";
  if (ratio < 0.85) return "#F59E0B";
  return "#EF4444";
}

function getGaugeLabel(ratio: number) {
  if (ratio < 0.6) return "Normal";
  if (ratio < 0.85) return "Élevé";
  return "Critique";
}

// ══════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════

export function RealtimeLoadChart({ groupId }: { groupId: string }) {
  const { capacityKw, currentLoadKw, evses, history30min, isLoading } =
    useSmartChargingRealtime(groupId);

  const ratio = capacityKw > 0 ? currentLoadKw / capacityKw : 0;
  const clampedRatio = Math.min(ratio, 1);
  const gaugeColor = getGaugeColor(ratio);
  const gaugeLabel = getGaugeLabel(ratio);

  // Gauge data: filled portion + empty portion
  const gaugeData = useMemo(
    () => [
      { name: "used", value: clampedRatio },
      { name: "free", value: 1 - clampedRatio },
    ],
    [clampedRatio]
  );

  if (isLoading) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-primary animate-pulse" />
          <h2 className="text-base font-semibold text-foreground">
            Charge en temps réel
          </h2>
        </div>
        <div className="h-48 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">
            Charge en temps réel
          </h2>
        </div>
        <span
          className={cn(
            "px-3 py-1 text-xs font-medium rounded-full",
            ratio < 0.6 && "bg-emerald-500/15 text-emerald-400",
            ratio >= 0.6 && ratio < 0.85 && "bg-amber-500/15 text-amber-400",
            ratio >= 0.85 && "bg-red-500/15 text-red-400"
          )}
        >
          {gaugeLabel}
        </span>
      </div>

      <div className="p-6 space-y-6">
        {/* ── Row 1: Gauge + EVSE cards ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gauge (semi-circle) */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative w-full" style={{ maxWidth: 260, height: 150 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={gaugeData}
                    cx="50%"
                    cy="100%"
                    startAngle={180}
                    endAngle={0}
                    innerRadius="70%"
                    outerRadius="100%"
                    dataKey="value"
                    stroke="none"
                    animationDuration={600}
                  >
                    <Cell fill={gaugeColor} />
                    <Cell fill="#2A2F5A" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-2 pointer-events-none">
                <span className="text-2xl font-heading font-bold text-foreground">
                  {currentLoadKw} kW
                </span>
                <span className="text-xs text-foreground-muted">
                  / {capacityKw} kW
                </span>
              </div>
            </div>
            <p className="text-xs text-foreground-muted mt-2 text-center">
              {Math.round(ratio * 100)}% de la capacité utilisée
            </p>
          </div>

          {/* Active EVSEs grid */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">
              EVSEs actifs ({evses.length})
            </h3>
            {evses.length === 0 ? (
              <p className="text-sm text-foreground-muted italic">
                Aucun EVSE dans ce groupe
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                {evses.map((evse) => (
                  <div
                    key={evse.identity}
                    className="flex items-center gap-2 p-2.5 bg-surface-elevated border border-border rounded-xl"
                  >
                    {/* Status dot */}
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        evse.status === "charging" && "bg-emerald-400",
                        evse.status === "idle" && "bg-gray-400",
                        evse.status === "offline" && "bg-red-400"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">
                        {evse.identity}
                      </p>
                      <p className="text-[10px] text-foreground-muted">
                        {evse.status === "charging"
                          ? `${evse.powerKw} kW`
                          : evse.status === "idle"
                          ? "En veille"
                          : "Hors ligne"}
                      </p>
                    </div>
                    {evse.status === "charging" && (
                      <Zap className="w-3 h-3 text-primary shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Row 2: Sparkline (last 30 min) ── */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Dernières 30 minutes
          </h3>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history30min} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9ACC0E" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#9ACC0E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: "#8B8FA3" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#8B8FA3" }}
                  axisLine={false}
                  tickLine={false}
                  width={35}
                  domain={[0, Math.max(capacityKw * 1.1, 1)]}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number) => [`${value} kW`, "Charge"]}
                  labelFormatter={(label: string) => `${label}`}
                />
                {/* Capacity reference line */}
                <ReferenceLine
                  y={capacityKw}
                  stroke="#EF4444"
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  label={{
                    value: `${capacityKw} kW max`,
                    position: "right",
                    fill: "#EF4444",
                    fontSize: 10,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="loadKw"
                  stroke="#9ACC0E"
                  strokeWidth={2}
                  fill="url(#sparkGrad)"
                  dot={false}
                  animationDuration={400}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
