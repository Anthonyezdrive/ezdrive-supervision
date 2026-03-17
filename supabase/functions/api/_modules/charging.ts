// ============================================================
// EZDrive Consumer API — Charging Module
// Dual routing: OCPP direct (via command queue) or ROAD proxy
// CDC: Pay-per-session via Stripe PaymentIntent
// ============================================================

import {
  apiSuccess,
  apiCreated,
  apiBadRequest,
  apiNotFound,
  apiServerError,
} from "../../_shared/api-response.ts";
import { getServiceClient } from "../../_shared/auth-middleware.ts";
import { createPaymentIntent } from "../../_shared/stripe-client.ts";
import { isFeatureEnabled, TOGGLES } from "../../_shared/feature-toggles.ts";
import type { RouteContext } from "../index.ts";

const ROAD_BASE_URL = Deno.env.get("ROAD_BASE_URL") ?? "https://api.e-flux.nl";
const ROAD_API_TOKEN = Deno.env.get("ROAD_API_TOKEN") ?? "";
const GFX_BASE_URL = Deno.env.get("GFX_BASE_URL") ?? "https://platform.greenflux.com/api/1.0";
const GFX_API_KEY = Deno.env.get("GFX_API_KEY_PROD") ?? "";

export async function handleCharging(ctx: RouteContext): Promise<Response> {
  const { method, segments } = ctx;
  const module = segments[0] ?? "";
  const action = segments[1] ?? "";

  // GreenFlux CDR proxy
  if (module === "greenflux") {
    return handleGreenFlux(ctx);
  }

  // Sessions routes
  if (module === "sessions") {
    switch (action) {
      case "start":
        if (method === "POST") return startSession(ctx);
        return apiBadRequest("POST required");

      case "stop":
        if (method === "POST") return stopSession(ctx);
        return apiBadRequest("POST required");

      default:
        if (method === "GET") {
          if (action) return getSession(ctx, action);
          return listSessions(ctx);
        }
        return apiBadRequest("Unsupported method");
    }
  }

  // Direct charging routes (backwards compat)
  if (module === "charging") {
    switch (action) {
      case "start":
        if (method === "POST") return startSession(ctx);
        return apiBadRequest("POST required");

      case "stop":
        if (method === "POST") return stopSession(ctx);
        return apiBadRequest("POST required");

      case "status":
        if (method === "GET") return getChargingStatus(ctx);
        return apiBadRequest("GET required");

      case "estimate":
        if (method === "POST") return estimateSessionCost(ctx);
        return apiBadRequest("POST required");

      case "bill":
        if (method === "POST") return billCompletedSession(ctx);
        return apiBadRequest("POST required");

      default:
        return apiBadRequest("Unknown charging action");
    }
  }

  return apiBadRequest("Unknown charging endpoint");
}

// ─── ROAD API Helper ────────────────────────────────────────

async function roadUserFetch(
  path: string,
  userId: string,
  options?: RequestInit,
): Promise<Response> {
  // Get user's ROAD account ID
  const db = getServiceClient();
  const { data: profile } = await db
    .from("consumer_profiles")
    .select("road_user_id")
    .eq("id", userId)
    .single();

  if (!profile?.road_user_id) {
    throw new Error("User has no ROAD account linked");
  }

  const url = `${ROAD_BASE_URL}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${ROAD_API_TOKEN}`,
      "Content-Type": "application/json",
      "X-Account-Id": profile.road_user_id,
      ...options?.headers,
    },
  });
}

// ─── List sessions (unified ROAD + OCPP) ────────────────────

