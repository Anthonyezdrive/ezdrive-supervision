import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { POLLING_INTERVAL, STALE_TIME } from "@/lib/constants";
import type { StationKPIs } from "@/types/station";

export function useStationKPIs() {
  return useQuery<StationKPIs>({
    queryKey: ["station-kpis"],
    queryFn: async () => {
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
