// ============================================================
// EZDrive — QR Charge Edge Function
// Called when a user scans a QR code on a charging station
// Resolves the station/EVSE and initiates a RemoteStartTransaction
//
// GET  /qr-charge/{identity}/{evse_uid}  — Redirect to app or return station info
// POST /qr-charge/start                  — Start charge via QR scan
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);

  try {
    // POST /qr-charge/start — Start charge via QR
    if (req.method === "POST") {
      const body = await req.json();
      return await handleStartCharge(body, req);
    }

    // GET /qr-charge/{identity}/{evse_uid} — Resolve station info
    // Extract identity and evse from path
    const fnIndex = pathParts.indexOf("qr-charge");
    const identity = pathParts[fnIndex + 1];
    const evseUid = pathParts[fnIndex + 2];

    if (!identity) {
      return jsonResponse({ error: "Missing station identity in QR URL" }, 400);
    }

    return await handleResolveStation(identity, evseUid);
  } catch (err) {
    console.error("[qr-charge] Error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});

// ── Resolve station from QR code identity ──────────────────

async function handleResolveStation(identity: string, evseUid?: string): Promise<Response> {
  // Find station by ocpp_identity
  const { data: station, error } = await db
    .from("stations")
    .select(`
      id, name, address, city, postal_code, latitude, longitude,
      max_power_kw, ocpp_status, is_online, connectors, ocpp_identity,
      cpo_operators(id, name, code)
    `)
    .eq("ocpp_identity", identity)
    .maybeSingle();

  if (error || !station) {
    return jsonResponse({
      error: "Station not found",
      identity,
      message: "Cette borne n'est pas enregistrée dans notre système",
    }, 404);
  }

  // Find EVSE info if provided
  let evse = null;
  if (evseUid && station.connectors) {
    const connectors = Array.isArray(station.connectors) ? station.connectors : [];
    evse = connectors.find((c: any) => c.evse_uid === evseUid || c.id === evseUid);
  }

  // Find active tariff
  const { data: tariff } = await db
    .from("station_tariffs")
    .select("ocpi_tariffs(tariff_id, currency, elements)")
    .eq("station_id", station.id)
    .order("priority")
    .limit(1)
    .maybeSingle();

  return jsonResponse({
    station: {
      id: station.id,
      name: station.name,
      address: station.address,
      city: station.city,
      latitude: station.latitude,
      longitude: station.longitude,
      max_power_kw: station.max_power_kw,
      status: station.ocpp_status,
      is_online: station.is_online,
      ocpp_identity: station.ocpp_identity,
      cpo: station.cpo_operators,
    },
    evse: evse ?? { uid: evseUid ?? "EVSE-1" },
    tariff: tariff?.ocpi_tariffs ?? null,
    can_charge: station.is_online && station.ocpp_status !== "Unavailable" && station.ocpp_status !== "Faulted",
    qr_url: `https://app.ezdrive.fr/charge/${identity}${evseUid ? `/${evseUid}` : ""}`,
    actions: {
      start_charge: {
        method: "POST",
        url: `${SUPABASE_URL}/functions/v1/qr-charge/start`,
        body: {
          station_id: station.id,
          ocpp_identity: identity,
          evse_uid: evseUid,
          id_tag: "<user_token_uid>",
        },
      },
    },
  });
}

// ── Start charge from QR scan ──────────────────────────────

async function handleStartCharge(body: Record<string, unknown>, req: Request): Promise<Response> {
  const { station_id, ocpp_identity, evse_uid, id_tag, connector_id } = body as {
    station_id?: string;
    ocpp_identity?: string;
    evse_uid?: string;
    id_tag: string;
    connector_id?: number;
  };

  if (!id_tag) return jsonResponse({ error: "id_tag is required (user's token UID)" }, 400);
  if (!station_id && !ocpp_identity) return jsonResponse({ error: "station_id or ocpp_identity is required" }, 400);

  // Resolve identity
  let identity = ocpp_identity;
  if (!identity && station_id) {
    const { data } = await db.from("stations").select("ocpp_identity").eq("id", station_id).maybeSingle();
    identity = data?.ocpp_identity;
  }
  if (!identity) return jsonResponse({ error: "Could not resolve OCPP identity" }, 400);

  // Check station is online
  const { data: station } = await db
    .from("stations")
    .select("is_online, ocpp_status")
    .eq("ocpp_identity", identity)
    .maybeSingle();

  if (!station?.is_online) {
    return jsonResponse({ error: "Station is offline", status: station?.ocpp_status ?? "Unknown" }, 400);
  }

  // Queue RemoteStartTransaction command
  const commandId = crypto.randomUUID();
  const { error: cmdError } = await db.from("ocpp_command_queue").insert({
    id: commandId,
    chargepoint_identity: identity,
    command: "RemoteStartTransaction",
    payload: {
      idTag: id_tag,
      connectorId: connector_id ?? 1,
    },
    status: "PENDING",
    requested_by: null, // Could extract from JWT if authenticated
  });

  if (cmdError) {
    console.error("[qr-charge] Command queue error:", cmdError);
    return jsonResponse({ error: "Failed to queue charge command" }, 500);
  }

  // Notify OCPP server via pg_notify
  await db.rpc("pg_notify_ocpp_command", { p_command_id: commandId }).catch(() => {
    // pg_notify may not exist, command will be picked up by polling
  });

  return jsonResponse({
    success: true,
    command_id: commandId,
    message: "Charge command queued — the station will start charging shortly",
    station_identity: identity,
    id_tag,
    poll_status: {
      method: "GET",
      url: `${SUPABASE_URL}/functions/v1/api/ocpp/command/${commandId}`,
      description: "Poll this URL every 2s to check if the command was executed",
    },
  }, 201);
}

// ── Helpers ──────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
