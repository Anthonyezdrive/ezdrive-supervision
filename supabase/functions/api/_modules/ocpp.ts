// ============================================
// API Module: OCPP Commands & Monitoring + Smart Charging
// Provides dashboard control over OCPP chargepoints
//
// Endpoints:
//   POST /api/ocpp/command                   — Send OCPP command (RemoteStart, Reset, etc.)
//   GET  /api/ocpp/command/:id               — Get command status/result
//   GET  /api/ocpp/sessions/active           — Active charging sessions (real-time)
//   GET  /api/ocpp/chargepoints              — Connected chargepoints
//   GET  /api/ocpp/station-tariffs           — Station tariff assignments
//   POST /api/ocpp/smart-charging/set        — Set charging profile (power limit)
//   POST /api/ocpp/smart-charging/clear      — Clear charging profile
//   GET  /api/ocpp/smart-charging/schedule   — Get composite schedule
//   GET  /api/ocpp/smart-charging/profiles   — List active charging profiles
// ============================================

import { apiSuccess, apiCreated, apiBadRequest, apiForbidden, apiNotFound, apiServerError } from "../../_shared/api-response.ts";
import { getServiceClient } from "../../_shared/auth-middleware.ts";
import type { RouteContext } from "../index.ts";

// Allowed OCPP commands from the dashboard
const ALLOWED_COMMANDS = [
  'RemoteStartTransaction',
  'RemoteStopTransaction',
  'Reset',
  'UnlockConnector',
  'ChangeConfiguration',
  'GetConfiguration',
  'ClearCache',
  'TriggerMessage',
  'ChangeAvailability',
  'SetChargingProfile',
  'ClearChargingProfile',
  'GetCompositeSchedule',
] as const;

export async function handleOcpp(ctx: RouteContext): Promise<Response> {
  const { method, segments, auth } = ctx;

  if (!auth) return apiForbidden("Authentication required");

  // ── Verify admin/operator role ──
  const db = getServiceClient();
  const { data: profile } = await db
    .from("ezdrive_profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  if (!profile || !["admin", "operator"].includes(profile.role)) {
    return apiForbidden("Only admin and operator roles can access OCPP commands");
  }

  const action = segments[0] ?? "";
  const subAction = segments[1] ?? "";

  switch (action) {
    case "command":
      if (method === "POST") return await sendCommand(ctx);
      if (method === "GET" && subAction) return await getCommand(subAction);
      return apiBadRequest("POST /ocpp/command or GET /ocpp/command/:id");

    case "sessions":
      if (subAction === "active" && method === "GET") return await getActiveSessions();
      return apiBadRequest("GET /ocpp/sessions/active");

    case "chargepoints":
      if (method === "GET") return await getChargepoints();
      return apiBadRequest("GET /ocpp/chargepoints");

    case "station-tariffs":
      if (method === "GET") return await getStationTariffs(ctx);
      return apiBadRequest("GET /ocpp/station-tariffs");

    case "smart-charging":
      return await handleSmartCharging(ctx, subAction);

    default:
      return apiNotFound(`Unknown OCPP endpoint: ${action}`);
  }
}

// ─── POST /api/ocpp/command ──────────────────────────────────

