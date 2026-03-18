/**
 * B2B Portal – Power BI formula replications
 * All formulas from Adil's "formules de calcul power bi.txt"
 */

import type { B2BCdr, B2BMonthlyRow, B2BChargePointRow, B2BDriverRow } from "@/types/b2b";
import type { StationLookupMaps } from "@/hooks/useB2BStationLookup";
import { resolveStation } from "@/hooks/useB2BStationLookup";

const MONTH_LABELS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

// ── Core Formulas ──────────────────────────────────────────

/** Redevance = SUM(total_retail_cost WHERE != 0) × rate */
export function computeRedevance(cdrs: B2BCdr[], rate: number): number {
  return cdrs
    .filter((c) => c.total_retail_cost != null && c.total_retail_cost !== 0)
    .reduce((sum, c) => sum + (c.total_retail_cost ?? 0), 0) * rate;
}

/** CO2 évité (kg) = (Volume/1.98 × 2.34) − (Volume × 0.84) */
export function computeCO2Evite(totalEnergyKwh: number): number {
  const co2Thermique = (totalEnergyKwh / 1.98) * 2.34;
  const co2Electrique = totalEnergyKwh * 0.84;
  return co2Thermique - co2Electrique;
}

/** Temps équivalent (heures) = volume par session / 7.4 kW */
export function computeTempsEquivalent(energyPerSessionKwh: number): number {
  return energyPerSessionKwh / 7.4;
}

/** Saturation = (temps réel moyen − temps équivalent moyen) / temps réel moyen
 *  Clampé entre 0% et 100% — les valeurs négatives arrivent sur les DC
 *  (énergie délivrée plus vite que la référence 7.4 kW AC) */
export function computeSaturation(avgRealTimeHours: number, avgEquivTimeHours: number): number {
  if (avgRealTimeHours === 0) return 0;
  const raw = (avgRealTimeHours - avgEquivTimeHours) / avgRealTimeHours;
  return Math.max(0, Math.min(1, raw));
}

/** Volume avec tarif = sessions avec cost != 0 et pas employés EZDrive */
export function computeVolAvecTarif(cdrs: B2BCdr[]): number {
  return cdrs
    .filter(
      (c) =>
        c.total_retail_cost != null &&
        c.total_retail_cost !== 0 &&
        c.customer_external_id !== "Employés EZdrive"
    )
    .reduce((sum, c) => sum + c.total_energy, 0);
}

/** Volume tarif gratuit = sessions gratuites, vol > 0.5, hors EZDrive, EMSP ∈ FR-GFX/FR-TOT/GF-APP */
export function computeVolGratuit(cdrs: B2BCdr[]): number {
  const allowedEmsp = new Set(["FR-GFX", "FR-TOT", "GF-APP"]);
  return cdrs
    .filter((c) => {
      const emspKey = `${c.emsp_country_code ?? ""}-${c.emsp_party_id ?? ""}`;
      return (
        (c.total_retail_cost === 0 || c.total_retail_cost == null) &&
        c.total_energy > 0.5 &&
        c.customer_external_id !== "Employés EZdrive" &&
        allowedEmsp.has(emspKey)
      );
    })
    .reduce((sum, c) => sum + c.total_energy, 0);
}

/** Ventouse status: > 40% = red/bad, < 40% = blue/ok */
export function getVentouseStatus(saturation: number): {
  label: string;
  color: string;
  isWarning: boolean;
} {
  if (saturation > 0.4) {
    return { label: "% du Temps en ventouse", color: "#FF6B6B", isWarning: true };
  }
  return { label: "Temps optimal", color: "#3498DB", isWarning: false };
}

// ── Aggregate KPIs ─────────────────────────────────────────

