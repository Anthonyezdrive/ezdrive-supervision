// ============================================================
// EZDrive — Driver Tokens & Sessions hooks
// Query tokens linked to a driver, link/unlink, and sessions
// ============================================================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────

export interface OcpiToken {
  id: string;
  token_uid: string;
  type: string | null;
  contract_id: string | null;
  valid: boolean | null;
  whitelist: string | null;
  last_updated: string | null;
  issuer: string | null;
}

export interface DriverSession {
  id: string;
  start_timestamp: string | null;
  stop_timestamp: string | null;
  id_tag: string | null;
  meter_start: number | null;
  meter_stop: number | null;
  connector_id: number | null;
  charge_point_id: string | null;
  location_name: string | null;
  total_energy_kwh: number | null;
  total_cost: number | null;
}

// ── useDriverTokens ───────────────────────────────────────────

export function useDriverTokens(driverExternalId: string | undefined) {
  return useQuery<OcpiToken[]>({
    queryKey: ["driver-tokens", driverExternalId],
    enabled: !!driverExternalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ocpi_tokens")
        .select("id, token_uid, type, contract_id, valid, whitelist, last_updated, issuer")
        .eq("contract_id", driverExternalId!)
        .order("last_updated", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OcpiToken[];
    },
  });
}

// ── useSearchAvailableTokens ──────────────────────────────────

export function useSearchAvailableTokens(search: string, enabled: boolean) {
  return useQuery<OcpiToken[]>({
    queryKey: ["available-tokens-search", search],
    enabled: enabled && search.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ocpi_tokens")
        .select("id, token_uid, type, contract_id, valid, whitelist, last_updated, issuer")
        .is("contract_id", null)
        .ilike("token_uid", `%${search}%`)
        .limit(20);
      if (error) throw error;
      return (data ?? []) as OcpiToken[];
    },
  });
}

// ── useLinkToken ──────────────────────────────────────────────

export function useLinkToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tokenUid,
      driverExternalId,
    }: {
      tokenUid: string;
      driverExternalId: string;
    }) => {
      const { error } = await supabase
        .from("ocpi_tokens")
        .update({ contract_id: driverExternalId })
        .eq("token_uid", tokenUid);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["driver-tokens", variables.driverExternalId] });
      queryClient.invalidateQueries({ queryKey: ["available-tokens-search"] });
    },
  });
}

// ── useUnlinkToken ────────────────────────────────────────────

export function useUnlinkToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tokenId,
      driverExternalId,
    }: {
      tokenId: string;
      driverExternalId: string;
    }) => {
      const { error } = await supabase
        .from("ocpi_tokens")
        .update({ contract_id: null })
        .eq("id", tokenId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["driver-tokens", variables.driverExternalId] });
    },
  });
}

// ── useDriverSessions ─────────────────────────────────────────

export function useDriverSessions(driverExternalId: string | undefined) {
  return useQuery<DriverSession[]>({
    queryKey: ["driver-sessions-ocpp", driverExternalId],
    enabled: !!driverExternalId,
    queryFn: async () => {
      // First get token UIDs linked to this driver
      const { data: tokens, error: tokensError } = await supabase
        .from("ocpi_tokens")
        .select("token_uid")
        .eq("contract_id", driverExternalId!);
      if (tokensError) throw tokensError;

      const tokenUids = (tokens ?? []).map((t) => t.token_uid);

      if (tokenUids.length === 0) {
        // Fallback: also try matching on driver_external_id in ocpi_cdrs
        const { data: cdrs, error: cdrsError } = await supabase
          .from("ocpi_cdrs")
          .select("id, start_date_time, cdr_location, total_energy, total_cost")
          .eq("driver_external_id", driverExternalId!)
          .order("start_date_time", { ascending: false })
          .limit(50);
        if (cdrsError) throw cdrsError;
        return ((cdrs ?? []) as Array<Record<string, unknown>>).map((c) => ({
          id: c.id as string,
          start_timestamp: c.start_date_time as string | null,
          stop_timestamp: null,
          id_tag: null,
          meter_start: null,
          meter_stop: null,
          connector_id: null,
          charge_point_id: null,
          location_name: (c.cdr_location as Record<string, unknown>)?.name as string | null ?? "—",
          total_energy_kwh: c.total_energy as number | null,
          total_cost: c.total_cost as number | null,
        })) as DriverSession[];
      }

      // Query OCPP transactions matching linked token UIDs
      // Try start_timestamp/stop_timestamp first, fallback to started_at/stopped_at
      let sessions: Array<Record<string, unknown>> = [];
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("ocpp_transactions")
        .select("id, start_timestamp, stop_timestamp, id_tag, meter_start, meter_stop, connector_id, charge_point_id")
        .in("id_tag", tokenUids)
        .order("start_timestamp", { ascending: false })
        .limit(50);

      if (!sessionsError) {
        sessions = (sessionsData ?? []) as Array<Record<string, unknown>>;
      } else {
        // Fallback: try started_at/stopped_at column names
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("ocpp_transactions")
          .select("id, started_at, stopped_at, id_tag, meter_start, meter_stop, connector_id, charge_point_id")
          .in("id_tag", tokenUids)
          .order("started_at", { ascending: false })
          .limit(50);
        if (fallbackError) throw fallbackError;
        sessions = ((fallbackData ?? []) as Array<Record<string, unknown>>).map((s) => ({
          ...s,
          start_timestamp: s.started_at,
          stop_timestamp: s.stopped_at,
        }));
      }

      return sessions.map((s) => ({
        id: s.id as string,
        start_timestamp: s.start_timestamp as string | null,
        stop_timestamp: s.stop_timestamp as string | null,
        id_tag: s.id_tag as string | null,
        meter_start: s.meter_start as number | null,
        meter_stop: s.meter_stop as number | null,
        connector_id: s.connector_id as number | null,
        charge_point_id: s.charge_point_id as string | null,
        location_name: null,
        total_energy_kwh:
          s.meter_stop != null && s.meter_start != null
            ? ((s.meter_stop as number) - (s.meter_start as number)) / 1000
            : null,
        total_cost: null,
      })) as DriverSession[];
    },
  });
}

// ── useSoftDeleteDriver ───────────────────────────────────────

export function useSoftDeleteDriver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (driverExternalId: string) => {
      const { error } = await supabase
        .from("gfx_consumers")
        .update({ status: "deleted", deleted_at: new Date().toISOString() })
        .eq("driver_external_id", driverExternalId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
    },
  });
}
