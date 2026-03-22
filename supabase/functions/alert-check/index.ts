import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? null;
const FROM_EMAIL = Deno.env.get("ALERT_FROM_EMAIL") ?? "alertes@ezdrive-supervision.app";
const DASHBOARD_URL = "https://ezdrive-supervision.vercel.app/monitoring";

// Singleton — réutilisé entre les requêtes (Deno edge runtime garde le module en mémoire)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── 1. Lire toutes les règles d'alerte actives ──
  // Try new alert_rules table first, fallback to legacy alert_config
  let rules: any[] = [];
  let useLegacy = false;

  const { data: newRules, error: newRulesErr } = await supabase
    .from("alert_rules")
    .select("*")
    .eq("is_active", true);

  if (newRulesErr) {
    console.warn("[alert-check] alert_rules not available, fallback to alert_config:", newRulesErr.message);
    useLegacy = true;
    const { data: legacyConfigs } = await supabase
      .from("alert_config")
      .select("*")
      .eq("is_active", true);
    rules = (legacyConfigs ?? []).map((c: any) => ({
      ...c,
      alert_type: c.alert_type ?? "fault_threshold",
      threshold_value: null,
      cpo_id: null,
      station_id: null,
      territory_id: null,
    }));
  } else {
    rules = newRules ?? [];
  }

  if (rules.length === 0) {
    return json({ skipped: true, reason: "Aucune règle d'alerte active" });
  }

  const results: any[] = [];

  // ── 2. Pre-fetch all recent alerts in ONE query (instead of 1 per rule) ──
  const minCooldownHours = Math.min(...rules.map((r: any) => r.notification_interval_hours ?? 12));
  const globalCooldownSince = new Date(Date.now() - minCooldownHours * 3_600_000).toISOString();
  const { data: allRecentAlerts } = await supabase
    .from("alert_history")
    .select("station_id, alert_type, sent_at")
    .gte("sent_at", globalCooldownSince);

  // Build per-type cooldown maps
  const recentAlertsMap = new Map<string, { station_id: string; sent_at: string }[]>();
  for (const a of allRecentAlerts ?? []) {
    const list = recentAlertsMap.get(a.alert_type) ?? [];
    list.push(a);
    recentAlertsMap.set(a.alert_type, list);
  }

  // ── 3. Process each rule by type ──
  for (const rule of rules) {
    const recipients: string[] = rule.email_recipients ?? [];
    if (recipients.length === 0) continue;

    const cooldownHours = rule.notification_interval_hours ?? 12;
    const cooldownSince = new Date(Date.now() - cooldownHours * 3_600_000).toISOString();

    // Use pre-fetched cooldown data (filtered per-rule cooldown window)
    const ruleAlerts = recentAlertsMap.get(rule.alert_type) ?? [];
    const alreadyAlerted = new Set(
      ruleAlerts.filter((a) => a.sent_at >= cooldownSince).map((a) => a.station_id)
    );

    let toAlert: any[] = [];
    let emailSubject = "";
    let alertTitle = "";

    switch (rule.alert_type) {
      // ── Fault threshold ──
      case "fault_threshold": {
        let query = supabase
          .from("maintenance_stations")
          .select("id, name, city, territory_name, cpo_name, ocpp_status, hours_in_fault")
          .gte("hours_in_fault", rule.threshold_hours ?? 4);
        if (rule.cpo_id) query = query.eq("cpo_id", rule.cpo_id);
        if (rule.station_id) query = query.eq("id", rule.station_id);
        query = query.limit(200);
        const { data } = await query;
        toAlert = (data ?? []).filter((s: any) => !alreadyAlerted.has(s.id));
        alertTitle = `${toAlert.length} borne${toAlert.length > 1 ? "s" : ""} en panne > ${rule.threshold_hours}h`;
        emailSubject = `EZDrive – ${alertTitle}`;
        break;
      }

      // ── Offline threshold ──
      case "offline_threshold": {
        let query = supabase
          .from("stations_enriched")
          .select("id, name, city, cpo_name, hours_in_status")
          .eq("is_online", false)
          .gte("hours_in_status", rule.threshold_hours ?? 4);
        if (rule.cpo_id) query = query.eq("cpo_id", rule.cpo_id);
        if (rule.station_id) query = query.eq("id", rule.station_id);
        query = query.limit(200);
        const { data } = await query;
        toAlert = (data ?? []).filter((s: any) => !alreadyAlerted.has(s.id));
        alertTitle = `${toAlert.length} borne${toAlert.length > 1 ? "s" : ""} hors ligne > ${rule.threshold_hours}h`;
        emailSubject = `EZDrive – ${alertTitle}`;
        break;
      }

      // ── Unavailable threshold ──
      case "unavailable_threshold": {
        let query = supabase
          .from("stations_enriched")
          .select("id, name, city, cpo_name, hours_in_status")
          .eq("ocpp_status", "Unavailable")
          .gte("hours_in_status", rule.threshold_hours ?? 4);
        if (rule.cpo_id) query = query.eq("cpo_id", rule.cpo_id);
        query = query.limit(200);
        const { data } = await query;
        toAlert = (data ?? []).filter((s: any) => !alreadyAlerted.has(s.id));
        alertTitle = `${toAlert.length} borne${toAlert.length > 1 ? "s" : ""} indisponible${toAlert.length > 1 ? "s" : ""} > ${rule.threshold_hours}h`;
        emailSubject = `EZDrive – ${alertTitle}`;
        break;
      }

      // ── Heartbeat missing ──
      case "heartbeat_missing": {
        const thresholdDate = new Date(
          Date.now() - (rule.threshold_hours ?? 2) * 3_600_000
        ).toISOString();
        let query = supabase
          .from("ocpp_chargepoints")
          .select("id, identity, vendor, model, last_heartbeat_at, station_id")
          .lt("last_heartbeat_at", thresholdDate)
          .eq("is_connected", true);
        if (rule.chargepoint_vendor) query = query.eq("vendor", rule.chargepoint_vendor);
        if (rule.chargepoint_model) query = query.eq("model", rule.chargepoint_model);
        query = query.limit(200);
        const { data } = await query;
        toAlert = (data ?? []).filter((cp: any) => !alreadyAlerted.has(cp.id)).map((cp: any) => ({
          ...cp,
          name: cp.identity ?? cp.id,
        }));
        alertTitle = `${toAlert.length} chargepoint${toAlert.length > 1 ? "s" : ""} sans heartbeat > ${rule.threshold_hours}h`;
        emailSubject = `EZDrive – ${alertTitle}`;
        break;
      }

      // ── Session stuck ──
      case "session_stuck": {
        const thresholdDate = new Date(
          Date.now() - (rule.threshold_hours ?? 8) * 3_600_000
        ).toISOString();
        const { data } = await supabase
          .from("ocpp_transactions")
          .select("id, chargepoint_id, connector_id, started_at, stations(name, city)")
          .eq("status", "Active")
          .lt("started_at", thresholdDate)
          .limit(50);
        toAlert = (data ?? []).filter((t: any) => !alreadyAlerted.has(t.id)).map((t: any) => ({
          ...t,
          name: t.stations?.name ?? t.chargepoint_id,
          city: t.stations?.city ?? null,
        }));
        alertTitle = `${toAlert.length} session${toAlert.length > 1 ? "s" : ""} bloquée${toAlert.length > 1 ? "s" : ""} > ${rule.threshold_hours}h`;
        emailSubject = `EZDrive – ${alertTitle}`;
        break;
      }

      // ── Capacity warning / critical ──
      case "capacity_warning":
      case "capacity_critical": {
        const { data: capacityData } = await supabase.rpc("check_site_capacity");
        if (capacityData?.capacity_alerts) {
          const level = rule.alert_type === "capacity_critical" ? "critical" : "warning";
          toAlert = capacityData.capacity_alerts
            .filter((a: any) => a.alert_level === level)
            .filter((a: any) => !alreadyAlerted.has(a.station_id))
            .map((a: any) => ({
              id: a.station_id,
              name: a.station_name,
              usage_pct: a.usage_pct,
              current_load_kw: a.current_load_kw,
              max_capacity_kw: a.max_capacity_kw,
            }));
          alertTitle = `Capacité ${level === "critical" ? "critique" : "élevée"} sur ${toAlert.length} site${toAlert.length > 1 ? "s" : ""}`;
          emailSubject = `EZDrive – ${alertTitle}`;
        }
        break;
      }

      default:
        continue;
    }

    if (toAlert.length === 0) {
      results.push({ rule_id: rule.id, type: rule.alert_type, alerts_sent: 0, reason: "Aucune alerte à envoyer" });
      continue;
    }

    // ── 3. Build HTML email ──
    const stationRows = toAlert
      .map((s: any) => {
        const hours = s.hours_in_fault ?? s.hours_in_status ?? null;
        const extraInfo = s.usage_pct != null
          ? `${s.usage_pct}% (${s.current_load_kw}/${s.max_capacity_kw} kW)`
          : hours != null
          ? `${Math.round(hours)}h`
          : "--";
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #1e2340;font-weight:600;color:#e2e8f0">${s.name ?? "--"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #1e2340;color:#8892b0">${s.city ?? s.cpo_name ?? "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #1e2340;color:#FF6B6B;font-weight:600">${extraInfo}</td>
        </tr>`;
      })
      .join("");

    const alertColor = rule.alert_type.includes("critical") ? "#FF6B6B" : "#FBBF24";
    const alertIcon = rule.alert_type.includes("capacity") ? "⚡" : "🔴";

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0A0E27;font-family:Inter,system-ui,sans-serif;padding:32px;margin:0">
  <div style="max-width:600px;margin:0 auto">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
      <div style="width:36px;height:36px;border-radius:10px;background:#00D4AA22;border:1px solid #00D4AA;display:flex;align-items:center;justify-content:center;font-size:18px">⚡</div>
      <div>
        <div style="font-weight:700;color:#e2e8f0;font-size:14px">EZDrive Supervision</div>
        <div style="color:#8892b0;font-size:11px">Alerte automatique — ${rule.title ?? rule.alert_type}</div>
      </div>
    </div>

    <div style="background:${alertColor}22;border:1px solid ${alertColor}55;border-radius:12px;padding:16px 20px;margin-bottom:24px">
      <div style="color:${alertColor};font-weight:700;font-size:16px;margin-bottom:4px">
        ${alertIcon} ${alertTitle}
      </div>
      <div style="color:#8892b0;font-size:13px">${rule.description ?? "Intervention requise"}</div>
    </div>

    <table style="width:100%;border-collapse:collapse;background:#111638;border:1px solid #1e2340;border-radius:12px;overflow:hidden;margin-bottom:24px">
      <thead>
        <tr style="background:#0d1030">
          <th style="padding:10px 12px;text-align:left;color:#8892b0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Borne</th>
          <th style="padding:10px 12px;text-align:left;color:#8892b0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Localisation</th>
          <th style="padding:10px 12px;text-align:left;color:#8892b0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Détail</th>
        </tr>
      </thead>
      <tbody>${stationRows}</tbody>
    </table>

    <a href="${DASHBOARD_URL}"
       style="display:inline-block;background:#00D4AA;color:#0A0E27;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;font-size:14px;margin-bottom:32px">
      Voir le monitoring →
    </a>

    <div style="color:#4a5568;font-size:11px;border-top:1px solid #1e2340;padding-top:16px">
      EZDrive Supervision · Alerte "${rule.title}" · Intervalle: ${cooldownHours}h<br>
      Pour modifier ces alertes : <a href="${DASHBOARD_URL}" style="color:#00D4AA">Monitoring → Alertes</a>
    </div>
  </div>
</body>
</html>`;

    // ── 4. Send email via Resend ──
    let emailSent = false;
    let emailError: string | null = null;
    const dryRun = !RESEND_API_KEY;

    if (RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: recipients,
          subject: `${alertIcon} ${emailSubject}`,
          html: htmlBody,
        }),
      });

      emailSent = res.ok;
      if (!res.ok) {
        emailError = await res.text();
        console.error("[alert-check] Resend error:", emailError);
      }
    } else {
      console.log("[alert-check] DRY RUN — Email simulé pour:", recipients, "—", alertTitle);
      emailSent = true;
    }

    // ── 5. Log to alert_history ──
    if (emailSent) {
      const historyRows = toAlert.map((s: any) => ({
        station_id: s.id ?? s.station_id,
        alert_type: rule.alert_type,
        hours_in_fault: s.hours_in_fault ?? s.hours_in_status ?? null,
        alert_rule_id: useLegacy ? null : rule.id,
        notification_channel: rule.push_enabled ? "both" : "email",
        details: {
          rule_title: rule.title,
          item_name: s.name,
          usage_pct: s.usage_pct ?? null,
          current_load_kw: s.current_load_kw ?? null,
        },
      }));
      await supabase.from("alert_history").insert(historyRows);
    }

    results.push({
      rule_id: rule.id,
      type: rule.alert_type,
      title: rule.title,
      alerts_sent: emailSent ? toAlert.length : 0,
      dry_run: dryRun,
      recipients: recipients.length,
      email_error: emailError,
    });
  }

  return json({
    rules_processed: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
