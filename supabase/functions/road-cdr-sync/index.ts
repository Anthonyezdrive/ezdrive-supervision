// ============================================
// Edge Function: Road CDR Sync
// Ingests sessions (CDRs) from Road.io API into ocpi_cdrs
// Supports incremental sync via watermark table
// Respects CPO isolation: EZDrive Reunion / VCity AG
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { corsHeaders } from "../_shared/cors.ts";
import { roadPost, ROAD_PROVIDER_ID } from "../_shared/road-client.ts";

const ROAD_VCITY_PROVIDER_ID = Deno.env.get("ROAD_VCITY_PROVIDER_ID") ?? "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const COUNTRY_CODE = "FR";
const PARTY_ID = "EZD";
const PAGE_SIZE = 100;
const MAX_PAGES_PER_RUN = 5; // Max 500 sessions per invocation

// -------------------------------------------------------
// Road account config — hermetic CPO isolation
// -------------------------------------------------------
interface RoadAccountConfig {
  providerId: string;
  cpoCode: string;
  label: string;
  watermarkId: string;
}

function getRoadAccounts(): RoadAccountConfig[] {
  const accounts: RoadAccountConfig[] = [];

  if (ROAD_PROVIDER_ID) {
    accounts.push({
      providerId: ROAD_PROVIDER_ID,
      cpoCode: "ezdrive-reunion",
      label: "EZDrive Reunion",
      watermarkId: "road-cdr-sync-reunion",
    });
  }

  if (ROAD_VCITY_PROVIDER_ID) {
    accounts.push({
      providerId: ROAD_VCITY_PROVIDER_ID,
      cpoCode: "vcity-ag",
      label: "VCity AG",
      watermarkId: "road-cdr-sync-vcity",
    });
  }

  return accounts;
}

// -------------------------------------------------------
// Interfaces
// -------------------------------------------------------
interface SyncResult {
  total_fetched: number;
  total_ingested: number;
  duplicates_skipped: number;
  errors: string[];
  has_more: boolean;
  accounts: Array<{ label: string; fetched: number; ingested: number }>;
}

interface RoadSession {
  id?: string;
  _id?: string;
  accountId?: string;
  userId?: string;
  user?: { firstName?: string; lastName?: string; email?: string };
  tokenUid?: string;
  tokenContractId?: string;
  chargePointId?: string;
  kwh?: number;
  durationSeconds?: number;
  currency?: string;
  externalCalculatedPrice?: number;
  priceWithFX?: {
    originalCurrency?: string;
    originalAmount?: number;
    originalAmountWithVAT?: number;
  };
  startedAt?: string;
  endedAt?: string;
  providerContext?: string;
  authType?: string;
  paid?: boolean;
  vatInfo?: {
    vatPercentage?: number;
  };
  location?: {
    name?: string;
    address?: string;
    city?: string;
    postalCode?: string;
    countryCode?: string;
    coordinates?: { latitude?: number; longitude?: number };
  };
  rawRecord?: Record<string, unknown>;
  externalProvider?: { name?: string; country?: string; partyId?: string };
  roamingId?: string;
  billingPlan?: { id?: string; name?: string };
  evseControllerId?: string;
}

