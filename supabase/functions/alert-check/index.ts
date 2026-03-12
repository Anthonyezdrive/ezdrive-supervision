import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? null;
const FROM_EMAIL = Deno.env.get("ALERT_FROM_EMAIL") ?? "alertes@ezdrive-supervision.app";
const DASHBOARD_URL = "https://ezdrive-supervision.vercel.app/maintenance";

// Anti-spam : délai minimum entre deux alertes pour la même borne
const RESEND_COOLDOWN_HOURS = 12;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Lire la config d'alerte active
  const { data: configs, error: configErr } = await supabase
    .from("alert_config")
    .select("*")
    .eq("is_active", true)
    .limit(1);

  if (configErr) {
    return json({ error: configErr.message }, 500);
  }

  const config = configs?.[0];
  if (!config) {
    return json({ skipped: true, reason: "Alertes désactivées dans la config" });
  }

  const recipients: string[] = config.email_recipients ?? [];
  if (recipients.length === 0) {
    return json({ skipped: true, reason: "Aucun destinataire configuré" });
  }

  // 2. Bornes en panne au-delà du seuil
  const { data: faultedRaw, error: faultErr } = await supabase
    .from("maintenance_stations")
    .select("id, name, city, territory_name, cpo_name, ocpp_status, hours_in_fault")
    .gte("hours_in_fault", config.threshold_hours);

  if (faultErr) {
    return json({ error: faultErr.message }, 500);
  }

  const faulted = faultedRaw ?? [];
  if (faulted.length === 0) {
    return json({ alerts_sent: 0, reason: "Aucune borne en panne au-delà du seuil" });
  }

  // 3. Filtrer celles déjà alertées dans le cooldown
  const cooldownSince = new Date(
    Date.now() - RESEND_COOLDOWN_HOURS * 3_600_000
  ).toISOString();

  const { data: recentAlerts } = await supabase
    .from("alert_history")
    .select("station_id")
    .gte("sent_at", cooldownSince);

  const alreadyAlerted = new Set(
    (recentAlerts ?? []).map((a: { station_id: string }) => a.station_id)
  );

  const toAlert = faulted.filter(
    (s: { id: string }) => !alreadyAlerted.has(s.id)
  );

  if (toAlert.length === 0) {
    return json({ alerts_sent: 0, reason: "Toutes les bornes en panne ont déjà été alertées récemment" });
  }

  // 4. Construire l'email HTML
  const stationRows = toAlert
    .map(
      (s: {
        name: string;
        city: string | null;
        territory_name: string | null;
        cpo_name: string | null;
        hours_in_fault: number;
        ocpp_status: string;
      }) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #1e2340;font-weight:600;color:#e2e8f0">${s.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #1e2340;color:#8892b0">${s.city ?? "—"} · ${s.territory_name ?? "?"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #1e2340;color:#FF6B6B;font-weight:600">${Math.round(s.hours_in_fault)}h</td>
          <td style="padding:8px 12px;border-bottom:1px solid #1e2340;color:#8892b0">${s.cpo_name ?? "—"}</td>
        </tr>`
    )
    .join("");

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
        <div style="color:#8892b0;font-size:11px">Alerte maintenance automatique</div>
      </div>
    </div>

    <div style="background:#FF6B6B22;border:1px solid #FF6B6B55;border-radius:12px;padding:16px 20px;margin-bottom:24px">
      <div style="color:#FF6B6B;font-weight:700;font-size:16px;margin-bottom:4px">
        🔴 ${toAlert.length} borne${toAlert.length > 1 ? "s" : ""} en panne &gt; ${config.threshold_hours}h
      </div>
      <div style="color:#8892b0;font-size:13px">Intervention requise</div>
    </div>

    <table style="width:100%;border-collapse:collapse;background:#111638;border:1px solid #1e2340;border-radius:12px;overflow:hidden;margin-bottom:24px">
      <thead>
        <tr style="background:#0d1030">
          <th style="padding:10px 12px;text-align:left;color:#8892b0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Borne</th>
          <th style="padding:10px 12px;text-align:left;color:#8892b0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Localisation</th>
          <th style="padding:10px 12px;text-align:left;color:#8892b0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Durée</th>
          <th style="padding:10px 12px;text-align:left;color:#8892b0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">CPO</th>
        </tr>
      </thead>
      <tbody>${stationRows}</tbody>
    </table>

    <a href="${DASHBOARD_URL}"
       style="display:inline-block;background:#00D4AA;color:#0A0E27;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;font-size:14px;margin-bottom:32px">
      Voir la page Maintenance →
    </a>

    <div style="color:#4a5568;font-size:11px;border-top:1px solid #1e2340;padding-top:16px">
      EZDrive Supervision · Alerte automatique toutes les ${RESEND_COOLDOWN_HOURS}h par borne<br>
      Pour modifier ces alertes : <a href="https://ezdrive-supervision.vercel.app/settings" style="color:#00D4AA">Paramètres</a>
    </div>
  </div>
</body>
</html>`;

  // 5. Envoi via Resend (ou dry-run si pas de clé)
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
        subject: `🔴 EZDrive – ${toAlert.length} borne${toAlert.length > 1 ? "s" : ""} en panne > ${config.threshold_hours}h`,
        html: htmlBody,
      }),
    });

    emailSent = res.ok;
    if (!res.ok) {
      emailError = await res.text();
      console.error("[alert-check] Resend error:", emailError);
    }
  } else {
    console.log("[alert-check] DRY RUN — RESEND_API_KEY non configuré. Email simulé pour:", recipients);
    emailSent = true; // Log quand même
  }

  // 6. Logguer dans alert_history
  if (emailSent) {
    await supabase.from("alert_history").insert(
      toAlert.map((s: { id: string; hours_in_fault: number }) => ({
        station_id: s.id,
        alert_type: "fault_threshold",
        hours_in_fault: s.hours_in_fault,
      }))
    );
  }

  return json({
    alerts_sent: emailSent ? toAlert.length : 0,
    dry_run: dryRun,
    recipients,
    stations: toAlert.map((s: { name: string; hours_in_fault: number }) => ({
      name: s.name,
      hours: Math.round(s.hours_in_fault),
    })),
    email_error: emailError,
  });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