async function listSessions(ctx: RouteContext): Promise<Response> {
  const userId = ctx.auth!.user.id;
  const db = getServiceClient();

  // 1) Fetch OCPP sessions from DB (always available)
  let normalizedOcpp: Record<string, unknown>[] = [];
  try {
    const { data: ocppSessions } = await db
      .from("ocpp_transactions")
      .select(`
        id, connector_id, ocpp_transaction_id, id_tag,
        meter_start, meter_stop, energy_kwh,
        started_at, stopped_at, stop_reason, status,
        chargepoint_id
      `)
      .eq("consumer_id", userId)
      .order("started_at", { ascending: false })
      .limit(50);

    normalizedOcpp = (ocppSessions ?? []).map((tx) => ({
      id: tx.id,
      source: "ocpp",
      status: tx.status === "Active" ? "ACTIVE" : "COMPLETED",
      started_at: tx.started_at,
      stopped_at: tx.stopped_at,
      energy_kwh: tx.energy_kwh ? Number(tx.energy_kwh) : null,
      stop_reason: tx.stop_reason,
      connector_id: tx.connector_id,
      meter_start: tx.meter_start,
      meter_stop: tx.meter_stop,
    }));
  } catch (err) {
    console.error("[Charging] OCPP sessions fetch error:", err);
  }

  // 2) Fetch ROAD sessions (may fail if user has no ROAD account)
  let normalizedRoad: Record<string, unknown>[] = [];
  try {
    const res = await roadUserFetch(
      "/api/v1/sessions?sort=-startDate&limit=50",
      userId,
    );
    if (res.ok) {
      const data = await res.json();
      const roadResults = data.results ?? data;
      normalizedRoad = (Array.isArray(roadResults) ? roadResults : []).map(
        (s: Record<string, unknown>) => ({
          ...s,
          source: "road",
        }),
      );
    }
  } catch {
    // User has no ROAD account or ROAD unavailable — that's OK
  }

  // 3) Merge and sort by date descending
  const allSessions = [...normalizedOcpp, ...normalizedRoad]
    .sort((a, b) => {
      const dateA = new Date(
        (a.started_at as string) || (a.startDate as string) || 0,
      ).getTime();
      const dateB = new Date(
        (b.started_at as string) || (b.startDate as string) || 0,
      ).getTime();
      return dateB - dateA;
    })
    .slice(0, 50);

  return apiSuccess(allSessions);
}

// ─── Get session detail (OCPP or ROAD) ──────────────────────

async function getSession(ctx: RouteContext, sessionId: string): Promise<Response> {
  const userId = ctx.auth!.user.id;
  const db = getServiceClient();

  // 1) Try OCPP transaction first (if sessionId looks like UUID)
  if (sessionId.includes("-")) {
    try {
      const { data: tx } = await db
        .from("ocpp_transactions")
        .select(`
          id, connector_id, ocpp_transaction_id, id_tag,
          meter_start, meter_stop, energy_kwh,
          started_at, stopped_at, stop_reason, status,
          chargepoint_id
        `)
        .eq("id", sessionId)
        .eq("consumer_id", userId)
        .single();

      if (tx) {
        // Get latest meter values for live data
        const { data: meter } = await db
          .from("ocpp_meter_values")
          .select("energy_wh, power_w, current_a, voltage_v, soc_percent, timestamp")
          .eq("transaction_id", tx.id)
          .order("timestamp", { ascending: false })
          .limit(1)
          .single();

        return apiSuccess({
          ...tx,
          source: "ocpp",
          live_meter: meter ?? null,
        });
      }
    } catch {
      // Not found in OCPP — fall through to ROAD
    }
  }

  // 2) Fallback: ROAD session
  try {
    const res = await roadUserFetch(`/api/v1/sessions/${sessionId}`, userId);
    if (!res.ok) return apiNotFound("Session not found");
    const data = await res.json();
    return apiSuccess({ ...data, source: "road" });
  } catch (err) {
    console.error("[Charging] Session detail error:", err);
    return apiServerError("Failed to fetch session");
  }
}

// ─── OCPP Helper: get station source and chargepoint ────────

async function getStationSource(stationId: string) {
  const db = getServiceClient();
  const { data: station } = await db
    .from("stations")
    .select("id, source, ocpp_identity, road_id")
    .eq("id", stationId)
    .single();
  return station;
}

