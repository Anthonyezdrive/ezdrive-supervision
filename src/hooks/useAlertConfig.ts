import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface AlertConfig {
  id: string;
  threshold_hours: number;
  email_recipients: string[];
  is_active: boolean;
  updated_at: string;
}

export interface AlertHistoryEntry {
  id: string;
  station_id: string;
  alert_type: string;
  hours_in_fault: number | null;
  sent_at: string;
  stations: { name: string; city: string | null } | null;
}

export function useAlertConfig() {
  return useQuery<AlertConfig | null>({
    queryKey: ["alert-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alert_config")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as AlertConfig | null;
    },
  });
}

export function useAlertHistory() {
  return useQuery<AlertHistoryEntry[]>({
    queryKey: ["alert-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alert_history")
        .select("*, stations(name, city)")
        .order("sent_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as AlertHistoryEntry[];
    },
  });
}

export function useUpdateAlertConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<AlertConfig> & { id: string }) => {
      const { id, ...fields } = updates;
      const { error } = await supabase
        .from("alert_config")
        .update(fields)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alert-config"] });
    },
  });
}

export function useTriggerAlertCheck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("alert-check");
      if (error) throw error;
      return data as {
        alerts_sent: number;
        dry_run: boolean;
        skipped?: boolean;
        reason?: string;
        stations?: Array<{ name: string; hours: number }>;
        email_error?: string;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alert-history"] });
    },
  });
}
