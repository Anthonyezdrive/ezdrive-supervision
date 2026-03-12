import { useState, useMemo } from "react";
import { useStations } from "@/hooks/useStations";
import {
  MapPin,
  Radio,
  Globe,
  Building2,
  Search,
  ChevronDown,
  CheckCircle,
  BatteryCharging,
  AlertTriangle,
  WifiOff,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Station } from "@/types/station";

// ============================================================
// Locations Page — Stations grouped by city/territory
// ============================================================

interface LocationGroup {
  city: string;
  territory: string | null;
  stations: Station[];
  available: number;
  charging: number;
  faulted: number;
  offline: number;
  totalPower: number;
}

export function LocationsPage() {
  const { data: stations, isLoading } = useStations();
  const [search, setSearch] = useState("");
  const [expandedCity, setExpandedCity] = useState<string | null>(null);

  const groups = useMemo(() => {
    if (!stations) return [];
    const map = new Map<string, LocationGroup>();

    for (const s of stations) {
      const city = s.city || "Non défini";
      let group = map.get(city);
      if (!group) {
        group = {
          city,
          territory: s.territory_name,
          stations: [],
          available: 0,
          charging: 0,
          faulted: 0,
          offline: 0,
          totalPower: 0,
        };
        map.set(city, group);
      }
      group.stations.push(s);
      group.totalPower += s.max_power_kw ?? 0;
      if (s.ocpp_status === "Available") group.available++;
      else if (s.ocpp_status === "Charging") group.charging++;
      else if (s.ocpp_status === "Faulted") group.faulted++;
      if (!s.is_online) group.offline++;
    }

    return Array.from(map.values()).sort(
      (a, b) => b.stations.length - a.stations.length
    );
  }, [stations]);

  const filtered = useMemo(() => {
    if (!search) return groups;
    const q = search.toLowerCase();
    return groups.filter(
      (g) =>
        g.city.toLowerCase().includes(q) ||
        g.territory?.toLowerCase().includes(q) ||
        g.stations.some((s) => s.name.toLowerCase().includes(q))
    );
  }, [groups, search]);

  const uniqueTerritories = useMemo(() => {
    const set = new Set(groups.map((g) => g.territory).filter(Boolean));
    return set.size;
  }, [groups]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-xl font-bold text-foreground">
          Localisations
        </h1>
        <p className="text-sm text-foreground-muted mt-1">
          Stations de recharge par zone géographique
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={MapPin} label="Localisations" value={groups.length} color="#8892B0" />
        <KpiCard icon={Radio} label="Total bornes" value={stations?.length ?? 0} color="#00D4AA" />
        <KpiCard icon={Globe} label="Territoires" value={uniqueTerritories} color="#4ECDC4" />
        <KpiCard icon={Building2} label="Villes" value={groups.length} color="#F39C12" />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
        <input
          type="text"
          placeholder="Rechercher ville, territoire ou station..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
        />
      </div>

      {/* Location Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl h-40 animate-shimmer" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl py-16 text-center">
          <MapPin className="w-12 h-12 text-foreground-muted/20 mx-auto mb-3" />
          <p className="text-foreground-muted">Aucune localisation trouvée</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((group) => {
            const isExpanded = expandedCity === group.city;
            return (
              <div
                key={group.city}
                className={cn(
                  "bg-surface border rounded-xl overflow-hidden transition-all",
                  isExpanded ? "border-primary/30 md:col-span-2 lg:col-span-3" : "border-border hover:border-border"
                )}
              >
                {/* Card header */}
                <button
                  onClick={() => setExpandedCity(isExpanded ? null : group.city)}
                  className="w-full text-left p-4 hover:bg-surface-elevated/30 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-heading text-sm font-semibold text-foreground">
                        {group.city}
                      </h3>
                      {group.territory && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-medium rounded">
                          {group.territory}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-heading font-bold text-foreground">
                        {group.stations.length}
                      </span>
                      <span className="text-xs text-foreground-muted">borne{group.stations.length > 1 ? "s" : ""}</span>
                      <ChevronDown className={cn(
                        "w-4 h-4 text-foreground-muted transition-transform",
                        isExpanded && "rotate-180"
                      )} />
                    </div>
                  </div>

                  {/* Status breakdown */}
                  <div className="flex items-center gap-3 text-xs">
                    {group.available > 0 && (
                      <div className="flex items-center gap-1 text-status-available">
                        <CheckCircle className="w-3 h-3" />
                        <span>{group.available}</span>
                      </div>
                    )}
                    {group.charging > 0 && (
                      <div className="flex items-center gap-1 text-status-charging">
                        <BatteryCharging className="w-3 h-3" />
                        <span>{group.charging}</span>
                      </div>
                    )}
                    {group.faulted > 0 && (
                      <div className="flex items-center gap-1 text-status-faulted">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{group.faulted}</span>
                      </div>
                    )}
                    {group.offline > 0 && (
                      <div className="flex items-center gap-1 text-status-offline">
                        <WifiOff className="w-3 h-3" />
                        <span>{group.offline}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-foreground-muted ml-auto">
                      <Zap className="w-3 h-3" />
                      <span>{Math.round(group.totalPower * 10) / 10} kW</span>
                    </div>
                  </div>
                </button>

                {/* Expanded station list */}
                {isExpanded && (
                  <div className="border-t border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="text-left px-4 py-2 text-xs font-medium text-foreground-muted">Station</th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-foreground-muted">Adresse</th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-foreground-muted">Statut</th>
                          <th className="text-right px-4 py-2 text-xs font-medium text-foreground-muted">Puissance</th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-foreground-muted">CPO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.stations.map((s) => (
                          <tr key={s.id} className="border-b border-border/30 hover:bg-surface-elevated/30 transition-colors">
                            <td className="px-4 py-2.5 text-xs font-medium text-foreground">{s.name}</td>
                            <td className="px-4 py-2.5 text-xs text-foreground-muted">{s.address}</td>
                            <td className="px-4 py-2.5">
                              <StatusDot status={s.ocpp_status} isOnline={s.is_online} />
                            </td>
                            <td className="px-4 py-2.5 text-right text-xs text-foreground-muted tabular-nums">
                              {s.max_power_kw ? `${s.max_power_kw} kW` : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-foreground-muted">{s.cpo_name ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function StatusDot({ status, isOnline }: { status: string; isOnline: boolean }) {
  const configs: Record<string, { label: string; color: string; bg: string }> = {
    Available: { label: "Disponible", color: "text-status-available", bg: "bg-status-available" },
    Charging: { label: "En charge", color: "text-status-charging", bg: "bg-status-charging" },
    Faulted: { label: "En panne", color: "text-status-faulted", bg: "bg-status-faulted" },
    Unavailable: { label: "Indisponible", color: "text-status-unavailable", bg: "bg-status-unavailable" },
  };
  const cfg = configs[status] ?? { label: isOnline ? status : "Hors ligne", color: "text-status-offline", bg: "bg-status-offline" };

  return (
    <div className={cn("flex items-center gap-1.5 text-xs", cfg.color)}>
      <div className={cn("w-1.5 h-1.5 rounded-full", cfg.bg)} />
      {cfg.label}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}15` }}>
        <Icon className="w-4.5 h-4.5" style={{ color }} />
      </div>
      <div>
        <p className="text-lg font-heading font-bold text-foreground">{value}</p>
        <p className="text-[11px] text-foreground-muted">{label}</p>
      </div>
    </div>
  );
}
