// ============================================
// Edge Function: GFX Driver Sync
// Imports drivers from GreenFlux CRM API into gfx_consumers
// Endpoint: GET /api/1.0/crm/{emspId}/drivers
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GFX_API_KEY = Deno.env.get("GFX_API_KEY_PROD") ?? "";

// GFX CRM API uses platform-a (not platform)
const GFX_CRM_BASE_URL =
  Deno.env.get("GFX_CRM_BASE_URL") ?? "https://platform-a.greenflux.com/api/1.0";

// eMSP ID as configured in GreenFlux
const GFX_EMSP_ID = Deno.env.get("GFX_EMSP_ID") ?? "EZDrive";

interface GFXDriver {
  id: string;
  externalId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  country?: string;
  address?: string;
  status?: string;
  retailPackage?: string | { name?: string };
  emspContract?: string | { name?: string };
  customer?: { id?: string; name?: string; externalId?: string };
  tokens?: Array<{ uid?: string; visualNumber?: string; status?: string }>;
  createdAt?: string;
  updatedAt?: string;
}

interface SyncResult {
  total_fetched: number;
  total_upserted: number;
  total_errors: number;
  errors: string[];
}

async function gfxCrmFetch(path: string): Promise<Response> {
  if (!GFX_API_KEY) throw new Error("Missing GFX_API_KEY_PROD secret");

  const url = `${GFX_CRM_BASE_URL}${path}`;
  console.log(`[gfx-driver-sync] Fetching: ${url}`);

  return fetch(url, {
    headers: {
      Authorization: `Token ${GFX_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const result: SyncResult = {
    total_fetched: 0,
    total_upserted: 0,
    total_errors: 0,
    errors: [],
  };

  try {
    // Try multiple possible emspId values
    const emspIds = [GFX_EMSP_ID, "EZDrive", "EZdrive", "ezdrive", "EZD"];
    let drivers: GFXDriver[] = [];
    let successEmspId = "";

    for (const emspId of emspIds) {
      console.log(`[gfx-driver-sync] Trying emspId: ${emspId}`);
      const res = await gfxCrmFetch(`/crm/${emspId}/drivers`);

      if (res.ok) {
        const data = await res.json();
        drivers = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
        successEmspId = emspId;
        console.log(`[gfx-driver-sync] Success with emspId=${emspId}, got ${drivers.length} drivers`);
        break;
      } else {
        const errText = await res.text();
        console.log(`[gfx-driver-sync] emspId=${emspId} failed: ${res.status} ${errText.substring(0, 200)}`);
      }
    }

    if (drivers.length === 0 && !successEmspId) {
      return new Response(
        JSON.stringify({
          error: "Could not find drivers with any emspId",
          tried: emspIds,
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    result.total_fetched = drivers.length;
    console.log(`[gfx-driver-sync] Processing ${drivers.length} drivers from emspId=${successEmspId}`);

    // Build CPO lookup from stations (to assign cpo_id based on customer_group)
    const { data: cpoRows } = await supabase
      .from("cpo_operators")
      .select("id, name, code");
    const cpoByName = new Map<string, string>();
    for (const c of cpoRows ?? []) {
      cpoByName.set(c.name?.toLowerCase(), c.id);
      if (c.code) cpoByName.set(c.code.toLowerCase(), c.id);
    }

    // Process drivers in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < drivers.length; i += BATCH_SIZE) {
      const batch = drivers.slice(i, i + BATCH_SIZE);

      const rows = batch.map((d) => {
        const externalId = d.externalId || d.id;
        const firstName = d.firstName ?? null;
        const lastName = d.lastName ?? null;
        const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
        const retailPkg = typeof d.retailPackage === "string"
          ? d.retailPackage
          : d.retailPackage?.name ?? null;
        const emspContract = typeof d.emspContract === "string"
          ? d.emspContract
          : d.emspContract?.name ?? null;
        const customerName = d.customer?.name ?? d.customer?.externalId ?? null;
        const primaryToken = d.tokens?.[0]?.visualNumber ?? d.tokens?.[0]?.uid ?? null;

        return {
          driver_external_id: externalId,
          gfx_driver_id: d.id,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          email: d.email ?? null,
          phone: d.phone ?? null,
          country: d.country ?? "FRA",
          address: d.address ?? null,
          status: d.status?.toLowerCase() ?? "active",
          retail_package: retailPkg,
          emsp_contract: emspContract,
          customer_group: customerName,
          primary_token_uid: primaryToken,
          is_active: (d.status?.toLowerCase() ?? "active") === "active",
          source: "gfx_crm",
          updated_at: new Date().toISOString(),
        };
      });

      const { error } = await supabase
        .from("gfx_consumers")
        .upsert(rows, { onConflict: "driver_external_id" });

      if (error) {
        console.error(`[gfx-driver-sync] Batch error:`, error.message);
        result.errors.push(`Batch ${i}: ${error.message}`);
        result.total_errors += batch.length;
      } else {
        result.total_upserted += batch.length;
      }
    }

    console.log(`[gfx-driver-sync] Done: ${result.total_upserted} upserted, ${result.total_errors} errors`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[gfx-driver-sync] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message, ...result }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
