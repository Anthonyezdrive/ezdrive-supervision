import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get target month from request body or default to previous month
    const body = await req.json().catch(() => ({}));
    const now = new Date();
    const targetMonth = body.month || `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}-01`; // Previous month

    const monthStart = new Date(targetMonth);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    // Get all X-DRIVE partners with b2b_client_id
    const { data: partners } = await supabase
      .from("xdrive_partners")
      .select("id, partner_code, b2b_client_id, b2b_clients(customer_external_ids)")
      .not("b2b_client_id", "is", null);

    const results = [];

    for (const partner of (partners || [])) {
      const customerIds = partner.b2b_clients?.customer_external_ids || [];
      if (customerIds.length === 0) continue;

      // Get CDRs for this partner in the target month
      const { data: cdrs } = await supabase
        .from("ocpi_cdrs")
        .select("total_retail_cost, total_retail_cost_incl_vat, emsp_party_id, cdr_token")
        .in("customer_external_id", customerIds)
        .gte("start_date_time", monthStart.toISOString())
        .lt("start_date_time", monthEnd.toISOString());

      // Calculate CB encaissements (non-roaming sessions with cost > 0)
      let totalCB = 0;
      let cbCount = 0;
      for (const cdr of (cdrs || [])) {
        const cost = Number(cdr.total_retail_cost) || 0;
        if (cost <= 0) continue;
        // Roaming sessions are paid by eMSP, not CB
        const tokenType = cdr.cdr_token?.type?.toUpperCase();
        if (tokenType === "RFID" && cdr.emsp_party_id) continue; // Roaming RFID
        totalCB += cost;
        cbCount++;
      }

      // Estimate Stripe fees (typically 1.4% + 0.25€ per transaction for EU cards)
      const estimatedFees = cbCount * 0.25 + totalCB * 0.014;
      const totalNet = totalCB - estimatedFees;

      // Upsert into xdrive_stripe_payouts
      await supabase.from("xdrive_stripe_payouts").upsert({
        partner_id: partner.id,
        period_month: targetMonth,
        total_charges: totalCB,
        total_fees: Math.round(estimatedFees * 100) / 100,
        total_net: Math.round(totalNet * 100) / 100,
        charge_count: cbCount,
        fetched_at: new Date().toISOString(),
      }, { onConflict: "partner_id,period_month" });

      // Auto-update reconciliation
      await supabase.from("xdrive_reconciliations").upsert({
        partner_id: partner.id,
        period_month: targetMonth,
        encaissements_cb: Math.round(totalNet * 100) / 100,
      }, { onConflict: "partner_id,period_month" });

      results.push({
        partner: partner.partner_code,
        month: targetMonth,
        totalCB,
        fees: Math.round(estimatedFees * 100) / 100,
        net: Math.round(totalNet * 100) / 100,
        sessions: cbCount,
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
