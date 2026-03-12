// ============================================================
// OCPI 2.2.1 Standard Response Builder
// Per OCPI spec: all responses must follow this envelope format
// ============================================================

import type { OcpiResponse } from "./ocpi-types.ts";
import { buildOcpiResponseHeaders } from "./ocpi-headers.ts";

/**
 * OCPI Status Codes (not HTTP status codes)
 * These go inside the response body as "status_code"
 */
export const OCPI_STATUS = {
  // 1xxx: Success
  SUCCESS: 1000,

  // 2xxx: Client errors
  GENERIC_CLIENT_ERROR: 2000,
  INVALID_OR_MISSING_PARAMETERS: 2001,
  NOT_ENOUGH_INFORMATION: 2002,
  UNKNOWN_LOCATION: 2003,
  UNKNOWN_TOKEN: 2004,

  // 3xxx: Server errors
  GENERIC_SERVER_ERROR: 3000,
  UNABLE_TO_USE_CLIENT_API: 3001,
  UNSUPPORTED_VERSION: 3002,
  NO_MATCHING_ENDPOINTS: 3003,

  // 4xxx: Hub errors (from Gireve)
  UNKNOWN_RECEIVER: 4001,
  TIMEOUT_ON_FORWARDED_REQUEST: 4002,
  CONNECTION_PROBLEM: 4003,
} as const;

function now(): string {
  return new Date().toISOString();
}

/**
 * Build a successful OCPI response
 */
export function ocpiSuccess<T>(data: T, correlationId?: string): Response {
  const body: OcpiResponse<T> = {
    data,
    status_code: OCPI_STATUS.SUCCESS,
    status_message: "Success",
    timestamp: now(),
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: buildOcpiResponseHeaders(correlationId),
  });
}

/**
 * Build an OCPI paginated response
 * Per Gireve spec: Locations 20/page, Tokens 1000/page, CDRs 20/page, Tariffs 100/page
 */
export function ocpiPaginatedSuccess<T>(
  data: T[],
  options: {
    offset: number;
    limit: number;
    total: number;
    correlationId?: string;
  },
): Response {
  const body: OcpiResponse<T[]> = {
    data,
    status_code: OCPI_STATUS.SUCCESS,
    status_message: "Success",
    timestamp: now(),
  };

  const headers = buildOcpiResponseHeaders(options.correlationId);

  // OCPI pagination uses Link header
  const nextOffset = options.offset + options.limit;
  if (nextOffset < options.total) {
    headers["X-Total-Count"] = String(options.total);
    headers["X-Limit"] = String(options.limit);
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers,
  });
}

/**
 * Build an OCPI error response
 */
export function ocpiError(
  statusCode: number,
  message: string,
  httpStatus = 200,  // OCPI errors are still HTTP 200 by convention
  correlationId?: string,
): Response {
  const body: OcpiResponse<null> = {
    data: null,
    status_code: statusCode,
    status_message: message,
    timestamp: now(),
  };

  return new Response(JSON.stringify(body), {
    status: httpStatus,
    headers: buildOcpiResponseHeaders(correlationId),
  });
}

/**
 * Build a 404 Not Found response
 */
export function ocpiNotFound(message = "Object not found", correlationId?: string): Response {
  return ocpiError(OCPI_STATUS.UNKNOWN_LOCATION, message, 200, correlationId);
}

/**
 * Build a 401 Unauthorized response
 */
export function ocpiUnauthorized(correlationId?: string): Response {
  const body: OcpiResponse<null> = {
    data: null,
    status_code: OCPI_STATUS.GENERIC_CLIENT_ERROR,
    status_message: "Unauthorized - Invalid or missing token",
    timestamp: now(),
  };

  return new Response(JSON.stringify(body), {
    status: 401,
    headers: buildOcpiResponseHeaders(correlationId),
  });
}

/**
 * Handle CORS OPTIONS preflight
 */
export function ocpiCorsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: buildOcpiResponseHeaders(),
  });
}

/**
 * Parse pagination params from URL
 */
export function parsePagination(url: URL, defaultLimit = 20): { offset: number; limit: number } {
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get("limit") ?? String(defaultLimit), 10) || defaultLimit));
  return { offset, limit };
}

/**
 * Parse date_from / date_to query params
 */
export function parseDateFilters(url: URL): { dateFrom?: string; dateTo?: string } {
  return {
    dateFrom: url.searchParams.get("date_from") ?? undefined,
    dateTo: url.searchParams.get("date_to") ?? undefined,
  };
}
