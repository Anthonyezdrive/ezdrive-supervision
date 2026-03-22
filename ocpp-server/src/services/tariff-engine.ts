// ============================================
// Tariff Engine — OCPI 2.2.1 Tariff Calculator
// Node.js version for OCPP server
// Calculates session costs from OCPI tariff elements
// VAT rates: 8.5% DOM-TOM (971-976), 20% métropole
// ============================================

import { query, queryOne } from '../db';
import { logger } from '../index';

// --- VAT Resolution by Territory ---

// DOM-TOM department codes → reduced VAT rate
const DOM_TOM_CODES = new Set(['971', '972', '973', '974', '975', '976']);
const VAT_RATE_DOM_TOM = 8.5;
const VAT_RATE_METRO = 20.0;

/**
 * Resolve VAT rate for a station based on its territory.
 * DOM-TOM (971-976): 8.5%, Métropole: 20%
 */
export async function resolveVatRate(chargepointId: string): Promise<number> {
  try {
    const result = await queryOne<{ territory_code: string | null; postal_code: string | null }>(
      `SELECT t.code as territory_code, s.postal_code
       FROM ocpp_chargepoints cp
       LEFT JOIN stations s ON s.id = cp.station_id
       LEFT JOIN territories t ON t.id = s.territory_id
       WHERE cp.id = $1`,
      [chargepointId]
    );

    if (result?.territory_code) {
      return DOM_TOM_CODES.has(result.territory_code) ? VAT_RATE_DOM_TOM : VAT_RATE_METRO;
    }

    // Fallback: detect from postal code (97xxx = DOM-TOM)
    if (result?.postal_code && result.postal_code.startsWith('97')) {
      return VAT_RATE_DOM_TOM;
    }

    // Default: DOM-TOM (EZDrive's primary market is Réunion/Antilles)
    return VAT_RATE_DOM_TOM;
  } catch (err) {
    logger.warn({ err, chargepointId }, 'Failed to resolve VAT rate, defaulting to DOM-TOM 8.5%');
    return VAT_RATE_DOM_TOM;
  }
}

// --- Interfaces ---

export interface TariffElement {
  price_components: PriceComponent[];
  restrictions?: TariffRestrictions;
}

export interface PriceComponent {
  type: 'ENERGY' | 'FLAT' | 'PARKING_TIME' | 'TIME';
  price: number;
  vat?: number;
  step_size: number;
}

export interface TariffRestrictions {
  min_kwh?: number;
  max_kwh?: number;
  min_power?: number;
  max_power?: number;
  min_duration?: number;
  max_duration?: number;
}

export interface TariffCalculationInput {
  energyKwh: number;
  durationHours: number;
  parkingHours?: number;
  powerKw?: number;
}

export interface TariffCalculationResult {
  totalCost: number;
  totalCostInclVat: number;
  totalVat: number;
  energyCost: number;
  timeCost: number;
  parkingCost: number;
  flatCost: number;
  vatRate: number;
}

// --- Default Tariff Elements ---

const DEFAULT_AC_TARIFF: TariffElement[] = [
  {
    price_components: [
      { type: 'ENERGY', price: 0.35, step_size: 1, vat: 8.5 },
    ],
  },
];

const DEFAULT_DC_TARIFF: TariffElement[] = [
  {
    price_components: [
      { type: 'ENERGY', price: 0.55, step_size: 1, vat: 8.5 },
    ],
  },
];

// --- Core Calculation ---

/**
 * Apply OCPI step_size rounding.
 * ENERGY: step_size in Wh, TIME/PARKING_TIME: step_size in seconds
 */
