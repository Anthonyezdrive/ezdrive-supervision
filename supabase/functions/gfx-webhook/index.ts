// GreenFlux Webhook Receiver
// Receives push events from GreenFlux (CDR complete, station status change)
// Replaces polling for real-time data flow

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GFX_WEBHOOK_SECRET = Deno.env.get("GFX_WEBHOOK_SECRET") ?? "";

const db = createClient(supabaseUrl, supabaseKey);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-GFX-Signature" },
    });
  }

  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const startTime = Date.now();

  try {
    // Verify webhook authenticity
    const signature = req.headers.get("x-gfx-signature") ?? req.headers.get("authorization") ?? "";
    if (GFX_WEBHOOK_SECRET && !signature.includes(GFX_WEBHOOK_SECRET)) {
      await logWebhook("unknown", {}, signature, "failed", "Invalid signature");
      return json({ error: "Unauthorized" }, 401);
    }

    const payload = await req.json();
    const eventType = payload.event_type ?? payload.type ?? "unknown";

    console.log(`[gfx-webhook] Received event: ${eventType}`);

    let status = "processed";
    let errorMessage: string | null = null;

    try {
      switch (eventType) {
        case "cdr.completed":
        case "cdr.created":
          await handleCdrEvent(payload);
          break;

        case "session.started":
        case "session.updated":
        case "session.completed":
          await handleSessionEvent(payload);
          break;

        case "chargestation.status_changed":
        case "station.status":
          await handleStationStatusEvent(payload);
          break;

        case "driver.updated":
        case "driver.created":
          await handleDriverEvent(payload);
          break;

        default:
          status = "ignored";
          console.log(`[gfx-webhook] Unknown event type: ${eventType}`);
      }
    } catch (err) {
      status = "failed";
      errorMessage = (err as Error).message;
      console.error(`[gfx-webhook] Processing error:`, errorMessage);
    }

    const processingTime = Date.now() - startTime;
    await logWebhook(eventType, payload, signature, status, errorMessage, processingTime);

    return json({ ok: true, event_type: eventType, status, processing_time_ms: processingTime });
  } catch (err) {
    console.error("[gfx-webhook] Fatal error:", (err as Error).message);
    return json({ error: "Internal server error" }, 500);
  }
});

// ─── Event Handlers ──────────────────────────────────

async function handleCdrEvent(payload: Record<string, unknown>) {
  const cdr = payload.data ?? payload.cdr ?? payload;
  if (!cdr) return;

  const cdrData = {
    country_code: "FR",
    party_id: "EZD",
    cdr_id: String(cdr.id ?? cdr.cdr_id ?? `gfx-${Date.now()}`),
    start_date_time: cdr.start_date_time ?? cdr.startDateTime,
    end_date_time: cdr.end_date_time ?? cdr.endDateTime,
    total_energy: Number(cdr.total_energy ?? cdr.totalEnergy ?? 0),
    total_time: Number(cdr.total_time ?? cdr.totalTime ?? 0),
    total_parking_time: Number(cdr.total_parking_time ?? 0),
    total_cost: cdr.total_cost ?? { excl_vat: 0, incl_vat: 0 },
    cdr_token: cdr.cdr_token ?? cdr.token ?? {},
    cdr_location: cdr.cdr_location ?? cdr.location ?? {},
    currency: cdr.currency ?? "EUR",
    charging_periods: cdr.charging_periods ?? [],
    last_updated: new Date().toISOString(),
  };

  const { error } = await db.from("ocpi_cdrs").upsert(cdrData, { onConflict: "country_code,party_id,cdr_id" });
  if (error) throw new Error(`CDR upsert failed: ${error.message}`);
  console.log(`[gfx-webhook] CDR ${cdrData.cdr_id} upserted`);
}

async function handleSessionEvent(payload: Record<string, unknown>) {
  const session = payload.data ?? payload.session ?? payload;
  if (!session) return;

  const sessionData = {
    country_code: "FR",
    party_id: "EZD",
    session_id: String(session.id ?? session.session_id ?? `gfx-sess-${Date.now()}`),
    start_date_time: session.start_date_time ?? session.startDateTime,
    end_date_time: session.end_date_time ?? session.endDateTime,
    kwh: Number(session.kwh ?? session.energy ?? 0),
    status: mapSessionStatus(String(session.status ?? "ACTIVE")),
    cdr_token: session.token ?? {},
    last_updated: new Date().toISOString(),
  };

  const { error } = await db.from("ocpi_sessions").upsert(sessionData, { onConflict: "country_code,party_id,session_id" });
  if (error) throw new Error(`Session upsert failed: ${error.message}`);
  console.log(`[gfx-webhook] Session ${sessionData.session_id} upserted (${sessionData.status})`);
}

async function handleStationStatusEvent(payload: Record<string, unknown>) {
  const data = payload.data ?? payload;
  const gfxId = String(data.chargestation_id ?? data.station_id ?? data.gfx_id ?? "");
  const newStatus = mapOcppStatus(String(data.status ?? data.new_status ?? "Unknown"));

  if (!gfxId) return;

  const { error } = await db
    .from("stations")
    .update({ ocpp_status: newStatus, status_since: new Date().toISOString(), is_online: newStatus !== "Unknown" })
    .eq("gfx_id", gfxId);

  if (error) throw new Error(`Station status update failed: ${error.message}`);
  console.log(`[gfx-webhook] Station ${gfxId} → ${newStatus}`);
}

async function handleDriverEvent(payload: Record<string, unknown>) {
  const driver = payload.data ?? payload.driver ?? payload;
  if (!driver) return;

  // Upsert to gfx_consumers if table exists
  console.log(`[gfx-webhook] Driver event received for: ${driver.email ?? driver.id}`);
  // Full driver sync logic handled by gfx-driver-sync — this is a lightweight update
}

// ─── Helpers ────────────────────────────────────────

function mapOcppStatus(status: string): string {
  const map: Record<string, string> = {
    AVAILABLE: "Available", OCCUPIED: "Charging", CHARGING: "Charging",
    OUTOFORDER: "Faulted", INOPERATIVE: "Unavailable", BLOCKED: "Unavailable",
    PLANNED: "Unavailable", REMOVED: "Unavailable", RESERVED: "Reserved",
  };
  return map[status.toUpperCase()] ?? "Unknown";
}

function mapSessionStatus(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: "ACTIVE", COMPLETED: "COMPLETED", INVALID: "INVALID", PENDING: "PENDING",
  };
  return map[status.toUpperCase()] ?? "ACTIVE";
}

async function logWebhook(
  eventType: string, payload: unknown, signature: string,
  status: string, errorMessage: string | null = null, processingTime: number = 0
) {
  try {
    await db.from("gfx_webhook_log").insert({
      event_type: eventType,
      payload: payload as Record<string, unknown>,
      signature: signature.substring(0, 50),
      status,
      error_message: errorMessage,
      processing_time_ms: processingTime,
    });
  } catch (e) {
    console.error("[gfx-webhook] Failed to log:", (e as Error).message);
  }
}
