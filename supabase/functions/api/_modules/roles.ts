// ============================================================
// EZDrive API — Roles & Groups Module
// RBAC management: roles with permissions, user groups
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

export async function handleRoles(ctx: RouteContext): Promise<Response> {
  const { method, segments } = ctx;
  const db = getServiceClient();

  // ─── GROUPS sub-route (/api/roles/groups/...) ────────────
  if (segments[0] === "groups") {
    const groupSegments = segments.slice(1);
    return handleGroups(ctx, groupSegments);
  }

  // ─── STATS (/api/roles/stats) ────────────────────────────
  if (method === "GET" && segments[0] === "stats") {
    const { data: roles } = await db.from("admin_roles").select("id, permissions, user_count");
    const { data: groups } = await db.from("user_groups").select("id, member_count");
    const allRoles = roles ?? [];
    const allGroups = groups ?? [];
    const allPerms = new Set<string>();
    allRoles.forEach((r: any) => (r.permissions ?? []).forEach((p: string) => allPerms.add(p)));

    return apiSuccess({
      roles_count: allRoles.length,
      groups_count: allGroups.length,
      users_count: allRoles.reduce((s: number, r: any) => s + (r.user_count ?? 0), 0),
      permissions_count: allPerms.size,
    });
  }

  // ─── GET /api/roles/:id ──────────────────────────────────
  if (method === "GET" && segments[0] && segments[0] !== "stats") {
    const { data, error } = await db.from("admin_roles").select("*").eq("id", segments[0]).maybeSingle();
    if (error) return apiServerError(error.message);
    if (!data) return apiNotFound("Rôle introuvable");
    return apiSuccess(data);
  }

  // ─── GET /api/roles — List all roles ─────────────────────
  if (method === "GET") {
    const { data, error } = await db.from("admin_roles").select("*").order("is_system", { ascending: false }).order("name");
    if (error) return apiServerError(error.message);
    return apiSuccess(data ?? []);
  }

  // ─── POST /api/roles — Create role ───────────────────────
  if (method === "POST") {
    try {
      const body = await ctx.req.json();
      const { name, description, color, permissions } = body;
      if (!name) return apiBadRequest("name requis");

      const { data, error } = await db.from("admin_roles").insert({
        name,
        description,
        color: color ?? "#6B7280",
        permissions: permissions ?? [],
        is_system: false,
        user_count: 0,
      }).select().single();

      if (error) {
        if (error.code === "23505") return apiBadRequest("Ce nom de rôle existe déjà");
        return apiServerError(error.message);
      }
      return apiCreated(data);
    } catch {
      return apiBadRequest("Corps de requête invalide");
    }
  }

  // ─── PUT /api/roles/:id — Update role ────────────────────
  if (method === "PUT" && segments[0]) {
    try {
      const body = await ctx.req.json();

      // Check if system role — only allow permission/description changes
      const { data: existing } = await db.from("admin_roles").select("is_system").eq("id", segments[0]).maybeSingle();
      if (!existing) return apiNotFound("Rôle introuvable");

      const updates: Record<string, any> = {};
      if (body.description !== undefined) updates.description = body.description;
      if (body.permissions !== undefined) updates.permissions = body.permissions;
      if (!existing.is_system) {
        if (body.name !== undefined) updates.name = body.name;
        if (body.color !== undefined) updates.color = body.color;
      }

      const { data, error } = await db.from("admin_roles").update(updates).eq("id", segments[0]).select().single();
      if (error) return apiServerError(error.message);
      return apiSuccess(data);
    } catch {
      return apiBadRequest("Corps de requête invalide");
    }
  }

  // ─── DELETE /api/roles/:id — Delete role (non-system) ────
  if (method === "DELETE" && segments[0]) {
    const { data: existing } = await db.from("admin_roles").select("is_system").eq("id", segments[0]).maybeSingle();
    if (!existing) return apiNotFound("Rôle introuvable");
    if (existing.is_system) return apiBadRequest("Impossible de supprimer un rôle système");

    const { error } = await db.from("admin_roles").delete().eq("id", segments[0]);
    if (error) return apiServerError(error.message);
    return apiSuccess({ deleted: true });
  }

  return apiBadRequest("Méthode non supportée");
}

// ─── Groups sub-handler ──────────────────────────────────────

async function handleGroups(ctx: RouteContext, segments: string[]): Promise<Response> {
  const { method } = ctx;
  const db = getServiceClient();

  // GET /api/roles/groups/:id
  if (method === "GET" && segments[0]) {
    const { data, error } = await db.from("user_groups").select("*, admin_roles(name, color)").eq("id", segments[0]).maybeSingle();
    if (error) return apiServerError(error.message);
    if (!data) return apiNotFound("Groupe introuvable");
    return apiSuccess(data);
  }

  // GET /api/roles/groups — List all groups
  if (method === "GET") {
    const { data, error } = await db.from("user_groups").select("*, admin_roles(name, color)").order("name");
    if (error) return apiServerError(error.message);
    return apiSuccess(data ?? []);
  }

  // POST /api/roles/groups — Create group
  if (method === "POST") {
    try {
      const body = await ctx.req.json();
      const { name, description, role_id } = body;
      if (!name) return apiBadRequest("name requis");

      const { data, error } = await db.from("user_groups").insert({
        name,
        description,
        role_id,
        member_count: 0,
      }).select().single();

      if (error) {
        if (error.code === "23505") return apiBadRequest("Ce nom de groupe existe déjà");
        return apiServerError(error.message);
      }
      return apiCreated(data);
    } catch {
      return apiBadRequest("Corps de requête invalide");
    }
  }

  // PUT /api/roles/groups/:id — Update group
  if (method === "PUT" && segments[0]) {
    try {
      const body = await ctx.req.json();
      const updates: Record<string, any> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.role_id !== undefined) updates.role_id = body.role_id;

      const { data, error } = await db.from("user_groups").update(updates).eq("id", segments[0]).select().single();
      if (error) return apiServerError(error.message);
      if (!data) return apiNotFound("Groupe introuvable");
      return apiSuccess(data);
    } catch {
      return apiBadRequest("Corps de requête invalide");
    }
  }

  // DELETE /api/roles/groups/:id
  if (method === "DELETE" && segments[0]) {
    const { error } = await db.from("user_groups").delete().eq("id", segments[0]);
    if (error) return apiServerError(error.message);
    return apiSuccess({ deleted: true });
  }

  return apiBadRequest("Méthode non supportée");
}
