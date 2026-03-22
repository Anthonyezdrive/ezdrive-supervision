// ============================================
// Edge Function: Health Check
// Reports status of all sync functions and cron jobs
// Call: GET /functions/v1/health-check
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Max hours since last sync before flagging as stale
const STALE_THRESHOLDS: Record<string, number> = {
  "gfx-cdr-sync": 8,         // runs every 6h, stale after 8h
  "road-cdr-sync-reunion": 8,
  "road-cdr-sync-vcity": 8,
  "road-token-sync-reunion": 8,
  "road-token-sync-vcity": 8,
  "road-driver-sync-reunion": 26, // runs daily, stale after 26h
  "road-driver-sync-vcity": 26,
  "road-tariff-sync-reunion": 26,
  "road-tariff-sync-vcity": 26,
};

interface SyncStatus {
  id: string;
  last_synced_at: string | null;
  hours_since_sync: number;
  last_offset: number;
  status: "ok" | "stale" | "never_synced";
  threshold_hours: number;
  metadata: Record<string, unknown> | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 1. Check sync watermarks
    const { data: watermarks, error: wmError } = await supabase
      .from("sync_watermarks")
      .select("*")
      .order("id");

    if (wmError) throw wmError;

    const now = Date.now();
    const syncs: SyncStatus[] = (watermarks ?? []).map((wm) => {
      const lastSyncedAt = wm.last_synced_at ? new Date(wm.last_synced_at).getTime() : 0;
      const hoursSince = lastSyncedAt ? (now - lastSyncedAt) / (1000 * 60 * 60) : Infinity;
      const threshold = STALE_THRESHOLDS[wm.id] ?? 24;

      let status: "ok" | "stale" | "never_synced" = "ok";
      if (!wm.last_synced_at) status = "never_synced";
      else if (hoursSince > threshold) status = "stale";

      return {
        id: wm.id,
        last_synced_at: wm.last_synced_at,
        hours_since_sync: Math.round(hoursSince * 10) / 10,
        last_offset: wm.last_offset ?? 0,
        status,
        threshold_hours: threshold,
        metadata: wm.metadata,
      };
    });

    // 2. Check cron jobs
    const { data: cronJobs, error: cronError } = await supabase
      .rpc("get_cron_jobs_status");

    // Fallback if RPC doesn't exist — just report syncs
    const crons = cronError ? null : cronJobs;

    // 3. Quick DB counts
    const counts: Record<string, number> = {};
    for (const table of ["stations", "ocpi_cdrs", "gfx_tokens", "gfx_consumers", "ocpi_tariffs"]) {
      const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
      counts[table] = count ?? 0;
    }

    // 4. X-DRIVE table checks
    const xdriveChecks: Record<string, unknown> = {};

    // xdrive_partners — must have at least 1 row
    const { count: partnersCount } = await supabase
      .from("xdrive_partners")
      .select("*", { count: "exact", head: true });
    xdriveChecks["xdrive_partners"] = {
      count: partnersCount ?? 0,
      status: (partnersCount ?? 0) >= 1 ? "ok" : "warn_empty",
    };

    // xdrive_bpu_config — must have at least 1 row
    const { count: bpuConfigCount } = await supabase
      .from("xdrive_bpu_config")
      .select("*", { count: "exact", head: true });
    xdriveChecks["xdrive_bpu_config"] = {
      count: bpuConfigCount ?? 0,
      status: (bpuConfigCount ?? 0) >= 1 ? "ok" : "warn_empty",
    };

    // xdrive_reconciliations — latest entry
    const { data: latestReconciliation } = await supabase
      .from("xdrive_reconciliations")
      .select("id, period_month, status, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    xdriveChecks["xdrive_reconciliations"] = {
      latest: latestReconciliation ?? null,
      status: latestReconciliation ? "ok" : "no_data",
    };

    // xdrive_bpu_invoices — latest entry
    const { data: latestBpuInvoice } = await supabase
      .from("xdrive_bpu_invoices")
      .select("id, period_month, status, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    xdriveChecks["xdrive_bpu_invoices"] = {
      latest: latestBpuInvoice ?? null,
      status: latestBpuInvoice ? "ok" : "no_data",
    };

    const xdriveWarnCount = Object.values(xdriveChecks).filter(
      (c) => (c as { status: string }).status !== "ok"
    ).length;

    // 5. Build result
    const staleCount = syncs.filter((s) => s.status === "stale").length;
    const neverSynced = syncs.filter((s) => s.status === "never_synced").length;

    const overallStatus =
      staleCount > 0 || neverSynced > 0
        ? "degraded"
        : xdriveWarnCount > 0
        ? "degraded"
        : "healthy";

    const result = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      syncs,
      summary: {
        total_syncs: syncs.length,
        ok: syncs.filter((s) => s.status === "ok").length,
        stale: staleCount,
        never_synced: neverSynced,
      },
      db_counts: counts,
      xdrive: xdriveChecks,
      crons: crons ?? "rpc_not_available",
    };

    return new Response(JSON.stringify(result, null, 2), {
      status: overallStatus === "healthy" ? 200 : 207,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[health-check] Error:", error);
    return new Response(
      JSON.stringify({ status: "error", error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
