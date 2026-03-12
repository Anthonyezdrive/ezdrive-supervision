// ============================================================
// OCPI 2.2.1 Database Helpers
// Supabase service-role client for OCPI tables
// ============================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

let _client: SupabaseClient | null = null;

export function getDB(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }
  return _client;
}

// --- Location Queries ---

export async function getOcpiLocations(params: {
  countryCode: string;
  partyId: string;
  offset?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
}) {
  const db = getDB();
  let query = db
    .from("ocpi_locations")
    .select("*, ocpi_evses(*, ocpi_connectors(*))", { count: "exact" })
    .eq("country_code", params.countryCode)
    .eq("party_id", params.partyId)
    .eq("publish", true)
    .order("last_updated", { ascending: true });

  if (params.dateFrom) {
    query = query.gte("last_updated", params.dateFrom);
  }
  if (params.dateTo) {
    query = query.lte("last_updated", params.dateTo);
  }

  const offset = params.offset ?? 0;
  const limit = params.limit ?? 20;  // Gireve: 20 locations per page
  query = query.range(offset, offset + limit - 1);

  return query;
}

export async function getOcpiLocationById(
  countryCode: string,
  partyId: string,
  locationId: string,
) {
  const db = getDB();
  return db
    .from("ocpi_locations")
    .select("*, ocpi_evses(*, ocpi_connectors(*))")
    .eq("country_code", countryCode)
    .eq("party_id", partyId)
    .eq("ocpi_id", locationId)
    .single();
}

export async function getOcpiEvseByUid(
  locationId: string,
  evseUid: string,
) {
  const db = getDB();
  return db
    .from("ocpi_evses")
    .select("*, ocpi_connectors(*)")
    .eq("location_id", locationId)
    .eq("uid", evseUid)
    .single();
}

// --- Token Queries ---

export async function getOcpiTokens(params: {
  countryCode: string;
  partyId: string;
  offset?: number;
  limit?: number;
  dateFrom?: string;
}) {
  const db = getDB();
  let query = db
    .from("ocpi_tokens")
    .select("*", { count: "exact" })
    .eq("country_code", params.countryCode)
    .eq("party_id", params.partyId)
    .order("last_updated", { ascending: true });

  if (params.dateFrom) {
    query = query.gte("last_updated", params.dateFrom);
  }

  const offset = params.offset ?? 0;
  const limit = params.limit ?? 1000;  // Gireve: 1000 tokens per page
  query = query.range(offset, offset + limit - 1);

  return query;
}

export async function getOcpiTokenByUid(
  countryCode: string,
  partyId: string,
  uid: string,
) {
  const db = getDB();
  return db
    .from("ocpi_tokens")
    .select("*")
    .eq("country_code", countryCode)
    .eq("party_id", partyId)
    .eq("uid", uid)
    .single();
}

/**
 * Authorize a token (POST /tokens/{token_uid}/authorize)
 * Gireve sends this to CPO to check if token is valid
 */
export async function authorizeToken(
  tokenUid: string,
  locationReferences?: { location_id: string; evse_uids?: string[] },
) {
  const db = getDB();

  // Find the token
  const { data: token } = await db
    .from("ocpi_tokens")
    .select("*")
    .eq("uid", tokenUid)
    .eq("valid", true)
    .single();

  if (!token) {
    return {
      allowed: "NOT_ALLOWED" as const,
      token: null,
      location: null,
    };
  }

  // Check whitelist
  if (token.whitelist === "NEVER") {
    return { allowed: "NOT_ALLOWED" as const, token, location: null };
  }

  if (token.whitelist === "ALWAYS" || token.whitelist === "ALLOWED") {
    // Verify location exists if provided
    if (locationReferences?.location_id) {
      const { data: location } = await db
        .from("ocpi_locations")
        .select("ocpi_id")
        .eq("ocpi_id", locationReferences.location_id)
        .single();

      if (!location) {
        return { allowed: "NOT_ALLOWED" as const, token, location: null };
      }
    }

    return {
      allowed: "ALLOWED" as const,
      token,
      location: locationReferences,
    };
  }

  return { allowed: "NOT_ALLOWED" as const, token, location: null };
}