export function computeKPIs(cdrs: B2BCdr[], redevanceRate: number) {
  const totalEnergy = cdrs.reduce((s, c) => s + c.total_energy, 0);
  const totalTime = cdrs.reduce((s, c) => s + c.total_time, 0);
  const count = cdrs.length;

  const avgEnergyPerSession = count > 0 ? totalEnergy / count : 0;
  const avgRealTime = count > 0 ? totalTime / count : 0;
  const avgEquivTime = computeTempsEquivalent(avgEnergyPerSession);
  const saturation = computeSaturation(avgRealTime, avgEquivTime);
  const redevance = computeRedevance(cdrs, redevanceRate);

  return {
    totalEnergy,
    totalTime,
    sessionCount: count,
    avgEnergyPerSession,
    avgRealTime,
    avgEquivTime,
    saturation,
    redevance,
    co2Evite: computeCO2Evite(totalEnergy),
    ventouse: getVentouseStatus(saturation),
  };
}

// ── Formatting ─────────────────────────────────────────────

/** Format hours as "1234h56min" */
export function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h${String(m).padStart(2, "0")}min`;
}

/** Format hours as "HH:MM" */
export function formatDurationShort(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Format number with French locale */
export function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format as EUR */
export function formatEUR(n: number): string {
  return `${formatNumber(n)} €`;
}

// ── Grouping Functions ─────────────────────────────────────

/** Group CDRs by month → B2BMonthlyRow[] */
export function groupByMonth(cdrs: B2BCdr[], redevanceRate: number): B2BMonthlyRow[] {
  const months = new Map<number, B2BCdr[]>();

  for (const cdr of cdrs) {
    const m = new Date(cdr.start_date_time).getMonth(); // 0-based
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push(cdr);
  }

  const rows: B2BMonthlyRow[] = [];
  for (let m = 0; m < 12; m++) {
    const monthCdrs = months.get(m) ?? [];

    const volume = monthCdrs.reduce((s, c) => s + c.total_energy, 0);
    const duration = monthCdrs.reduce((s, c) => s + c.total_time, 0);

    rows.push({
      month: m + 1,
      monthLabel: `${String(m + 1).padStart(2, "0")} - ${MONTH_LABELS[m]}`,
      volume,
      duration,
      volumeAvecTarif: monthCdrs.length > 0 ? computeVolAvecTarif(monthCdrs) : 0,
      volumeGratuit: monthCdrs.length > 0 ? computeVolGratuit(monthCdrs) : 0,
      redevance: monthCdrs.length > 0 ? computeRedevance(monthCdrs, redevanceRate) : 0,
    });
  }

  return rows;
}

/** Group CDRs by charge point → B2BChargePointRow[] (enriched with station hardware data) */
export function groupByChargePoint(
  cdrs: B2BCdr[],
  stationLookup?: StationLookupMaps | null
): B2BChargePointRow[] {
  const map = new Map<string, { cdrs: B2BCdr[]; locationName: string }>();

  for (const cdr of cdrs) {
    // Use first EVSE ID, or location name as fallback
    const evses = cdr.cdr_location?.evses;
    const cpId = evses?.[0]?.evse_id ?? evses?.[0]?.uid ?? cdr.cdr_location?.name ?? "Inconnu";
    const locName = cdr.cdr_location?.name ?? "";
    if (!map.has(cpId)) map.set(cpId, { cdrs: [], locationName: locName });
    map.get(cpId)!.cdrs.push(cdr);
  }

  return Array.from(map.entries()).map(([chargePointId, { cdrs: cpCdrs, locationName }]) => {
    const volume = cpCdrs.reduce((s, c) => s + c.total_energy, 0);
    const duration = cpCdrs.reduce((s, c) => s + c.total_time, 0);
    const count = cpCdrs.length;
    const avgEnergy = count > 0 ? volume / count : 0;
    const avgRealTime = count > 0 ? duration / count : 0;
    const avgEquivTime = computeTempsEquivalent(avgEnergy);

    // Enrich with station hardware data
    const station = resolveStation(chargePointId, locationName, stationLookup);

    // Build human-readable label
    const displayLabel = formatChargePointLabel(chargePointId, locationName);

    return {
      chargePointId: displayLabel,
      siteName: locationName || station?.name || "—",
      volume,
      duration,
      saturation: computeSaturation(avgRealTime, avgEquivTime),
      co2Evite: computeCO2Evite(volume),
      sessionCount: count,
      // Station hardware enrichment
      vendor: station?.charge_point_vendor ?? null,
      model: station?.charge_point_model ?? null,
      maxPowerKw: station?.max_power_kw ?? null,
      connectivityStatus: station?.connectivity_status ?? null,
      firmwareVersion: station?.firmware_version ?? null,
    };
  }).sort((a, b) => b.volume - a.volume);
}

/** Group CDRs by driver → B2BDriverRow[] */
export function groupByDriver(cdrs: B2BCdr[]): B2BDriverRow[] {
  // Group by driver_external_id + auth_id combo
  const map = new Map<string, { cdrs: B2BCdr[]; authId: string }>();

  for (const cdr of cdrs) {
    const driver = cdr.driver_external_id ?? "Inconnu";
    const authId = cdr.cdr_token?.uid ?? cdr.auth_id ?? "";

    if (!map.has(driver)) {
      map.set(driver, { cdrs: [], authId });
    }
    const entry = map.get(driver)!;
    entry.cdrs.push(cdr);
    // Keep the first non-empty authId
    if (!entry.authId && authId) entry.authId = authId;
  }

  return Array.from(map.entries()).map(([driverName, { cdrs: driverCdrs, authId }]) => {
    // Split driver name into first/last name
    const parts = driverName.split(/\s+/);
    const lastName = parts[0] ?? driverName;
    const firstName = parts.slice(1).join(" ") || "";

    return {
      driverName,
      firstName,
      lastName,
      tokenVisualNumber: authId,
      volumeGratuit: computeVolGratuit(driverCdrs),
    };
  }).sort((a, b) => b.volumeGratuit - a.volumeGratuit);
}

/** Extract location name from CDR */
export function getLocationName(cdr: B2BCdr): string {
  return cdr.cdr_location?.name ?? "Inconnu";
}

/** Extract charge point ID from CDR */
export function getChargePointId(cdr: B2BCdr): string {
  const evses = cdr.cdr_location?.evses;
  return evses?.[0]?.evse_id ?? evses?.[0]?.uid ?? "Inconnu";
}

/**
 * Build a human-readable label for a chargepoint.
 * e.g. "FR*DMO*E001*2" + "Siège Social - La Défense" → "Siège La Défense - Borne 2"
 * Falls back to the raw EVSE ID if no location name is available.
 */
export function formatChargePointLabel(evseId: string, locationName: string): string {
  if (!locationName || locationName === "Inconnu") return evseId;

  // Extract connector/point number from EVSE ID (last segment after *)
  const parts = evseId.split("*");
  const connectorNum = parts.length > 1 ? parts[parts.length - 1] : null;

  // Shorten location name (remove common prefixes/suffixes for compactness)
  const shortLoc = locationName
    .replace(/^Siège Social\s*[-–—]\s*/i, "Siège ")
    .replace(/\s*[-–—]\s*Ombrière$/i, "")
    .trim();

  if (connectorNum) {
    return `${shortLoc} - Borne ${connectorNum}`;
  }
  return shortLoc;
}

/**
 * Resolve a token UID to a driver name using CDR data.
 * Returns the driver_external_id if found, otherwise the raw token UID.
 */
export function buildTokenDriverMap(cdrs: B2BCdr[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const cdr of cdrs) {
    const tokenUid = cdr.cdr_token?.uid;
    const driver = cdr.driver_external_id;
    if (tokenUid && driver && driver !== "Inconnu") {
      map.set(tokenUid, driver);
    }
  }
  return map;
}
