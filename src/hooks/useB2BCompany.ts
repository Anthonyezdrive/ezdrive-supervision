import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────

export interface B2BClientUser {
  user_id: string;
  email: string;
  full_name: string | null;
}

// ── Queries ──────────────────────────────────────────────

/** List all users with access to a B2B client (secured via RPC) */
export function useB2BClientUsers(clientId: string | undefined) {
  return useQuery({
    queryKey: ["b2b-client-users", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("b2b_list_my_client_users", {
        p_client_id: clientId!,
      });
      if (error) throw error;
      return (data ?? []) as B2BClientUser[];
    },
    staleTime: 60_000,
  });
}

// ── Mutations ────────────────────────────────────────────

/** Update own B2B client name (secured via RPC) */
export function useUpdateB2BClientSelf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      clientId: string;
      name?: string;
      logo_url?: string;
    }) => {
      const { error } = await supabase.rpc("b2b_update_my_client", {
        p_client_id: params.clientId,
        p_name: params.name ?? null,
        p_logo_url: params.logo_url ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-b2b-clients"] });
      qc.invalidateQueries({ queryKey: ["b2b-clients"] });
      qc.invalidateQueries({ queryKey: ["b2b-clients-admin"] });
    },
  });
}

/** Upload a logo to Supabase Storage and update the client */
export function useUploadB2BLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { clientId: string; file: File }) => {
      const ext = params.file.name.split(".").pop() ?? "png";
      const path = `${params.clientId}/logo-${Date.now()}.${ext}`;

      // Upload file
      const { error: uploadErr } = await supabase.storage
        .from("b2b-logos")
        .upload(path, params.file, { upsert: true });
      if (uploadErr) throw uploadErr;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("b2b-logos")
        .getPublicUrl(path);

      const publicUrl = urlData.publicUrl;

      // Update client logo_url via RPC
      const { error: updateErr } = await supabase.rpc("b2b_update_my_client", {
        p_client_id: params.clientId,
        p_name: null,
        p_logo_url: publicUrl,
      });
      if (updateErr) throw updateErr;

      return publicUrl;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-b2b-clients"] });
      qc.invalidateQueries({ queryKey: ["b2b-clients"] });
      qc.invalidateQueries({ queryKey: ["b2b-clients-admin"] });
    },
  });
}
