// ============================================
// Edge Function: Road CDR Fix Links (one-time)
// Retroactively links existing Road CDRs to stations
// by fetching all sessions from Road.io and matching
// evseControllerId → stations.road_id
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getRoadAccounts,
  roadPostWithAuth,
  type RoadAccountConfig,
} from "../_shared/road-client.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PAGE_SIZE = 100;
const MAX_PAGES = 50; // Safety limit: 5000 sessions max per account

interface FixResult {
  total_sessions_fetched: number;
  total_cdrs_updated: number;
  total_cdrs_not_found: number;
  total_no_evse_controller: number;
  total_station_not_found: number;
  total_already_linked: number;
  errors: string[];
  accounts: Array<{
    label: string;
    sessions_fetched: number;
    cdrs_updated: number;
  }>;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const result: FixResult = {
    total_sessions_fetched: 0,
    total_cdrs_updated: 0,
    total_cdrs_not_found: 0,
    total_no_evse_controller: 0,
    total_station_not_found: 0,
    total_already_linked: 0,
    errors: [],
    accounts: [],
  };

  try {
    // -------------------------------------------------------
    // 1. Build station lookup: road_id → station UUID + cpo_id
    // -------------------------------------------------------
    const { data: stations } = await supabase
      .from("stations")
      .select("id, road_id, cpo_id")
      .eq("source", "road");

    const stationByRoadId = new Map<string, { id: string; cpo_id: string }>();
    for (const s of stations ?? []) {
      if (s.road_id) stationByRoadId.set(s.road_id, { id: s.id, cpo_id: s.cpo_id });
    }

    console.log(`[road-cdr-fix-links] Loaded ${stationByRoadId.size} stations with road_id`);

    // -------------------------------------------------------
    // 2. CPO code → cpo_id lookup
    // -------------------------------------------------------
    const { data: cpos } = await supabase
      .from("cpo_operators")
      .select("id, code");
    const cpoMap = new Map(
      (cpos ?? []).map((c: { code: string; id: string }) => [c.code, c.id])
    );

    // -------------------------------------------------------
    // 3. Process each Road account
    // -------------------------------------------------------
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

      console.log(`[road-cdr-fix-links] Processing ${account.label}...`);

      const accountResult = await fixAccountCdrs(
        supabase,
        account,
        cpoId,
        stationByRoadId
      );

      result.total_sessions_fetched += accountResult.sessions_fetched;
      result.total_cdrs_updated += accountResult.cdrs_updated;
      result.total_cdrs_not_found += accountResult.cdrs_not_found;
      result.total_no_evse_controller += accountResult.no_evse_controller;
      result.total_station_not_found += accountResult.station_not_found;
      result.total_already_linked += accountResult.already_linked;
      result.errors.push(...accountResult.errors);

      result.accounts.push({
        label: account.label,
        sessions_fetched: accountResult.sessions_fetched,
        cdrs_updated: accountResult.cdrs_updated,
      });
    }