async function getChargepointByIdentity(ocppIdentity: string) {
  const db = getServiceClient();
  const { data: cp } = await db
    .from("ocpp_chargepoints")
    .select("id, identity, is_connected")
    .eq("identity", ocppIdentity)
    .single();
  return cp;
}

// ─── OCPP: Insert command into queue ────────────────────────

async function sendOcppCommand(
  chargepointId: string,
  command: string,
  payload: Record<string, unknown>,
  requestedBy?: string,
) {
  const db = getServiceClient();
  const { data, error } = await db
    .from("ocpp_command_queue")
    .insert({
      chargepoint_id: chargepointId,
      command,
      payload,
      requested_by: requestedBy ?? null,
    })
    .select("id, status, created_at")
    .single();

  if (error) throw error;
  return data;
}

// ─── OCPP: Poll command result ──────────────────────────────

async function pollCommandResult(commandId: string, maxWaitMs = 15000) {
  const db = getServiceClient();
  const pollInterval = 1000;
  const maxAttempts = Math.ceil(maxWaitMs / pollInterval);

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const { data } = await db
      .from("ocpp_command_queue")
      .select("id, status, result")
      .eq("id", commandId)
      .single();

    if (data && data.status !== "pending" && data.status !== "sent") {
      return data;
    }
  }

  // Return last known state
  const { data } = await db
    .from("ocpp_command_queue")
    .select("id, status, result")
    .eq("id", commandId)
    .single();
  return data;
}

// ─── Start charging session ─────────────────────────────────

