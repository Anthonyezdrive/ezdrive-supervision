import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Plus,
  Trash2,
  Loader2,
  Gauge,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { SlideOver } from "@/components/ui/SlideOver";

// ── Types ──────────────────────────────────────────────────

interface SiteCapacity {
  id: string;
  station_id: string;
  site_name: string | null;
  max_capacity_kw: number;
  warning_threshold_pct: number;
  critical_threshold_pct: number;
  is_active: boolean;
  stations?: { name: string; city: string | null } | null;
}

// ── Hooks ──────────────────────────────────────────────────

function useSiteCapacity() {
  return useQuery<SiteCapacity[]>({
    queryKey: ["site-capacity"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("site_capacity_config")
          .select("*, stations(name, city)")
          .eq("is_active", true)
          .order("created_at", { ascending: false });
        if (error) {
          console.warn("[Capacity] error:", error.message);
          return [];
        }
        return (data ?? []) as SiteCapacity[];
      } catch {
        return [];
      }
    },
    refetchInterval: 30_000,
  });
}

function useCapacityCheck() {
  return useQuery<{
    capacity_alerts: Array<{
      station_id: string;
      station_name: string;
      alert_level: "warning" | "critical";
      current_load_kw: number;
      max_capacity_kw: number;
      usage_pct: number;
    }>;
    checked_at: string;
  }>({
    queryKey: ["capacity-check"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("check_site_capacity");
        if (error) {
          console.warn("[CapacityCheck] error:", error.message);
          return { capacity_alerts: [], checked_at: new Date().toISOString() };
        }
        return data as any;
      } catch {
        return { capacity_alerts: [], checked_at: new Date().toISOString() };
      }
    },
    refetchInterval: 60_000,
  });
}

// ── Component ──────────────────────────────────────────────

