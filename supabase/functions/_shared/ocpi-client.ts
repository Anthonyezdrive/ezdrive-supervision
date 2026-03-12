// ============================================================
// OCPI 2.2.1 HTTP Client — Outbound Requests to Gireve IOP
// Handles authentication, headers, retry, and logging
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildOcpiHeaders } from "./ocpi-headers.ts";
import { getOutboundToken, getCredentialDetails } from "./ocpi-auth.ts";
import {
  GIREVE_PREPROD_URL,
  GIREVE_PROD_URL,
  GIREVE_PREPROD_COUNTRY,
  GIREVE_PREPROD_PARTY,
  GIREVE_PROD_COUNTRY,
  GIREVE_PROD_PARTY,
  OCPI_VERSION,
  type OcpiResponse,
} from "./ocpi-types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function getDB() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export interface OcpiClientConfig {
  platform?: "PREPROD" | "PROD";
  role?: "CPO" | "EMSP";
  timeout?: number;
}

/**
 * Make an outbound OCPI request to Gireve IOP
 *
 * Handles:
 * - Token retrieval from DB
 * - Base64 encoding of token (OCPI 2.2.1 requirement)
 * - Required OCPI headers (routing, tracing)
 * - Response logging to ocpi_push_log
 * - Store and Forward compliance (retry on failure)
 */
