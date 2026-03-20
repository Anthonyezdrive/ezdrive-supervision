// ============================================================
// EZDrive — OCPP Command Hook
// React Query mutation for sending OCPP commands to stations
// ============================================================

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface OcppCommand {
  stationId: string;
  command: "Reset" | "RemoteStartTransaction" | "RemoteStopTransaction" | "UnlockConnector";
  params?: Record<string, unknown>;
}

export function useOcppCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ stationId, command, params }: OcppCommand) => {
      const { data, error } = await supabase.functions.invoke("api", {
        body: { action: "ocpp_command", station_id: stationId, command, params: params ?? {} },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monitoring-stations"] });
    },
  });
}
