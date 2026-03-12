// ============================================================
// EZDrive Consumer API — Stations Module
// PostGIS geo-search, text search, station details
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  apiSuccess,
  apiPaginated,
  apiNotFound,
  apiBadRequest,
  parsePagination,
} from "../../_shared/api-response.ts";
import type { RouteContext } from "../index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function getDb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export async function handleStations(ctx: RouteContext): Promise<Response> {
  const { method, segments, url } = ctx;
  const action = segments[0] ?? "";

  if (method !== "GET") {
    return apiBadRequest("Only GET is supported for stations");
  }

  // GET /api/networks
  if (action === "_networks") {
    return getNetworks();
  }

  // GET /api/stations/search?q=...
  if (action === "search") {
    return searchStations(url);
  }

  // GET /api/stations/{id}
  if (action && action !== "") {
    return getStationDetail(action);
  }

  // GET /api/stations?lat=...&lng=...&radius=...
  return listStations(url);
}

// ─── List stations with optional geo-filter ─────────────────

async function listStations(url: URL): Promise<Response> {
  const db = getDb();
  const { offset, limit } = parsePagination(url);

  const lat = parseFloat(url.searchParams.get("lat") ?? "");
  const lng = parseFloat(url.searchParams.get("lng") ?? "");
  const radiusKm = parseFloat(url.searchParams.get("radius") ?? "50");
  const connectorType = url.searchParams.get("connector_type");
  const minPower = parseFloat(url.searchParams.get("min_power") ?? "0");
  const networkCode = url.searchParams.get("network");
  const status = url.searchParams.get("status");
  const onlyAvailable = url.searchParams.get("available") === "true";

  // Use PostGIS geo-search if lat/lng provided
  if (!isNaN(lat) && !isNaN(lng)) {
    const radiusMeters = radiusKm * 1000;

    // Build PostGIS query via RPC
    const { data, error } = await db.rpc("search_stations_geo", {
      p_lat: lat,
      p_lng: lng,
      p_radius_meters: radiusMeters,
      p_connector_type: connectorType ?? null,
      p_min_power: minPower > 0 ? minPower : null,
      p_network_code: networkCode ?? null,
      p_status: onlyAvailable ? "Available" : (status ?? null),
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      console.error("[Stations] Geo search error:", error);
      // Fallback to basic query if RPC doesn't exist yet
      return fallbackListStations(db, offset, limit);
    }

    return apiSuccess({
      items: data ?? [],
      center: { lat, lng },
      radius_km: radiusKm,
    });
  }

  // No geo-filter: return paginated list
  return fallbackListStations(db, offset, limit);
}

async function fallbackListStations(
  db: ReturnType<typeof createClient>,
  offset: number,
  limit: number,
): Promise<Response> {
  // Get total count
  const { count } = await db
    .from("stations")
    .select("*", { count: "exact", head: true });

  const { data, error } = await db
    .from("stations")
    .select(`
      id, name, address, city, postal_code,
      latitude, longitude, ocpp_status, is_online,
      connectors, max_power_kw, avg_rating, review_count,
      network_id, cpo_id, last_synced_at
    `)
    .order("name")
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[Stations] List error:", error);
    return apiBadRequest("Failed to fetch stations");
  }

  return apiPaginated(data ?? [], {
    total: count ?? 0,
    offset,
    limit,
  });
}

// ─── Station detail ─────────────────────────────────────────

async function getStationDetail(stationId: string): Promise<Response> {
  const db = getDb();

  const { data, error } = await db
    .from("stations")
    .select(`
      *,
      cpo_operators ( id, name, code, color ),
      territories ( id, name, code ),
      charging_networks ( id, name, code, logo_url, color )
    `)
    .eq("id", stationId)
    .maybeSingle();

  if (error) {
    console.error("[Stations] Detail error:", error);
    return apiBadRequest("Failed to fetch station");
  }

  if (!data) {
    return apiNotFound("Station not found");
  }

  // Also fetch OCPI EVSEs if linked via ocpi_locations
  let evses: unknown[] = [];
  const { data: ocpiLoc } = await db
    .from("ocpi_locations")
    .select("id")
    .eq("station_id", stationId)
    .maybeSingle();

  if (ocpiLoc) {
    const { data: evseData } = await db
      .from("ocpi_evses")
      .select(`
        uid, evse_id, status, physical_reference,
        ocpi_connectors ( id, standard, format, power_type, max_voltage, max_amperage, max_electric_power )
      `)
      .eq("location_id", ocpiLoc.id)
      .limit(50);
    evses = evseData ?? [];
  }

  return apiSuccess({
    ...data,
    evses,
  });
}

// ─── Text search ────────────────────────────────────────────

async function searchStations(url: URL): Promise<Response> {
  const db = getDb();
  const query = url.searchParams.get("q") ?? "";
  const { offset, limit } = parsePagination(url);

  if (!query || query.length < 2) {
    return apiBadRequest("Search query must be at least 2 characters");
  }

  // Use ILIKE for simple search (works without full-text search setup)
  const pattern = `%${query}%`;

  const { data, error, count } = await db
    .from("stations")
    .select(`
      id, name, address, city, postal_code,
      latitude, longitude, ocpp_status, is_online,
      connectors, max_power_kw, avg_rating, review_count
    `, { count: "exact" })
    .or(`name.ilike.${pattern},address.ilike.${pattern},city.ilike.${pattern}`)
    .order("name")
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[Stations] Search error:", error);
    return apiBadRequest("Search failed");
  }

  return apiPaginated(data ?? [], {
    total: count ?? 0,
    offset,
    limit,
  });
}

// ─── Networks list ──────────────────────────────────────────

async function getNetworks(): Promise<Response> {
  const db = getDb();

  const { data, error } = await db
    .from("charging_networks")
    .select("*")
    .order("name");

  if (error) {
    console.error("[Stations] Networks error:", error);
    return apiBadRequest("Failed to fetch networks");
  }

  return apiSuccess(data ?? []);
}
