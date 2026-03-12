import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { StationStatusEntry } from "@/types/station";

export function useStationStatusHistory(stationId: string | null) {
  return useQuery<StationStatusEntry[]>({
    queryKey: ["station-status-history", stationId],
    queryFn: async () => {
      if (!stationId) return [];
      const { data, error } = await supabase
        .from("station_status_log")
        .select("*")
        .eq("station_id", stationId)
        .order("changed_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as StationStatusEntry[];
    },
    enabled: !!stationId,
  });
}
