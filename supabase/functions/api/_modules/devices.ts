// ============================================================
// EZDrive Consumer API — Devices Module
// Push notification device registration
// Port from Resonovia user-service devices.py
// ============================================================

import {
  apiSuccess,
  apiCreated,
  apiBadRequest,
  apiServerError,
} from "../../_shared/api-response.ts";
import { getServiceClient } from "../../_shared/auth-middleware.ts";
import type { RouteContext } from "../index.ts";

export async function handleDevices(ctx: RouteContext): Promise<Response> {
  const { method, segments } = ctx;
  const deviceId = segments[0] ?? "";

  switch (method) {
    case "GET":
      return listDevices(ctx);

    case "POST":
      return registerDevice(ctx);

    case "PUT":
      if (deviceId) return updateDevice(ctx, deviceId);
      return apiBadRequest("Device ID required");

    case "DELETE":
      if (deviceId) return unregisterDevice(ctx, deviceId);
      return apiBadRequest("Device ID required");

    default:
      return apiBadRequest("Unsupported method");
  }
}

// ─── List devices ───────────────────────────────────────────

async function listDevices(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();

  const { data, error } = await db
    .from("device_registrations")
    .select("*")
    .eq("user_id", ctx.auth!.user.id)
    .eq("is_active", true)
    .order("last_seen_at", { ascending: false });

  if (error) return apiServerError("Failed to fetch devices");
  return apiSuccess(data ?? []);
}

// ─── Register device ────────────────────────────────────────

async function registerDevice(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const body = await ctx.req.json();
  const userId = ctx.auth!.user.id;

  if (!body.device_id || !body.platform) {
    return apiBadRequest("device_id and platform required");
  }

  if (!["ANDROID", "IOS", "WEB"].includes(body.platform)) {
    return apiBadRequest("platform must be ANDROID, IOS, or WEB");
  }

  // Upsert: update if same device_id exists
  const { data, error } = await db
    .from("device_registrations")
    .upsert({
      user_id: userId,
      device_id: body.device_id,
      platform: body.platform,
      push_token: body.push_token ?? null,
      app_version: body.app_version ?? null,
      os_version: body.os_version ?? null,
      device_model: body.device_model ?? null,
      is_active: true,
      last_seen_at: new Date().toISOString(),
    }, {
      onConflict: "user_id,device_id",
    })
    .select()
    .single();

  if (error) {
    console.error("[Devices] Register error:", error);
    return apiServerError("Failed to register device");
  }

  return apiCreated(data);
}

// ─── Update device (push token refresh) ─────────────────────

async function updateDevice(ctx: RouteContext, deviceId: string): Promise<Response> {
  const db = getServiceClient();
  const body = await ctx.req.json();

  const allowed: Record<string, unknown> = {};
  const fields = ["push_token", "app_version", "os_version", "device_model"];

  for (const f of fields) {
    if (body[f] !== undefined) allowed[f] = body[f];
  }

  allowed.last_seen_at = new Date().toISOString();

  const { data, error } = await db
    .from("device_registrations")
    .update(allowed)
    .eq("id", deviceId)
    .eq("user_id", ctx.auth!.user.id)
    .select()
    .single();

  if (error) return apiServerError("Failed to update device");
  return apiSuccess(data);
}

// ─── Unregister device ──────────────────────────────────────

async function unregisterDevice(ctx: RouteContext, deviceId: string): Promise<Response> {
  const db = getServiceClient();

  // Soft delete: mark as inactive
  const { error } = await db
    .from("device_registrations")
    .update({ is_active: false })
    .eq("id", deviceId)
    .eq("user_id", ctx.auth!.user.id);

  if (error) return apiServerError("Failed to unregister device");
  return apiSuccess({ unregistered: true });
}