async function startSession(ctx: RouteContext): Promise<Response> {
  const userId = ctx.auth!.user.id;
  const body = await ctx.req.json();

  // Accept station_id for OCPP routing
  const stationId = body.station_id;

  // If station_id provided, check if it's an OCPP station
  if (stationId) {
    try {
      const station = await getStationSource(stationId);
      if (station?.source === "ocpp" && station.ocpp_identity) {
        return await startSessionOcpp(station, body, userId);
      }
    } catch (err) {
      console.error("[Charging] Station lookup error:", err);
    }
  }

  // Fallback: ROAD proxy (existing behavior)
  if (!body.evse_id && !body.connector_id) {
    return apiBadRequest("evse_id or connector_id required");
  }

  try {
    const res = await roadUserFetch(
      "/api/v1/sessions/start",
      userId,
      {
        method: "POST",
        body: JSON.stringify({
          evse_id: body.evse_id,
          connector_id: body.connector_id,
          token_uid: body.token_uid,
          auth_method: body.auth_method ?? "APP",
        }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("[Charging] ROAD start session error:", err);
      return apiServerError("Failed to start charging session");
    }

    const data = await res.json();
    return apiCreated(data);
  } catch (err) {
    console.error("[Charging] ROAD start error:", err);
    return apiServerError("Failed to start charging session");
  }
}

// ─── OCPP Start: via command queue ──────────────────────────

async function startSessionOcpp(
  station: { id: string; ocpp_identity: string },
  body: Record<string, unknown>,
  userId: string,
): Promise<Response> {
  const cp = await getChargepointByIdentity(station.ocpp_identity);
  if (!cp) {
    return apiServerError("Chargepoint not registered in OCPP server");
  }
  if (!cp.is_connected) {
    return apiServerError("Chargepoint is currently offline");
  }

  // ── Input validation ──
  const rawConnectorId = Number(body.connector_id ?? 1);
  if (!Number.isInteger(rawConnectorId) || rawConnectorId < 1 || rawConnectorId > 99) {
    return apiBadRequest("Invalid connector_id (must be 1-99)");
  }
  const connectorId = rawConnectorId;

  const rawTokenUid = String(body.token_uid ?? body.id_tag ?? "APP-TOKEN").trim();
  if (rawTokenUid.length === 0 || rawTokenUid.length > 36 || !/^[A-Za-z0-9\-_]+$/.test(rawTokenUid)) {
    return apiBadRequest("Invalid token_uid format");
  }
  const tokenUid = rawTokenUid;

  try {
    const cmd = await sendOcppCommand(
      cp.id,
      "RemoteStartTransaction",
      { connectorId: Number(connectorId), idTag: String(tokenUid) },
      userId,
    );

    // Poll for result (up to 15s)
    const result = await pollCommandResult(cmd.id, 15000);

    if (result?.status === "accepted") {
      return apiCreated({
        command_id: cmd.id,
        status: "accepted",
        message: "Charging session started via OCPP",
        station_id: station.id,
        connector_id: connectorId,
      });
    } else if (result?.status === "rejected") {
      return apiServerError("Chargepoint rejected the start command");
    } else {
      // Still pending/sent — return async reference
      return apiCreated({
        command_id: cmd.id,
        status: result?.status ?? "pending",
        message: "Command sent, waiting for chargepoint response",
        station_id: station.id,
      });
    }
  } catch (err) {
    console.error("[Charging] OCPP start error:", err);
    return apiServerError("Failed to send start command to chargepoint");
  }
}

// ─── Stop charging session ──────────────────────────────────

async function stopSession(ctx: RouteContext): Promise<Response> {
  const userId = ctx.auth!.user.id;
  const body = await ctx.req.json();

  // If station_id provided, check for OCPP
  const stationId = body.station_id;
  if (stationId) {
    try {
      const station = await getStationSource(stationId);
      if (station?.source === "ocpp" && station.ocpp_identity) {
        return await stopSessionOcpp(station, body, userId);
      }
    } catch (err) {
      console.error("[Charging] Station lookup error:", err);
    }
  }

  // Fallback: ROAD proxy
  if (!body.session_id) {
    return apiBadRequest("session_id required");
  }

  try {
    const res = await roadUserFetch(
      `/api/v1/sessions/${body.session_id}/stop`,
      userId,
      { method: "POST" },
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("[Charging] ROAD stop session error:", err);
      return apiServerError("Failed to stop charging session");
    }

    const data = await res.json();
    return apiSuccess(data);
  } catch (err) {
    console.error("[Charging] ROAD stop error:", err);
    return apiServerError("Failed to stop charging session");
  }
}

// ─── OCPP Stop: via command queue ───────────────────────────

async function stopSessionOcpp(
  station: { id: string; ocpp_identity: string },
  body: Record<string, unknown>,
  userId: string,
): Promise<Response> {
  const cp = await getChargepointByIdentity(station.ocpp_identity);
  if (!cp) {
    return apiServerError("Chargepoint not registered");
  }
  if (!cp.is_connected) {
    return apiServerError("Chargepoint is currently offline");
  }

  // Find active OCPP transaction to get the transactionId
  const db = getServiceClient();
  const transactionId = body.transaction_id ?? body.ocpp_transaction_id;

  let ocppTxId: number;
  if (transactionId) {
    ocppTxId = Number(transactionId);
    // ── Ownership check: verify this transaction belongs to the user ──
    const { data: ownerCheck } = await db
      .from("ocpp_transactions")
      .select("consumer_id")
      .eq("ocpp_transaction_id", ocppTxId)
      .eq("chargepoint_id", cp.id)
      .single();
    if (ownerCheck && ownerCheck.consumer_id && ownerCheck.consumer_id !== userId) {
      return apiBadRequest("This charging session does not belong to you");
    }
  } else {
    // Find last active transaction on this chargepoint OWNED BY this user
    const { data: tx } = await db
      .from("ocpp_transactions")
      .select("ocpp_transaction_id, consumer_id")
      .eq("chargepoint_id", cp.id)
      .eq("status", "Active")
      .order("started_at", { ascending: false })
      .limit(1)
      .single();

    if (!tx) {
      return apiBadRequest("No active charging session found on this chargepoint");
    }
    // Verify ownership if consumer_id is set
    if (tx.consumer_id && tx.consumer_id !== userId) {
      return apiBadRequest("Active session on this chargepoint belongs to another user");
    }
    ocppTxId = tx.ocpp_transaction_id;
  }

  try {
    const cmd = await sendOcppCommand(
      cp.id,
      "RemoteStopTransaction",
      { transactionId: ocppTxId },
      userId,
    );

    const result = await pollCommandResult(cmd.id, 15000);

    if (result?.status === "accepted") {
      return apiSuccess({
        command_id: cmd.id,
        status: "accepted",
        message: "Charging session stopped via OCPP",
        station_id: station.id,
      });
    } else if (result?.status === "rejected") {
      return apiServerError("Chargepoint rejected the stop command");
    } else {
      return apiSuccess({
        command_id: cmd.id,
        status: result?.status ?? "pending",
        message: "Stop command sent, waiting for chargepoint response",
      });
    }
  } catch (err) {
    console.error("[Charging] OCPP stop error:", err);
    return apiServerError("Failed to send stop command to chargepoint");
  }
}

// ─── Charging status ────────────────────────────────────────

async function getChargingStatus(ctx: RouteContext): Promise<Response> {
  const userId = ctx.auth!.user.id;
  const sessionId = ctx.url.searchParams.get("session_id");
  const stationId = ctx.url.searchParams.get("station_id");
  const commandId = ctx.url.searchParams.get("command_id");

  // Check OCPP command status — only own commands
  if (commandId) {
    const db = getServiceClient();
    const { data: cmd } = await db
      .from("ocpp_command_queue")
      .select("id, command, status, result, created_at, processed_at, requested_by")
      .eq("id", commandId)
      .single();

    if (!cmd) return apiNotFound("Command not found");
    // Ownership check: only return commands requested by this user
    if (cmd.requested_by && cmd.requested_by !== userId) {
      return apiNotFound("Command not found");
    }
    const { requested_by: _, ...safeCmd } = cmd;
    return apiSuccess(safeCmd);
  }

  // Check OCPP station active transaction
  if (stationId) {
    try {
      const station = await getStationSource(stationId);
      if (station?.source === "ocpp" && station.ocpp_identity) {
        const cp = await getChargepointByIdentity(station.ocpp_identity);
        if (!cp) return apiNotFound("Chargepoint not registered");

        const db = getServiceClient();
        const { data: tx } = await db
          .from("ocpp_transactions")
          .select(`
            id, connector_id, ocpp_transaction_id, id_tag,
            meter_start, energy_kwh, started_at, status
          `)
          .eq("chargepoint_id", cp.id)
          .eq("status", "Active")
          .order("started_at", { ascending: false })
          .limit(1)
          .single();

        if (!tx) {
          return apiSuccess({
            station_id: stationId,
            status: "idle",
            is_charging: false,
            chargepoint_connected: cp.is_connected,
          });
        }

        // Get latest meter values
        const { data: meter } = await db
          .from("ocpp_meter_values")
          .select("energy_wh, power_w, current_a, voltage_v, soc_percent, timestamp")
          .eq("transaction_id", tx.id)
          .order("timestamp", { ascending: false })
          .limit(1)
          .single();

        return apiSuccess({
          station_id: stationId,
          status: "charging",
          is_charging: true,
          transaction: tx,
          live_meter: meter ?? null,
          chargepoint_connected: cp.is_connected,
        });
      }
    } catch (err) {
      console.error("[Charging] OCPP status error:", err);
    }
  }

  // Fallback: ROAD proxy
  if (!sessionId) {
    return apiBadRequest("session_id or station_id query parameter required");
  }

  try {
    const res = await roadUserFetch(
      `/api/v1/sessions/${sessionId}/status`,
      userId,
    );

    if (!res.ok) {
      return apiNotFound("Session not found");
    }

    const data = await res.json();
    return apiSuccess(data);
  } catch (err) {
    console.error("[Charging] Status error:", err);
    return apiServerError("Failed to fetch charging status");
  }
}

// ─── Pay-per-session: Estimate cost ─────────────────────────

async function estimateSessionCost(ctx: RouteContext): Promise<Response> {
  const body = await ctx.req.json();
  const { station_id, energy_kwh, duration_min } = body;

  if (!station_id || !energy_kwh) {
    return apiBadRequest("station_id and energy_kwh required");
  }

  const db = getServiceClient();
  const userId = ctx.auth!.user.id;

  try {
    const cost = await calculateSessionCost(db, station_id, Number(energy_kwh), Number(duration_min ?? 0), userId);
    return apiSuccess(cost);
  } catch (err) {
    console.error("[Charging] Estimate error:", err);
    return apiServerError("Failed to estimate cost");
  }
}

// ─── Pay-per-session: Bill completed session ────────────────

async function billCompletedSession(ctx: RouteContext): Promise<Response> {
  const body = await ctx.req.json();
  const { transaction_id } = body;

  if (!transaction_id) {
    return apiBadRequest("transaction_id required");
  }

  // Check feature toggle
  const payPerSessionEnabled = await isFeatureEnabled(TOGGLES.ENABLE_PAY_PER_SESSION, true);
  if (!payPerSessionEnabled) {
    return apiBadRequest("Pay-per-session is not enabled");
  }

  const db = getServiceClient();
  const userId = ctx.auth!.user.id;

  // Get completed transaction
  const { data: tx } = await db
    .from("ocpp_transactions")
    .select("id, energy_kwh, started_at, stopped_at, chargepoint_id, status, consumer_id")
    .eq("id", transaction_id)
    .maybeSingle();

  if (!tx) return apiNotFound("Transaction not found");
  if (tx.consumer_id && tx.consumer_id !== userId) {
    return apiBadRequest("Transaction does not belong to this user");
  }
  if (tx.status !== "Completed") {
    return apiBadRequest("Transaction is not completed yet");
  }

  // Check if already billed
  const { data: existingInvoice } = await db
    .from("invoices")
    .select("id, status")
    .eq("line_items", `[{"transaction_id":"${transaction_id}"}]`)
    .maybeSingle();

  // Better check: look for invoice with this transaction in line_items
  const { data: existingInvoices } = await db
    .from("invoices")
    .select("id, status")
    .eq("user_id", userId)
    .eq("type", "session")
    .not("status", "eq", "cancelled");

  // Check line_items for this transaction_id
  const alreadyBilled = (existingInvoices ?? []).some((inv) => {
    const items = inv.line_items as Array<Record<string, unknown>> | undefined;
    return items?.some((item) => item.transaction_id === transaction_id);
  });

  if (alreadyBilled) {
    return apiBadRequest("This session has already been billed");
  }

  // Calculate cost
  const energyKwh = Number(tx.energy_kwh ?? 0);
  const durationMin = tx.stopped_at && tx.started_at
    ? Math.round((new Date(tx.stopped_at).getTime() - new Date(tx.started_at).getTime()) / 60000)
    : 0;

  // Get station info
  let stationId: string | null = null;
  let stationName = "Borne EZDrive";
  let stationCity = "";

  if (tx.chargepoint_id) {
    const { data: cp } = await db
      .from("ocpp_chargepoints")
      .select("station_id")
      .eq("id", tx.chargepoint_id)
      .maybeSingle();

    if (cp?.station_id) {
      stationId = cp.station_id;
      const { data: station } = await db
        .from("stations")
        .select("name, city")
        .eq("id", cp.station_id)
        .maybeSingle();
      if (station) {
        stationName = station.name ?? stationName;
        stationCity = station.city ?? "";
      }
    }
  }

  const cost = await calculateSessionCost(
    db,
    stationId ?? "",
    energyKwh,
    durationMin,
    userId,
  );

  if (cost.totalCents <= 0) {
    return apiSuccess({
      message: "No charge for this session",
      cost,
    });
  }

  // Get or create Stripe customer
  let stripeCustomerId: string | null = null;
  try {
    const { data: profile } = await db
      .from("consumer_profiles")
      .select("stripe_customer_id, email, full_name")
      .eq("id", userId)
      .maybeSingle();

    stripeCustomerId = profile?.stripe_customer_id ?? null;

    if (!stripeCustomerId) {
      const { createCustomer } = await import("../../_shared/stripe-client.ts");
      const customer = await createCustomer({
        email: profile?.email ?? ctx.auth!.user.email,
        name: profile?.full_name ?? undefined,
        metadata: { ezdrive_user_id: userId },
      });
      stripeCustomerId = customer.id;

      await db
        .from("consumer_profiles")
        .update({ stripe_customer_id: customer.id })
        .eq("id", userId);
    }
  } catch (err) {
    console.error("[Charging] Stripe customer error:", err);
    return apiServerError("Failed to setup payment");
  }

  // Create PaymentIntent
  try {
    const pi = await createPaymentIntent({
      amountCents: cost.totalCents,
      currency: "eur",
      customerId: stripeCustomerId!,
      description: `Recharge EZDrive - ${stationName} - ${energyKwh.toFixed(2)} kWh`,
      metadata: {
        ezdrive_user_id: userId,
        transaction_id: transaction_id,
        station_name: stationName,
        energy_kwh: energyKwh.toFixed(2),
        duration_min: String(durationMin),
      },
    });

    // Generate invoice number
    const { data: invNum } = await db.rpc("generate_invoice_number");
    const invoiceNumber = invNum ?? `EZD-${new Date().getFullYear()}-${Date.now()}`;

    // Create invoice in DB
    const { data: invoice, error: invErr } = await db
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        user_id: userId,
        period_start: tx.started_at,
        period_end: tx.stopped_at ?? new Date().toISOString(),
        subtotal_cents: cost.subtotalCents,
        vat_cents: cost.vatCents,
        total_cents: cost.totalCents,
        vat_rate: cost.vatRate,
        line_items: [{
          date: tx.started_at,
          station_name: stationName,
          station_city: stationCity,
          energy_kwh: energyKwh,
          duration_min: durationMin,
          amount_cents: cost.subtotalCents,
          transaction_id: transaction_id,
          description: `Recharge ${energyKwh.toFixed(2)} kWh - ${durationMin} min`,
        }],
        stripe_payment_intent_id: pi.id,
        type: "session",
        status: "draft",
      })
      .select()
      .single();

    if (invErr) {
      console.error("[Charging] Invoice creation error:", invErr);
    }

    return apiCreated({
      payment_intent_id: pi.id,
      client_secret: pi.client_secret,
      amount_cents: cost.totalCents,
      currency: "eur",
      invoice_id: invoice?.id,
      cost_breakdown: cost,
    });
  } catch (err) {
    console.error("[Charging] PaymentIntent error:", err);
    return apiServerError("Failed to create payment");
  }
}

