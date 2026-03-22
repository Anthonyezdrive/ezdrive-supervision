// ============================================
// Tariff Engine — OCPI 2.2.1 Tariff Calculator
// Calculates session costs from OCPI tariff elements
// Supports ENERGY, FLAT, TIME, PARKING_TIME components
// DOM-TOM VAT rate: 8.5% (configurable)
// ============================================

import type { OcpiTariffElement, OcpiPriceComponent, OcpiTariffRestrictions } from "./ocpi-types.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Interfaces ---

export interface TariffCalculationInput {
  energyKwh: number;        // Total energy consumed (kWh)
  durationHours: number;    // Total session duration (hours)
  parkingHours?: number;    // Parking time post-charge (hours)
  powerKw?: number;         // Charging power (for restriction matching)
  startTime?: Date;         // Session start (for time-of-day restrictions)
}

export interface PriceBreakdown {
  componentType: "ENERGY" | "FLAT" | "PARKING_TIME" | "TIME";
  unitPrice: number;
  volume: number;
  stepSize: number;
  billedVolume: number;  // After step_size rounding
  cost: number;          // Before VAT
}

export interface TariffCalculationResult {
  totalCost: number;           // Cost excl. VAT (€)
  totalCostInclVat: number;    // Cost incl. VAT (€)
  totalVat: number;            // VAT amount (€)
  energyCost: number;
  timeCost: number;
  parkingCost: number;
  flatCost: number;
  vatRate: number;             // VAT percentage (e.g. 8.5)
  breakdown: PriceBreakdown[];
}

// --- Default Tariff Elements ---

const DEFAULT_AC_TARIFF: OcpiTariffElement[] = [
  {
    price_components: [
      { type: "ENERGY", price: 0.35, step_size: 1, vat: 8.5 },
    ],
  },
];

const DEFAULT_DC_TARIFF: OcpiTariffElement[] = [
  {
    price_components: [
      { type: "ENERGY", price: 0.55, step_size: 1, vat: 8.5 },
    ],
  },
];

// --- Core Calculation ---

/**
 * Apply OCPI step_size rounding.
 * OCPI spec: volume is rounded UP to the nearest multiple of step_size.
 * step_size unit depends on component type:
 *   ENERGY: 1 step = 1 Wh (not kWh!)
 *   TIME: 1 step = 1 second
 *   PARKING_TIME: 1 step = 1 second
 *   FLAT: no rounding needed
 */
function applyStepSize(
  volume: number,
  stepSize: number,
  componentType: string
): number {
  if (stepSize <= 0 || componentType === "FLAT") return volume;

  // Convert to step_size units
  let volumeInStepUnits: number;
  switch (componentType) {
    case "ENERGY":
      // volume is in kWh, step_size is in Wh
      volumeInStepUnits = volume * 1000;
      break;
    case "TIME":
    case "PARKING_TIME":
      // volume is in hours, step_size is in seconds
      volumeInStepUnits = volume * 3600;
      break;
    default:
      volumeInStepUnits = volume;
  }

  // Round up to nearest step_size
  const steps = Math.ceil(volumeInStepUnits / stepSize);
  const billedUnits = steps * stepSize;

  // Convert back to billing units (kWh for energy, hours for time)
  switch (componentType) {
    case "ENERGY":
      return billedUnits / 1000; // Wh → kWh
    case "TIME":
    case "PARKING_TIME":
      return billedUnits / 3600; // seconds → hours
    default:
      return billedUnits;
  }
}

/**
 * Check if tariff element restrictions match the session.
 */
function matchesRestrictions(
  restrictions: OcpiTariffRestrictions | undefined,
  input: TariffCalculationInput
): boolean {
  if (!restrictions) return true;

  // Energy restrictions
  if (restrictions.min_kwh !== undefined && input.energyKwh < restrictions.min_kwh) return false;
  if (restrictions.max_kwh !== undefined && input.energyKwh > restrictions.max_kwh) return false;

  // Power restrictions
  if (input.powerKw !== undefined) {
    if (restrictions.min_power !== undefined && input.powerKw < restrictions.min_power) return false;
    if (restrictions.max_power !== undefined && input.powerKw > restrictions.max_power) return false;
  }

  // Duration restrictions (in seconds → compare with hours)
  if (restrictions.min_duration !== undefined && input.durationHours * 3600 < restrictions.min_duration) return false;
  if (restrictions.max_duration !== undefined && input.durationHours * 3600 > restrictions.max_duration) return false;

  // Day of week restrictions
  if (restrictions.day_of_week && input.startTime) {
    const dow = input.startTime.getDay(); // 0=Sunday
    // OCPI uses 1=Monday to 7=Sunday
    const ocpiDow = dow === 0 ? 7 : dow;
    if (!restrictions.day_of_week.includes(ocpiDow)) return false;
  }

  // Time of day restrictions
  if (restrictions.start_time && restrictions.end_time && input.startTime) {
    const timeStr = `${String(input.startTime.getHours()).padStart(2, '0')}:${String(input.startTime.getMinutes()).padStart(2, '0')}`;
    if (timeStr < restrictions.start_time || timeStr >= restrictions.end_time) return false;
  }

  return true;
}

