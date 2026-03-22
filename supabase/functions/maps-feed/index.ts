// Maps Feed — Public Station Data Export
// Serves GeoJSON and Google Maps compatible formats
// No authentication required (public data)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  const url = new URL(req.url);
  const format = url.pathname.split("/").pop() ?? "geojson";

  // CORS for public access
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=300", // 5 min cache
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { ...headers, "Access-Control-Allow-Methods": "GET, OPTIONS" } });
  }

  try {
    // Check feature toggle
    const { data: toggle } = await db.from("feature_toggles").select("enabled").eq("key", "enable_maps_feed").single();
    if (!toggle?.enabled) {
      return new Response(JSON.stringify({ error: "Maps feed disabled" }), { status: 503, headers: { ...headers, "Content-Type": "application/json" } });
    }

    // Query stations with coordinates
    const { data: stations, error } = await db
      .from("stations")
      .select(`
        id, name, address, city, postal_code, latitude, longitude,
        ocpp_status, is_online, max_power_kw, connectors, source,
        cpo_operators!stations_cpo_id_fkey(name, code),
        territories!stations_territory_id_fkey(name, code)
      `)
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (error) throw error;
    if (!stations) return new Response("[]", { headers: { ...headers, "Content-Type": "application/json" } });

    switch (format) {
      case "geojson":
        return serveGeoJSON(stations, headers);
      case "google":
        return serveGoogleCSV(stations, headers);
      case "apple":
        return serveAppleJSON(stations, headers);
      default:
        return serveGeoJSON(stations, headers);
    }
  } catch (err) {
    console.error("[maps-feed] Error:", (err as Error).message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});

function serveGeoJSON(stations: unknown[], headers: Record<string, string>) {
  const geojson = {
    type: "FeatureCollection",
    features: stations.map((s: any) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [s.longitude, s.latitude],
      },
      properties: {
        id: s.id,
        name: s.name,
        address: `${s.address ?? ""}, ${s.postal_code ?? ""} ${s.city ?? ""}`.trim(),
        status: mapStatus(s.ocpp_status),
        is_online: s.is_online,
        max_power_kw: s.max_power_kw,
        power_category: s.max_power_kw <= 22 ? "AC" : s.max_power_kw <= 60 ? "DC_FAST" : "DC_ULTRA_FAST",
        connector_count: Array.isArray(s.connectors) ? s.connectors.length : 0,
        connectors: s.connectors,
        operator: s.cpo_operators?.name ?? "EZDrive",
        operator_code: s.cpo_operators?.code ?? "EZD",
        territory: s.territories?.name ?? "",
        source: s.source,
      },
    })),
    metadata: {
      generated_at: new Date().toISOString(),
      total_stations: stations.length,
      operator: "EZDrive",
      website: "https://ezdrive.fr",
    },
  };

  return new Response(JSON.stringify(geojson), {
    headers: { ...headers, "Content-Type": "application/geo+json" },
  });
}

function serveGoogleCSV(stations: unknown[], headers: Record<string, string>) {
  const csvHeaders = "name,address,latitude,longitude,category,phone,website,description";
  const rows = stations.map((s: any) => {
    const address = `${s.address ?? ""}, ${s.postal_code ?? ""} ${s.city ?? ""}`.trim();
    const desc = `Borne ${s.max_power_kw ?? 0}kW - ${s.cpo_operators?.name ?? "EZDrive"} - ${mapStatus(s.ocpp_status)}`;
    return `"${s.name}","${address}",${s.latitude},${s.longitude},"Electric Vehicle Charging Station","","https://ezdrive.fr","${desc}"`;
  });

  return new Response([csvHeaders, ...rows].join("\n"), {
    headers: { ...headers, "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=ezdrive-stations.csv" },
  });
}

function serveAppleJSON(stations: unknown[], headers: Record<string, string>) {
  const places = stations.map((s: any) => ({
    name: s.name,
    latitude: s.latitude,
    longitude: s.longitude,
    address: { street: s.address, city: s.city, postalCode: s.postal_code, country: "FR" },
    category: "EVCharger",
    attributes: {
      maxPowerKw: s.max_power_kw,
      operator: s.cpo_operators?.name ?? "EZDrive",
      status: mapStatus(s.ocpp_status),
      connectorCount: Array.isArray(s.connectors) ? s.connectors.length : 0,
    },
  }));

  return new Response(JSON.stringify({ places, metadata: { total: places.length, generated: new Date().toISOString() } }), {
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function mapStatus(ocppStatus: string): string {
  const map: Record<string, string> = {
    Available: "AVAILABLE", Charging: "IN_USE", Preparing: "IN_USE",
    SuspendedEVSE: "IN_USE", SuspendedEV: "IN_USE", Finishing: "IN_USE",
    Faulted: "OUT_OF_SERVICE", Unavailable: "OUT_OF_SERVICE",
  };
  return map[ocppStatus] ?? "UNKNOWN";
}
