import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { XDrivePartner } from "@/types/xdrive";

export function useXDrivePartner(b2bClientId: string | undefined) {
  return useQuery({
    queryKey: ["xdrive-partner", b2bClientId],
    queryFn: async () => {
      if (!b2bClientId) return null;
      const { data, error } = await supabase
        .from("xdrive_partners")
        .select("*")
        .eq("b2b_client_id", b2bClientId)
        .maybeSingle();
      if (error) throw error;
      return data as XDrivePartner | null;
    },
    enabled: !!b2bClientId,
  });
}

export function useXDrivePartners() {
  return useQuery({
    queryKey: ["xdrive-partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("xdrive_partners")
        .select("*, b2b_clients(name, slug)")
        .order("display_name");
      if (error) throw error;
      return data as (XDrivePartner & { b2b_clients: { name: string; slug: string } })[];
    },
  });
}

export function useXDrivePartnerByCpo(cpoId: string | null) {
  return useQuery({
    queryKey: ["xdrive-partner-by-cpo", cpoId],
    queryFn: async () => {
      if (!cpoId) return null;
      const { data, error } = await supabase
        .from("xdrive_partners")
        .select("*")
        .eq("cpo_id", cpoId)
        .maybeSingle();
      if (error) throw error;
      return data as XDrivePartner | null;
    },
    enabled: !!cpoId,
  });
}
