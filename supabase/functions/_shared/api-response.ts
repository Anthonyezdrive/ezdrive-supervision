// ============================================================
// EZDrive Consumer API — Standard Response Builder
// Format compatible with Android EzDriveApiService.kt
// ============================================================

import { corsHeaders } from "./cors.ts";

const API_HEADERS = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

function now(): string {
  return new Date().toISOString();
}

/**
 * Successful response — matches ApiResponse<T> on Android
 */
export function apiSuccess<T>(data: T, message = "OK", httpStatus = 200): Response {
  return new Response(
    JSON.stringify({
      status_code: httpStatus,
      status_message: message,
      data,
      timestamp: now(),
    }),
    { status: httpStatus, headers: API_HEADERS },
  );
}

/**
 * Created response (HTTP 201)
 */
export function apiCreated<T>(data: T, message = "Created"): Response {
  return apiSuccess(data, message, 201);
}

/**
 * Paginated response — matches Android PaginatedResponse
 */
export function apiPaginated<T>(
  items: T[],
  options: { total: number; offset: number; limit: number },
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
    { status: 200, headers: API_HEADERS },
  );
}

/**
 * Error response
 */
export function apiError(
  httpStatus: number,
  message: string,
  details?: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      status_code: httpStatus,
      status_message: message,
      data: null,
      error: details ? { code: String(httpStatus), message, details } : undefined,
      timestamp: now(),
    }),
    { status: httpStatus, headers: API_HEADERS },
  );
}

/**
 * Shorthand errors
 */
export const apiBadRequest = (msg = "Bad Request", details?: Record<string, string>) =>
  apiError(400, msg, details);
export const apiUnauthorized = (msg = "Unauthorized") => apiError(401, msg);
export const apiForbidden = (msg = "Forbidden") => apiError(403, msg);
export const apiNotFound = (msg = "Not Found") => apiError(404, msg);
export const apiConflict = (msg = "Conflict") => apiError(409, msg);
export const apiServerError = (msg = "Internal Server Error") => apiError(500, msg);

/**
 * CORS preflight
 */
export function apiCorsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
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
