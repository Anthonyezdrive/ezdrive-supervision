import { cn } from "@/lib/utils";

interface KPICardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  borderColor?: string;
}

/** Convert any hex color (#rgb or #rrggbb) to rgba with given alpha */
function hexToRgba(hex: string, alpha: number): string {
  // Remove #
  let h = hex.replace("#", "");
  // Expand 3-digit hex to 6-digit
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  // Parse r, g, b
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return hex; // fallback
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function KPICard({
  label,
  value,
  icon: Icon,
  color,
  borderColor,
}: KPICardProps) {
  return (
    <div
      className={cn(
        "bg-surface border rounded-2xl p-5 flex items-center gap-4 transition-colors hover:border-opacity-80",
        borderColor ?? "border-border"
      )}
      role="group"
      aria-label={`${label}: ${value}`}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: hexToRgba(color, 0.08) }}
      >
        <Icon className="w-6 h-6" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-heading font-bold text-foreground truncate">
          {value}
        </p>
        <p className="text-xs text-foreground-muted mt-0.5">{label}</p>
      </div>
    </div>
  );
}
