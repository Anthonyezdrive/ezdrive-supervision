import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface UpdateCPOPayload {
  station_id: string;
  gfx_id: string;
  cpo_id: string | null;
}

export function useUpdateStationCPO() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateCPOPayload) => {
      const { data, error } = await supabase.functions.invoke(
        "update-station-cpo",
        { body: payload }
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Rafraîchit la liste des stations et les vues associées après mise à jour CPO
      queryClient.invalidateQueries({ queryKey: ["stations"] });
      queryClient.invalidateQueries({ queryKey: ["station-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["monitoring-stations"] });
    },
  });
}
