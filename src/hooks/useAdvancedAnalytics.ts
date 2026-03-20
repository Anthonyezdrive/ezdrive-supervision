import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface DailyStats {
  stat_date: string;
  station_id: string;
  station_name: string;
  cpo_id: string;
  territory_id: string;
  session_count: number;
  energy_kwh: number;
  total_hours: number;
  revenue: number;
  avg_energy_kwh: number;
  avg_duration_min: number;
  unique_drivers: number;
}

export interface MonthlyCpoSummary {
  month: string;
  cpo_id: string;
  total_sessions: number;
  total_energy_kwh: number;
  total_revenue: number;
  total_hours: number;
  avg_energy_per_session: number;
  avg_duration_min: number;
  unique_drivers: number;
  active_stations: number;
}

export interface PeakUsage {
  stat_date: string;
  cpo_id: string;
  period_type: "peak" | "off_peak" | "normal";
  session_count: number;
  energy_kwh: number;
  revenue: number;
}

export interface StationUtilization {
  station_id: string;
  station_name: string;
  cpo_id: string;
  territory_id: string;
  month: string;
  charging_hours: number;
  days_active: number;
  utilization_pct: number;
}

export function useDailyStats(cpoId?: string, days: number = 30) {
  return useQuery({
    queryKey: ["daily-stats", cpoId, days],
    queryFn: async () => {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      let query = supabase
        .from("mv_daily_station_stats")
        .select("*")
        .gte("stat_date", fromDate.toISOString().split("T")[0])
        .order("stat_date", { ascending: false });

      if (cpoId) query = query.eq("cpo_id", cpoId);

      const { data, error } = await query;
      if (error) throw error;
      return data as DailyStats[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useMonthlyCpoSummary(cpoId?: string) {
  return useQuery({
    queryKey: ["monthly-cpo-summary", cpoId],
    queryFn: async () => {
      let query = supabase
        .from("mv_monthly_cpo_summary")
        .select("*")
        .order("month", { ascending: false })
        .limit(24);

      if (cpoId) query = query.eq("cpo_id", cpoId);

      const { data, error } = await query;
      if (error) throw error;
      return data as MonthlyCpoSummary[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function usePeakUsage(cpoId?: string, days: number = 30) {
  return useQuery({
    queryKey: ["peak-usage", cpoId, days],
    queryFn: async () => {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      let query = supabase
        .from("mv_peak_usage")
        .select("*")
        .gte("stat_date", fromDate.toISOString().split("T")[0]);

      if (cpoId) query = query.eq("cpo_id", cpoId);

      const { data, error } = await query;
      if (error) throw error;
      return data as PeakUsage[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useStationUtilization(cpoId?: string, month?: string) {
  return useQuery({
    queryKey: ["station-utilization", cpoId, month],
    queryFn: async () => {
      let query = supabase
        .from("mv_station_utilization")
        .select("*")
        .order("utilization_pct", { ascending: false });

      if (cpoId) query = query.eq("cpo_id", cpoId);
      if (month) query = query.eq("month", month);

      const { data, error } = await query;
      if (error) throw error;
      return data as StationUtilization[];
    },
    staleTime: 10 * 60 * 1000,
  });
}
