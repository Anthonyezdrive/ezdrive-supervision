import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { B2BCdr, B2BClient } from "@/types/b2b";

// ── eMSP party ID → display name mapping ─────────────────

const EMSP_NAMES: Record<string, string> = {
  GFX: "Freshmile",
  CHM: "ChargeMap",
  SHL: "Shell",
  VRT: "Virta",
  TOT: "Freshmile (Total)",
  EON: "E.ON Drive",
  IOP: "Intercharge",
  EDF: "EDF Pulse",
  ENE: "Enbw",
  MOB: "Mobivia",
};

export function resolveEmspName(partyId: string | null, ownPartyId?: string | null): string {
  if (!partyId) return "Inconnu";
  if (ownPartyId && partyId === ownPartyId) return "Direct";
  return EMSP_NAMES[partyId.toUpperCase()] ?? partyId;
}

// ── Payment method derivation ──────────────────────────────

/**
 * Derive payment method from CDR.
 * - If the emsp_party_id matches the partner's own party (or is null/empty), it's a direct session.
 *   Direct sessions with a cdr_token of type RFID = Badge RFID; else we treat as CB/App.
 * - Roaming sessions (emsp is a 3rd party) = Badge RFID by convention.
 * - Sessions with total_retail_cost = 0 = Badge RFID (gratuit).
 * We use emsp_country_code/emsp_party_id combination to classify.
 */
export function derivePaymentMethod(
  cdr: B2BCdr,
  ownEmspPartyId?: string | null
): "CB" | "RFID" | "App" | "QR" {
  const tokenType = cdr.cdr_token?.type?.toUpperCase();

  // RFID token type
  if (tokenType === "RFID") return "RFID";

  // App token type
  if (tokenType === "APP_USER" || tokenType === "APP") return "App";

  // Other token type
  if (tokenType === "OTHER") return "QR";

  // Roaming sessions = RFID badge
  const isRoaming =
    cdr.emsp_party_id &&
    ownEmspPartyId &&
    cdr.emsp_party_id !== ownEmspPartyId;
  if (isRoaming) return "RFID";

  // Free sessions = RFID badge
  if (cdr.total_retail_cost === 0 || cdr.total_retail_cost == null) return "RFID";

  // Default: CB
  return "CB";
}

// ── Filter types ────────────────────────────────────────────

export interface XDriveFilters {
  dateFrom: string; // ISO date string
  dateTo: string;   // ISO date string
  paymentTypes: Array<"CB" | "RFID" | "App" | "QR">;
  operatorType: "all" | "direct" | "emsp";
  locationName?: string;
}

// ── Hook: fetch B2B client by ID ──────────────────────────

export function useXDriveB2BClient(b2bClientId: string | null | undefined) {
  return useQuery({
    queryKey: ["xdrive-b2b-client", b2bClientId],
    queryFn: async () => {
      if (!b2bClientId) return null;
      const { data, error } = await supabase
        .from("b2b_clients")
        .select("*")
        .eq("id", b2bClientId)
        .maybeSingle();
      if (error) throw error;
      return data as B2BClient | null;
    },
    enabled: !!b2bClientId,
    staleTime: 300_000,
  });
}

// ── Hook: fetch CDRs for X-DRIVE partner ─────────────────

export function useXDriveCDRs(
  customerExternalIds: string[],
  filters: XDriveFilters
) {
  return useQuery({
    queryKey: ["xdrive-cdrs", customerExternalIds, filters],
    queryFn: async () => {
      if (customerExternalIds.length === 0) return [];

      const selectCols =
        "id, start_date_time, end_date_time, total_energy, total_time, total_cost, total_retail_cost, total_retail_cost_incl_vat, customer_external_id, driver_external_id, cdr_token, cdr_location, emsp_country_code, emsp_party_id, station_id, charger_type, source";

      const PAGE = 1000;
      let allRows: B2BCdr[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("ocpi_cdrs")
          .select(selectCols)
          .in("customer_external_id", customerExternalIds)
          .gte("start_date_time", filters.dateFrom)
          .lte("start_date_time", filters.dateTo)
          .order("start_date_time", { ascending: true })
          .range(from, from + PAGE - 1);

        if (filters.locationName) {
          query = query.eq("cdr_location->>name", filters.locationName);
        }

        const { data, error } = await query;
        if (error) throw error;
        const rows = (data ?? []) as B2BCdr[];
        allRows = allRows.concat(rows);
        from += PAGE;
        hasMore = rows.length === PAGE;
      }

      return allRows;
    },
    staleTime: 60_000,
    enabled: customerExternalIds.length > 0,
  });
}

