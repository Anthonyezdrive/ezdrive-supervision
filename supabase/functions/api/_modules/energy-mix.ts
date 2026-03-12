// ============================================================
// EZDrive API — Energy Mix Profiles Module
// CRUD energy source profiles for stations
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

export async function handleEnergyMix(ctx: RouteContext): Promise<Response> {
  const { method, segments } = ctx;
  const db = getServiceClient();

  // GET /api/energy-mix/stats — KPIs
  if (method === "GET" && segments[0] === "stats") {
    const { data } = await db.from("energy_mix_profiles").select("*");
    const profiles = data ?? [];
    const totalSites = profiles.reduce((s: number, p: any) => s + (p.sites_count ?? 0), 0);
    const avgRenewable = profiles.length > 0
      ? profiles.reduce((s: number, p: any) => s + (Number(p.renewable_percentage) ?? 0), 0) / profiles.length
      : 0;

    return apiSuccess({
      profiles_count: profiles.length,
      green_count: profiles.filter((p: any) => p.is_green).length,
      avg_renewable: Math.round(avgRenewable * 100) / 100,
      total_sites: totalSites,
    });
  }

  // GET /api/energy-mix/:id — Single profile
  if (method === "GET" && segments[0] && segments[0] !== "stats") {
    const { data, error } = await db.from("energy_mix_profiles").select("*").eq("id", segments[0]).maybeSingle();
    if (error) return apiServerError(error.message);
    if (!data) return apiNotFound("Profil energy mix introuvable");
    return apiSuccess(data);
  }

  // GET /api/energy-mix — List all profiles
  if (method === "GET") {
    const { data, error } = await db.from("energy_mix_profiles")
      .select("*")
      .order("renewable_percentage", { ascending: false });
    if (error) return apiServerError(error.message);
    return apiSuccess(data ?? []);
  }

  // POST /api/energy-mix — Create profile
  if (method === "POST") {
    try {
      const body = await ctx.req.json();
      const { name, supplier, product, description, renewable_percentage, is_green, sites_count, sources } = body;

      if (!name || !supplier) return apiBadRequest("name et supplier requis");

      // Validate sources format
      const srcArray = Array.isArray(sources) ? sources : [];
      const validTypes = ["solar", "wind", "hydro", "nuclear", "gas", "coal", "biomass", "geothermal"];
      for (const src of srcArray) {
        if (!validTypes.includes(src.type)) {
          return apiBadRequest(`Type de source invalide: ${src.type}. Types valides: ${validTypes.join(", ")}`);
        }
      }

      // Validate percentages sum to ~100
      const totalPct = srcArray.reduce((s: number, src: any) => s + (Number(src.percentage) || 0), 0);
      if (srcArray.length > 0 && (totalPct < 95 || totalPct > 105)) {
        return apiBadRequest(`La somme des pourcentages (${totalPct}%) doit être proche de 100%`);
      }

      const { data, error } = await db.from("energy_mix_profiles").insert({
        name,
        supplier,
        product,
        description,
        renewable_percentage: Number(renewable_percentage) || 0,
        is_green: is_green ?? false,
        sites_count: Number(sites_count) || 0,
        sources: srcArray,
        created_by: ctx.auth?.user.id,
      }).select().single();

      if (error) return apiServerError(error.message);
      return apiCreated(data);
    } catch {
      return apiBadRequest("Corps de requête invalide");
    }
  }

  // PUT /api/energy-mix/:id — Update profile
  if (method === "PUT" && segments[0]) {
    try {
      const body = await ctx.req.json();
      const updates: Record<string, any> = {};

      if (body.name !== undefined) updates.name = body.name;
      if (body.supplier !== undefined) updates.supplier = body.supplier;
      if (body.product !== undefined) updates.product = body.product;
      if (body.description !== undefined) updates.description = body.description;
      if (body.renewable_percentage !== undefined) updates.renewable_percentage = Number(body.renewable_percentage);
      if (body.is_green !== undefined) updates.is_green = body.is_green;
      if (body.sites_count !== undefined) updates.sites_count = Number(body.sites_count);
      if (body.sources !== undefined) updates.sources = body.sources;

      const { data, error } = await db.from("energy_mix_profiles").update(updates).eq("id", segments[0]).select().single();
      if (error) return apiServerError(error.message);
      if (!data) return apiNotFound("Profil energy mix introuvable");
      return apiSuccess(data);
    } catch {
      return apiBadRequest("Corps de requête invalide");
    }
  }

  // DELETE /api/energy-mix/:id
  if (method === "DELETE" && segments[0]) {
    const { error } = await db.from("energy_mix_profiles").delete().eq("id", segments[0]);
    if (error) return apiServerError(error.message);
    return apiSuccess({ deleted: true });
  }

  return apiBadRequest("Méthode non supportée");
}