// ─── Tariff calculation engine ──────────────────────────────

async function calculateSessionCost(
  db: ReturnType<typeof getServiceClient>,
  stationId: string,
  energyKwh: number,
  durationMin: number,
  userId: string,
): Promise<{
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  vatRate: number;
  discountPercent: number;
  breakdown: { energy_cents: number; time_cents: number; flat_cents: number };
  tariff_name: string;
}> {
  // 1. Get subscription discount
  const discountPercent = await getSubscriptionDiscount(db, userId);

  // 2. Get station tariff
  let tariffName = "Standard";
  let energyCents = 0;
  let timeCents = 0;
  let flatCents = 0;

  if (stationId) {
    const { data: stationTariff } = await db
      .from("station_tariffs")
      .select("tariff_id")
      .eq("station_id", stationId)
      .is("valid_to", null)
      .order("priority", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (stationTariff?.tariff_id) {
      const { data: tariff } = await db
        .from("ocpi_tariffs")
        .select("tariff_id, elements, currency")
        .eq("id", stationTariff.tariff_id)
        .maybeSingle();

      if (tariff?.elements) {
        tariffName = tariff.tariff_id ?? "Custom";

        const elements = tariff.elements as Array<{
          price_components: Array<{ type: string; price: number; step_size: number }>;
        }>;

        for (const element of elements) {
          for (const comp of element.price_components ?? []) {
            switch (comp.type) {
              case "ENERGY":
                energyCents += Math.round(energyKwh * comp.price * 100);
                break;
              case "TIME":
                timeCents += Math.round((durationMin / 60) * comp.price * 100);
                break;
              case "FLAT":
                flatCents += Math.round(comp.price * 100);
                break;
            }
          }
        }
      }
    }
  }

  // Fallback: default 0.35€/kWh
  if (energyCents === 0 && timeCents === 0 && flatCents === 0) {
    energyCents = Math.round(energyKwh * 35); // 0.35€/kWh in cents
    tariffName = "STANDARD";
  }

  // 3. Apply discount
  const subtotalBeforeDiscount = energyCents + timeCents + flatCents;
  const discountAmount = Math.round(subtotalBeforeDiscount * (discountPercent / 100));
  const subtotalCents = subtotalBeforeDiscount - discountAmount;

  // 4. VAT DOM-TOM (8.5%)
  const vatRate = 8.5;
  const vatCents = Math.round(subtotalCents * (vatRate / 100));
  const totalCents = subtotalCents + vatCents;

  return {
    subtotalCents,
    vatCents,
    totalCents,
    vatRate,
    discountPercent,
    breakdown: {
      energy_cents: energyCents,
      time_cents: timeCents,
      flat_cents: flatCents,
    },
    tariff_name: tariffName,
  };
}

async function getSubscriptionDiscount(
  db: ReturnType<typeof getServiceClient>,
  userId: string,
): Promise<number> {
  const { data: sub } = await db
    .from("user_subscriptions")
    .select("offer_id, subscription_offers(discount_percent)")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) return 0;
  const offer = sub.subscription_offers as unknown as { discount_percent: number } | null;
  return offer?.discount_percent ?? 0;
}

