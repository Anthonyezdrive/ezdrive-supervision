// ============================================================
// OCPI 2.2.1 Location Seeder
// Transforms existing stations (from GFX/ROAD sync) into
// OCPI-formatted locations, EVSEs, and connectors
//
// This bridges the existing supervision data with OCPI 2.2.1
// Creates entries in ocpi_locations, ocpi_evses, ocpi_connectors
// that can then be exposed to Gireve IOP
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  EZDRIVE_COUNTRY_CODE,
  EZDRIVE_PARTY_ID,
  EZDRIVE_OPERATOR_NAME,
  EZDRIVE_OPERATOR_WEBSITE,
  OCPP_TO_OCPI_STATUS,
} from "../_shared/ocpi-types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function getDB() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// eMI3 Operator ID for EZDrive
const EZDRIVE_OPERATOR_ID = "FREZD";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    console.log("[OCPI Seed] Starting location seeding...");

    const db = getDB();

    // Fetch all stations from supervision DB
    const { data: stations, error: stationsError } = await db
      .from("stations")
      .select(`
        id, name, address, city, postal_code,
        latitude, longitude, ocpp_status,
        connectors, max_power_kw, source,
        gfx_id, road_id, is_online,
        cpo_operators:cpo_id(name, code),
        territories:territory_id(name, code)
      `)
      .order("name");

    if (stationsError) {
      console.error("[OCPI Seed] Failed to fetch stations:", stationsError);
      return new Response(JSON.stringify({ error: stationsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!stations || stations.length === 0) {
      return new Response(JSON.stringify({ message: "No stations found", seeded: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[OCPI Seed] Found ${stations.length} stations to process`);

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const station of stations) {
      try {
        // Generate OCPI location ID from station
        const locationId = generateLocationId(station);

        // Generate eMI3 EVSE ID
        // Format: FR*EZD*E{numeric}*{connector_num}
        const evseUid = generateEvseUid(station);
        const evseId = `${EZDRIVE_OPERATOR_ID}*E${evseUid}`;

        // Map OCPP status to OCPI status
        const ocpiStatus = OCPP_TO_OCPI_STATUS[station.ocpp_status] ?? "UNKNOWN";
        if (!station.is_online) {
          // Override: offline stations are INOPERATIVE
        }

        // Determine timezone from territory
        const timezone = getTimezoneFromTerritory(
          (station.territories as Record<string, string>)?.code
        );

        // Upsert OCPI Location
        const { data: locationRow, error: locError } = await db
          .from("ocpi_locations")
          .upsert({
            ocpi_id: locationId,
            country_code: EZDRIVE_COUNTRY_CODE,
            party_id: EZDRIVE_PARTY_ID,
            name: station.name || "Station EZDrive",
            address: station.address || "Adresse non renseignée",
            city: station.city || "Ville inconnue",
            postal_code: station.postal_code,
            country: "FRA",
            latitude: station.latitude ?? 0,
            longitude: station.longitude ?? 0,
            operator_name: (station.cpo_operators as Record<string, string>)?.name ?? EZDRIVE_OPERATOR_NAME,
            operator_website: EZDRIVE_OPERATOR_WEBSITE,
            publish: true,
            time_zone: timezone,
            station_id: station.id,
            last_updated: new Date().toISOString(),
          }, {
            onConflict: "country_code,party_id,ocpi_id",
          })
          .select("id")
          .single();

        if (locError || !locationRow) {
          console.error(`[OCPI Seed] Failed to upsert location for station ${station.name}:`, locError);
          errors++;
          continue;
        }

        // Upsert OCPI EVSE
        const { data: evseRow, error: evseError } = await db
          .from("ocpi_evses")
          .upsert({
            location_id: locationRow.id,
            uid: evseUid,
            evse_id: evseId,
            status: ocpiStatus,
            capabilities: buildCapabilities(station),
            last_updated: new Date().toISOString(),
          }, {
            onConflict: "location_id,uid",
          })
          .select("id")
          .single();

        if (evseError || !evseRow) {
          console.error(`[OCPI Seed] Failed to upsert EVSE for station ${station.name}:`, evseError);
          errors++;
          continue;
        }

        // Upsert Connectors
        const connectors = parseConnectors(station.connectors);
        for (let i = 0; i < connectors.length; i++) {
          const conn = connectors[i];
          const connectorId = String(i + 1);

          await db.from("ocpi_connectors").upsert({
            evse_id: evseRow.id,
            connector_id: connectorId,
            standard: conn.standard,
            format: conn.format,
            power_type: conn.powerType,
            max_voltage: conn.maxVoltage,
            max_amperage: conn.maxAmperage,
            max_electric_power: conn.maxPower,
            tariff_ids: conn.powerType === "DC" ? '["STANDARD-DC"]' : '["STANDARD-AC"]',
            last_updated: new Date().toISOString(),
          }, {
            onConflict: "evse_id,connector_id",
          });
        }

        // If no connectors found, create a default one
        if (connectors.length === 0) {
          await db.from("ocpi_connectors").upsert({
            evse_id: evseRow.id,
            connector_id: "1",
            standard: "IEC_62196_T2",
            format: "SOCKET",
            power_type: station.max_power_kw && station.max_power_kw > 22 ? "DC" : "AC_3_PHASE",
            max_voltage: 400,
            max_amperage: station.max_power_kw ? Math.round((station.max_power_kw * 1000) / 400) : 32,
            max_electric_power: station.max_power_kw ? station.max_power_kw * 1000 : 22000,
            tariff_ids: station.max_power_kw && station.max_power_kw > 22 ? '["STANDARD-DC"]' : '["STANDARD-AC"]',
            last_updated: new Date().toISOString(),
          }, {
            onConflict: "evse_id,connector_id",
          });
        }

        created++;
      } catch (err) {
        console.error(`[OCPI Seed] Error processing station ${station.name}:`, err);
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    const result = {
      total_stations: stations.length,
      locations_seeded: created,
      errors,
      duration_ms: duration,
    };

    console.log(`[OCPI Seed] Complete: ${created} locations seeded, ${errors} errors, ${duration}ms`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[OCPI Seed] Unhandled error:", err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Unknown error",
      duration_ms: Date.now() - startTime,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ============================================================
// HELPERS
// ============================================================

/**
 * Generate OCPI location ID from station data
 * Max 36 chars, unique per location
 * Uses source prefix + provider ID for uniqueness
 */
function generateLocationId(station: Record<string, unknown>): string {
  if (station.gfx_id) {
    // GreenFlux stations: use GFX ID
    return `GFX-${(station.gfx_id as string).replace(/[^a-zA-Z0-9-]/g, "").substring(0, 30)}`;
  }
  if (station.road_id) {
    // ROAD stations: use ROAD ID
    return `RD-${(station.road_id as string).replace(/[^a-zA-Z0-9-]/g, "").substring(0, 32)}`;
  }
  // Fallback: use internal UUID (first 8 chars)
  return `EZD-${(station.id as string).substring(0, 31)}`;
}

/**
 * Generate EVSE UID (internal unique identifier)
 * Used as the key in OCPI, separate from evse_id (eMI3 format)
 */
function generateEvseUid(station: Record<string, unknown>): string {
  if (station.gfx_id) {
    return `GFX${(station.gfx_id as string).replace(/[^a-zA-Z0-9]/g, "").substring(0, 30)}`;
  }
  if (station.road_id) {
    return `RD${(station.road_id as string).replace(/[^a-zA-Z0-9]/g, "").substring(0, 32)}`;
  }
  return `E${(station.id as string).replace(/-/g, "").substring(0, 32)}`;
}

/**
 * Parse connector data from stations.connectors JSONB
 * Handles different formats from GFX and ROAD
 */
interface ParsedConnector {
  standard: string;
  format: string;
  powerType: string;
  maxVoltage: number;
  maxAmperage: number;
  maxPower: number;
}

function parseConnectors(connectorsJson: unknown): ParsedConnector[] {
  if (!connectorsJson) return [];

  let connectors: Record<string, unknown>[];
  if (typeof connectorsJson === "string") {
    try {
      connectors = JSON.parse(connectorsJson);
    } catch {
      return [];
    }
  } else if (Array.isArray(connectorsJson)) {
    connectors = connectorsJson;
  } else {
    return [];
  }

  return connectors.map((c) => {
    const type = String(c.type ?? c.connector_type ?? c.standard ?? "Type2").toLowerCase();
    const power = Number(c.max_power_kw ?? c.power ?? c.max_electric_power ?? 22);
    const powerWatts = power > 1000 ? power : power * 1000;  // Normalize to watts

    return {
      standard: mapConnectorType(type),
      format: mapConnectorFormat(type),
      powerType: mapPowerType(type, powerWatts / 1000),
      maxVoltage: Number(c.max_voltage ?? (powerWatts > 22000 ? 500 : 400)),
      maxAmperage: Number(c.max_amperage ?? Math.round(powerWatts / (powerWatts > 22000 ? 500 : 400))),
      maxPower: powerWatts,
    };
  });
}

function mapConnectorType(type: string): string {
  const lc = type.toLowerCase();
  if (lc.includes("chademo")) return "CHADEMO";
  if (lc.includes("combo") || lc.includes("ccs")) return "IEC_62196_T2_COMBO";
  if (lc.includes("type1") || lc.includes("t1") || lc.includes("j1772")) return "IEC_62196_T1";
  if (lc.includes("type3") || lc.includes("t3")) return "IEC_62196_T3C";
  if (lc.includes("schuko") || lc.includes("domestic")) return "DOMESTIC_F";
  if (lc.includes("tesla")) return "TESLA_S";
  // Default to Type 2 (most common in France/EU)
  return "IEC_62196_T2";
}

function mapConnectorFormat(type: string): string {
  const lc = type.toLowerCase();
  if (lc.includes("cable") || lc.includes("tethered")) return "CABLE";
  // Most European Type 2 are sockets
  return "SOCKET";
}

function mapPowerType(type: string, powerKw: number): string {
  const lc = type.toLowerCase();
  if (lc.includes("dc") || lc.includes("chademo") || lc.includes("combo") || lc.includes("ccs")) return "DC";
  if (powerKw > 22) return "DC";
  if (powerKw > 7.4) return "AC_3_PHASE";
  return "AC_1_PHASE";
}

/**
 * Build EVSE capabilities based on station data
 */
function buildCapabilities(station: Record<string, unknown>): string[] {
  const caps: string[] = ["RFID_READER"];

  // All EZDrive stations support remote start/stop via ROAD/GFX
  caps.push("REMOTE_START_STOP_CAPABLE");

  // If station has max_power > 22kW, likely supports charging profiles
  if (station.max_power_kw && Number(station.max_power_kw) > 22) {
    caps.push("CHARGING_PROFILE_CAPABLE");
  }

  return caps;
}

/**
 * Map territory code to timezone
 * French overseas territories
 */
function getTimezoneFromTerritory(code?: string): string {
  switch (code) {
    case "971": return "America/Guadeloupe";
    case "972": return "America/Martinique";
    case "973": return "America/Cayenne";
    case "974": return "Indian/Reunion";
    default: return "America/Martinique";  // Default to Martinique (EZDrive HQ)
  }
}
