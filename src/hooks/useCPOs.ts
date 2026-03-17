import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CPOOperator } from "@/types/station";

interface UseCPOsOptions {
  /** Include the root level 0 CPO. Defaults to false (only level >= 1). */
  includeRoot?: boolean;
}

export function useCPOs(options?: UseCPOsOptions) {
  const { includeRoot = false } = options ?? {};

  return useQuery<CPOOperator[]>({
    queryKey: ["cpo-operators", includeRoot ? "all" : "level1+"],
    queryFn: async () => {
      let query = supabase
        .from("cpo_operators")
        .select("*")
        .order("name");
      if (!includeRoot) {
        query = query.gte("level", 1);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CPOOperator[];
    },
    staleTime: Infinity,
  });
}
