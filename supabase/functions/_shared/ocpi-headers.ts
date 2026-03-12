// ============================================================
// OCPI 2.2.1 Headers — Gireve IOP Compliance
// Per Gireve Implementation Guide v1.2 Section 2.1.3-2.1.4
// ============================================================

import {
  EZDRIVE_COUNTRY_CODE,
  EZDRIVE_PARTY_ID,
} from "./ocpi-types.ts";

/**
 * Generate a unique request ID (UUID v4)
 * Required by Gireve for X-Request-ID header
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Generate or forward a correlation ID
 * Required by Gireve for X-Correlation-ID header
 * - For new requests: generate new UUID
 * - For forwarded requests: use the incoming correlation ID
 */
export function getCorrelationId(incomingHeaders?: Headers): string {
  const existing = incomingHeaders?.get("x-correlation-id");
  return existing ?? crypto.randomUUID();
}

/**
 * Build OCPI headers for outgoing requests to Gireve IOP
 *
 * Required headers per Gireve spec:
 * - Authorization: Token <base64_encoded_token>
 * - X-Request-ID: unique per request
 * - X-Correlation-ID: unique per transaction (may span multiple requests)
 * - ocpi-from-country-code: sender country
 * - ocpi-from-party-id: sender party
 * - ocpi-to-country-code: receiver country
 * - ocpi-to-party-id: receiver party
 */
export function buildOcpiHeaders(options: {
  token: string;
  toCountryCode: string;
  toPartyId: string;
  correlationId?: string;
  fromCountryCode?: string;
  fromPartyId?: string;
  contentType?: string;
}): Record<string, string> {
  // OCPI 2.2.1: Token must be base64-encoded
  const encodedToken = btoa(options.token);

  return {
    "Authorization": `Token ${encodedToken}`,
    "Content-Type": options.contentType ?? "application/json",
    "Accept": "application/json",
    "X-Request-ID": generateRequestId(),
    "X-Correlation-ID": options.correlationId ?? generateRequestId(),
    "ocpi-from-country-code": options.fromCountryCode ?? EZDRIVE_COUNTRY_CODE,
    "ocpi-from-party-id": options.fromPartyId ?? EZDRIVE_PARTY_ID,
    "ocpi-to-country-code": options.toCountryCode,
    "ocpi-to-party-id": options.toPartyId,
  };
}

/**
 * Parse incoming OCPI headers from Gireve IOP
 * Validates required headers and extracts routing info
 */
export interface OcpiIncomingHeaders {
  requestId: string;
  correlationId: string;
  fromCountryCode: string;
  fromPartyId: string;
  toCountryCode: string;
  toPartyId: string;
  authorization: string;  // Raw token (decoded)
}

export function parseOcpiHeaders(headers: Headers): OcpiIncomingHeaders | null {
  const authHeader = headers.get("authorization");
  if (!authHeader) return null;

  // Extract token: "Token <base64>" → decode
  let token = "";
  if (authHeader.startsWith("Token ")) {
    try {
      token = atob(authHeader.substring(6));
    } catch {
      token = authHeader.substring(6); // Fallback if not base64
    }
  }

  const requestId = headers.get("x-request-id") ?? "";
  const correlationId = headers.get("x-correlation-id") ?? requestId;

  return {
    requestId,
    correlationId,
    fromCountryCode: headers.get("ocpi-from-country-code") ?? "",
    fromPartyId: headers.get("ocpi-from-party-id") ?? "",
    toCountryCode: headers.get("ocpi-to-country-code") ?? EZDRIVE_COUNTRY_CODE,
    toPartyId: headers.get("ocpi-to-party-id") ?? EZDRIVE_PARTY_ID,
    authorization: token,
  };
}

/**
 * Build response headers for incoming OCPI requests
 */
export function buildOcpiResponseHeaders(correlationId?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Request-ID": generateRequestId(),
    "X-Correlation-ID": correlationId ?? generateRequestId(),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id, x-correlation-id, ocpi-from-country-code, ocpi-from-party-id, ocpi-to-country-code, ocpi-to-party-id",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  };
}
