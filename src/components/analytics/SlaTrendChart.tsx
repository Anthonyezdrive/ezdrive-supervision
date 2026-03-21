import { useState, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  CartesianGrid,
} from "recharts";
import { useSlaHistory, type SlaGranularity } from "@/hooks/useSlaHistory";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface SlaTrendChartProps {
  cpoId?: string | null;
  from?: string;
  to?: string;
}

const GRANULARITY_OPTIONS: { key: SlaGranularity; label: string }[] = [
  { key: "day", label: "Jour" },
  { key: "week", label: "Semaine" },
  { key: "month", label: "Mois" },
];

const LS_KEY = "sla_target_pct";

function readSavedTarget(): number {
  try {
    const val = localStorage.getItem(LS_KEY);
    if (val !== null) {
      const n = Number(val);
      if (!isNaN(n) && n >= 0 && n <= 100) return n;
    }
  } catch {
    // ignore
  }
  return 95;
}

function formatPeriod(dateStr: string, granularity: SlaGranularity): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  if (granularity === "month") {
    return d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
  }
  if (granularity === "week") {
    return `Sem. ${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}`;
  }
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        backgroundColor: "#111638",
        border: "1px solid #2A2F5A",
        borderRadius: "12px",
        color: "#F7F9FC",
        fontSize: "12px",
        padding: "10px 14px",
      }}
    >
      <p className="font-medium mb-1">{label}</p>
      <p>
        Disponibilité :{" "}
        <span className="font-bold" style={{ color: "#9ACC0E" }}>
          {payload[0].value.toFixed(1)}%
        </span>
      </p>
    </div>
  );
}

export function SlaTrendChart({ cpoId, from, to }: SlaTrendChartProps) {
  const [granularity, setGranularity] = useState<SlaGranularity>("day");
  const [slaTarget, setSlaTarget] = useState<number>(readSavedTarget);

  // Persist SLA target (debounced to avoid writes on every keystroke)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, String(slaTarget));
      } catch {
        // ignore
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [slaTarget]);

  const { data: rawData = [], isLoading, error } = useSlaHistory({
    from,
    to,
    cpoId,
    granularity,
  });

  // Format data for chart
  const chartData = useMemo(
    () =>
      rawData.map((d) => ({
        ...d,
        label: formatPeriod(d.period, granularity),
      })),
    [rawData, granularity]
  );

  // Summary stats
  const avgPct = useMemo(() => {
    if (!rawData.length) return 0;
    return (
      Math.round(
        (rawData.reduce((s, d) => s + d.availability_pct, 0) / rawData.length) *
          10
      ) / 10
    );
  }, [rawData]);

  const daysBelowTarget = useMemo(
    () => rawData.filter((d) => d.availability_pct < slaTarget).length,
    [rawData, slaTarget]
  );

  const slaRespected = avgPct >= slaTarget;

  // Compute the Y min for the reference area (below target, red zone)
  const yMin = useMemo(() => {
    if (!rawData.length) return 0;
    const min = Math.min(...rawData.map((d) => d.availability_pct));
    return Math.max(0, Math.floor(min - 5));
  }, [rawData]);

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Granularity selector */}
        <div className="flex gap-1">
          {GRANULARITY_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setGranularity(opt.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                granularity === opt.key
                  ? "bg-primary text-white"
                  : "bg-surface-elevated text-foreground-muted hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-border" />

        {/* SLA target input */}
        <div className="flex items-center gap-2 text-xs">
          <label className="text-foreground-muted whitespace-nowrap">
            Objectif SLA :
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={slaTarget}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!isNaN(v) && v >= 0 && v <= 100) setSlaTarget(v);
            }}
            className="w-14 bg-surface-elevated border border-border rounded-lg px-2 py-1.5 text-xs text-foreground text-center tabular-nums"
          />
          <span className="text-foreground-muted">%</span>
        </div>
      </div>

      {/* Chart */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-foreground-muted">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Chargement...
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-64 text-status-faulted text-sm">
          Erreur lors du chargement des données SLA
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-foreground-muted text-sm">
          Aucune donnée disponible pour cette période
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#2A2F5A"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#8B8FA3" }}
                axisLine={{ stroke: "#2A2F5A" }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[yMin, 100]}
                tick={{ fontSize: 11, fill: "#8B8FA3" }}
                axisLine={{ stroke: "#2A2F5A" }}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
                width={48}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Red zone below SLA target */}
              <ReferenceArea
                y1={yMin}
                y2={slaTarget}
                fill="#EF4444"
                fillOpacity={0.08}
              />

              {/* SLA target line */}
              <ReferenceLine
                y={slaTarget}
                stroke="#EF4444"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                label={{
                  value: `Objectif ${slaTarget}%`,
                  position: "right",
                  fill: "#EF4444",
                  fontSize: 11,
                }}
              />

              {/* Availability line */}
              <Line
                type="monotone"
                dataKey="availability_pct"
                stroke="#9ACC0E"
                strokeWidth={2}
                dot={{ r: 3, fill: "#9ACC0E", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "#9ACC0E", strokeWidth: 2, stroke: "#1a1f3e" }}
                name="Disponibilité"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary */}
      {!isLoading && !error && chartData.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="text-foreground-muted">
            Disponibilité moyenne :{" "}
            <span
              className={cn(
                "font-bold",
                avgPct >= slaTarget
                  ? "text-status-available"
                  : "text-status-faulted"
              )}
            >
              {avgPct.toFixed(1)}%
            </span>
          </div>

          <div className="h-4 w-px bg-border" />

          <div className="text-foreground-muted">
            Périodes sous l'objectif :{" "}
            <span
              className={cn(
                "font-bold",
                daysBelowTarget === 0
                  ? "text-status-available"
                  : "text-status-faulted"
              )}
            >
              {daysBelowTarget}
            </span>
          </div>

          <div className="h-4 w-px bg-border" />

          {slaRespected ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-status-available/10 text-status-available text-xs font-semibold">
              <span aria-hidden>&#10003;</span> SLA respect&eacute;
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-status-faulted/10 text-status-faulted text-xs font-semibold">
              <span aria-hidden>&#10007;</span> SLA non atteint
            </span>
          )}
        </div>
      )}
    </div>
  );
}
