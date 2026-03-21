import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Fetch driver names from gfx_consumers and build a lookup map.
 * Maps driver_external_id → full_name for enriching CDR displays.
 */
export function useDriverLookup() {
  return useQuery({
    queryKey: ["driver-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gfx_consumers")
        .select("driver_external_id, full_name");
      if (error) throw error;

      const map = new Map<string, string>();
      for (const d of data ?? []) {
        if (d.driver_external_id && d.full_name) {
          map.set(d.driver_external_id, d.full_name);
        }
      }
      return map;
    },
    staleTime: 300_000,
  });
}
