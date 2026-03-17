import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { POLLING_INTERVAL, STALE_TIME } from "@/lib/constants";
import type { Station } from "@/types/station";

export function useStations(cpoId?: string | null) {
  return useQuery<Station[]>({
    queryKey: ["stations", cpoId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("stations_enriched")
        .select("*");
      if (cpoId) {
        query = query.eq("cpo_id", cpoId);
      }
      const { data, error } = await query.order("name");
      if (error) throw error;
      return (data ?? []) as Station[];
    },
    refetchInterval: POLLING_INTERVAL,
    staleTime: STALE_TIME,
  });
}
