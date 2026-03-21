import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface TariffSchedule {
  id: string;
  tariff_id: string;
  day_of_week: number[];
  start_time: string;
  end_time: string;
  peak_type: "peak" | "off_peak" | "super_off_peak" | "normal";
  price_multiplier: number;
  label: string | null;
  is_active: boolean;
  created_at: string;
}

export interface IdleFeeConfig {
  id: string;
  station_id: string | null;
  cpo_id: string | null;
  enabled: boolean;
  fee_per_minute: number;
  grace_period_minutes: number;
  max_fee: number | null;
  applies_after: "charge_complete" | "session_end";
  notification_at_minutes: number | null;
}

export function useTariffSchedules(tariffId: string | null) {
  return useQuery({
    queryKey: ["tariff-schedules", tariffId],
    queryFn: async () => {
      if (!tariffId) return [];
      const { data, error } = await supabase
        .from("tariff_schedules")
        .select("*")
        .eq("tariff_id", tariffId)
        .order("start_time");
      if (error) throw error;
      return data as TariffSchedule[];
    },
    enabled: !!tariffId,
  });
}

export function useIdleFeeConfigs(cpoId?: string) {
  return useQuery({
    queryKey: ["idle-fee-configs", cpoId],
    queryFn: async () => {
      let query = supabase.from("idle_fee_config").select("*").order("created_at");
      if (cpoId) query = query.eq("cpo_id", cpoId);
      const { data, error } = await query;
      if (error) throw error;
      return data as IdleFeeConfig[];
    },
  });
}

export function useCreateTariffSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (schedule: Partial<TariffSchedule>) => {
      const { data, error } = await supabase.from("tariff_schedules").insert(schedule).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tariff-schedules"] }),
  });
}

export function useUpdateTariffSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TariffSchedule> & { id: string }) => {
      const { data, error } = await supabase.from("tariff_schedules").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tariff-schedules"] }),
  });
}

export function useDeleteTariffSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tariff_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tariff-schedules"] }),
  });
}

export function useUpsertIdleFeeConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: Partial<IdleFeeConfig>) => {
      const { data, error } = await supabase.from("idle_fee_config").upsert(config).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["idle-fee-configs"] }),
  });
}
