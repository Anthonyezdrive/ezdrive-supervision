import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { POLLING_INTERVAL, STALE_TIME } from "@/lib/constants";
import type { Station } from "@/types/station";

export function useStations(cpoId?: string | null, source?: string) {
  return useQuery<Station[]>({
    queryKey: ["stations", cpoId ?? "all", source ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("stations_enriched")
        .select("*");
      if (cpoId) {
        query = query.eq("cpo_id", cpoId);
      }
      if (source) {
        query = query.eq("source", source);
      }
      const { data, error } = await query.order("name");
      if (error) throw error;
      return (data ?? []) as Station[];
    },
    refetchInterval: POLLING_INTERVAL,
    staleTime: STALE_TIME,
  });
}