// ── Computed KPIs ─────────────────────────────────────────

export interface XDriveKPIs {
  sessionCount: number;
  totalEnergy: number;       // kWh
  totalDuration: number;     // minutes
  caHT: number;              // total_cost sum
  caTTC: number;             // total_retail_cost_incl_vat sum
  utilizationRate: number;   // saturation 0–1
  caByPayment: Record<string, number>;   // CB/RFID/App/QR → amount HT
  caByEmsp: Record<string, number>;      // eMSP name → amount HT
  sessionsByPayment: Record<string, number>;
  sessionsByEmsp: Record<string, number>;
}

export function computeXDriveKPIs(
  cdrs: B2BCdr[],
  ownEmspPartyId?: string | null
): XDriveKPIs {
  const sessionCount = cdrs.length;
  const totalEnergy = cdrs.reduce((s, c) => s + (c.total_energy ?? 0), 0);
  const totalDurationHours = cdrs.reduce((s, c) => s + (c.total_time ?? 0), 0);
  const totalDuration = totalDurationHours * 60; // convert hours → minutes

  const caHT = cdrs.reduce((s, c) => s + (c.total_cost ?? 0), 0);
  const caTTC = cdrs.reduce((s, c) => s + (c.total_retail_cost_incl_vat ?? c.total_cost ?? 0), 0);

  // Utilization rate (saturation)
  const avgRealTime = sessionCount > 0 ? totalDurationHours / sessionCount : 0;
  const avgEnergy = sessionCount > 0 ? totalEnergy / sessionCount : 0;
  const avgEquivTime = avgEnergy / 7.4; // 7.4 kW reference
  const utilizationRate =
    avgRealTime > 0
      ? Math.max(0, Math.min(1, (avgRealTime - avgEquivTime) / avgRealTime))
      : 0;

  // CA by payment method
  const caByPayment: Record<string, number> = { CB: 0, RFID: 0, App: 0, QR: 0 };
  const sessionsByPayment: Record<string, number> = { CB: 0, RFID: 0, App: 0, QR: 0 };
  const caByEmsp: Record<string, number> = {};
  const sessionsByEmsp: Record<string, number> = {};

  for (const cdr of cdrs) {
    const method = derivePaymentMethod(cdr, ownEmspPartyId);
    const costHT = cdr.total_cost ?? 0;

    caByPayment[method] = (caByPayment[method] ?? 0) + costHT;
    sessionsByPayment[method] = (sessionsByPayment[method] ?? 0) + 1;

    const emspName = resolveEmspName(cdr.emsp_party_id, ownEmspPartyId);
    caByEmsp[emspName] = (caByEmsp[emspName] ?? 0) + costHT;
    sessionsByEmsp[emspName] = (sessionsByEmsp[emspName] ?? 0) + 1;
  }

  return {
    sessionCount,
    totalEnergy,
    totalDuration,
    caHT,
    caTTC,
    utilizationRate,
    caByPayment,
    caByEmsp,
    sessionsByPayment,
    sessionsByEmsp,
  };
}

// ── Monthly trend grouping ─────────────────────────────────

export interface XDriveMonthlyRow {
  month: number;       // 1–12
  monthLabel: string;  // "jan", "fév", ...
  sessionCount: number;
  energy: number;
  caHT: number;
}

const MONTH_SHORT = ["jan", "fév", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];

export function groupCDRsByMonth(cdrs: B2BCdr[]): XDriveMonthlyRow[] {
  const map = new Map<number, B2BCdr[]>();
  for (const cdr of cdrs) {
    const m = new Date(cdr.start_date_time).getMonth(); // 0-based
    if (!map.has(m)) map.set(m, []);
    map.get(m)!.push(cdr);
  }

  const rows: XDriveMonthlyRow[] = [];
  for (let m = 0; m < 12; m++) {
    const month = map.get(m) ?? [];
    rows.push({
      month: m + 1,
      monthLabel: MONTH_SHORT[m],
      sessionCount: month.length,
      energy: month.reduce((s, c) => s + (c.total_energy ?? 0), 0),
      caHT: month.reduce((s, c) => s + (c.total_cost ?? 0), 0),
    });
  }
  return rows;
}