export default function CapacityTab() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const { data: sites, isLoading } = useSiteCapacity();
  const { data: capacityCheck, refetch: refetchCapacity } = useCapacityCheck();
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({
    station_id: "",
    site_name: "",
    max_capacity_kw: "100",
    warning_threshold_pct: "80",
    critical_threshold_pct: "95",
  });

  // Fetch stations for dropdown
  const { data: stationsList } = useQuery({
    queryKey: ["stations-dropdown-capacity"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stations")
        .select("id, name, city")
        .order("name");
      return data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("site_capacity_config").insert({
        station_id: form.station_id,
        site_name: form.site_name || null,
        max_capacity_kw: parseFloat(form.max_capacity_kw) || 100,
        warning_threshold_pct: parseFloat(form.warning_threshold_pct) || 80,
        critical_threshold_pct: parseFloat(form.critical_threshold_pct) || 95,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-capacity"] });
      setShowAddModal(false);
      setForm({ station_id: "", site_name: "", max_capacity_kw: "100", warning_threshold_pct: "80", critical_threshold_pct: "95" });
      toastSuccess("Configuration ajoutée");
    },
    onError: (err: Error) => toastError("Erreur", err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("site_capacity_config").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-capacity"] });
      toastSuccess("Configuration supprimée");
    },
  });

  // Merge live data with config
  const sitesWithLoad = useMemo(() => {
    if (!sites) return [];
    const alertMap = new Map(
      (capacityCheck?.capacity_alerts ?? []).map((a) => [a.station_id, a])
    );
    return sites.map((site) => {
      const alert = alertMap.get(site.station_id);
      return {
        ...site,
        current_load_kw: alert?.current_load_kw ?? 0,
        usage_pct: alert?.usage_pct ?? 0,
        alert_level: alert?.alert_level ?? null,
      };
    });
  }, [sites, capacityCheck]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-base font-semibold text-foreground">
            Capacité électrique par site
          </h2>
          <p className="text-xs text-foreground-muted mt-0.5">
            Surveillance de la charge électrique en temps réel
            {capacityCheck?.checked_at && (
              <span className="ml-2 text-foreground-muted/60">
                · Vérifié {formatRelativeTime(capacityCheck.checked_at)}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetchCapacity()}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground-muted hover:text-foreground transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Ajouter un site
          </button>
        </div>
      </div>

      {/* Active alerts banner */}
      {capacityCheck && capacityCheck.capacity_alerts.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-semibold text-red-400">
              {capacityCheck.capacity_alerts.length} alerte{capacityCheck.capacity_alerts.length > 1 ? "s" : ""} de capacité
            </span>
          </div>
          <div className="space-y-1">
            {capacityCheck.capacity_alerts.map((alert) => (
              <div key={alert.station_id} className="flex items-center justify-between text-xs">
                <span className="text-foreground">{alert.station_name}</span>
                <span className={cn(
                  "font-semibold",
                  alert.alert_level === "critical" ? "text-red-400" : "text-amber-400"
                )}>
                  {alert.usage_pct}% ({alert.current_load_kw} / {alert.max_capacity_kw} kW)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sites grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-surface border border-border rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : !sitesWithLoad || sitesWithLoad.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 bg-surface border border-border rounded-2xl">
          <Gauge className="w-8 h-8 text-foreground-muted/40 mb-2" />
          <p className="text-foreground-muted">Aucun site configuré</p>
          <p className="text-xs text-foreground-muted/60 mt-1">Ajoutez une station pour surveiller sa capacité.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sitesWithLoad.map((site) => {
            const pct = Math.min(site.usage_pct, 100);
            const barColor =
              site.alert_level === "critical"
                ? "bg-red-500"
                : site.alert_level === "warning"
                ? "bg-amber-500"
                : pct > 50
                ? "bg-blue-500"
                : "bg-emerald-500";
            const stationName = site.stations?.name ?? site.site_name ?? "Station";
            const stationCity = site.stations?.city ?? "";

            return (
              <div
                key={site.id}
                className={cn(
                  "bg-surface border rounded-2xl p-5 space-y-3",
                  site.alert_level === "critical"
                    ? "border-red-500/40"
                    : site.alert_level === "warning"
                    ? "border-amber-500/40"
                    : "border-border"
                )}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{stationName}</h3>
                    {stationCity && (
                      <p className="text-xs text-foreground-muted">{stationCity}</p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(site.id)}
                    className="p-1 text-foreground-muted hover:text-red-400 transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-2xl font-bold text-foreground tabular-nums">
                      {site.current_load_kw.toFixed(1)}
                    </span>
                    <span className="text-xs text-foreground-muted">
                      / {site.max_capacity_kw} kW
                    </span>
                  </div>
                  <div className="w-full h-3 bg-surface-elevated rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-700", barColor)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-xs text-foreground-muted">
                    <span>{pct.toFixed(1)}% utilisé</span>
                    <div className="flex gap-2">
                      <span className="text-amber-400">{site.warning_threshold_pct}%</span>
                      <span className="text-red-400">{site.critical_threshold_pct}%</span>
                    </div>
                  </div>
                </div>

                {site.alert_level && (
                  <div className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium",
                    site.alert_level === "critical"
                      ? "bg-red-500/10 text-red-400"
                      : "bg-amber-500/10 text-amber-400"
                  )}>
                    <AlertTriangle className="w-3 h-3" />
                    {site.alert_level === "critical" ? "Critique" : "Attention"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add site modal */}
      <SlideOver
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Ajouter un site"
      >
        <div className="space-y-5 p-1">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Station <span className="text-red-500">*</span>
            </label>
            <select
              value={form.station_id}
              onChange={(e) => setForm({ ...form, station_id: e.target.value })}
              className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="">Sélectionner une station</option>
              {(stationsList ?? []).map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.city ? `(${s.city})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Nom du site
            </label>
            <input
              type="text"
              value={form.site_name}
              onChange={(e) => setForm({ ...form, site_name: e.target.value })}
              placeholder="Optionnel"
              className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Capacité max (kW) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.max_capacity_kw}
              onChange={(e) => setForm({ ...form, max_capacity_kw: e.target.value })}
              className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Seuil warning (%)
              </label>
              <input
                type="number"
                value={form.warning_threshold_pct}
                onChange={(e) => setForm({ ...form, warning_threshold_pct: e.target.value })}
                className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Seuil critique (%)
              </label>
              <input
                type="number"
                value={form.critical_threshold_pct}
                onChange={(e) => setForm({ ...form, critical_threshold_pct: e.target.value })}
                className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!form.station_id || createMutation.isPending}
            className={cn(
              "w-full py-2.5 rounded-xl text-sm font-semibold transition-colors",
              form.station_id && !createMutation.isPending
                ? "bg-primary text-white hover:bg-primary/90"
                : "bg-primary/40 text-white/60 cursor-not-allowed"
            )}
          >
            {createMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            ) : (
              "Ajouter"
            )}
          </button>
        </div>
      </SlideOver>
    </div>
  );
}