/**
 * Calculate the cost of a charging session based on OCPI tariff elements.
 *
 * @param input - Session data (energy, duration, parking time)
 * @param tariffElements - OCPI tariff elements with price components
 * @param vatRate - VAT rate percentage (default: 8.5% for DOM-TOM)
 * @param scheduleMultiplier - Optional multiplier for ENERGY and TIME prices (from tariff_schedules)
 * @returns Detailed cost breakdown
 */
export function calculateTariff(
  input: TariffCalculationInput,
  tariffElements: OcpiTariffElement[],
  vatRate: number = 8.5,
  scheduleMultiplier?: number
): TariffCalculationResult {
  const multiplier = scheduleMultiplier ?? 1.0;
  const breakdown: PriceBreakdown[] = [];
  let energyCost = 0;
  let timeCost = 0;
  let parkingCost = 0;
  let flatCost = 0;

  for (const element of tariffElements) {
    // Check restrictions
    if (!matchesRestrictions(element.restrictions, input)) continue;

    for (const component of element.price_components) {
      let volume = 0;
      let billedVolume = 0;
      let cost = 0;

      switch (component.type) {
        case "ENERGY":
          volume = input.energyKwh;
          billedVolume = applyStepSize(volume, component.step_size, "ENERGY");
          cost = billedVolume * component.price * multiplier;
          energyCost += cost;
          break;

        case "TIME":
          volume = input.durationHours;
          billedVolume = applyStepSize(volume, component.step_size, "TIME");
          cost = billedVolume * component.price * multiplier;
          timeCost += cost;
          break;

        case "PARKING_TIME":
          volume = input.parkingHours ?? 0;
          billedVolume = applyStepSize(volume, component.step_size, "PARKING_TIME");
          cost = billedVolume * component.price;
          parkingCost += cost;
          break;

        case "FLAT":
          volume = 1;
          billedVolume = 1;
          cost = component.price;
          flatCost += cost;
          break;
      }

      if (cost > 0) {
        breakdown.push({
          componentType: component.type,
          unitPrice: component.price,
          volume,
          stepSize: component.step_size,
          billedVolume,
          cost: Math.round(cost * 10000) / 10000,
        });
      }
    }
  }

  const totalCost = Math.round((energyCost + timeCost + parkingCost + flatCost) * 10000) / 10000;
  const totalVat = Math.round(totalCost * (vatRate / 100) * 10000) / 10000;
  const totalCostInclVat = Math.round((totalCost + totalVat) * 10000) / 10000;

  return {
    totalCost,
    totalCostInclVat,
    totalVat,
    energyCost: Math.round(energyCost * 10000) / 10000,
    timeCost: Math.round(timeCost * 10000) / 10000,
    parkingCost: Math.round(parkingCost * 10000) / 10000,
    flatCost: Math.round(flatCost * 10000) / 10000,
    vatRate,
    breakdown,
  };
}

/**
 * Get default tariff elements based on connector type.
 * Used as fallback when no tariff is found in the database.
 */
export function getDefaultTariffElements(
  connectorType?: string
): OcpiTariffElement[] {
  if (!connectorType) return DEFAULT_AC_TARIFF;
  const upper = connectorType.toUpperCase();
  if (
    upper.includes("DC") ||
    upper.includes("CHADEMO") ||
    upper.includes("CCS")
  ) {
    return DEFAULT_DC_TARIFF;
  }
  return DEFAULT_AC_TARIFF;
}

// --- Schedule Multiplier Resolution ---

/**
 * Resolve a time-of-day price multiplier from the tariff_schedules table.
 * Calls the `resolve_tariff_multiplier` SQL function.
 *
 * @param supabase - Supabase client
 * @param tariffId - UUID of the tariff
 * @param sessionTime - Point in time to evaluate (defaults to now)
 * @returns The price multiplier (e.g. 1.5 for peak), or 1.0 if no schedule matches
 */
