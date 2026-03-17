// ============================================================
// EZDrive — Push Notification Dispatcher
// Sends Expo push notifications when charging sessions complete
// Triggered via pg_notify or HTTP call from cron/trigger
// Auth: service_role or admin/operator JWT required
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const db = createClient(supabaseUrl, supabaseKey);

interface PushPayload {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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
      const { data: { user }, error } = await userClient.auth.getUser();
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

    const payload: PushPayload = await req.json();

    if (!payload.user_id || !payload.title || !payload.body) {
      return jsonResponse({ error: "user_id, title, and body required" }, 400);
    }

    // Validate user_id format (UUID)
    if (!UUID_REGEX.test(payload.user_id)) {
      return jsonResponse({ error: "Invalid user_id format" }, 400);
    }

    // Sanitize title and body length
    const safeTitle = String(payload.title).slice(0, 100);
    const safeBody = String(payload.body).slice(0, 500);

    // Get user's push tokens
    const { data: devices } = await db
      .from("device_registrations")
      .select("push_token, platform")
      .eq("user_id", payload.user_id)
      .not("push_token", "is", null);

    if (!devices || devices.length === 0) {
      return jsonResponse({ ok: true, sent: 0, reason: "no_devices" });
    }

    // Build Expo push messages
    const messages = devices.map((device) => ({
      to: device.push_token,
      title: safeTitle,
      body: safeBody,
      sound: "default",
      data: payload.data ?? {},
      channelId: "charging",
    }));

    // Send via Expo Push API
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    const result = await res.json();

    return jsonResponse({ ok: true, sent: messages.length, expo_response: result });
  } catch (err) {
    console.error("[push-notify] Error:", String(err));
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
