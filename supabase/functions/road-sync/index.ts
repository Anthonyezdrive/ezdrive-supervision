import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { corsHeaders } from "../_shared/cors.ts";
import { roadPost, ROAD_PROVIDER_ID } from "../_shared/road-client.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SyncResult {
  total_synced: number;
  new_stations: number;
  status_changes: number;
  skipped: number;
  errors: string[];
  raw_sample?: string;
}

// -------------------------------------------------------
// E-Flux status → OCPP status mapping
// E-Flux uses its own terminology at multiple levels
// -------------------------------------------------------
const EFLUX_TO_OCPP: Record<string, string> = {
  // E-Flux connector-level statuses
  available: "Available",
  occupied: "Charging",
  reserved: "Preparing",
  faulted: "Faulted",
  unavailable: "Unavailable",
  unknown: "Unknown",
  // Operational status
  operative: "Available",
  inoperative: "Unavailable",
  outoforder: "Faulted",
  // OCPP native (if API returns OCPP values directly)
  Available: "Available",
  Preparing: "Preparing",
  Charging: "Charging",
  SuspendedEVSE: "SuspendedEVSE",
  SuspendedEV: "SuspendedEV",
  Finishing: "Finishing",
  Unavailable: "Unavailable",
  Faulted: "Faulted",
  Unknown: "Unknown",
};

function normalizeRoadStatus(raw: string | undefined | null): string {
  if (!raw) return "Unknown";
  // Try exact match first, then lowercase
  return EFLUX_TO_OCPP[raw] ?? EFLUX_TO_OCPP[raw.toLowerCase()] ?? "Unknown";
}

function deriveStatusFromConnectors(
  connectors: Array<Record<string, unknown>>
): string {
  if (!connectors || connectors.length === 0) return "Unknown";
  const statuses = connectors.map((c) => {
    const rawStatus = (c.status ?? c.connectorStatus ?? c.ocppStatus ?? "unknown") as string;
    return normalizeRoadStatus(rawStatus);
  });
  if (statuses.some((s) => s === "Charging")) return "Charging";
  if (statuses.every((s) => s === "Available")) return "Available";
  if (statuses.some((s) => s === "Faulted")) return "Faulted";
  if (statuses.some((s) => s === "Available")) return "Available";
  if (statuses.every((s) => s === "Unavailable")) return "Unavailable";
  return "Unknown";
}

function detectTerritory(postalCode: string | null | undefined): string | null {
  if (!postalCode) return null;
  const code = postalCode.trim().replace(/\s/g, "");
  if (code.startsWith("971")) return "971";
  if (code.startsWith("972")) return "972";
  if (code.startsWith("973")) return "973";
  if (code.startsWith("974")) return "974";
  return null;
}

// Extract station ID – E-Flux uses _id (MongoDB style) or id
function extractRoadId(ctrl: Record<string, unknown>): string | null {
  return (
    (ctrl._id as string) ??
    (ctrl.id as string) ??
    (ctrl.evseControllerId as string) ??
    null
  );
}

// -------------------------------------------------------
// Paginated fetch of all evse-controllers
// -------------------------------------------------------
async function fetchAllControllers(): Promise<{
  controllers: Array<Record<string, unknown>>;
  sample: string;
}> {
  const LIMIT = 100;
  const allControllers: Array<Record<string, unknown>> = [];

  // First page
  const firstRes = await roadPost("/1/evse-controllers/search", {
    limit: LIMIT,
    skip: 0,
    accountId: ROAD_PROVIDER_ID,
  });

  if (!firstRes.ok) {
    const errText = await firstRes.text();
    throw new Error(
      `ROAD evse-controllers error ${firstRes.status}: ${errText}`
    );
  }

  const firstData = await firstRes.json();
  const sample = JSON.stringify(firstData).substring(0, 600);

  // E-Flux may wrap items in different keys
  const firstItems: Array<Record<string, unknown>> =
    firstData?.items ?? firstData?.data ?? firstData?.evseControllers ?? [];
  const total: number =
    firstData?.total ?? firstData?.count ?? firstItems.length;

  allControllers.push(...firstItems);

  // Paginate remaining pages
  let skip = LIMIT;
  while (allControllers.length < total && skip < total) {
    const pageRes = await roadPost("/1/evse-controllers/search", {
      limit: LIMIT,
      skip,
      accountId: ROAD_PROVIDER_ID,
    });
    if (!pageRes.ok) break;

    const pageData = await pageRes.json();
    const pageItems: Array<Record<string, unknown>> =
      pageData?.items ?? pageData?.data ?? pageData?.evseControllers ?? [];
    if (pageItems.length === 0) break;

    allControllers.push(...pageItems);
    skip += LIMIT;
  }

  console.log(
    `[road-sync] Fetched ${allControllers.length} / ${total} evse-controllers`
  );
  return { controllers: allControllers, sample };
}

