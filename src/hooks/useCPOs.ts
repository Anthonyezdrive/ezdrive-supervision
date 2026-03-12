import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CPOOperator } from "@/types/station";

export function useCPOs() {
  return useQuery<CPOOperator[]>({
    queryKey: ["cpo-operators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cpo_operators")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CPOOperator[];
    },
    staleTime: Infinity,
  });
}
