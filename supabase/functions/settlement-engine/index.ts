// Settlement Engine — Monthly Auto-Billing
// Triggered by pg_cron on 1st of each month
// Aggregates CDRs per CPO and generates settlement invoices

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" },
    });
  }

  try {
    // Auth: service_role or admin only
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === supabaseKey;

    if (!isServiceRole) {
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "Unauthorized" }, 401);

      const { data: profile } = await db.from("ezdrive_profiles").select("role").eq("id", user.id).maybeSingle();
      if (!profile || profile.role !== "admin") return json({ error: "Admin only" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const now = new Date();

    // Default: settle previous month
    const targetYear = (body as Record<string, number>).year ?? (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
    const targetMonth = (body as Record<string, number>).month ?? (now.getMonth() === 0 ? 12 : now.getMonth());
    const targetCpoId = (body as Record<string, string>).cpo_id ?? null;

    console.log(`[settlement-engine] Generating settlements for ${targetYear}-${String(targetMonth).padStart(2, '0')}`);

    // Get CPOs to settle
    let cpoQuery = db.from("cpo_operators").select("id, name, code");
    if (targetCpoId) {
      cpoQuery = cpoQuery.eq("id", targetCpoId);
    }
    const { data: cpos } = await cpoQuery;

    if (!cpos || cpos.length === 0) {
      return json({ ok: true, message: "No CPOs found", settlements: [] });
    }

    const results: Array<{ cpo: string; settlement_id: string | null; sessions: number; amount: string; error?: string }> = [];

    for (const cpo of cpos) {
      try {
        const { data: settlementId, error } = await db.rpc("generate_monthly_settlement", {
          p_cpo_id: cpo.id,
          p_year: targetYear,
          p_month: targetMonth,
        });

        if (error) throw error;

        // Get settlement details
        const { data: settlement } = await db
          .from("settlement_runs")
          .select("total_sessions, total_amount_cents, total_with_vat_cents")
          .eq("id", settlementId)
          .maybeSingle();

        // Generate invoice for this settlement
        if (settlement && settlement.total_amount_cents > 0) {
          const { data: invoiceNum } = await db.rpc("generate_invoice_number");

          const { data: invoice } = await db.from("invoices").insert({
            invoice_number: invoiceNum ?? `SET-${Date.now()}`,
            type: "session",
            status: "issued",
            currency: "eur",
            subtotal_cents: settlement.total_amount_cents,
            vat_rate: 8.5,
            vat_cents: Math.round(settlement.total_amount_cents * 0.085),
            total_cents: settlement.total_with_vat_cents,
            period_start: `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`,
            period_end: new Date(targetYear, targetMonth, 0).toISOString().split("T")[0],
            line_items: [{
              description: `Règlement mensuel ${cpo.name} — ${String(targetMonth).padStart(2, '0')}/${targetYear}`,
              sessions: settlement.total_sessions,
              amount_cents: settlement.total_amount_cents,
            }],
            notes: `Settlement auto-généré pour CPO ${cpo.code}`,
            issued_at: new Date().toISOString(),
          }).select().maybeSingle();

          // Link invoice to settlement
          if (invoice) {
            await db.from("settlement_runs").update({ invoice_id: invoice.id }).eq("id", settlementId);
          }
        }

        results.push({
          cpo: cpo.name,
          settlement_id: settlementId,
          sessions: settlement?.total_sessions ?? 0,
          amount: `${((settlement?.total_with_vat_cents ?? 0) / 100).toFixed(2)}€`,
        });

        console.log(`[settlement-engine] ${cpo.name}: ${settlement?.total_sessions ?? 0} sessions, ${((settlement?.total_amount_cents ?? 0) / 100).toFixed(2)}€`);
      } catch (err) {
        const errorMsg = (err as Error).message;
        console.error(`[settlement-engine] Error for ${cpo.name}:`, errorMsg);
        results.push({ cpo: cpo.name, settlement_id: null, sessions: 0, amount: "0€", error: errorMsg });
      }
    }

    return json({
      ok: true,
      period: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
      settlements: results,
      total_settlements: results.filter(r => !r.error).length,
    });
  } catch (err) {
    console.error("[settlement-engine] Fatal:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
