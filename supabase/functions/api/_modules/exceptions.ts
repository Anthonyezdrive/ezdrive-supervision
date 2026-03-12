// ============================================================
// EZDrive API — Exception Groups & Rules Module
// Authorization exceptions: whitelist, blacklist, overrides
// ============================================================

import type { RouteContext } from "../index.ts";
import { getServiceClient } from "../../_shared/auth-middleware.ts";
import {
  apiSuccess,
  apiCreated,
  apiBadRequest,
  apiNotFound,
  apiServerError,
} from "../../_shared/api-response.ts";

export async function handleExceptions(ctx: RouteContext): Promise<Response> {
  const { method, segments } = ctx;
  const db = getServiceClient();

  // ─── RULES sub-route (/api/exceptions/rules/...) ─────────
  if (segments[0] === "rules") {
    return handleRules(ctx, segments.slice(1));
  }

  // ─── STATS (/api/exceptions/stats) ───────────────────────
  if (method === "GET" && segments[0] === "stats") {
    const { data: groups } = await db.from("exception_groups").select("id, is_active");
    const { data: rules } = await db.from("exception_rules").select("id, is_active");
    const g = groups ?? [];
    const r = rules ?? [];
    return apiSuccess({
      groups_count: g.length,
      groups_active: g.filter((x: any) => x.is_active).length,
      rules_count: r.length,
      rules_active: r.filter((x: any) => x.is_active).length,
    });
  }

  // ─── GET /api/exceptions/:id — Single group ──────────────
  if (method === "GET" && segments[0] && segments[0] !== "stats") {
    const { data, error } = await db.from("exception_groups")
      .select("*, exception_rules(*)")
      .eq("id", segments[0])
      .maybeSingle();
    if (error) return apiServerError(error.message);
    if (!data) return apiNotFound("Groupe d'exception introuvable");
    return apiSuccess(data);
  }

  // ─── GET /api/exceptions — List all groups ────────────────
  if (method === "GET") {
    const { data, error } = await db.from("exception_groups")
      .select("*")
      .order("is_active", { ascending: false })
      .order("name");
    if (error) return apiServerError(error.message);
    return apiSuccess(data ?? []);
  }

  // ─── POST /api/exceptions — Create group ──────────────────
  if (method === "POST") {
    try {
      const body = await ctx.req.json();
      const { name, description, organization, category, is_active } = body;
      if (!name) return apiBadRequest("name requis");

      const { data, error } = await db.from("exception_groups").insert({
        name,
        description,
        organization,
        category: category ?? "drivers",
        is_active: is_active ?? true,
        rules_count: 0,
        items_count: 0,
        created_by: ctx.auth?.user.id,
      }).select().single();

      if (error) return apiServerError(error.message);
      return apiCreated(data);
    } catch {
      return apiBadRequest("Corps de requête invalide");
    }
  }

  // ─── PUT /api/exceptions/:id — Update group ──────────────
  if (method === "PUT" && segments[0]) {
    try {
      const body = await ctx.req.json();
      const updates: Record<string, any> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.organization !== undefined) updates.organization = body.organization;
      if (body.category !== undefined) updates.category = body.category;
      if (body.is_active !== undefined) updates.is_active = body.is_active;

      const { data, error } = await db.from("exception_groups").update(updates).eq("id", segments[0]).select().single();
      if (error) return apiServerError(error.message);
      if (!data) return apiNotFound("Groupe introuvable");
      return apiSuccess(data);
    } catch {
      return apiBadRequest("Corps de requête invalide");
    }
  }

  // ─── DELETE /api/exceptions/:id — Delete group (cascade rules) ─
  if (method === "DELETE" && segments[0]) {
    const { error } = await db.from("exception_groups").delete().eq("id", segments[0]);
    if (error) return apiServerError(error.message);
    return apiSuccess({ deleted: true });
  }

  return apiBadRequest("Méthode non supportée");
}

// ─── Rules sub-handler ───────────────────────────────────────

async function handleRules(ctx: RouteContext, segments: string[]): Promise<Response> {
  const { method } = ctx;
  const db = getServiceClient();

  // GET /api/exceptions/rules/:id
  if (method === "GET" && segments[0]) {
    const { data, error } = await db.from("exception_rules").select("*").eq("id", segments[0]).maybeSingle();
    if (error) return apiServerError(error.message);
    if (!data) return apiNotFound("Règle introuvable");
    return apiSuccess(data);
  }

  // GET /api/exceptions/rules — List all rules
  if (method === "GET") {
    const groupId = ctx.url.searchParams.get("group_id");
    let query = db.from("exception_rules").select("*").order("priority").order("name");
    if (groupId) query = query.eq("group_id", groupId);

    const { data, error } = await query;
    if (error) return apiServerError(error.message);
    return apiSuccess(data ?? []);
  }

  // POST /api/exceptions/rules — Create rule
  if (method === "POST") {
    try {
      const body = await ctx.req.json();
      const { group_id, name, description, type, scope, priority, conditions, is_active } = body;
      if (!name) return apiBadRequest("name requis");

      const { data, error } = await db.from("exception_rules").insert({
        group_id,
        name,
        description,
        type: type ?? "whitelist",
        scope: scope ?? "drivers",
        priority: Number(priority) || 0,
        is_active: is_active ?? true,
        items_count: 0,
        conditions: conditions ?? [],
        created_by: ctx.auth?.user.id,
      }).select().single();

      if (error) return apiServerError(error.message);

      // Update group rules_count
      if (group_id) {
        await db.rpc("increment_count", { table_name: "exception_groups", row_id: group_id, col: "rules_count" })
          .catch(() => {}); // Best effort
      }

      return apiCreated(data);
    } catch {
      return apiBadRequest("Corps de requête invalide");
    }
  }

  // PUT /api/exceptions/rules/:id — Update rule
  if (method === "PUT" && segments[0]) {
    try {
      const body = await ctx.req.json();
      const updates: Record<string, any> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.type !== undefined) updates.type = body.type;
      if (body.scope !== undefined) updates.scope = body.scope;
      if (body.priority !== undefined) updates.priority = Number(body.priority);
      if (body.is_active !== undefined) updates.is_active = body.is_active;
      if (body.conditions !== undefined) updates.conditions = body.conditions;

      const { data, error } = await db.from("exception_rules").update(updates).eq("id", segments[0]).select().single();
      if (error) return apiServerError(error.message);
      if (!data) return apiNotFound("Règle introuvable");
      return apiSuccess(data);
    } catch {
      return apiBadRequest("Corps de requête invalide");
    }
  }

  // DELETE /api/exceptions/rules/:id
  if (method === "DELETE" && segments[0]) {
    // Get group_id before deleting for count update
    const { data: rule } = await db.from("exception_rules").select("group_id").eq("id", segments[0]).maybeSingle();
    const { error } = await db.from("exception_rules").delete().eq("id", segments[0]);
    if (error) return apiServerError(error.message);
    return apiSuccess({ deleted: true });
  }

  return apiBadRequest("Méthode non supportée");
}
