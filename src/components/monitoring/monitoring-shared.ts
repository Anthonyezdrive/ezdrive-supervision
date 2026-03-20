// ── Shared types, constants & queries for Monitoring tabs ──
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Station } from "@/types/station";

// ── Types ──────────────────────────────────────────────────

export interface OcppTransaction {
  id: string;
  connector_id: number;
  meter_start: number | null;
  meter_stop: number | null;
  started_at: string;
  status: string;
  stations: { name: string; city: string | null } | null;
}

export interface OcppChargepoint {
  id: string;
  identity: string;
  vendor: string | null;
  model: string | null;
  firmware_version: string | null;
  last_heartbeat_at: string | null;
  is_connected: boolean;
  created_at: string;
}

export interface AlertRule {
  id: string;
  alert_type: string;
  title: string;
  threshold_hours: number;
  notification_interval_hours: number;
  email_recipients: string[];
  is_active: boolean;
  charge_station_type: string;
  deploy_state: string;
  firmware_version: string | null;
  chargepoint_vendor: string | null;
  chargepoint_model: string | null;
  chargepoint_location_id: string | null;
  global_config: boolean;
  created_at: string;
  updated_at: string;
}

// ── Alert type definitions ──

export const ALERT_TYPES = [
  { value: "fault_threshold", label: "Station en panne", description: "Alerte quand une borne est en statut Faulted depuis X heures" },
  { value: "offline_threshold", label: "Station hors ligne", description: "Alerte quand une borne est hors ligne depuis X heures" },
  { value: "unavailable_threshold", label: "Station indisponible", description: "Alerte quand une borne est indisponible depuis X heures" },
  { value: "heartbeat_missing", label: "Heartbeat manquant", description: "Alerte quand aucun heartbeat reçu depuis X heures" },
  { value: "session_stuck", label: "Session bloquée", description: "Alerte quand une session de charge dépasse X heures" },
  { value: "connector_error", label: "Erreur connecteur", description: "Alerte quand un connecteur remonte une erreur" },
  { value: "energy_threshold", label: "Seuil énergie", description: "Alerte quand la consommation dépasse un seuil kWh" },
  { value: "capacity_warning", label: "Capacité warning", description: "Alerte quand la charge électrique d'un site dépasse le seuil d'avertissement" },
  { value: "capacity_critical", label: "Capacité critique", description: "Alerte quand la charge électrique d'un site dépasse le seuil critique" },
];

// ── Queries ────────────────────────────────────────────────

const REFETCH_INTERVAL = 15_000;

export function useMonitoringStations(cpoId?: string | null) {
  return useQuery<Station[]>({
    queryKey: ["monitoring-stations", cpoId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("stations_enriched")
        .select(
          "id, name, city, ocpp_status, is_online, max_power_kw, last_synced_at, status_since, hours_in_status, cpo_name"
        );
      if (cpoId) {
        query = query.eq("cpo_id", cpoId);
      }
      const { data, error } = await query.order("is_online", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Station[];
    },
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useActiveTransactions() {
  return useQuery<OcppTransaction[]>({
    queryKey: ["active-transactions"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("ocpp_transactions")
          .select("*, stations(name, city)")
          .eq("status", "Active")
          .order("started_at", { ascending: false });
        if (error) {
          console.warn("[Monitoring] ocpp_transactions error:", error.code, error.message);
        }
        if (data && data.length > 0) return data as OcppTransaction[];

        console.info("[Monitoring] ocpp_transactions empty, falling back to ocpi_cdrs");
        const { data: cdrs, error: cdrError } = await supabase
          .from("ocpi_cdrs")
          .select("id, start_date_time, end_date_time, total_energy, total_cost, cdr_location, cdr_token, status")
          .order("start_date_time", { ascending: false })
          .limit(15);
        if (cdrError) {
          console.warn("[Monitoring] CDR fallback error:", cdrError.message);
          return [];
        }

        return (cdrs ?? []).map((cdr: Record<string, unknown>): OcppTransaction => {
          const location = cdr.cdr_location as Record<string, unknown> | null;
          const stationName = location?.name as string ?? "Borne CDR";
          const stationCity = (location?.city as string) ?? null;
          const totalEnergy = cdr.total_energy as number | null;
          return {
            id: cdr.id as string,
            connector_id: 1,
            meter_start: 0,
            meter_stop: totalEnergy != null ? Math.round(totalEnergy * 1000) : null,
            started_at: cdr.start_date_time as string,
            status: "Active",
            stations: { name: stationName, city: stationCity },
          };
        });
      } catch {
        return [];
      }
    },
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useChargepoints() {
  return useQuery<OcppChargepoint[]>({
    queryKey: ["ocpp-chargepoints"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("ocpp_chargepoints")
          .select("*")
          .order("last_heartbeat_at", { ascending: false });
        if (error) {
          console.warn("[Monitoring] ocpp_chargepoints error:", error.code, error.message);
          return [];
        }
        return (data ?? []) as OcppChargepoint[];
      } catch {
        return [];
      }
    },
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useAlertRules() {
  return useQuery<AlertRule[]>({
    queryKey: ["alert-rules"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("alert_config")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) {
          console.warn("[Monitoring] alert_config error:", error.code, error.message);
          return [];
        }
        return (data ?? []).map((row: any) => ({
          id: row.id,
          alert_type: row.alert_type ?? "fault_threshold",
          title: row.title ?? "Alerte seuil de panne",
          threshold_hours: row.threshold_hours ?? 4,
          notification_interval_hours: row.notification_interval_hours ?? 1,
          email_recipients: row.email_recipients ?? [],
          is_active: row.is_active ?? false,
          charge_station_type: row.charge_station_type ?? "any",
          deploy_state: row.deploy_state ?? "any",
          firmware_version: row.firmware_version ?? null,
          chargepoint_vendor: row.chargepoint_vendor ?? null,
          chargepoint_model: row.chargepoint_model ?? null,
          chargepoint_location_id: row.chargepoint_location_id ?? null,
          global_config: row.global_config ?? false,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }));
      } catch {
        return [];
      }
    },
  });
}

export function useAlertHistory() {
  return useQuery({
    queryKey: ["alert-history"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("alert_history")
          .select("*, stations(name, city)")
          .order("sent_at", { ascending: false })
          .limit(50);
        if (error) return [];
        return data ?? [];
      } catch {
        return [];
      }
    },
  });
}

// ── Helpers ────────────────────────────────────────────────

export function heartbeatFresh(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return diffMs < 5 * 60 * 1000;
}

export function computeEnergy(tx: OcppTransaction): string {
  if (tx.meter_stop != null && tx.meter_start != null) {
    return ((tx.meter_stop - tx.meter_start) / 1000).toFixed(1);
  }
  return "--";
}
