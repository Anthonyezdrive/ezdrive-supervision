import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { B2BStationLookup } from "@/types/b2b";

/**
 * Fetch station hardware data and build a lookup map keyed by various identifiers.
 * Used to enrich B2B chargepoint rows with vendor, model, power, connectivity.
 *
 * Lookup keys tried (in order):
 *  1. gfx_id (GreenFlux station ID — often matches EVSE evse_id in CDR)
 *  2. station name (fallback match)
 */
export function useB2BStationLookup() {
  return useQuery({
    queryKey: ["b2b-station-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations_enriched")
        .select(
          "gfx_id, name, charge_point_vendor, charge_point_model, max_power_kw, connectivity_status, firmware_version"
        );
      if (error) throw error;

      // Build multi-key lookup maps
      const byGfxId = new Map<string, B2BStationLookup>();
      const byName = new Map<string, B2BStationLookup>();

      for (const s of data ?? []) {
        const entry: B2BStationLookup = {
          evse_uid: s.gfx_id ?? "",
          name: s.name ?? "",
          charge_point_vendor: s.charge_point_vendor,
          charge_point_model: s.charge_point_model,
          max_power_kw: s.max_power_kw,
          connectivity_status: s.connectivity_status,
          firmware_version: s.firmware_version,
        };

        if (s.gfx_id) byGfxId.set(s.gfx_id, entry);
        if (s.name) byName.set(s.name, entry);
      }

      return { byGfxId, byName };
    },
    staleTime: 300_000, // 5 min — station hardware rarely changes
  });
}

export type StationLookupMaps = {
  byGfxId: Map<string, B2BStationLookup>;
  byName: Map<string, B2BStationLookup>;
};

/**
 * Resolve a charge point ID (from CDR EVSE) to station hardware data.
 * Tries gfx_id match first, then partial match, then name.
 */
export function resolveStation(
  chargePointId: string,
  locationName: string | undefined,
  lookup?: StationLookupMaps | null
): B2BStationLookup | null {
  if (!lookup) return null;

  // 1. Direct gfx_id match
  if (lookup.byGfxId.has(chargePointId)) {
    return lookup.byGfxId.get(chargePointId)!;
  }

  // 2. Partial match — CDR evse_id may contain the gfx_id as substring
  for (const [gfxId, station] of lookup.byGfxId) {
    if (gfxId && chargePointId.includes(gfxId)) return station;
    if (gfxId && gfxId.includes(chargePointId)) return station;
  }

  // 3. Match by location name
  if (locationName && lookup.byName.has(locationName)) {
    return lookup.byName.get(locationName)!;
  }

  return null;
}