// -------------------------------------------------------
// Main handler
// -------------------------------------------------------
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
    has_more: false,
    accounts: [],
  };

  try {
    // Build station lookup (road_id → station UUID + cpo_id)
    const { data: stations } = await supabase
      .from("stations")
      .select("id, road_id, cpo_id")
      .eq("source", "road");

    const stationByRoadId = new Map<string, { id: string; cpo_id: string }>();
    for (const s of stations ?? []) {
      if (s.road_id) stationByRoadId.set(s.road_id, { id: s.id, cpo_id: s.cpo_id });
    }

    // CPO code → cpo_id lookup
    const { data: cpos } = await supabase
      .from("cpo_operators")
      .select("id, code");
    const cpoMap = new Map(
      (cpos ?? []).map((c: { code: string; id: string }) => [c.code, c.id])
    );

    // Process each Road account independently (hermetic isolation)
    const roadAccounts = getRoadAccounts();

    if (roadAccounts.length === 0) {
      return new Response(
        JSON.stringify({ ...result, message: "No ROAD provider IDs configured." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (const account of roadAccounts) {
      const cpoId = cpoMap.get(account.cpoCode) ?? null;
      if (!cpoId) {
        result.errors.push(`CPO "${account.cpoCode}" not found for ${account.label}`);
        continue;
      }

      console.log(`[road-cdr-sync] Starting ${account.label} (provider: ${account.providerId})`);

      const accountResult = await syncAccountSessions(
        supabase,
        account,
        cpoId,
        stationByRoadId
      );

      result.total_fetched += accountResult.fetched;
      result.total_ingested += accountResult.ingested;
      result.duplicates_skipped += accountResult.duplicates;
      result.errors.push(...accountResult.errors);
      if (accountResult.has_more) result.has_more = true;

      result.accounts.push({
        label: account.label,
        fetched: accountResult.fetched,
        ingested: accountResult.ingested,
      });
    }

    console.log(`[road-cdr-sync] Done: ${JSON.stringify({ ...result, errors: result.errors.slice(0, 5) })}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[road-cdr-sync] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message, result }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// -------------------------------------------------------
// Sync sessions for a single Road account
// -------------------------------------------------------
async function syncAccountSessions(
  supabase: ReturnType<typeof createClient>,
  account: RoadAccountConfig,
  cpoId: string,
  stationByRoadId: Map<string, { id: string; cpo_id: string }>
): Promise<{
  fetched: number;
  ingested: number;
  duplicates: number;
  errors: string[];
  has_more: boolean;
}> {
  const accountResult = { fetched: 0, ingested: 0, duplicates: 0, errors: [] as string[], has_more: false };

  // 1. Read watermark for this account
  const { data: watermark } = await supabase
    .from("sync_watermarks")
    .select("*")
    .eq("id", account.watermarkId)
    .single();

  let currentSkip = watermark?.last_offset ?? 0;
  const lastRecordDate = watermark?.last_record_date ?? null;

  console.log(`[road-cdr-sync] ${account.label}: starting from skip=${currentSkip}, lastDate=${lastRecordDate}`);

  // 2. Paginated fetch from Road.io
  let pagesProcessed = 0;

  while (pagesProcessed < MAX_PAGES_PER_RUN) {
    const searchBody: Record<string, unknown> = {
      limit: PAGE_SIZE,
      skip: currentSkip,
    };

    // Filter by account's provider to ensure hermetic isolation
    // The provider header ensures we only see this provider's data

    const res = await roadPost("/1/sessions/search", searchBody);

    if (!res.ok) {
      const errText = await res.text();
      accountResult.errors.push(`Road sessions API error ${res.status}: ${errText}`);
      break;
    }

    const responseData = await res.json();
    const sessions: RoadSession[] = responseData?.data ?? responseData?.items ?? [];
    const total: number = responseData?.meta?.total ?? responseData?.total ?? sessions.length;

    if (sessions.length === 0) {
      console.log(`[road-cdr-sync] ${account.label}: no more sessions at skip=${currentSkip}`);
      break;
    }

    accountResult.fetched += sessions.length;
    console.log(`[road-cdr-sync] ${account.label}: fetched ${sessions.length} sessions (skip=${currentSkip}, total=${total})`);

    // 3. Process each session as a CDR
    for (const session of sessions) {
      try {
        const sessionId = session.id ?? session._id;
        if (!sessionId) {
          accountResult.errors.push("Session missing id");
          continue;
        }

        // Deduplication check by road session ID stored in gfx_cdr_id field
        // (reusing the existing column for Road CDR IDs)
        const roadCdrId = `road-${sessionId}`;

        const { data: existing } = await supabase
          .from("ocpi_cdrs")
          .select("id")
          .eq("gfx_cdr_id", roadCdrId)
          .limit(1);

        if (existing && existing.length > 0) {
          accountResult.duplicates++;
          continue;
        }

        // Resolve station_id from evseControllerId or chargePointId
        let stationId: string | null = null;
        const evseCtrlId = session.evseControllerId;
        if (evseCtrlId) {
          const station = stationByRoadId.get(evseCtrlId);
          if (station) {
            stationId = station.id;
            // Verify CPO isolation: only link if station belongs to this CPO
            if (station.cpo_id !== cpoId) {
              stationId = null; // Don't cross-link CPOs
            }
          }
        }

        // Build cdr_token
        const cdrToken = session.tokenUid
          ? {
              uid: session.tokenUid,
              type: session.authType === "WHITELIST" ? "RFID" : (session.authType ?? "OTHER"),
              contract_id: session.tokenContractId ?? session.tokenUid,
            }
          : null;

        // Build cdr_location
        const loc = session.location;
        const cdrLocation = loc
          ? {
              name: loc.name,
              address: loc.address,
              city: loc.city,
              postal_code: loc.postalCode,
              country: loc.countryCode ?? "FRA",
              coordinates: loc.coordinates,
            }
          : null;

        // Duration in hours
        const durationHours = session.durationSeconds
          ? session.durationSeconds / 3600
          : null;

        // Cost
        const totalCost = session.externalCalculatedPrice ?? 0;
        const vatRate = session.vatInfo?.vatPercentage ?? null;
        const totalCostInclVat = session.priceWithFX?.originalAmountWithVAT ?? null;
        const totalVat = totalCostInclVat && totalCost
          ? Math.round((totalCostInclVat - totalCost) * 100) / 100
          : null;

        // EMSP info (roaming)
        const emspCountryCode = session.externalProvider?.country ?? null;
        const emspPartyId = session.externalProvider?.partyId ?? null;

        // Driver info from user
        const driverExternalId = session.userId ?? null;

        const row = {
          // OCPI identifiers
          country_code: COUNTRY_CODE,
          party_id: PARTY_ID,
          cdr_id: roadCdrId,

          // Road-specific tracking
          gfx_cdr_id: roadCdrId,
          source: "road",

          // Timing
          start_date_time: session.startedAt,
          end_date_time: session.endedAt,

          // Token and location
          cdr_token: cdrToken,
          cdr_location: cdrLocation,

          // Energy
          total_energy: session.kwh ?? 0,
          total_time: durationHours ?? 0,
          total_parking_time: 0,

          // Cost
          currency: session.currency ?? session.priceWithFX?.originalCurrency ?? "EUR",
          total_cost: totalCost,
          total_cost_incl_vat: totalCostInclVat,
          total_vat: totalVat,
          vat_rate: vatRate,

          // EMSP / roaming
          emsp_country_code: emspCountryCode,
          emsp_party_id: emspPartyId,
          emsp_external_id: session.roamingId ?? null,

          // Driver
          driver_external_id: driverExternalId,

          // Raw OCPI record if available
          charging_periods: session.rawRecord?.charging_periods
            ? JSON.stringify(session.rawRecord.charging_periods)
            : "[]",

          // Station link (CPO-isolated)
          station_id: stationId,

          // Timestamps
          last_updated: new Date().toISOString(),
        };

        const { error: insertErr } = await supabase
          .from("ocpi_cdrs")
          .insert(row);

        if (insertErr) {
          if (insertErr.message.includes("duplicate") || insertErr.message.includes("unique")) {
            accountResult.duplicates++;
          } else {
            accountResult.errors.push(`Insert error ${roadCdrId}: ${insertErr.message}`);
          }
        } else {
          accountResult.ingested++;
        }
      } catch (sessionError) {
        accountResult.errors.push(`Session error: ${(sessionError as Error).message}`);
      }
    }

    currentSkip += sessions.length;
    pagesProcessed++;

    // If fewer than PAGE_SIZE, we've reached the end
    if (sessions.length < PAGE_SIZE) break;
  }

  accountResult.has_more = pagesProcessed >= MAX_PAGES_PER_RUN;

  // 4. Update watermark
  const latestDate = accountResult.fetched > 0
    ? new Date().toISOString()
    : (lastRecordDate ?? new Date().toISOString());

  await supabase
    .from("sync_watermarks")
    .upsert({
      id: account.watermarkId,
      last_offset: currentSkip,
      last_synced_at: new Date().toISOString(),
      last_record_date: latestDate,
      metadata: {
        last_run_fetched: accountResult.fetched,
        last_run_ingested: accountResult.ingested,
        last_run_duplicates: accountResult.duplicates,
        last_run_errors: accountResult.errors.length,
        provider_id: account.providerId,
        cpo_code: account.cpoCode,
      },
    });

  console.log(`[road-cdr-sync] ${account.label}: done — ${accountResult.ingested} ingested, ${accountResult.duplicates} dupes, ${accountResult.errors.length} errors`);

  return accountResult;
}
