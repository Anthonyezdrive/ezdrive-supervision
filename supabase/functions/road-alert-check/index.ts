// ============================================
// Edge Function: Road Alert Check
// Monitors Road.io station connectivity changes
// and writes to existing alert_history table
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "alerts@ezdrive.re";
const DASHBOARD_URL = "https://ezdrive-supervision.vercel.app/monitoring";

interface AlertResult {
  disconnections: number;
  recoveries: number;
  extended_outages: number;
  emails_sent: number;
  errors: string[];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const result: AlertResult = {
    disconnections: 0,
    recoveries: 0,
    extended_outages: 0,
    emails_sent: 0,
    errors: [],
  };

  try {
    // 1. Load active alert rules for our types
    const { data: rules } = await supabase
      .from("alert_rules")
      .select("*")
      .in("alert_type", ["disconnection", "recovery", "extended_outage"])
      .eq("is_active", true);

    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ ...result, message: "No active Road alert rules" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Load Road stations with their current state
    const { data: stations } = await supabase
      .from("stations_enriched")
      .select("id, name, cpo_name, cpo_code, connectivity_status, ocpp_status, hours_in_status, source, territory_name")
      .eq("source", "road");

    if (!stations || stations.length === 0) {
      return new Response(JSON.stringify({ ...result, message: "No Road stations found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Load recent alerts for cooldown check (last 48h)
    const cooldownCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: recentAlerts } = await supabase
      .from("alert_history")
      .select("station_id, alert_type, sent_at")
      .in("alert_type", ["disconnection", "recovery", "extended_outage"])
      .gte("sent_at", cooldownCutoff);

    const recentMap = new Map<string, Date>();
    for (const a of recentAlerts ?? []) {
      const key = `${a.station_id}:${a.alert_type}`;
      const existing = recentMap.get(key);
      const sentAt = new Date(a.sent_at);
      if (!existing || sentAt > existing) {
        recentMap.set(key, sentAt);
      }
    }

    const isInCooldown = (stationId: string, alertType: string, intervalHours: number): boolean => {
      const key = `${stationId}:${alertType}`;
      const lastSent = recentMap.get(key);
      if (!lastSent) return false;
      const hoursSince = (Date.now() - lastSent.getTime()) / (1000 * 60 * 60);
      return hoursSince < intervalHours;
    };

    // 4. Process each rule
    for (const rule of rules) {
      const recipients = rule.email_recipients ?? [];
      const intervalHours = rule.notification_interval_hours ?? 12;

      if (rule.alert_type === "disconnection") {
        const disconnected = stations.filter(
          (s) => s.connectivity_status !== "Online" && !isInCooldown(s.id, "disconnection", intervalHours)
        );
        for (const station of disconnected) {
          await supabase.from("alert_history").insert({
            station_id: station.id,
            alert_type: "disconnection",
            alert_rule_id: rule.id,
            details: {
              station_name: station.name,
              cpo: station.cpo_name,
              territory: station.territory_name,
              ocpp_status: station.ocpp_status,
            },
          });
          result.disconnections++;
        }
        if (disconnected.length > 0 && recipients.length > 0 && RESEND_API_KEY) {
          await sendAlertEmail(
            recipients,
            `[EZDrive] ${disconnected.length} station(s) déconnectée(s)`,
            disconnected.map((s) => `${s.name} (${s.cpo_name})`).join(", ")
          );
          result.emails_sent++;
        }
      }

      if (rule.alert_type === "recovery") {
        const recovered = stations.filter((s) => {
          if (s.connectivity_status !== "Online") return false;
          const key = `${s.id}:disconnection`;
          return recentMap.has(key) && !isInCooldown(s.id, "recovery", intervalHours);
        });
        for (const station of recovered) {
          await supabase.from("alert_history").insert({
            station_id: station.id,
            alert_type: "recovery",
            alert_rule_id: rule.id,
            details: {
              station_name: station.name,
              cpo: station.cpo_name,
              ocpp_status: station.ocpp_status,
            },
          });
          result.recoveries++;
        }
      }

      if (rule.alert_type === "extended_outage") {
        const thresholdHours = rule.threshold_hours ?? 24;
        const outages = stations.filter(
          (s) =>
            (s.ocpp_status === "Faulted" || s.ocpp_status === "Unavailable") &&
            (s.hours_in_status ?? 0) >= thresholdHours &&
            !isInCooldown(s.id, "extended_outage", intervalHours)
        );
        for (const station of outages) {
          await supabase.from("alert_history").insert({
            station_id: station.id,
            alert_type: "extended_outage",
            alert_rule_id: rule.id,
            hours_in_fault: station.hours_in_status,
            details: {
              station_name: station.name,
              cpo: station.cpo_name,
              ocpp_status: station.ocpp_status,
              hours: Math.round(station.hours_in_status ?? 0),
            },
          });
          result.extended_outages++;
        }
        if (outages.length > 0 && recipients.length > 0 && RESEND_API_KEY) {
          await sendAlertEmail(
            recipients,
            `[EZDrive] ${outages.length} panne(s) prolongée(s) (>24h)`,
            outages.map((s) => `${s.name}: ${Math.round(s.hours_in_status ?? 0)}h (${s.cpo_name})`).join(", ")
          );
          result.emails_sent++;
        }
      }
    }

    console.log(`[road-alert-check] Done: ${JSON.stringify(result)}`);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[road-alert-check] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message, result }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function sendAlertEmail(to: string[], subject: string, body: string) {
  if (!RESEND_API_KEY) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject,
        html: `<div style="font-family:sans-serif;padding:20px">
          <h2>${subject}</h2>
          <p>${body}</p>
          <p><a href="${DASHBOARD_URL}">Voir le dashboard</a></p>
        </div>`,
      }),
    });
  } catch (err) {
    console.error("[road-alert-check] Email error:", err);
  }
}