// --- Session Queries ---

export async function getOcpiSessions(params: {
  countryCode: string;
  partyId: string;
  offset?: number;
  limit?: number;
  dateFrom?: string;
}) {
  const db = getDB();
  let query = db
    .from("ocpi_sessions")
    .select("*", { count: "exact" })
    .eq("country_code", params.countryCode)
    .eq("party_id", params.partyId)
    .order("last_updated", { ascending: true });

  if (params.dateFrom) {
    query = query.gte("last_updated", params.dateFrom);
  }

  const offset = params.offset ?? 0;
  const limit = params.limit ?? 20;
  query = query.range(offset, offset + limit - 1);

  return query;
}

// --- CDR Queries ---

export async function getOcpiCdrs(params: {
  countryCode: string;
  partyId: string;
  offset?: number;
  limit?: number;
  dateFrom?: string;
}) {
  const db = getDB();
  let query = db
    .from("ocpi_cdrs")
    .select("*", { count: "exact" })
    .eq("country_code", params.countryCode)
    .eq("party_id", params.partyId)
    .order("last_updated", { ascending: true });

  if (params.dateFrom) {
    query = query.gte("last_updated", params.dateFrom);
  }

  const offset = params.offset ?? 0;
  const limit = params.limit ?? 20;  // Gireve: 20 CDRs per page
  query = query.range(offset, offset + limit - 1);

  return query;
}

// --- Tariff Queries ---

export async function getOcpiTariffs(params: {
  countryCode: string;
  partyId: string;
  offset?: number;
  limit?: number;
  dateFrom?: string;
}) {
  const db = getDB();
  let query = db
    .from("ocpi_tariffs")
    .select("*", { count: "exact" })
    .eq("country_code", params.countryCode)
    .eq("party_id", params.partyId)
    .order("last_updated", { ascending: true });

  if (params.dateFrom) {
    query = query.gte("last_updated", params.dateFrom);
  }

  const offset = params.offset ?? 0;
  const limit = params.limit ?? 100;  // Gireve: 100 tariffs per page
  query = query.range(offset, offset + limit - 1);

  return query;
}

// --- Push Queue ---

export async function getPendingPushItems(limit = 50) {
  const db = getDB();
  return db
    .from("ocpi_push_queue")
    .select("*")
    .in("status", ["PENDING", "RETRY"])
    .lte("next_retry_at", new Date().toISOString())
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })  // FIFO per Gireve Store&Forward
    .limit(limit);
}

export async function markPushItemProcessing(id: string) {
  const db = getDB();
  return db
    .from("ocpi_push_queue")
    .update({ status: "PROCESSING" })
    .eq("id", id);
}

export async function markPushItemSent(id: string) {
  const db = getDB();
  return db
    .from("ocpi_push_queue")
    .update({
      status: "SENT",
      processed_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function markPushItemFailed(id: string, error: string, attempts: number) {
  const db = getDB();
  // Exponential backoff: 1min, 5min, 15min, 60min, 240min
  const backoffMinutes = [1, 5, 15, 60, 240];
  const nextRetryMinutes = backoffMinutes[Math.min(attempts, backoffMinutes.length - 1)];
  const nextRetryAt = new Date(Date.now() + nextRetryMinutes * 60 * 1000).toISOString();

  return db
    .from("ocpi_push_queue")
    .update({
      status: attempts >= 5 ? "FAILED" : "RETRY",
      last_error: error,
      attempts: attempts + 1,
      next_retry_at: nextRetryAt,
    })
    .eq("id", id);
}

// --- Commands ---

export async function saveCommand(command: {
  command: string;
  source: "RECEIVED" | "SENT";
  request_data: unknown;
  response_url?: string;
}) {
  const db = getDB();
  return db.from("ocpi_commands").insert(command).select().single();
}

export async function updateCommandResult(id: string, result: string, callbackData?: unknown) {
  const db = getDB();
  return db
    .from("ocpi_commands")
    .update({
      result,
      callback_data: callbackData,
      callback_sent: !!callbackData,
    })
    .eq("id", id);
}
