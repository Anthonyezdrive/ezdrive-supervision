// ============================================================
// EZDrive — useB2BRole hook
// Determines the B2B role of the current user:
// - admin: chef de flotte (read/write all)
// - manager: DAF/compta (read all)
// - employee: employé (read own sessions/tokens only)
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface B2BAccess {
  b2b_client_id: string;
  b2b_role: "admin" | "manager" | "employee";
  driver_external_id: string | null;
  token_uids: string[] | null;
}

export function useB2BRole() {
  const { user } = useAuth();

  const { data: access, isLoading } = useQuery<B2BAccess | null>({
    queryKey: ["b2b-role", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 min cache
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("b2b_client_access")
        .select("b2b_client_id, b2b_role, driver_external_id, token_uids")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error || !data) return null;
      return data as B2BAccess;
    },
  });

  return {
    b2bRole: access?.b2b_role ?? "employee",
    isEmployee: access?.b2b_role === "employee",
    isManager: access?.b2b_role === "manager",
    isB2BAdmin: access?.b2b_role === "admin",
    driverExternalId: access?.driver_external_id ?? null,
    tokenUids: access?.token_uids ?? null,
    b2bClientId: access?.b2b_client_id ?? null,
    isLoading,
  };
}
