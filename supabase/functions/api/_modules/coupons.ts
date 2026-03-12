// ============================================================
// EZDrive API — Coupons Module
// CRUD coupons + stats for admin dashboard
// ============================================================

import type { RouteContext } from "../index.ts";
import { getServiceClient } from "../../_shared/auth-middleware.ts";
import {
  apiSuccess,
  apiCreated,
  apiPaginated,
  apiBadRequest,
  apiNotFound,
  apiServerError,
  parsePagination,
} from "../../_shared/api-response.ts";

export async function handleCoupons(ctx: RouteContext): Promise<Response> {
  const { method, segments, url } = ctx;
  const db = getServiceClient();

  // GET /api/coupons/stats — KPIs
  if (method === "GET" && segments[0] === "stats") {
    try {
      const { data: all } = await db.from("coupons").select("status, current_value, initial_value");
      const items = all ?? [];
      return apiSuccess({
        total: items.length,
        active: items.filter((c: any) => c.status === "active").length,
        inactive: items.filter((c: any) => c.status === "inactive").length,
        expired: items.filter((c: any) => c.status === "expired").length,
        exhausted: items.filter((c: any) => c.status === "exhausted").length,
        credits_available: items
          .filter((c: any) => c.status === "active")
          .reduce((sum: number, c: any) => sum + (Number(c.current_value) || 0), 0),
        credits_total: items.reduce((sum: number, c: any) => sum + (Number(c.initial_value) || 0), 0),
      });
    } catch (err) {
      return apiServerError(String(err));
    }
  }

  // GET /api/coupons/:id — Single coupon detail
  if (method === "GET" && segments[0] && segments[0] !== "stats") {
    const { data, error } = await db.from("coupons").select("*").eq("id", segments[0]).maybeSingle();
    if (error) return apiServerError(error.message);
    if (!data) return apiNotFound("Coupon introuvable");
    return apiSuccess(data);
  }

  // GET /api/coupons — List with search, filter, pagination
  if (method === "GET") {
    const { offset, limit } = parsePagination(url);
    const search = url.searchParams.get("search")?.trim();
    const status = url.searchParams.get("status");
    const sortBy = url.searchParams.get("sort") ?? "created_at";
    const sortDir = url.searchParams.get("dir") === "asc";

    let query = db.from("coupons").select("*", { count: "exact" });

    if (search) {
      query = query.or(`code.ilike.%${search}%,label.ilike.%${search}%,driver_name.ilike.%${search}%,driver_email.ilike.%${search}%`);
    }
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    query = query.order(sortBy, { ascending: sortDir }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) return apiServerError(error.message);
    return apiPaginated(data ?? [], { total: count ?? 0, offset, limit });
  }

  // POST /api/coupons — Create coupon
  if (method === "POST") {
    try {
      const body = await ctx.req.json();
      const { code, label, type, initial_value, max_uses, expires_at, driver_id, driver_name, driver_email, description } = body;

      if (!code || !label) return apiBadRequest("code et label requis");

      const { data, error } = await db.from("coupons").insert({
        code: code.toUpperCase().trim(),
        label,
        description,
        type: type ?? "credit",
        initial_value: Number(initial_value) || 0,
        current_value: Number(initial_value) || 0,
        max_uses: max_uses ? Number(max_uses) : null,
        expires_at,
        driver_id,
        driver_name,
        driver_email,
        created_by: ctx.auth?.user.id,
      }).select().single();

      if (error) {
        if (error.code === "23505") return apiBadRequest("Ce code coupon existe déjà");
        return apiServerError(error.message);
      }
      return apiCreated(data);
    } catch (err) {
      return apiBadRequest("Corps de requête invalide");
    }
  }

  // PUT /api/coupons/:id — Update coupon
  if (method === "PUT" && segments[0]) {
    try {
      const body = await ctx.req.json();
      const { label, description, status, current_value, max_uses, expires_at, driver_id, driver_name, driver_email } = body;

      const updates: Record<string, any> = {};
      if (label !== undefined) updates.label = label;
      if (description !== undefined) updates.description = description;
      if (status !== undefined) updates.status = status;
      if (current_value !== undefined) updates.current_value = Number(current_value);
      if (max_uses !== undefined) updates.max_uses = max_uses ? Number(max_uses) : null;
      if (expires_at !== undefined) updates.expires_at = expires_at;
      if (driver_id !== undefined) updates.driver_id = driver_id;
      if (driver_name !== undefined) updates.driver_name = driver_name;
      if (driver_email !== undefined) updates.driver_email = driver_email;

      const { data, error } = await db.from("coupons").update(updates).eq("id", segments[0]).select().single();
      if (error) return apiServerError(error.message);
      if (!data) return apiNotFound("Coupon introuvable");
      return apiSuccess(data);
    } catch {
      return apiBadRequest("Corps de requête invalide");
    }
  }

  // DELETE /api/coupons/:id — Delete coupon
  if (method === "DELETE" && segments[0]) {
    const { error } = await db.from("coupons").delete().eq("id", segments[0]);
    if (error) return apiServerError(error.message);
    return apiSuccess({ deleted: true });
  }

  return apiBadRequest("Méthode non supportée");
}