export async function resolveScheduleMultiplier(
  supabase: SupabaseClient,
  tariffId: string,
  sessionTime?: Date
): Promise<number> {
  try {
    const timeParam = sessionTime?.toISOString() ?? new Date().toISOString();
    const { data, error } = await supabase.rpc("resolve_tariff_multiplier", {
      p_tariff_id: tariffId,
      p_time: timeParam,
    });

    if (error) {
      console.error("[tariff-engine] resolve_tariff_multiplier error:", error.message);
      return 1.0;
    }

    // The SQL function returns a single numeric value
    return typeof data === "number" ? data : 1.0;
  } catch (err) {
    console.error("[tariff-engine] resolveScheduleMultiplier exception:", err);
    return 1.0;
  }
}

// --- Access Group Tariff Resolution ---

/**
 * Resolve group-specific tariff elements from `access_group_tariffs`.
 * Calls the `resolve_access_group_tariff` SQL function which returns
 * the OCPI tariff elements array for the group/station combination.
 *
 * @param supabase - Supabase client
 * @param groupId - UUID of the access group
 * @param stationId - UUID of the station
 * @returns OCPI tariff elements if a group tariff exists, otherwise null
 */
export async function resolveGroupTariffElements(
  supabase: SupabaseClient,
  groupId: string,
  stationId: string
): Promise<OcpiTariffElement[] | null> {
  try {
    const { data, error } = await supabase.rpc("resolve_access_group_tariff", {
      p_group_id: groupId,
      p_station_id: stationId,
    });

    if (error) {
      console.error("[tariff-engine] resolve_access_group_tariff error:", error.message);
      return null;
    }

    // The SQL function returns tariff elements JSON or null
    if (!data) return null;

    // data may be a tariff row with elements, or directly the elements array
    if (Array.isArray(data)) {
      return data as OcpiTariffElement[];
    }
    if (data.elements && Array.isArray(data.elements)) {
      return data.elements as OcpiTariffElement[];
    }

    return null;
  } catch (err) {
    console.error("[tariff-engine] resolveGroupTariffElements exception:", err);
    return null;
  }
}

// --- Idle Fee Calculation ---

export interface IdleFeeResult {
  fee_cents: number;
  grace_period_minutes: number;
  capped: boolean;
}

/**
 * Calculate idle (parking) fees from the `idle_fee_config` table.
 * Applies grace period, per-minute fee, and optional max cap.
 *
 * @param supabase - Supabase client
 * @param stationId - UUID of the charging station
 * @param parkingMinutes - Total parking minutes after charge completed
 * @returns Idle fee details (fee in cents, grace period, whether cap was applied)
 */
export async function calculateIdleFee(
  supabase: SupabaseClient,
  stationId: string,
  parkingMinutes: number
): Promise<IdleFeeResult> {
  const defaultResult: IdleFeeResult = {
    fee_cents: 0,
    grace_period_minutes: 0,
    capped: false,
  };

  try {
    const { data, error } = await supabase
      .from("idle_fee_config")
      .select("grace_period_minutes, fee_per_minute_cents, max_fee_cents")
      .eq("station_id", stationId)
      .maybeSingle();

    if (error) {
      console.error("[tariff-engine] idle_fee_config query error:", error.message);
      return defaultResult;
    }

    if (!data) {
      // No idle fee configured for this station
      return defaultResult;
    }

    const gracePeriod: number = data.grace_period_minutes ?? 0;
    const feePerMinute: number = data.fee_per_minute_cents ?? 0;
    const maxFee: number | null = data.max_fee_cents ?? null;

    // Billable minutes = parking time minus grace period, minimum 0
    const billableMinutes = Math.max(0, parkingMinutes - gracePeriod);

    if (billableMinutes === 0 || feePerMinute === 0) {
      return {
        fee_cents: 0,
        grace_period_minutes: gracePeriod,
        capped: false,
      };
    }

    let feeCents = Math.round(billableMinutes * feePerMinute);
    let capped = false;

    if (maxFee !== null && feeCents > maxFee) {
      feeCents = maxFee;
      capped = true;
    }

    return {
      fee_cents: feeCents,
      grace_period_minutes: gracePeriod,
      capped,
    };
  } catch (err) {
    console.error("[tariff-engine] calculateIdleFee exception:", err);
    return defaultResult;
  }
}
