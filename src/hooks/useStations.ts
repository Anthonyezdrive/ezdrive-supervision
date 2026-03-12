import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { POLLING_INTERVAL, STALE_TIME } from "@/lib/constants";
import type { Station } from "@/types/station";

export function useStations() {
  return useQuery<Station[]>({
    queryKey: ["stations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations_enriched")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Station[];
    },
    refetchInterval: POLLING_INTERVAL,
    staleTime: STALE_TIME,
  });
}
