// ============================================================
// EZDrive Consumer API — Standard Response Builder
// Format compatible with Android EzDriveApiService.kt
// ============================================================

import { corsHeaders, getCorsHeaders } from "./cors.ts";

function getApiHeaders(req?: Request): Record<string, string> {
  return {
    ...(req ? getCorsHeaders(req) : corsHeaders),
    "Content-Type": "application/json",
  };
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Successful response — matches ApiResponse<T> on Android
 */
export function apiSuccess<T>(data: T, message = "OK", httpStatus = 200, req?: Request): Response {
  return new Response(
    JSON.stringify({
      status_code: httpStatus,
      status_message: message,
      data,
      timestamp: now(),
    }),
    { status: httpStatus, headers: getApiHeaders(req) },
  );
}

/**
 * Created response (HTTP 201)
 */
export function apiCreated<T>(data: T, message = "Created", req?: Request): Response {
  return apiSuccess(data, message, 201, req);
}

/**
 * Paginated response — matches Android PaginatedResponse
 */
export function apiPaginated<T>(
  items: T[],
  options: { total: number; offset: number; limit: number },
  req?: Request,
): Response {
  return new Response(
    JSON.stringify({
      status_code: 200,
      status_message: "OK",
      data: {
        items,
        total: options.total,
        page: Math.floor(options.offset / options.limit) + 1,
        pageSize: options.limit,
        hasMore: options.offset + options.limit < options.total,
      },
      timestamp: now(),
    }),
    { status: 200, headers: getApiHeaders(req) },
  );
}

/**
 * Error response
 */
export function apiError(
  httpStatus: number,
  message: string,
  details?: Record<string, string>,
  req?: Request,
): Response {
  return new Response(
    JSON.stringify({
      status_code: httpStatus,
      status_message: message,
      data: null,
      error: details ? { code: String(httpStatus), message, details } : undefined,
      timestamp: now(),
    }),
    { status: httpStatus, headers: getApiHeaders(req) },
  );
}

/**
 * Shorthand errors
 */
export const apiBadRequest = (msg = "Bad Request", details?: Record<string, string>, req?: Request) =>
  apiError(400, msg, details, req);
export const apiUnauthorized = (msg = "Unauthorized", req?: Request) => apiError(401, msg, undefined, req);
export const apiForbidden = (msg = "Forbidden", req?: Request) => apiError(403, msg, undefined, req);
export const apiNotFound = (msg = "Not Found", req?: Request) => apiError(404, msg, undefined, req);
export const apiConflict = (msg = "Conflict", req?: Request) => apiError(409, msg, undefined, req);
export const apiServerError = (msg = "Internal Server Error", req?: Request) => apiError(500, msg, undefined, req);

/**
 * CORS preflight — pass req for dynamic origin reflection on web-facing endpoints
 */
export function apiCorsResponse(req?: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...(req ? getCorsHeaders(req) : corsHeaders),
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    },
  });
}

/**
 * Parse pagination params from URL (same helper pattern as OCPI)
 */
export function parsePagination(
  url: URL,
  defaultLimit = 20,
): { offset: number; limit: number } {
  const offset = Math.max(
    0,
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
  );
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? String(defaultLimit), 10) || defaultLimit),
  );
  return { offset, limit };
}
