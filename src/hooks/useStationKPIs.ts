import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { POLLING_INTERVAL, STALE_TIME } from "@/lib/constants";
import type { StationKPIs } from "@/types/station";

export function useStationKPIs(cpoId?: string | null) {
  return useQuery<StationKPIs>({
    queryKey: ["station-kpis", cpoId ?? "all"],
    queryFn: async () => {
      if (cpoId) {
        // station_kpis is a single-row aggregate view — recompute from stations_enriched when filtering by CPO
        const { data, error } = await supabase
          .from("stations_enriched")
          .select("ocpp_status, is_online")
          .eq("cpo_id", cpoId);
        if (error) throw error;
        const rows = data ?? [];
        const kpis: StationKPIs = {
          total_stations: rows.length,
          available: 0,
          charging: 0,
          faulted: 0,
          offline: 0,
          other: 0,
        };
        for (const s of rows) {
          if (!s.is_online) {
            kpis.offline++;
          } else if (s.ocpp_status === "Available") {
            kpis.available++;
          } else if (
            s.ocpp_status === "Charging" ||
            s.ocpp_status === "Preparing" ||
            s.ocpp_status === "Finishing" ||
            s.ocpp_status === "SuspendedEV" ||
            s.ocpp_status === "SuspendedEVSE"
          ) {
            kpis.charging++;
          } else if (s.ocpp_status === "Faulted") {
            kpis.faulted++;
          } else {
            kpis.other++;
          }
        }
        return kpis;
      }
      const { data, error } = await supabase
        .from("station_kpis")
        .select("*")
        .single();
      if (error) throw error;
      return data as StationKPIs;
    },
    refetchInterval: POLLING_INTERVAL,
    staleTime: STALE_TIME,
  });
}
