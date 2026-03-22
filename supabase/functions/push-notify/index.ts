// ============================================================
// EZDrive — Push Notification Dispatcher
// Sends Expo push notifications via templates or direct payload
// Triggered via pg_notify or HTTP call from cron/trigger
// Auth: service_role or admin/operator JWT required
//
// Payload modes:
//   1. Template-based: { user_id, type, variables?, data? }
//   2. Direct:         { user_id, title, body, data? }
//   3. Mixed:          { user_id, type, variables?, title?, body?, data? }
//      (template wins; title/body used as fallback if template not found)
//
// All notifications are logged to notification_log.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const db = createClient(supabaseUrl, supabaseKey);

// ── Types ────────────────────────────────────────────────────

type NotificationType =
  | "charge_started"
  | "charge_completed"
  | "charge_error"
  | "charge_low_power"
  | "reservation_confirmed"
  | "reservation_expired"
  | "idle_fee_warning"
  | "idle_fee_applied"
  | "payment_success"
  | "payment_failed"
  | "maintenance_alert"
  | "firmware_update";

interface PushPayload {
  user_id: string;
  /** Optional — triggers template resolution */
  type?: NotificationType;
  /** Variables to interpolate into template placeholders */
  variables?: Record<string, string>;
  /** Fallback title (used when no template or type is provided) */
  title?: string;
  /** Fallback body (used when no template or type is provided) */
  body?: string;
  /** Arbitrary data forwarded to the mobile client */
  data?: Record<string, unknown>;
}

interface NotificationTemplate {
  id: string;
  type: NotificationType;
  title_template: string;
  body_template: string;
  channel: string;
  priority: string;
}

// ── Helpers ──────────────────────────────────────────────────

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Replace `{{var}}` placeholders with values from the variables map.
 * Unknown placeholders are replaced with an empty string.
 */
function interpolate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(PLACEHOLDER_RE, (_, key) => variables[key] ?? "");
}

/**
 * Resolve title + body + channel + priority from a template (if type given)
 * or fall back to the raw payload values.
 */
async function resolveNotification(
  payload: PushPayload,
): Promise<{
  title: string;
  body: string;
  channel: string;
  priority: string;
  templateId: string | null;
}> {
  const variables = payload.variables ?? {};

  if (payload.type) {
    const { data: template, error } = await db
      .from("notification_templates")
      .select("id, type, title_template, body_template, channel, priority")
      .eq("type", payload.type)
      .single<NotificationTemplate>();

    if (!error && template) {
      return {
        title: interpolate(template.title_template, variables),
        body: interpolate(template.body_template, variables),
        channel: template.channel,
        priority: template.priority,
        templateId: template.id,
      };
    }

    // Template not found — fall through to payload fallback
    console.warn(
      `[push-notify] No template for type "${payload.type}", using fallback`,
    );
  }

  // Direct / fallback mode
  return {
    title: payload.title ?? "",
    body: payload.body ?? "",
    channel: "charging",
    priority: "default",
    templateId: null,
  };
}

/**
 * Log a sent notification to the notification_log table.
 * Fire-and-forget: we don't block the response on logging.
 */
async function logNotification(params: {
  user_id: string;
  type: NotificationType | null;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  expo_ticket_id: string | null;
  status: "sent" | "no_devices" | "error";
}): Promise<void> {
  const { error } = await db.from("notification_log").insert({
    user_id: params.user_id,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data,
    expo_ticket_id: params.expo_ticket_id,
    status: params.status,
  });

  if (error) {
    console.error("[push-notify] Failed to log notification:", error.message);
  }
}

// ── Main handler ─────────────────────────────────────────────

serve(async (req) => {
  try {
    // ── Auth check: only service_role or admin/operator ──
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === supabaseKey;

    if (!isServiceRole) {
      if (!token) return jsonResponse({ error: "Unauthorized" }, 401);

      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const {
        data: { user },
        error,
      } = await userClient.auth.getUser();
      if (error || !user) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const { data: profile } = await db
        .from("ezdrive_profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || !["admin", "operator"].includes(profile.role)) {
        return jsonResponse({ error: "Forbidden — admin/operator only" }, 403);
      }
    }

    // ── Parse & validate payload ──
    const payload: PushPayload = await req.json();

    if (!payload.user_id) {
      return jsonResponse({ error: "user_id is required" }, 400);
    }
    if (!UUID_REGEX.test(payload.user_id)) {
      return jsonResponse({ error: "Invalid user_id format" }, 400);
    }

    // Must have either a type (for template) or explicit title+body
    if (!payload.type && (!payload.title || !payload.body)) {
      return jsonResponse(
        { error: "Provide 'type' for template or 'title' + 'body' for direct notification" },
        400,
      );
    }

    // ── Resolve notification content ──
    const resolved = await resolveNotification(payload);

    if (!resolved.title || !resolved.body) {
      return jsonResponse(
        { error: "Could not resolve notification content — check template or payload" },
        400,
      );
    }

    // Sanitize
    const safeTitle = resolved.title.slice(0, 100);
    const safeBody = resolved.body.slice(0, 500);

    // ── Fetch user's push tokens ──
    const { data: devices } = await db
      .from("device_registrations")
      .select("push_token, platform")
      .eq("user_id", payload.user_id)
      .not("push_token", "is", null);

    if (!devices || devices.length === 0) {
      // Log even when no devices
      await logNotification({
        user_id: payload.user_id,
        type: payload.type ?? null,
        title: safeTitle,
        body: safeBody,
        data: (payload.data as Record<string, unknown>) ?? null,
        expo_ticket_id: null,
        status: "no_devices",
      });

      return jsonResponse({ ok: true, sent: 0, reason: "no_devices" });
    }

    // ── Build Expo push messages ──
    const messages = devices.map((device) => ({
      to: device.push_token,
      title: safeTitle,
      body: safeBody,
      sound: "default",
      data: payload.data ?? {},
      channelId: resolved.channel,
      priority: resolved.priority,
    }));

    // ── Send via Expo Push API ──
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    const result = await res.json();

    // Extract first ticket id for logging (Expo returns an array of tickets)
    const firstTicketId: string | null =
      result?.data?.[0]?.id ?? null;

    // ── Log each notification per device ──
    const logPromises = devices.map((_, idx) => {
      const ticketId: string | null = result?.data?.[idx]?.id ?? null;
      const ticketStatus: string = result?.data?.[idx]?.status ?? "unknown";

      return logNotification({
        user_id: payload.user_id,
        type: payload.type ?? null,
        title: safeTitle,
        body: safeBody,
        data: (payload.data as Record<string, unknown>) ?? null,
        expo_ticket_id: ticketId,
        status: ticketStatus === "ok" ? "sent" : "error",
      });
    });

    await Promise.all(logPromises);

    return jsonResponse({
      ok: true,
      sent: messages.length,
      template_used: resolved.templateId,
      expo_response: result,
    });
  } catch (err) {
    console.error("[push-notify] Error:", String(err));
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
