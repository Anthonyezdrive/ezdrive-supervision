import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface SettlementRun {
  id: string;
  period_start: string;
  period_end: string;
  cpo_id: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  total_sessions: number;
  total_energy_kwh: number;
  total_amount_cents: number;
  total_vat_cents: number;
  total_with_vat_cents: number;
  commission_rate: number;
  commission_cents: number;
  net_payout_cents: number;
  invoice_id: string | null;
  stripe_transfer_id: string | null;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface SettlementLineItem {
  id: string;
  settlement_run_id: string;
  cdr_id: string | null;
  session_date: string;
  station_name: string;
  energy_kwh: number;
  duration_minutes: number;
  amount_cents: number;
  vat_cents: number;
  tariff_type: string;
  driver_id: string;
  token_uid: string;
}

export function useSettlements(year?: number) {
  return useQuery({
    queryKey: ["settlements", year],
    queryFn: async () => {
      let query = supabase
        .from("settlement_runs")
        .select("*")
        .order("period_start", { ascending: false });

      if (year) {
        query = query
          .gte("period_start", `${year}-01-01`)
          .lte("period_start", `${year}-12-31`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SettlementRun[];
    },
  });
}

export function useSettlementDetail(id: string | null) {
  return useQuery({
    queryKey: ["settlement-detail", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("settlement_line_items")
        .select("*")
        .eq("settlement_run_id", id)
        .order("session_date", { ascending: false });
      if (error) throw error;
      return data as SettlementLineItem[];
    },
    enabled: !!id,
  });
}
