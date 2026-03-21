// ============================================================
// EZDrive — Smart Charging Realtime Hook
// Fetches live load data for a smart charging group
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface EvseRealtimeRow {
  identity: string;
  powerKw: number;
  status: "charging" | "idle" | "offline";
}

interface HistoryPoint {
  time: string;
  loadKw: number;
}

interface SmartChargingRealtimeData {
  capacityKw: number;
  currentLoadKw: number;
  evses: EvseRealtimeRow[];
  history30min: HistoryPoint[];
  hasData: boolean;
  isLoading: boolean;
}

/** Active session row from ocpp_transactions */
interface ActiveSessionRow {
  chargepoint_id: string;
  meter_value_wh: number | null;
  current_power_w: number | null;
}

export function useSmartChargingRealtime(groupId: string): SmartChargingRealtimeData {
  const { data, isLoading } = useQuery({
    queryKey: ["smart-charging-realtime", groupId],
    queryFn: async () => {
      // 1. Get group config (capacity)
      const { data: groupData, error: groupError } = await supabase
        .from("smart_charging_groups")
        .select("default_capacity_kw")
        .eq("id", groupId)
        .single();

      if (groupError) throw groupError;
      const capacityKw = groupData?.default_capacity_kw ?? 0;

      // 2. Get EVSEs in this group with chargepoint info
      const { data: groupEvses, error: evseError } = await supabase
        .from("smart_charging_group_evses")
        .select("chargepoint_id, ocpp_chargepoints(id, chargepoint_identity, is_connected)")
        .eq("group_id", groupId);

      if (evseError) throw evseError;

      const chargepointIds = (groupEvses ?? [])
        .map((e) => {
          const cp = Array.isArray(e.ocpp_chargepoints) ? e.ocpp_chargepoints[0] : e.ocpp_chargepoints;
          return cp?.id ?? e.chargepoint_id;
        })
        .filter(Boolean);

      // 3. Get active transactions for those chargepoints
      let activeSessions: ActiveSessionRow[] = [];
      if (chargepointIds.length > 0) {
        const { data: txData } = await supabase
          .from("ocpp_transactions")
          .select("chargepoint_id, meter_value_wh, current_power_w")
          .eq("status", "active")
          .in("chargepoint_id", chargepointIds);
        activeSessions = txData ?? [];
      }

      // Build a map of chargepoint_id -> power
      const powerMap = new Map<string, number>();
      for (const tx of activeSessions) {
        const cpId = tx.chargepoint_id;
        const powerKw = (tx.current_power_w ?? 0) / 1000;
        powerMap.set(cpId, (powerMap.get(cpId) ?? 0) + powerKw);
      }

      // 4. Build EVSE list
      const evses: EvseRealtimeRow[] = (groupEvses ?? []).map((row) => {
        const cpRaw = row.ocpp_chargepoints;
        const cp = Array.isArray(cpRaw) ? cpRaw[0] : cpRaw;
        const cpId = cp?.id ?? row.chargepoint_id;
        const identity = cp?.chargepoint_identity ?? "Inconnu";
        const isConnected = cp?.is_connected ?? false;
        const powerKw = powerMap.get(cpId) ?? 0;

        let status: "charging" | "idle" | "offline" = "offline";
        if (isConnected && powerKw > 0) status = "charging";
        else if (isConnected) status = "idle";

        return { identity, powerKw: Math.round(powerKw * 100) / 100, status };
      });

      // 5. Current total load
      const currentLoadKw = Math.round(evses.reduce((sum, e) => sum + e.powerKw, 0) * 100) / 100;

      // 6. History last 30 minutes — aggregate from ocpp_meter_values or simulate from transactions
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      let history30min: HistoryPoint[] = [];

      if (chargepointIds.length > 0) {
        const { data: meterData } = await supabase
          .from("ocpp_meter_values")
          .select("timestamp, value_wh, chargepoint_id")
          .in("chargepoint_id", chargepointIds)
          .gte("timestamp", thirtyMinAgo)
          .order("timestamp", { ascending: true });

        if (meterData && meterData.length > 0) {
          // Group by minute
          const byMinute = new Map<string, number>();
          for (const mv of meterData) {
            const ts = new Date(mv.timestamp);
            const minuteKey = `${ts.getHours().toString().padStart(2, "0")}:${ts.getMinutes().toString().padStart(2, "0")}`;
            // OCPP MeterValues: value_wh is actually watts despite column name
            const powerKw = (mv.value_wh ?? 0) / 1000;
            byMinute.set(minuteKey, (byMinute.get(minuteKey) ?? 0) + powerKw);
          }
          history30min = Array.from(byMinute.entries()).map(([time, loadKw]) => ({
            time,
            loadKw: Math.round(loadKw * 100) / 100,
          }));
        }
      }

      return { capacityKw, currentLoadKw, evses, history30min, hasData: history30min.length > 0 };
    },
    refetchInterval: 10_000,
    // Prevent redundant refetches on component re-renders within the 10s polling interval.
    // The data includes both static config (group capacity, EVSE list) and live metrics,
    // but splitting them would add complexity. staleTime of 5s is a pragmatic tradeoff.
    staleTime: 5_000,
    enabled: !!groupId,
  });

  return {
    capacityKw: data?.capacityKw ?? 0,
    currentLoadKw: data?.currentLoadKw ?? 0,
    evses: data?.evses ?? [],
    history30min: data?.history30min ?? [],
    hasData: data?.hasData ?? false,
    isLoading,
  };
}
