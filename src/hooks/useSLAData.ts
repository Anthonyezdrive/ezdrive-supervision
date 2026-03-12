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

export function useSLAByTerritory() {
  return useQuery<SLATerritory[]>({
    queryKey: ["sla_by_territory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sla_by_territory")
        .select("*");
      if (error) throw error;
      return (data ?? []) as SLATerritory[];
    },
    refetchInterval: 60_000,
  });
}

export function useSLAByCPO() {
  return useQuery<SLACPO[]>({
    queryKey: ["sla_by_cpo"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sla_by_cpo").select("*");
      if (error) throw error;
      return (data ?? []) as SLACPO[];
    },
    refetchInterval: 60_000,
  });
}
