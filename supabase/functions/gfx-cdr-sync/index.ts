// ============================================
// Edge Function: GFX CDR Sync
// Ingests CDRs from GreenFlux API into ocpi_cdrs
// Supports incremental sync via watermark table
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { corsHeaders } from "../_shared/cors.ts";
import { gfxFetch } from "../_shared/gfx-client.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const COUNTRY_CODE = "FR";
const PARTY_ID = "EZD";
const PAGE_SIZE = 100;
const MAX_PAGES_PER_RUN = 5; // Max 500 CDRs per invocation to avoid timeouts

interface SyncResult {
  total_fetched: number;
  total_ingested: number;
  duplicates_skipped: number;
  errors: string[];
  watermark_offset: number;
  has_more: boolean;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const result: SyncResult = {
    total_fetched: 0,
    total_ingested: 0,
    duplicates_skipped: 0,
    errors: [],
    watermark_offset: 0,
    has_more: false,
  };

  try {
    // 1. Read watermark
    const { data: watermark } = await supabase
      .from("sync_watermarks")
      .select("*")
      .eq("id", "gfx-cdr-sync")
      .single();

    let currentOffset = watermark?.last_offset ?? 0;
    result.watermark_offset = currentOffset;

    console.log(`[gfx-cdr-sync] Starting from offset ${currentOffset}`);

    // 2. Build station lookup (gfx location ID → station UUID)
    const { data: stations } = await supabase
      .from("stations")
      .select("id, gfx_id, gfx_location_id")
      .eq("source", "gfx");

    const stationByGfxLocationId = new Map<string, string>();
    const stationByGfxId = new Map<string, string>();
    for (const s of stations ?? []) {
      if (s.gfx_location_id) stationByGfxLocationId.set(s.gfx_location_id, s.id);
      if (s.gfx_id) stationByGfxId.set(s.gfx_id, s.id);
    }

    // 3. Paginated fetch from GFX
    let pagesProcessed = 0;

    while (pagesProcessed < MAX_PAGES_PER_RUN) {
      const res = await gfxFetch(`/cdrs?offset=${currentOffset}&limit=${PAGE_SIZE}`);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`GFX CDR API error ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const cdrs: Array<Record<string, unknown>> = data?.data ?? [];

      if (cdrs.length === 0) {
        console.log(`[gfx-cdr-sync] No more CDRs at offset ${currentOffset}`);
        break;
      }

      result.total_fetched += cdrs.length;
      console.log(
        `[gfx-cdr-sync] Fetched ${cdrs.length} CDRs (offset ${currentOffset})`
      );

      // 4. Process each CDR
      for (const cdr of cdrs) {
        try {
          const gfxCdrId = cdr.id as string;
          if (!gfxCdrId) {
            result.errors.push("CDR missing id field");
            continue;
          }

          // Check for duplicates
          const { data: existing } = await supabase
            .from("ocpi_cdrs")
            .select("id")
            .eq("gfx_cdr_id", gfxCdrId)
            .limit(1);

          if (existing && existing.length > 0) {
            result.duplicates_skipped++;
            continue;
          }

          // Resolve station_id from location
          let stationId: string | null = null;
          const location = cdr.location as Record<string, unknown> | null;
          if (location) {
            const locId = location.id as string;
            if (locId) {
              stationId = stationByGfxLocationId.get(locId) ?? null;
            }
            // Fallback: try EVSE charge_station_id
            if (!stationId) {
              const evses = location.evses as Array<Record<string, unknown>> | undefined;
              if (evses && evses.length > 0) {
                const csId = evses[0].charge_station_id as string;
                if (csId) stationId = stationByGfxId.get(csId) ?? null;
              }
            }
          }

          // Map GFX CDR → ocpi_cdrs row
          const authId = cdr.auth_id as string | null;
          const authMethod = cdr.auth_method as string | null;
          const chargingPeriods = cdr.charging_periods as unknown[] | null;
          const customGroups = cdr.custom_groups as string[] | null;

          // Build cdr_token jsonb
          const cdrToken = authId
            ? {
                uid: authId,
                type: authMethod === "WHITELIST" ? "RFID" : (authMethod ?? "OTHER"),
                contract_id: authId,
              }
            : null;

          // Build cdr_location jsonb (snapshot from GFX data)
          const cdrLocation = location
            ? {
                id: location.id,
                name: location.name,
                address: location.address,
                city: location.city,
                postal_code: location.postal_code,
                country: location.country ?? "FRA",
                coordinates: location.coordinates,
                evses: location.evses,
              }
            : null;

          const row = {
            // OCPI identifiers
            country_code: (cdr.emsp_country_code as string) ?? COUNTRY_CODE,
            party_id: PARTY_ID,
            cdr_id: gfxCdrId,

            // GFX-specific
            gfx_cdr_id: gfxCdrId,
            source: "gfx",

            // Timing
            start_date_time: cdr.start_date_time as string,
            end_date_time: cdr.stop_date_time as string,

            // Token and location
            cdr_token: cdrToken,
            cdr_location: cdrLocation,

            // Energy
            total_energy: (cdr.total_energy as number) ?? 0,
            total_time: (cdr.total_time as number) ?? 0,
            total_parking_time: (cdr.total_parking_time as number) ?? 0,

            // Cost (HT)
            currency: (cdr.currency as string) ?? "EUR",
            total_cost: (cdr.total_cost as number) ?? 0,
            total_cost_incl_vat: (cdr.total_cost_incl_vat as number) ?? null,
            total_vat: (cdr.total_vat as number) ?? null,
            vat_rate: (cdr.vat as number) ?? null,

            // Retail costs (B2B)
            total_retail_cost: (cdr.total_retail_cost as number) ?? null,
            total_retail_cost_incl_vat:
              (cdr.total_retail_cost_incl_vat as number) ?? null,
            total_retail_vat: (cdr.total_retail_vat as number) ?? null,
            retail_vat_rate: (cdr.retail_vat as number) ?? null,

            // B2B fields
            customer_external_id: (cdr.customer_external_id as string) ?? null,
            retail_package_id: (cdr.retail_package_id as string) ?? null,
            custom_groups: customGroups ?? null,
            charger_type: (cdr.charger_type as string) ?? null,
            driver_external_id: (cdr.driver_external_id as string) ?? null,

            // EMSP info
            emsp_country_code: (cdr.emsp_country_code as string) ?? null,
            emsp_party_id: (cdr.emsp_party_id as string) ?? null,
            emsp_external_id: (cdr.emsp_external_id as string) ?? null,

            // Charging periods
            charging_periods: chargingPeriods
              ? JSON.stringify(chargingPeriods)
              : "[]",

            // Station link
            station_id: stationId,

            // Timestamps
            last_updated: new Date().toISOString(),
          };

          const { error: insertErr } = await supabase
            .from("ocpi_cdrs")
            .insert(row);

          if (insertErr) {
            // Handle duplicate key errors gracefully
            if (insertErr.message.includes("duplicate") || insertErr.message.includes("unique")) {
              result.duplicates_skipped++;
            } else {
              result.errors.push(
                `Insert error ${gfxCdrId}: ${insertErr.message}`
              );
            }
          } else {
            result.total_ingested++;
          }
        } catch (cdrError) {
          result.errors.push(
            `CDR error: ${(cdrError as Error).message}`
          );
        }
      }

      currentOffset += cdrs.length;
      pagesProcessed++;

      // If we got fewer than PAGE_SIZE, we've reached the end
      if (cdrs.length < PAGE_SIZE) {
        break;
      }
    }

    // Check if there are more pages
    result.has_more = pagesProcessed >= MAX_PAGES_PER_RUN;

    // 5. Update watermark
    await supabase
      .from("sync_watermarks")
      .update({
        last_offset: currentOffset,
        last_synced_at: new Date().toISOString(),
        metadata: {
          last_run_fetched: result.total_fetched,
          last_run_ingested: result.total_ingested,
          last_run_errors: result.errors.length,
        },
      })
      .eq("id", "gfx-cdr-sync");

    result.watermark_offset = currentOffset;

    console.log(
      `[gfx-cdr-sync] Done: ${JSON.stringify({
        ...result,
        errors: result.errors.slice(0, 5),
      })}`
    );

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[gfx-cdr-sync] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message, result }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
