import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface StationAlert {
  id: string;
  station_id: string;
  alert_type: string;
  hours_in_fault: number | null;
  sent_at: string;
  alert_rule_id: string | null;
  notification_channel: string | null;
  details: {
    station_name?: string;
    cpo?: string;
    territory?: string;
    ocpp_status?: string;
    hours?: number;
  } | null;
}

export function useStationAlerts(stationId?: string, limit = 50) {
  return useQuery({
    queryKey: ["station-alerts", stationId, limit],
    queryFn: async () => {
      let query = supabase
        .from("alert_history")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(limit);

      if (stationId) {
        query = query.eq("station_id", stationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as StationAlert[];
    },
    enabled: !!stationId,
    staleTime: 60_000,
  });
}

export function useRecentAlerts(limit = 20) {
  return useQuery({
    queryKey: ["recent-alerts", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alert_history")
        .select("*")
        .in("alert_type", ["disconnection", "recovery", "extended_outage", "fault_threshold"])
        .order("sent_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as StationAlert[];
    },
    staleTime: 30_000,
  });
}