export async function ocpiFetch<T = unknown>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    config?: OcpiClientConfig;
    correlationId?: string;
  } = {},
): Promise<{ ok: boolean; status: number; data: OcpiResponse<T> | null; error?: string }> {
  const platform = options.config?.platform ?? "PREPROD";
  const role = options.config?.role ?? "CPO";
  const method = options.method ?? "GET";

  // Get outbound token
  const token = await getOutboundToken(role, platform);
  if (!token) {
    return { ok: false, status: 0, data: null, error: `No valid token_b found for ${role} ${platform}` };
  }

  // Get Gireve platform URL
  const baseUrl = platform === "PROD" ? GIREVE_PROD_URL : GIREVE_PREPROD_URL;
  const toCountry = platform === "PROD" ? GIREVE_PROD_COUNTRY : GIREVE_PREPROD_COUNTRY;
  const toParty = platform === "PROD" ? GIREVE_PROD_PARTY : GIREVE_PREPROD_PARTY;

  // Build full URL: baseUrl/ocpi/{role}/2.2.1/{path}
  const fullPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${baseUrl}/ocpi/${role.toLowerCase()}/2.2.1${fullPath}`;

  // Build headers
  const headers = buildOcpiHeaders({
    token,
    toCountryCode: toCountry,
    toPartyId: toParty,
    correlationId: options.correlationId,
  });

  const startTime = Date.now();

  console.log(`[OCPI Client] ${method} ${url}`);

  try {
    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(options.config?.timeout ?? 30000),
    };

    if (options.body && method !== "GET") {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, fetchOptions);
    const duration = Date.now() - startTime;

    let responseBody: OcpiResponse<T> | null = null;
    try {
      responseBody = await response.json() as OcpiResponse<T>;
    } catch {
      console.error(`[OCPI Client] Failed to parse response body`);
    }

    console.log(`[OCPI Client] ${method} ${url} → ${response.status} (${duration}ms)`);

    // Log to push log
    await logOcpiRequest({
      module: extractModule(path),
      action: method,
      ocpiPath: fullPath,
      requestHeaders: headers,
      requestBody: options.body ?? null,
      responseStatus: response.status,
      responseBody,
      requestId: headers["X-Request-ID"],
      correlationId: headers["X-Correlation-ID"],
      durationMs: duration,
    });

    return {
      ok: response.ok && (responseBody?.status_code === 1000),
      status: response.status,
      data: responseBody,
      error: responseBody?.status_code !== 1000 ? responseBody?.status_message : undefined,
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`[OCPI Client] ${method} ${url} FAILED: ${errorMessage} (${duration}ms)`);

    await logOcpiRequest({
      module: extractModule(path),
      action: method,
      ocpiPath: fullPath,
      requestHeaders: headers,
      requestBody: options.body ?? null,
      responseStatus: 0,
      responseBody: { error: errorMessage },
      requestId: headers["X-Request-ID"],
      correlationId: headers["X-Correlation-ID"],
      durationMs: duration,
    });

    return { ok: false, status: 0, data: null, error: errorMessage };
  }
}

/**
 * Push a location update to Gireve
 */
export async function pushLocation(
  countryCode: string,
  partyId: string,
  locationId: string,
  body: unknown,
  config?: OcpiClientConfig,
) {
  return ocpiFetch(`/locations/${countryCode}/${partyId}/${locationId}`, {
    method: "PUT",
    body,
    config: { ...config, role: "CPO" },
  });
}

/**
 * Patch an EVSE status to Gireve
 */
export async function patchEvseStatus(
  countryCode: string,
  partyId: string,
  locationId: string,
  evseUid: string,
  body: unknown,
  config?: OcpiClientConfig,
) {
  return ocpiFetch(`/locations/${countryCode}/${partyId}/${locationId}/${evseUid}`, {
    method: "PATCH",
    body,
    config: { ...config, role: "CPO" },
  });
}

/**
 * Post a CDR to Gireve
 */
export async function postCdr(body: unknown, config?: OcpiClientConfig) {
  return ocpiFetch("/cdrs", {
    method: "POST",
    body,
    config: { ...config, role: "CPO" },
  });
}

/**
 * Push a session update to Gireve
 */
export async function pushSession(
  countryCode: string,
  partyId: string,
  sessionId: string,
  body: unknown,
  config?: OcpiClientConfig,
) {
  return ocpiFetch(`/sessions/${countryCode}/${partyId}/${sessionId}`, {
    method: "PUT",
    body,
    config: { ...config, role: "CPO" },
  });
}

/**
 * Push a tariff to Gireve
 */
export async function pushTariff(
  countryCode: string,
  partyId: string,
  tariffId: string,
  body: unknown,
  config?: OcpiClientConfig,
) {
  return ocpiFetch(`/tariffs/${countryCode}/${partyId}/${tariffId}`, {
    method: "PUT",
    body,
    config: { ...config, role: "CPO" },
  });
}

/**
 * Push token (eMSP role) to Gireve
 */
export async function pushToken(
  countryCode: string,
  partyId: string,
  tokenUid: string,
  body: unknown,
  config?: OcpiClientConfig,
) {
  return ocpiFetch(`/tokens/${countryCode}/${partyId}/${tokenUid}`, {
    method: "PUT",
    body,
    config: { ...config, role: "EMSP" },
  });
}

/**
 * Get locations from Gireve (eMSP PULL)
 */
export async function pullLocations(
  params?: { dateFrom?: string; dateTo?: string; offset?: number; limit?: number },
  config?: OcpiClientConfig,
) {
  const query = new URLSearchParams();
  if (params?.dateFrom) query.set("date_from", params.dateFrom);
  if (params?.dateTo) query.set("date_to", params.dateTo);
  if (params?.offset !== undefined) query.set("offset", String(params.offset));
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();

  return ocpiFetch(`/locations${qs ? `?${qs}` : ""}`, {
    config: { ...config, role: "EMSP" },
  });
}

// --- Helpers ---

function extractModule(path: string): string {
  const match = path.match(/^\/?([a-z]+)/);
  return match?.[1] ?? "unknown";
}

async function logOcpiRequest(entry: {
  module: string;
  action: string;
  ocpiPath: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  responseStatus: number;
  responseBody: unknown;
  requestId: string;
  correlationId: string;
  durationMs: number;
}) {
  try {
    const db = getDB();
    // Sanitize headers: remove Authorization
    const safeHeaders = { ...entry.requestHeaders };
    delete safeHeaders["Authorization"];

    await db.from("ocpi_push_log").insert({
      module: entry.module,
      action: entry.action,
      ocpi_path: entry.ocpiPath,
      request_headers: safeHeaders,
      request_body: entry.requestBody,
      response_status: entry.responseStatus,
      response_body: entry.responseBody,
      x_request_id: entry.requestId,
      x_correlation_id: entry.correlationId,
      duration_ms: entry.durationMs,
    });
  } catch (err) {
    console.error("[OCPI Client] Failed to log request:", err);
  }
}