async function sendCommand(ctx: RouteContext): Promise<Response> {
  try {
    const body = await ctx.req.json();
    const { chargepoint_id, command, payload = {} } = body;

    if (!chargepoint_id) return apiBadRequest("chargepoint_id is required");
    if (!command) return apiBadRequest("command is required");
    if (!ALLOWED_COMMANDS.includes(command)) {
      return apiBadRequest(`Invalid command. Allowed: ${ALLOWED_COMMANDS.join(", ")}`);
    }

    const db = getServiceClient();

    // Verify chargepoint exists
    const { data: cp } = await db
      .from("ocpp_chargepoints")
      .select("id, identity, is_connected")
      .eq("id", chargepoint_id)
      .single();

    if (!cp) return apiNotFound("Chargepoint not found");

    if (!cp.is_connected) {
      return apiBadRequest(`Chargepoint ${cp.identity} is not connected`);
    }

    // Insert command into queue
    const { data: cmd, error } = await db
      .from("ocpp_command_queue")
      .insert({
        chargepoint_id,
        command,
        payload,
        requested_by: ctx.auth?.user.id,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      .select("id, command, status, created_at")
      .single();

    if (error) throw error;

    // Poll for result (max 15 seconds)
    const result = await pollCommandResult(db, cmd.id, 15000);

    return apiSuccess({
      command_id: cmd.id,
      command: cmd.command,
      chargepoint: cp.identity,
      status: result.status,
      result: result.result,
      processed_at: result.processed_at,
    });
  } catch (err) {
    console.error("[OCPP] sendCommand error:", err);
    return apiServerError(err instanceof Error ? err.message : "Failed to send command");
  }
}

// Poll command queue for result
async function pollCommandResult(
  db: ReturnType<typeof getServiceClient>,
  commandId: string,
  maxWaitMs: number
): Promise<{ status: string; result: unknown; processed_at: string | null }> {
  const startTime = Date.now();
  const pollInterval = 500; // ms

  while (Date.now() - startTime < maxWaitMs) {
    const { data } = await db
      .from("ocpp_command_queue")
      .select("status, result, processed_at")
      .eq("id", commandId)
      .single();

    if (data && data.status !== "pending" && data.status !== "sent") {
      return data;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Timeout — return current status
  const { data } = await db
    .from("ocpp_command_queue")
    .select("status, result, processed_at")
    .eq("id", commandId)
    .single();

  return data ?? { status: "timeout", result: null, processed_at: null };
}

// ─── GET /api/ocpp/command/:id ───────────────────────────────

async function getCommand(commandId: string): Promise<Response> {
  try {
    const db = getServiceClient();
    const { data, error } = await db
      .from("ocpp_command_queue")
      .select("id, chargepoint_id, command, payload, status, result, requested_by, created_at, processed_at")
      .eq("id", commandId)
      .single();

    if (error || !data) return apiNotFound("Command not found");

    return apiSuccess(data);
  } catch (err) {
    return apiServerError("Failed to fetch command");
  }
}

// ─── GET /api/ocpp/sessions/active ───────────────────────────

async function getActiveSessions(): Promise<Response> {
  try {
    const db = getServiceClient();

    // Active transactions with station info and latest meter values
    const { data, error } = await db.rpc("get_active_ocpp_sessions");

    if (error) {
      // Fallback: direct query if RPC doesn't exist
      const { data: sessions, error: err2 } = await db
        .from("ocpp_transactions")
        .select(`
          id,
          chargepoint_id,
          connector_id,
          id_tag,
          meter_start,
          started_at,
          status,
          energy_kwh,
          ocpp_chargepoints!inner (
            identity,
            station_id,
            stations!inner (
              name,
              city,
              address
            )
          )
        `)
        .eq("status", "Active")
        .order("started_at", { ascending: false });

      if (err2) throw err2;

      // Enrich with duration
      const enriched = (sessions ?? []).map((s: Record<string, unknown>) => {
        const cp = s.ocpp_chargepoints as Record<string, unknown>;
        const station = cp?.stations as Record<string, unknown>;
        const startTime = new Date(s.started_at as string);
        const durationMinutes = Math.round((Date.now() - startTime.getTime()) / 60000);

        return {
          id: s.id,
          station_name: station?.name ?? "Unknown",
          city: station?.city ?? "",
          address: station?.address ?? "",
          chargepoint_identity: cp?.identity ?? "",
          connector_id: s.connector_id,
          id_tag: s.id_tag,
          started_at: s.started_at,
          duration_minutes: durationMinutes,
          meter_start: s.meter_start,
          energy_kwh: s.energy_kwh,
        };
      });

      return apiSuccess(enriched);
    }

    return apiSuccess(data);
  } catch (err) {
    console.error("[OCPP] getActiveSessions error:", err);
    return apiServerError("Failed to fetch active sessions");
  }
}

// ─── GET /api/ocpp/chargepoints ──────────────────────────────

async function getChargepoints(): Promise<Response> {
  try {
    const db = getServiceClient();
    const { data, error } = await db
      .from("ocpp_chargepoints")
      .select(`
        id,
        identity,
        is_connected,
        last_heartbeat,
        ocpp_protocol,
        firmware_version,
        station_id,
        stations (
          name,
          city,
          address
        )
      `)
      .order("is_connected", { ascending: false })
      .order("last_heartbeat", { ascending: false });

    if (error) throw error;

    const result = (data ?? []).map((cp: Record<string, unknown>) => {
      const station = cp.stations as Record<string, unknown> | null;
      return {
        id: cp.id,
        identity: cp.identity,
        is_connected: cp.is_connected,
        last_heartbeat: cp.last_heartbeat,
        protocol: cp.ocpp_protocol,
        firmware_version: cp.firmware_version,
        station_id: cp.station_id,
        station_name: station?.name ?? null,
        station_city: station?.city ?? null,
      };
    });

    return apiSuccess(result);
  } catch (err) {
    console.error("[OCPP] getChargepoints error:", err);
    return apiServerError("Failed to fetch chargepoints");
  }
}

// ─── GET /api/ocpp/station-tariffs ───────────────────────────

async function getStationTariffs(ctx: RouteContext): Promise<Response> {
  try {
    const db = getServiceClient();
    const stationId = ctx.url.searchParams.get("station_id");

    let query = db
      .from("station_tariffs")
      .select(`
        id,
        station_id,
        tariff_id,
        priority,
        connector_type,
        valid_from,
        valid_to,
        source,
        created_at,
        stations (
          name,
          city
        ),
        ocpi_tariffs (
          tariff_id,
          elements,
          currency
        )
      `)
      .order("created_at", { ascending: false });

    if (stationId) {
      query = query.eq("station_id", stationId);
    }

    const { data, error } = await query.limit(200);

    if (error) throw error;

    return apiSuccess(data);
  } catch (err) {
    console.error("[OCPP] getStationTariffs error:", err);
    return apiServerError("Failed to fetch station tariffs");
  }
}

// ═══════════════════════════════════════════════════════════
// SMART CHARGING
// ═══════════════════════════════════════════════════════════

async function handleSmartCharging(ctx: RouteContext, subAction: string): Promise<Response> {
  const { method } = ctx;

  switch (subAction) {
    case "set":
      if (method === "POST") return await setChargingProfile(ctx);
      return apiBadRequest("POST /ocpp/smart-charging/set");

    case "clear":
      if (method === "POST") return await clearChargingProfile(ctx);
      return apiBadRequest("POST /ocpp/smart-charging/clear");

    case "schedule":
      if (method === "GET") return await getCompositeSchedule(ctx);
      return apiBadRequest("GET /ocpp/smart-charging/schedule");

    case "profiles":
      if (method === "GET") return await listChargingProfiles(ctx);
      return apiBadRequest("GET /ocpp/smart-charging/profiles");

    default:
      return apiNotFound(`Unknown smart-charging endpoint: ${subAction}`);
  }
}

// ─── POST /api/ocpp/smart-charging/set ──────────────────────
// Sets a charging power profile on a chargepoint connector
// Body: { chargepoint_id, connector_id, profile: { stackLevel, chargingProfilePurpose, chargingProfileKind, chargingSchedule } }

async function setChargingProfile(ctx: RouteContext): Promise<Response> {
  try {
    const db = getServiceClient();
    const body = await ctx.req.json();

    const { chargepoint_id, connector_id = 0, profile } = body;
    if (!chargepoint_id) return apiBadRequest("chargepoint_id is required");
    if (!profile) return apiBadRequest("profile is required");

    // Validate profile structure
    const schedule = profile.chargingSchedule;
    if (!schedule) return apiBadRequest("profile.chargingSchedule is required");
    if (!schedule.chargingRateUnit || !["W", "A"].includes(schedule.chargingRateUnit)) {
      return apiBadRequest("chargingRateUnit must be 'W' or 'A'");
    }
    if (!schedule.chargingSchedulePeriod || !Array.isArray(schedule.chargingSchedulePeriod) || schedule.chargingSchedulePeriod.length === 0) {
      return apiBadRequest("chargingSchedulePeriod must be a non-empty array");
    }

    // Verify chargepoint exists and is connected
    const { data: cp } = await db
      .from("ocpp_chargepoints")
      .select("id, identity, is_connected")
      .eq("id", chargepoint_id)
      .single();

    if (!cp) return apiNotFound("Chargepoint not found");
    if (!cp.is_connected) return apiBadRequest(`Chargepoint ${cp.identity} is not connected`);

    // Build OCPP 1.6 SetChargingProfile payload
    const ocppPayload = {
      connectorId: connector_id,
      csChargingProfiles: {
        chargingProfileId: Math.floor(Math.random() * 100000),
        stackLevel: profile.stackLevel ?? 0,
        chargingProfilePurpose: profile.chargingProfilePurpose ?? "TxDefaultProfile",
        chargingProfileKind: profile.chargingProfileKind ?? "Absolute",
        recurrencyKind: profile.recurrencyKind ?? undefined,
        validFrom: profile.validFrom ?? undefined,
        validTo: profile.validTo ?? undefined,
        chargingSchedule: {
          duration: schedule.duration ?? undefined,
          startSchedule: schedule.startSchedule ?? undefined,
          chargingRateUnit: schedule.chargingRateUnit,
          chargingSchedulePeriod: schedule.chargingSchedulePeriod,
          minChargingRate: schedule.minChargingRate ?? undefined,
        },
      },
    };

    // Insert command into queue
    const { data: cmd, error: cmdError } = await db
      .from("ocpp_command_queue")
      .insert({
        chargepoint_id,
        command: "SetChargingProfile",
        payload: ocppPayload,
        requested_by: ctx.auth?.user.id,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      .select("id, command, status, created_at")
      .single();

    if (cmdError) throw cmdError;

    // Poll for result
    const result = await pollCommandResult(db, cmd.id, 15000);

    // If accepted, store the profile
    if (result.status === "accepted") {
      const { data: storedProfile } = await db
        .from("charging_profiles")
        .insert({
          chargepoint_id,
          connector_id,
          stack_level: profile.stackLevel ?? 0,
          purpose: profile.chargingProfilePurpose ?? "TxDefaultProfile",
          kind: profile.chargingProfileKind ?? "Absolute",
          recurrency_kind: profile.recurrencyKind ?? null,
          valid_from: profile.validFrom ?? null,
          valid_to: profile.validTo ?? null,
          schedule,
          is_active: true,
          created_by: ctx.auth?.user.id,
          command_id: cmd.id,
          admin_notes: body.admin_notes ?? null,
        })
        .select()
        .single();

      console.log(`[OCPP] Charging profile set on ${cp.identity} connector ${connector_id}: ${schedule.chargingRateUnit} ${JSON.stringify(schedule.chargingSchedulePeriod)}`);

      return apiCreated({
        command_id: cmd.id,
        chargepoint: cp.identity,
        connector_id,
        status: "accepted",
        profile: storedProfile,
        message: `Charging profile applied to ${cp.identity}`,
      });
    }

    return apiSuccess({
      command_id: cmd.id,
      chargepoint: cp.identity,
      status: result.status,
      result: result.result,
      message: result.status === "rejected"
        ? "Chargepoint rejected the charging profile"
        : `Command ${result.status}`,
    });
  } catch (err) {
    console.error("[OCPP] setChargingProfile error:", err);
    return apiServerError("Failed to set charging profile");
  }
}

// ─── POST /api/ocpp/smart-charging/clear ────────────────────
// Clears charging profile(s) from a chargepoint
// Body: { chargepoint_id, connector_id?, stack_level?, purpose? }

async function clearChargingProfile(ctx: RouteContext): Promise<Response> {
  try {
    const db = getServiceClient();
    const body = await ctx.req.json();

    const { chargepoint_id } = body;
    if (!chargepoint_id) return apiBadRequest("chargepoint_id is required");

    // Verify chargepoint
    const { data: cp } = await db
      .from("ocpp_chargepoints")
      .select("id, identity, is_connected")
      .eq("id", chargepoint_id)
      .single();

    if (!cp) return apiNotFound("Chargepoint not found");
    if (!cp.is_connected) return apiBadRequest(`Chargepoint ${cp.identity} is not connected`);

    // Build OCPP 1.6 ClearChargingProfile payload
    const ocppPayload: Record<string, unknown> = {};
    if (body.connector_id !== undefined) ocppPayload.connectorId = body.connector_id;
    if (body.stack_level !== undefined) ocppPayload.stackLevel = body.stack_level;
    if (body.purpose) ocppPayload.chargingProfilePurpose = body.purpose;

    // Send command
    const { data: cmd, error: cmdError } = await db
      .from("ocpp_command_queue")
      .insert({
        chargepoint_id,
        command: "ClearChargingProfile",
        payload: ocppPayload,
        requested_by: ctx.auth?.user.id,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      .select("id, command, status, created_at")
      .single();

    if (cmdError) throw cmdError;

    // Poll for result
    const result = await pollCommandResult(db, cmd.id, 15000);

    // If accepted, deactivate matching profiles in our DB
    if (result.status === "accepted") {
      let deactivateQuery = db
        .from("charging_profiles")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("chargepoint_id", chargepoint_id)
        .eq("is_active", true);

      if (body.connector_id !== undefined) {
        deactivateQuery = deactivateQuery.eq("connector_id", body.connector_id);
      }
      if (body.stack_level !== undefined) {
        deactivateQuery = deactivateQuery.eq("stack_level", body.stack_level);
      }
      if (body.purpose) {
        deactivateQuery = deactivateQuery.eq("purpose", body.purpose);
      }

      await deactivateQuery;

      console.log(`[OCPP] Charging profiles cleared on ${cp.identity}`);
    }

    return apiSuccess({
      command_id: cmd.id,
      chargepoint: cp.identity,
      status: result.status,
      result: result.result,
      message: result.status === "accepted"
        ? `Charging profiles cleared on ${cp.identity}`
        : `Clear command ${result.status}`,
    });
  } catch (err) {
    console.error("[OCPP] clearChargingProfile error:", err);
    return apiServerError("Failed to clear charging profile");
  }
}

// ─── GET /api/ocpp/smart-charging/schedule ──────────────────
// Gets the composite schedule from a chargepoint
// Params: ?chargepoint_id=uuid&connector_id=1&duration=3600

async function getCompositeSchedule(ctx: RouteContext): Promise<Response> {
  try {
    const db = getServiceClient();
    const chargepointId = ctx.url.searchParams.get("chargepoint_id");
    const connectorId = parseInt(ctx.url.searchParams.get("connector_id") ?? "0", 10);
    const duration = parseInt(ctx.url.searchParams.get("duration") ?? "86400", 10);

    if (!chargepointId) return apiBadRequest("chargepoint_id query param is required");

    // Verify chargepoint
    const { data: cp } = await db
      .from("ocpp_chargepoints")
      .select("id, identity, is_connected")
      .eq("id", chargepointId)
      .single();

    if (!cp) return apiNotFound("Chargepoint not found");
    if (!cp.is_connected) return apiBadRequest(`Chargepoint ${cp.identity} is not connected`);

    // Send GetCompositeSchedule command
    const { data: cmd, error: cmdError } = await db
      .from("ocpp_command_queue")
      .insert({
        chargepoint_id: chargepointId,
        command: "GetCompositeSchedule",
        payload: {
          connectorId,
          duration,
          chargingRateUnit: "W",
        },
        requested_by: ctx.auth?.user.id,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      .select("id, command, status, created_at")
      .single();

    if (cmdError) throw cmdError;

    // Poll for result
    const result = await pollCommandResult(db, cmd.id, 15000);

    return apiSuccess({
      command_id: cmd.id,
      chargepoint: cp.identity,
      connector_id: connectorId,
      duration,
      status: result.status,
      schedule: result.result,
    });
  } catch (err) {
    console.error("[OCPP] getCompositeSchedule error:", err);
    return apiServerError("Failed to get composite schedule");
  }
}

// ─── GET /api/ocpp/smart-charging/profiles ──────────────────
// List active charging profiles for a chargepoint
// Params: ?chargepoint_id=uuid&active_only=true

async function listChargingProfiles(ctx: RouteContext): Promise<Response> {
  try {
    const db = getServiceClient();
    const chargepointId = ctx.url.searchParams.get("chargepoint_id");
    const activeOnly = ctx.url.searchParams.get("active_only") !== "false";

    if (!chargepointId) return apiBadRequest("chargepoint_id query param is required");

    let query = db
      .from("charging_profiles")
      .select(`
        id, chargepoint_id, connector_id, stack_level,
        purpose, kind, recurrency_kind,
        valid_from, valid_to, schedule,
        is_active, created_by, command_id, admin_notes,
        created_at, updated_at
      `)
      .eq("chargepoint_id", chargepointId)
      .order("created_at", { ascending: false });

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) throw error;

    return apiSuccess(data ?? []);
  } catch (err) {
    console.error("[OCPP] listChargingProfiles error:", err);
    return apiServerError("Failed to fetch charging profiles");
  }
}