function applyStepSize(
  volume: number,
  stepSize: number,
  componentType: string
): number {
  if (stepSize <= 0 || componentType === 'FLAT') return volume;

  let volumeInStepUnits: number;
  switch (componentType) {
    case 'ENERGY':
      volumeInStepUnits = volume * 1000; // kWh → Wh
      break;
    case 'TIME':
    case 'PARKING_TIME':
      volumeInStepUnits = volume * 3600; // hours → seconds
      break;
    default:
      volumeInStepUnits = volume;
  }

  const steps = Math.ceil(volumeInStepUnits / stepSize);
  const billedUnits = steps * stepSize;

  switch (componentType) {
    case 'ENERGY':
      return billedUnits / 1000; // Wh → kWh
    case 'TIME':
    case 'PARKING_TIME':
      return billedUnits / 3600; // seconds → hours
    default:
      return billedUnits;
  }
}

/**
 * Calculate cost from OCPI tariff elements.
 */
export function calculateTariff(
  input: TariffCalculationInput,
  tariffElements: TariffElement[],
  vatRate: number = 8.5,
  scheduleMultiplier?: number
): TariffCalculationResult {
  const multiplier = scheduleMultiplier ?? 1.0;
  let energyCost = 0;
  let timeCost = 0;
  let parkingCost = 0;
  let flatCost = 0;

  for (const element of tariffElements) {
    // Check restrictions
    const r = element.restrictions;
    if (r) {
      if (r.min_kwh !== undefined && input.energyKwh < r.min_kwh) continue;
      if (r.max_kwh !== undefined && input.energyKwh > r.max_kwh) continue;
      if (input.powerKw !== undefined) {
        if (r.min_power !== undefined && input.powerKw < r.min_power) continue;
        if (r.max_power !== undefined && input.powerKw > r.max_power) continue;
      }
    }

    for (const component of element.price_components) {
      switch (component.type) {
        case 'ENERGY': {
          const billed = applyStepSize(input.energyKwh, component.step_size, 'ENERGY');
          energyCost += billed * component.price * multiplier;
          break;
        }
        case 'TIME': {
          const billed = applyStepSize(input.durationHours, component.step_size, 'TIME');
          timeCost += billed * component.price * multiplier;
          break;
        }
        case 'PARKING_TIME': {
          const billed = applyStepSize(input.parkingHours ?? 0, component.step_size, 'PARKING_TIME');
          parkingCost += billed * component.price;
          break;
        }
        case 'FLAT':
          flatCost += component.price;
          break;
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
  };
}

/**
 * Resolve tariff elements for a station from the database.
 * Resolution chain:
 *   1. station_tariffs (per-station assignment, highest priority)
 *   2. STANDARD-AC / STANDARD-DC fallback tariffs
 *   3. Hardcoded defaults (last resort)
 */
export async function resolveTariff(
  chargepointId: string,
  connectorType?: string
): Promise<TariffElement[]> {
  const isdc = isConnectorDC(connectorType);
  const connType = isdc ? 'DC' : 'AC';

  try {
    // ── Step 1: Resolve via station_tariffs (per-station assignment) ──
    // Look up station_id from the chargepoint, then find assigned tariff
    const stationTariff = await queryOne<{ elements: TariffElement[]; tariff_id: string }>(
      `SELECT t.elements, t.tariff_id
       FROM station_tariffs st
       JOIN ocpi_tariffs t ON st.tariff_id = t.id
       JOIN ocpp_chargepoints cp ON cp.station_id = st.station_id
       WHERE cp.id = $1
         AND (st.connector_type = $2 OR st.connector_type IS NULL)
         AND (st.valid_from IS NULL OR st.valid_from <= now())
         AND (st.valid_to IS NULL OR st.valid_to > now())
       ORDER BY
         CASE WHEN st.connector_type = $2 THEN 0 ELSE 1 END,
         st.priority DESC
       LIMIT 1`,
      [chargepointId, connType]
    );

    if (stationTariff?.elements && Array.isArray(stationTariff.elements) && stationTariff.elements.length > 0) {
      logger.info({ chargepointId, tariffId: stationTariff.tariff_id, connType }, 'Resolved station-specific tariff');
      return stationTariff.elements;
    }

    // ── Step 2: Fallback to STANDARD-AC/DC ──
    const tariffId = isdc ? 'STANDARD-DC' : 'STANDARD-AC';

    const tariff = await queryOne<{ elements: TariffElement[] }>(
      `SELECT elements FROM ocpi_tariffs WHERE tariff_id = $1 ORDER BY last_updated DESC LIMIT 1`,
      [tariffId]
    );

    if (tariff?.elements && Array.isArray(tariff.elements) && tariff.elements.length > 0) {
      logger.info({ chargepointId, tariffId, connType }, 'Using STANDARD fallback tariff');
      return tariff.elements;
    }
  } catch (err) {
    logger.warn({ err, chargepointId }, 'Failed to resolve tariff from DB, using defaults');
  }

  // ── Step 3: Hardcoded defaults (last resort) ──
  logger.warn({ chargepointId, connType }, 'Using hardcoded default tariff');
  return isdc ? DEFAULT_DC_TARIFF : DEFAULT_AC_TARIFF;
}

// --- Schedule & Group Tariff Resolution ---

/**
 * Resolve a time-of-day price multiplier from tariff_schedules.
 * Queries for the current day_of_week and time range.
 * Returns price_multiplier or 1.0 if no matching schedule is found.
 */
export async function resolveScheduleMultiplier(
  tariffId: string,
  sessionTime?: Date
): Promise<number> {
  try {
    const now = sessionTime ?? new Date();
    // JS getDay(): 0=Sunday … 6=Saturday — store as ISO weekday (1=Mon … 7=Sun)
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
    const timeStr = now.toTimeString().slice(0, 8); // HH:MM:SS

    const schedule = await queryOne<{ price_multiplier: number }>(
      `SELECT price_multiplier
       FROM tariff_schedules
       WHERE tariff_id = $1
         AND day_of_week = $2
         AND start_time <= $3::time
         AND end_time   >  $3::time
       ORDER BY priority DESC NULLS LAST
       LIMIT 1`,
      [tariffId, dayOfWeek, timeStr]
    );

    if (schedule?.price_multiplier != null) {
      logger.info(
        { tariffId, dayOfWeek, timeStr, multiplier: schedule.price_multiplier },
        'Resolved schedule multiplier'
      );
      return schedule.price_multiplier;
    }

    return 1.0;
  } catch (err) {
    logger.warn({ err, tariffId }, 'Failed to resolve schedule multiplier, defaulting to 1.0');
    return 1.0;
  }
}

/**
 * Resolve group-specific tariff elements for an access group + station.
 * Queries access_group_tariffs → ocpi_tariffs to find a tariff override
 * that applies to the given group and station.
 * Returns null if no group tariff is configured.
 */
export async function resolveGroupTariff(
  groupId: string,
  stationId: string
): Promise<TariffElement[] | null> {
  try {
    const row = await queryOne<{ elements: TariffElement[]; tariff_id: string }>(
      `SELECT t.elements, t.tariff_id
       FROM access_group_tariffs agt
       JOIN ocpi_tariffs t ON t.id = agt.tariff_id
       WHERE agt.group_id = $1
         AND (agt.station_id = $2 OR agt.station_id IS NULL)
         AND (agt.valid_from IS NULL OR agt.valid_from <= now())
         AND (agt.valid_to IS NULL OR agt.valid_to > now())
       ORDER BY
         CASE WHEN agt.station_id = $2 THEN 0 ELSE 1 END,
         agt.priority DESC NULLS LAST
       LIMIT 1`,
      [groupId, stationId]
    );

    if (row?.elements && Array.isArray(row.elements) && row.elements.length > 0) {
      logger.info({ groupId, stationId, tariffId: row.tariff_id }, 'Resolved group tariff');
      return row.elements;
    }

    return null;
  } catch (err) {
    logger.warn({ err, groupId, stationId }, 'Failed to resolve group tariff');
    return null;
  }
}

function isConnectorDC(connectorType?: string): boolean {
  if (!connectorType) return false;
  return /dc|chademo|ccs/i.test(connectorType);
}
