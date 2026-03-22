// Reimbursement Engine — Employee Charging Cost Reimbursement
// Monthly cron: calculates reimbursement per B2B client's employees

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
    // Auth: service_role or admin
    const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
    if (token !== supabaseKey) {
      return json({ error: "Service role required" }, 403);
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const now = new Date();
    const targetYear = (body.year as number) ?? (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
    const targetMonth = (body.month as number) ?? (now.getMonth() === 0 ? 12 : now.getMonth());
    const periodStart = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const periodEnd = new Date(targetYear, targetMonth, 0).toISOString().split("T")[0];

    console.log(`[reimbursement-engine] Processing ${periodStart} to ${periodEnd}`);

    // Get all enabled reimbursement configs
    const { data: configs } = await db
      .from("reimbursement_config")
      .select("*, b2b_clients!inner(id, name, customer_external_ids, redevance_rate)")
      .eq("enabled", true);

    if (!configs || configs.length === 0) {
      return json({ ok: true, message: "No reimbursement configs enabled", runs: [] });
    }

    const results: Array<{ client: string; drivers: number; kwh: number; amount: string; error?: string }> = [];

    for (const config of configs) {
      try {
        const client = config.b2b_clients;
        const externalIds = client.customer_external_ids ?? [];

        if (externalIds.length === 0) {
          results.push({ client: client.name, drivers: 0, kwh: 0, amount: "0€", error: "No external IDs" });
          continue;
        }

        // Get CDRs for this client's drivers in the period
        const { data: cdrs } = await db
          .from("ocpi_cdrs")
          .select("*")
          .gte("start_date_time", periodStart)
          .lte("start_date_time", periodEnd + "T23:59:59");

        // Filter CDRs by client's external IDs
        const clientCdrs = (cdrs ?? []).filter((cdr: any) => {
          const tokenUid = cdr.cdr_token?.uid ?? "";
          const contractId = cdr.cdr_token?.contract_id ?? "";
          return externalIds.some((eid: string) =>
            tokenUid.includes(eid) || contractId.includes(eid)
          );
        });

        // Group by driver
        const driverMap = new Map<string, { name: string; email: string; sessions: number; kwh: number }>();

        for (const cdr of clientCdrs) {
          const driverId = cdr.cdr_token?.uid ?? "unknown";
          const existing = driverMap.get(driverId) ?? { name: driverId, email: "", sessions: 0, kwh: 0 };
          existing.sessions += 1;
          existing.kwh += Number(cdr.total_energy ?? 0);
          driverMap.set(driverId, existing);
        }

        // Create reimbursement run
        let totalKwh = 0;
        let totalAmountCents = 0;

        const { data: run, error: runError } = await db.from("reimbursement_runs").insert({
          b2b_client_id: client.id,
          period_start: periodStart,
          period_end: periodEnd,
          status: "calculated",
          total_drivers: driverMap.size,
        }).select().maybeSingle();

        if (runError) throw runError;

        // Create line items per driver
        const lineItems: Array<Record<string, unknown>> = [];

        for (const [driverId, data] of driverMap) {
          let amount = Math.round(data.kwh * config.rate_per_kwh * 100); // cents
          let capped = false;

          // Apply monthly cap if configured
          if (config.max_monthly_amount) {
            const maxCents = Math.round(config.max_monthly_amount * 100);
            if (amount > maxCents) {
              amount = maxCents;
              capped = true;
            }
          }

          totalKwh += data.kwh;
          totalAmountCents += amount;

          lineItems.push({
            run_id: run.id,
            driver_id: driverId,
            driver_name: data.name,
            session_count: data.sessions,
            total_kwh: data.kwh,
            rate_per_kwh: config.rate_per_kwh,
            amount_cents: amount,
            charging_type: "work", // Default, could be refined
            capped,
          });
        }

        if (lineItems.length > 0) {
          await db.from("reimbursement_line_items").insert(lineItems);
        }

        // Update run totals
        await db.from("reimbursement_runs").update({
          total_kwh: totalKwh,
          total_amount_cents: totalAmountCents,
          total_drivers: driverMap.size,
        }).eq("id", run.id);

        results.push({
          client: client.name,
          drivers: driverMap.size,
          kwh: Math.round(totalKwh * 100) / 100,
          amount: `${(totalAmountCents / 100).toFixed(2)}€`,
        });

        console.log(`[reimbursement-engine] ${client.name}: ${driverMap.size} drivers, ${totalKwh.toFixed(1)} kWh, ${(totalAmountCents / 100).toFixed(2)}€`);
      } catch (err) {
        results.push({ client: config.b2b_clients?.name ?? "?", drivers: 0, kwh: 0, amount: "0€", error: (err as Error).message });
      }
    }

    return json({
      ok: true,
      period: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
      runs: results,
      total_clients: results.filter(r => !r.error).length,
    });
  } catch (err) {
    console.error("[reimbursement-engine] Fatal:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
