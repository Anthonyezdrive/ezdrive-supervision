import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Territory } from "@/types/station";

export function useTerritories() {
  return useQuery<Territory[]>({
    queryKey: ["territories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("territories")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Territory[];
    },
    staleTime: Infinity,
  });
}
