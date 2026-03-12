import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  Wallet,
  Zap,
  DollarSign,
  Search,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Tariffs Management Page
// ============================================================

interface StationTariff {
  id: string;
  station_id: string;
  tariff_id: string | null;
  name: string;
  currency: string;
  ocpi_tariff_id: string | null;
  start_fee: number | null;
  price_per_kwh: number | null;
  price_per_hour: number | null;
  idle_fee_per_hour: number | null;
  created_at: string;
  stations: { name: string; city: string } | null;
}

interface OcpiTariff {
  id: string;
  tariff_id_ocpi: string;
  currency: string;
  elements: unknown;
  created_at: string;
}

export function TariffsPage() {
  const [activeTab, setActiveTab] = useState<"station" | "ocpi">("station");
  const [search, setSearch] = useState("");

  // Station tariffs
  const { data: stationTariffs, isLoading: stLoading } = useQuery({
    queryKey: ["station-tariffs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("station_tariffs")
        .select("*, stations(name, city)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StationTariff[];
    },
  });

  // OCPI tariffs
  const { data: ocpiTariffs, isLoading: ocpiLoading } = useQuery({
    queryKey: ["ocpi-tariffs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ocpi_tariffs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OcpiTariff[];
    },
  });

  const filteredStation = useMemo(() => {
    if (!stationTariffs) return [];
    if (!search) return stationTariffs;
    const q = search.toLowerCase();
    return stationTariffs.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.stations?.name?.toLowerCase().includes(q) ||
        t.stations?.city?.toLowerCase().includes(q)
    );
  }, [stationTariffs, search]);

  const filteredOcpi = useMemo(() => {
    if (!ocpiTariffs) return [];
    if (!search) return ocpiTariffs;
    const q = search.toLowerCase();
    return ocpiTariffs.filter(
      (t) =>
        t.tariff_id_ocpi?.toLowerCase().includes(q) ||
        t.currency?.toLowerCase().includes(q)
    );
  }, [ocpiTariffs, search]);

  // Stats
  const avgPriceKwh = useMemo(() => {
    if (!stationTariffs?.length) return 0;
    const withPrice = stationTariffs.filter((t) => t.price_per_kwh && t.price_per_kwh > 0);
    if (!withPrice.length) return 0;
    return withPrice.reduce((sum, t) => sum + (t.price_per_kwh ?? 0), 0) / withPrice.length;
  }, [stationTariffs]);

  const formatEur = (v: number | null) =>
    v != null ? `${v.toFixed(2)} €` : "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-xl font-bold text-foreground">Tarifs</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Configuration des tarifs de recharge
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Wallet} label="Total tarifs" value={(stationTariffs?.length ?? 0) + (ocpiTariffs?.length ?? 0)} color="#8892B0" />
        <KpiCard icon={Zap} label="Tarifs station" value={stationTariffs?.length ?? 0} color="#00D4AA" />
        <KpiCard icon={Globe} label="Tarifs OCPI" value={ocpiTariffs?.length ?? 0} color="#4ECDC4" />
        <KpiCard icon={DollarSign} label="Prix moyen/kWh" value={`${avgPriceKwh.toFixed(3)} €`} color="#F39C12" />
      </div>

      {/* Search + Tabs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            type="text"
            placeholder="Rechercher tarif, station, ville..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
          />
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
          {([
            { key: "station" as const, label: "Tarifs Stations", count: stationTariffs?.length ?? 0 },
            { key: "ocpi" as const, label: "Tarifs OCPI", count: ocpiTariffs?.length ?? 0 },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2",
                activeTab === tab.key
                  ? "bg-primary/10 text-primary"
                  : "text-foreground-muted hover:text-foreground"
              )}
            >
              {tab.label}
              <span className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px]",
                activeTab === tab.key ? "bg-primary/20" : "bg-surface-elevated"
              )}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {activeTab === "station" ? (
        <StationTariffsTable tariffs={filteredStation} isLoading={stLoading} formatEur={formatEur} />
      ) : (
        <OcpiTariffsTable tariffs={filteredOcpi} isLoading={ocpiLoading} />
      )}
    </div>
  );
}

// ── Station Tariffs Table ─────────────────────────────────

function StationTariffsTable({
  tariffs,
  isLoading,
  formatEur,
}: {
  tariffs: StationTariff[];
  isLoading: boolean;
  formatEur: (v: number | null) => string;
}) {
  if (isLoading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-10 animate-shimmer rounded" />
        ))}
      </div>
    );
  }

  if (!tariffs.length) {
    return (
      <div className="bg-surface border border-border rounded-xl py-16 text-center">
        <Wallet className="w-12 h-12 text-foreground-muted/20 mx-auto mb-3" />
        <p className="text-foreground-muted">Aucun tarif station trouvé</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Nom tarif</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Station</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Ville</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-foreground-muted">Frais départ</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-foreground-muted">Prix/kWh</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-foreground-muted">Prix/heure</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-foreground-muted">Frais idle</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Devise</th>
            </tr>
          </thead>
          <tbody>
            {tariffs.map((t) => (
              <tr key={t.id} className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors">
                <td className="px-4 py-3">
                  <span className="text-sm font-medium text-foreground">{t.name}</span>
                </td>
                <td className="px-4 py-3 text-sm text-foreground">
                  {t.stations?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-sm text-foreground-muted">
                  {t.stations?.city ?? "—"}
                </td>
                <td className="px-4 py-3 text-right text-sm font-mono text-foreground-muted tabular-nums">
                  {formatEur(t.start_fee)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-mono tabular-nums">
                  <span className={t.price_per_kwh ? "text-primary font-medium" : "text-foreground-muted"}>
                    {formatEur(t.price_per_kwh)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-sm font-mono text-foreground-muted tabular-nums">
                  {formatEur(t.price_per_hour)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-mono text-foreground-muted tabular-nums">
                  {formatEur(t.idle_fee_per_hour)}
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 bg-surface-elevated rounded text-xs text-foreground-muted">
                    {t.currency}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── OCPI Tariffs Table ────────────────────────────────────

function OcpiTariffsTable({
  tariffs,
  isLoading,
}: {
  tariffs: OcpiTariff[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-10 animate-shimmer rounded" />
        ))}
      </div>
    );
  }

  if (!tariffs.length) {
    return (
      <div className="bg-surface border border-border rounded-xl py-16 text-center">
        <Globe className="w-12 h-12 text-foreground-muted/20 mx-auto mb-3" />
        <p className="text-foreground-muted">Aucun tarif OCPI trouvé</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">ID Tarif</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Devise</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Composants</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-foreground-muted">Créé le</th>
            </tr>
          </thead>
          <tbody>
            {tariffs.map((t) => {
              const components = parseOcpiElements(t.elements);
              return (
                <tr key={t.id} className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-foreground">
                    {t.tariff_id_ocpi}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-surface-elevated rounded text-xs text-foreground-muted">
                      {t.currency}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {components.map((c, i) => (
                        <span
                          key={i}
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-medium",
                            c.type === "ENERGY" ? "bg-primary/10 text-primary" :
                            c.type === "TIME" ? "bg-status-charging/10 text-status-charging" :
                            c.type === "FLAT" ? "bg-warning/10 text-warning" :
                            "bg-surface-elevated text-foreground-muted"
                          )}
                        >
                          {c.type}: {c.price}€
                        </span>
                      ))}
                      {components.length === 0 && (
                        <span className="text-xs text-foreground-muted">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground-muted">
                    {new Date(t.created_at).toLocaleDateString("fr-FR")}
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

// ── Helpers ───────────────────────────────────────────────

function parseOcpiElements(elements: unknown): Array<{ type: string; price: string }> {
  try {
    if (!Array.isArray(elements)) return [];
    const result: Array<{ type: string; price: string }> = [];
    for (const el of elements) {
      const components = el?.price_components ?? [];
      for (const pc of components) {
        result.push({
          type: pc.type ?? "UNKNOWN",
          price: (pc.price ?? 0).toFixed(4),
        });
      }
    }
    return result;
  } catch {
    return [];
  }
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: number | string;
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
