// ============================================================
// EZDrive Consumer API — Reports Module
// Station issue reports (out of order, damaged, etc.)
// Integration with supervision alert_history
// ============================================================

import {
  apiSuccess,
  apiCreated,
  apiBadRequest,
  apiNotFound,
  apiServerError,
  apiPaginated,
  parsePagination,
} from "../../_shared/api-response.ts";
import { getServiceClient } from "../../_shared/auth-middleware.ts";
import type { RouteContext } from "../index.ts";

const VALID_REPORT_TYPES = [
  "OUT_OF_ORDER", "DAMAGED_CONNECTOR", "ACCESS_BLOCKED",
  "WRONG_INFO", "SAFETY_HAZARD", "VANDALISM", "OTHER",
];

export async function handleReports(ctx: RouteContext): Promise<Response> {
  const { method, segments } = ctx;
  const action = segments[0] ?? "";

  // GET /api/reports/user — current user's reports
  if (action === "user" && method === "GET") {
    return getUserReports(ctx);
  }

  switch (method) {
    case "GET":
      if (action) return getReport(ctx, action);
      return getUserReports(ctx);

    case "POST":
      return createReport(ctx);

    default:
      return apiBadRequest("Unsupported method");
  }
}

// ─── Create report ──────────────────────────────────────────

async function createReport(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const body = await ctx.req.json();

  if (!body.station_id || !body.report_type) {
    return apiBadRequest("station_id and report_type required");
  }

  if (!VALID_REPORT_TYPES.includes(body.report_type)) {
    return apiBadRequest(`report_type must be one of: ${VALID_REPORT_TYPES.join(", ")}`);
  }

  const { data, error } = await db
    .from("station_reports")
    .insert({
      station_id: body.station_id,
      user_id: ctx.auth!.user.id,
      report_type: body.report_type,
      description: body.description ?? null,
      photos: body.photos ?? [],
    })
    .select()
    .single();

  if (error) {
    console.error("[Reports] Create error:", error);
    return apiServerError("Failed to create report");
  }

  // Alert is auto-created by trigger (report_to_alert) for critical types

  return apiCreated(data);
}

// ─── Get report ─────────────────────────────────────────────

async function getReport(ctx: RouteContext, reportId: string): Promise<Response> {
  const db = getServiceClient();

  const { data, error } = await db
    .from("station_reports")
    .select(`
      *,
      stations ( id, name, address, city )
    `)
    .eq("id", reportId)
    .eq("user_id", ctx.auth!.user.id)
    .maybeSingle();

  if (error || !data) return apiNotFound("Report not found");
  return apiSuccess(data);
}

// ─── User's reports ─────────────────────────────────────────

async function getUserReports(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const { offset, limit } = parsePagination(ctx.url);

  const { data, error, count } = await db
    .from("station_reports")
    .select(`
      *,
      stations ( id, name, address, city )
    `, { count: "exact" })
    .eq("user_id", ctx.auth!.user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return apiServerError("Failed to fetch reports");
  return apiPaginated(data ?? [], { total: count ?? 0, offset, limit });
}