// ─── GreenFlux CDR proxy ────────────────────────────────────
// Port from Resonovia greenflux_router.py

async function handleGreenFlux(ctx: RouteContext): Promise<Response> {
  const segments = ctx.segments;
  // /api/greenflux/cdr/{cdr_id}/authid/{auth_id}
  if (segments[1] === "cdr" && segments[3] === "authid") {
    const cdrId = segments[2];
    const authId = segments[4];
    return getGreenFluxCdr(cdrId, authId);
  }

  return apiBadRequest("Unknown GreenFlux endpoint");
}

async function getGreenFluxCdr(cdrId: string, authId: string): Promise<Response> {
  if (!GFX_API_KEY || !GFX_BASE_URL) {
    return apiServerError("GreenFlux not configured");
  }

  try {
    // GFX_BASE_URL is the platform base (e.g. https://platform.greenflux.com/api/1.0)
    // CDR endpoint uses ChargeAssist API: https://ca-api.chargeassist.app/api/v1/cdr/...
    const gfxCdrBase = "https://ca-api.chargeassist.app";
    const res = await fetch(
      `${gfxCdrBase}/api/v1/cdr/${cdrId}/authid/${authId}`,
      {
        headers: {
          Authorization: `Token ${GFX_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!res.ok) {
      return apiNotFound("CDR not found");
    }

    const data = await res.json();
    return apiSuccess(data);
  } catch (err) {
    console.error("[GreenFlux] CDR error:", err);
    return apiServerError("Failed to fetch CDR");
  }
}
