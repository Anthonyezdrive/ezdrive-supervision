// ============================================================
// OCPI 2.2.1 Push Queue Processor
// Processes outbound OCPI messages to Gireve IOP
// Implements Store & Forward per Gireve spec (FIFO, retry)
//
// Called via pg_cron every minute
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { ocpiFetch } from "../_shared/ocpi-client.ts";
import {
  getPendingPushItems,
  markPushItemProcessing,
  markPushItemSent,
  markPushItemFailed,
} from "../_shared/ocpi-db.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    console.log("[OCPI Push] Starting push queue processing...");

    // Fetch pending items (FIFO order, by priority then created_at)
    const { data: items, error } = await getPendingPushItems(50);

    if (error) {
      console.error("[OCPI Push] Failed to fetch queue:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch queue" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!items || items.length === 0) {
      console.log("[OCPI Push] No pending items in queue");
      return new Response(JSON.stringify({
        processed: 0,
        sent: 0,
        failed: 0,
        duration_ms: Date.now() - startTime,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[OCPI Push] Found ${items.length} items to process`);

    let sent = 0;
    let failed = 0;

    // Process items sequentially (FIFO per Gireve Store & Forward spec)
    for (const item of items) {
      try {
        // Mark as processing
        await markPushItemProcessing(item.id);

        console.log(`[OCPI Push] Processing: ${item.action} ${item.ocpi_path} (attempt ${item.attempts + 1}/${item.max_attempts})`);

        // Determine role based on module
        const role = getModuleRole(item.module);

        // Execute OCPI request
        const result = await ocpiFetch(item.ocpi_path, {
          method: item.action,
          body: item.payload,
          config: { role, platform: "PREPROD" },
        });

        if (result.ok) {
          await markPushItemSent(item.id);
          sent++;
          console.log(`[OCPI Push] ✅ Sent: ${item.action} ${item.ocpi_path}`);
        } else {
          await markPushItemFailed(
            item.id,
            result.error ?? `HTTP ${result.status}: ${result.data?.status_message ?? "Unknown"}`,
            item.attempts,
          );
          failed++;
          console.warn(`[OCPI Push] ❌ Failed: ${item.action} ${item.ocpi_path} — ${result.error}`);

          // If this is a FIFO-critical module (sessions, cdrs), stop processing
          // to maintain order per Gireve Store & Forward spec
          if (item.module === "sessions" || item.module === "cdrs") {
            console.warn(`[OCPI Push] Stopping FIFO queue for module: ${item.module}`);
            break;
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        await markPushItemFailed(item.id, errorMsg, item.attempts);
        failed++;
        console.error(`[OCPI Push] ❌ Exception: ${item.action} ${item.ocpi_path}`, err);
      }
    }

    const duration = Date.now() - startTime;
    const result = {
      processed: items.length,
      sent,
      failed,
      duration_ms: duration,
    };

    console.log(`[OCPI Push] Complete: ${sent} sent, ${failed} failed, ${duration}ms`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[OCPI Push] Unhandled error:", err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Unknown error",
      duration_ms: Date.now() - startTime,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Map module to OCPI role for outbound requests
 * - locations, sessions, cdrs, tariffs → CPO (we push our data)
 * - tokens → EMSP (we push user tokens)
 */
function getModuleRole(module: string): "CPO" | "EMSP" {
  switch (module) {
    case "tokens":
      return "EMSP";
    default:
      return "CPO";
  }
}
