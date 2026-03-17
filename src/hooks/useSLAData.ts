import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface SLATerritory {
  territory_code: string;
  territory_name: string;
  total_stations: number;
  available: number;
  charging: number;
  faulted: number;
  unavailable: number;
  other: number;
  availability_pct: number;
  avg_fault_hours: number | null;
}

export interface SLACPO {
  cpo_code: string;
  cpo_name: string;
  cpo_color: string | null;
  total_stations: number;
  available: number;
  charging: number;
  faulted: number;
  unavailable: number;
  availability_pct: number;
}

export function useSLAByTerritory(cpoId?: string | null) {
  return useQuery<SLATerritory[]>({
    queryKey: ["sla_by_territory", cpoId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("sla_by_territory")
        .select("*");
      if (cpoId) {
        query = query.eq("cpo_id", cpoId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SLATerritory[];
    },
    refetchInterval: 60_000,
  });
}

export function useSLAByCPO(cpoId?: string | null) {
  return useQuery<SLACPO[]>({
    queryKey: ["sla_by_cpo", cpoId ?? "all"],
    queryFn: async () => {
      let query = supabase.from("sla_by_cpo").select("*");
      if (cpoId) {
        query = query.eq("cpo_id", cpoId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SLACPO[];
    },
    refetchInterval: 60_000,
  });
}