// -------------------------------------------------------
// Main handler
// -------------------------------------------------------
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const result: SyncResult = {
    total_synced: 0,
    new_stations: 0,
    status_changes: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // 1. Fetch all ROAD evse-controllers
    console.log("[road-sync] Starting sync with ROAD provider:", ROAD_PROVIDER_ID);
    const { controllers, sample } = await fetchAllControllers();
    result.raw_sample = sample;

    if (controllers.length === 0) {
      console.warn(
        "[road-sync] No controllers returned – token may not have provider access yet"
      );
      return new Response(
        JSON.stringify({
          ...result,
          message:
            "No evse-controllers returned from ROAD API. " +
            "The application token may not yet be linked to the EZDrive sub-provider " +
            "(provider ID: " + ROAD_PROVIDER_ID + "). " +
            "Contact ROAD account manager (Myriam) to confirm credential linkage.",
          raw_sample: sample,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Load DB references (only ROAD stations)
    const [
      { data: existingStations },
      { data: territories },
      { data: cpos },
    ] = await Promise.all([
      supabase
        .from("stations")
        .select("id, road_id, ocpp_status")
        .eq("source", "road"),
      supabase.from("territories").select("id, code"),
      supabase.from("cpo_operators").select("id, code, name"),
    ]);

    const stationMap = new Map(
      (existingStations ?? []).map(
        (s: { road_id: string; id: string; ocpp_status: string }) => [
          s.road_id,
          s,
        ]
      )
    );

    const territoryMap = new Map(
      (territories ?? []).map((t: { code: string; id: string }) => [
        t.code,
        t.id,
      ])
    );

    // Prefer ROAD EZDrive CPO; fallback to GFX EZDrive CPO
    const roadEzdriveCpoId = cpos?.find(
      (c: { code: string }) => c.code === "road-ezdrive"
    )?.id;
    const ezdriveCpoId = cpos?.find(
      (c: { code: string }) => c.code === "ezdrive"
    )?.id;
    const defaultCpoId = roadEzdriveCpoId ?? ezdriveCpoId ?? null;

    const seenRoadIds = new Set<string>();

    // 3. Process each evse-controller
    for (const ctrl of controllers) {
      try {
        const roadId = extractRoadId(ctrl);
        if (!roadId) {
          result.errors.push("Evse-controller missing ID field");
          continue;
        }

        seenRoadIds.add(roadId);

        // --- Name ---
        const name =
          (ctrl.name as string) ??
          (ctrl.chargePointName as string) ??
          (ctrl.displayName as string) ??
          `ROAD-${roadId.slice(-6)}`;

        // --- Location (embedded object or reference) ---
        const location =
          (ctrl.location as Record<string, unknown>) ??
          (ctrl.address as Record<string, unknown>) ??
          {};

        const address =
          (location.address as string) ??
          (location.street as string) ??
          (ctrl.address as string) ??
          null;

        const city =
          (location.city as string) ??
          (ctrl.city as string) ??
          null;

        const postalCode =
          (location.postalCode as string) ??
          (location.zipCode as string) ??
          (ctrl.postalCode as string) ??
          (ctrl.zipCode as string) ??
          null;

        // --- Coordinates ---
        let lat: number | null = null;
        let lng: number | null = null;

        const geometry = (location.geometry ?? ctrl.geometry) as
          | Record<string, unknown>
          | undefined;

        if (
          geometry?.type === "Point" &&
          Array.isArray(geometry?.coordinates)
        ) {
          // GeoJSON [lng, lat]
          lng = (geometry.coordinates as number[])[0] ?? null;
          lat = (geometry.coordinates as number[])[1] ?? null;
        } else {
          const rawLat =
            location.latitude ?? location.lat ?? ctrl.latitude ?? ctrl.lat;
          const rawLng =
            location.longitude ?? location.lng ?? ctrl.longitude ?? ctrl.lng;
          if (rawLat !== undefined) lat = parseFloat(rawLat as string) || null;
          if (rawLng !== undefined) lng = parseFloat(rawLng as string) || null;
        }

        // --- Connectors ---
        const rawConnectors =
          (ctrl.connectors as Array<Record<string, unknown>>) ??
          (ctrl.evses as Array<Record<string, unknown>>) ??
          (ctrl.ports as Array<Record<string, unknown>>) ??
          [];

        // --- OCPP Status ---
        let ocppStatus = "Unknown";
        if (rawConnectors.length > 0) {
          ocppStatus = deriveStatusFromConnectors(rawConnectors);
        } else {
          // Fallback to controller-level status
          const rawStatus = (
            ctrl.status ??
            ctrl.operationalStatus ??
            ctrl.connectorStatus ??
            ctrl.ocppStatus
          ) as string | undefined;
          ocppStatus = normalizeRoadStatus(rawStatus);
        }

        // --- Normalized connectors ---
        const connectors = rawConnectors.map(
          (c: Record<string, unknown>, idx: number) => ({
            id: ((c._id ?? c.id ?? `${roadId}-${idx}`) as string),
            type: ((c.standard ?? c.connectorType ?? c.type ?? "Unknown") as string),
            format: ((c.format ?? "Cable") as string),
            status: normalizeRoadStatus(
              (c.status ?? c.connectorStatus ?? "unknown") as string
            ),
            max_power_kw:
              Math.round(
                (((c.maxPower ?? c.maxElectricPower ?? c.powerKw ?? 0) as number) /
                  1000) *
                  100
              ) / 100,
          })
        );

        const maxPower =
          connectors.length > 0
            ? Math.max(...connectors.map((c) => c.max_power_kw))
            : null;

        // --- Territory ---
        const territoryCode = detectTerritory(postalCode);
        const territoryId = territoryCode
          ? (territoryMap.get(territoryCode) ?? null)
          : null;

        // --- CPO (all ROAD stations → ROAD EZDrive by default) ---
        const cpoId = defaultCpoId;

        // --- Location ID for reference ---
        const locationId =
          ((location._id ?? location.id ?? ctrl.locationId) as string) ?? null;

        const existing = stationMap.get(roadId);

        if (!existing) {
          // INSERT new ROAD station
          const { error: insertErr } = await supabase
            .from("stations")
            .insert({
              road_id: roadId,
              gfx_id: null,
              source: "road",
              gfx_location_id: locationId,
              name,
              address,
              city,
              postal_code: postalCode,
              latitude: lat,
              longitude: lng,
              cpo_id: cpoId,
              territory_id: territoryId,
              ocpp_status: ocppStatus,
              status_since: new Date().toISOString(),
              is_online: true,
              connectors: JSON.stringify(connectors),
              max_power_kw: maxPower,
              gfx_raw: ctrl,
              last_synced_at: new Date().toISOString(),
            });

          if (insertErr) {
            result.errors.push(`Insert error ${roadId}: ${insertErr.message}`);
          } else {
            result.new_stations++;
            // Log initial status
            const { data: newStation } = await supabase
              .from("stations")
              .select("id")
              .eq("road_id", roadId)
              .single();
            if (newStation) {
              await supabase.from("station_status_log").insert({
                station_id: newStation.id,
                previous_status: null,
                new_status: ocppStatus,
              });
            }
          }
        } else {
          // UPDATE existing ROAD station
          const statusChanged = existing.ocpp_status !== ocppStatus;

          const updateData: Record<string, unknown> = {
            last_synced_at: new Date().toISOString(),
            is_online: true,
            gfx_raw: ctrl,
            connectors: JSON.stringify(connectors),
            name,
            address,
            city,
            postal_code: postalCode,
          };

          if (lat !== null) updateData.latitude = lat;
          if (lng !== null) updateData.longitude = lng;
          if (statusChanged) {
            updateData.ocpp_status = ocppStatus;
            updateData.status_since = new Date().toISOString();
          }
          if (cpoId) updateData.cpo_id = cpoId;
          if (territoryId) updateData.territory_id = territoryId;
          if (maxPower !== null) updateData.max_power_kw = maxPower;

          const { error: updateErr } = await supabase
            .from("stations")
            .update(updateData)
            .eq("road_id", roadId);

          if (updateErr) {
            result.errors.push(`Update error ${roadId}: ${updateErr.message}`);
          }

          if (statusChanged) {
            await supabase.from("station_status_log").insert({
              station_id: existing.id,
              previous_status: existing.ocpp_status,
              new_status: ocppStatus,
            });
            result.status_changes++;
          }
        }

        result.total_synced++;
      } catch (ctrlError) {
        result.errors.push(
          `Controller error: ${(ctrlError as Error).message}`
        );
      }
    }

    // 4. Mark unseen ROAD stations as offline
    if (seenRoadIds.size > 0 && existingStations) {
      const unseenStations = (existingStations as Array<{ road_id: string; id: string }>).filter(
        (s) => !seenRoadIds.has(s.road_id)
      );
      for (const unseen of unseenStations) {
        await supabase
          .from("stations")
          .update({
            is_online: false,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", unseen.id);
      }
      if (unseenStations.length > 0) {
        console.log(
          `[road-sync] Marked ${unseenStations.length} ROAD stations as offline`
        );
      }
    }

    console.log("[road-sync] Done:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[road-sync] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message, result }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
