import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { POLLING_INTERVAL, STALE_TIME } from "@/lib/constants";

export interface MaintenanceStation {
  id: string;
  gfx_id: string;
  name: string;
  address: string | null;
  city: string | null;
  ocpp_status: string;
  status_since: string;
  is_online: boolean;
  connectors: unknown[];
  max_power_kw: number | null;
  cpo_id: string | null;
  cpo_name: string | null;
  cpo_code: string | null;
  territory_name: string | null;
  territory_code: string | null;
  hours_in_fault: number;
  last_synced_at: string;
}

export function useMaintenanceStations(cpoId?: string | null) {
  return useQuery<MaintenanceStation[]>({
    queryKey: ["maintenance-stations", cpoId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("maintenance_stations")
        .select("*");
      if (cpoId) {
        query = query.eq("cpo_id", cpoId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as MaintenanceStation[];
    },
    refetchInterval: POLLING_INTERVAL,
    staleTime: STALE_TIME,
  });
}