    console.log(`[road-cdr-fix-links] Done: ${JSON.stringify({
      ...result,
      errors: result.errors.slice(0, 10),
    })}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[road-cdr-fix-links] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message, result }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// -------------------------------------------------------
// Fix CDRs for a single Road account
// -------------------------------------------------------
async function fixAccountCdrs(
  supabase: ReturnType<typeof createClient>,
  account: RoadAccountConfig,
  cpoId: string,
  stationByRoadId: Map<string, { id: string; cpo_id: string }>
): Promise<{
  sessions_fetched: number;
  cdrs_updated: number;
  cdrs_not_found: number;
  no_evse_controller: number;
  station_not_found: number;
  already_linked: number;
  errors: string[];
}> {
  const r = {
    sessions_fetched: 0,
    cdrs_updated: 0,
    cdrs_not_found: 0,
    no_evse_controller: 0,
    station_not_found: 0,
    already_linked: 0,
    errors: [] as string[],
  };

  // Fetch CPO sessions specifically — Road.io only includes evseControllerId
  // when providerContext=cpo is requested. Without it, sessions lack station links.
  let currentSkip = 0;
  let pagesProcessed = 0;

  while (pagesProcessed < MAX_PAGES) {
    const res = await roadPostWithAuth(
      "/1/sessions/search",
      { limit: PAGE_SIZE, skip: currentSkip, providerContext: "cpo" },
      account.apiToken,
      account.providerId
    );

    if (!res.ok) {
      const errText = await res.text();
      r.errors.push(`Road API error ${res.status}: ${errText}`);
      break;
    }

    const responseData = await res.json();
    const sessions = responseData?.data ?? responseData?.items ?? [];

    if (sessions.length === 0) {
      console.log(`[road-cdr-fix-links] ${account.label}: no more sessions at skip=${currentSkip}`);
      break;
    }

    r.sessions_fetched += sessions.length;
    console.log(`[road-cdr-fix-links] ${account.label}: fetched ${sessions.length} sessions (skip=${currentSkip})`);

    // Process each CPO session — match to existing CDRs by start_date_time + driver
    // (CPO and MSP views of the same session have DIFFERENT IDs in Road.io)
    for (const session of sessions) {
      try {
        const sessionId = session.id ?? session._id;
        if (!sessionId) continue;

        const evseCtrlId = session.evseControllerId;
        if (!evseCtrlId) {
          r.no_evse_controller++;
          continue;
        }

        const station = stationByRoadId.get(evseCtrlId);
        if (!station) {
          r.station_not_found++;
          continue;
        }

        if (station.cpo_id !== cpoId) {
          r.errors.push(`CPO mismatch for session ${sessionId}`);
          continue;
        }

        // Strategy 1: Try matching by exact gfx_cdr_id (CPO session ID)
        const roadCdrId = `road-${sessionId}`;
        let { data: existingCdr } = await supabase
          .from("ocpi_cdrs")
          .select("id, station_id")
          .eq("gfx_cdr_id", roadCdrId)
          .limit(1);

        // Strategy 2: Match by start_date_time + driver_external_id
        // (same event stored with MSP session ID)
        if ((!existingCdr || existingCdr.length === 0) && session.startedAt && session.userId) {
          const { data: matchByTime } = await supabase
            .from("ocpi_cdrs")
            .select("id, station_id")
            .eq("source", "road")
            .eq("start_date_time", session.startedAt)
            .eq("driver_external_id", session.userId)
            .is("station_id", null)
            .limit(1);
          if (matchByTime && matchByTime.length > 0) {
            existingCdr = matchByTime;
          }
        }

        // Strategy 3: Match by start_date_time alone (if unique enough)
        if ((!existingCdr || existingCdr.length === 0) && session.startedAt) {
          const { data: matchByTimeOnly } = await supabase
            .from("ocpi_cdrs")
            .select("id, station_id")
            .eq("source", "road")
            .eq("start_date_time", session.startedAt)
            .is("station_id", null)
            .limit(1);
          if (matchByTimeOnly && matchByTimeOnly.length > 0) {
            existingCdr = matchByTimeOnly;
          }
        }

        if (!existingCdr || existingCdr.length === 0) {
          r.cdrs_not_found++;
          continue;
        }

        const cdr = existingCdr[0];

        if (cdr.station_id === station.id) {
          r.already_linked++;
          continue;
        }

        const { error: updateErr } = await supabase
          .from("ocpi_cdrs")
          .update({ station_id: station.id })
          .eq("id", cdr.id);

        if (updateErr) {
          r.errors.push(`Update error for ${roadCdrId}: ${updateErr.message}`);
        } else {
          r.cdrs_updated++;
        }
      } catch (sessionError) {
        r.errors.push(`Session error: ${(sessionError as Error).message}`);
      }
    }

    currentSkip += sessions.length;
    pagesProcessed++;

    if (sessions.length < PAGE_SIZE) break;
  }

  console.log(`[road-cdr-fix-links] ${account.label}: done — ${r.cdrs_updated} updated, ${r.cdrs_not_found} not found in DB, ${r.no_evse_controller} without evseControllerId, ${r.station_not_found} station not found, ${r.already_linked} already linked`);

  return r;
}
