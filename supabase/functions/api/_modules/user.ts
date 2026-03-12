// ============================================================
// EZDrive Consumer API — User Module
// Profile, vehicles, favorites, IBAN management
// Port from Resonovia user-service (devices.py, user_identity_service.py)
// ============================================================

import {
  apiSuccess,
  apiCreated,
  apiBadRequest,
  apiNotFound,
  apiServerError,
  parsePagination,
} from "../../_shared/api-response.ts";
import { getServiceClient, getUserClient } from "../../_shared/auth-middleware.ts";
import type { RouteContext } from "../index.ts";

export async function handleUser(ctx: RouteContext): Promise<Response> {
  const { method, segments, auth } = ctx;
  const resource = segments[0] ?? "";

  switch (resource) {
    case "profile":
      return handleProfile(ctx);

    case "vehicles":
      return handleVehicles(ctx);

    case "favorites":
      return handleFavorites(ctx);

    case "iban":
      if (method === "PUT") return updateIban(ctx);
      return apiBadRequest("PUT required for /user/iban");

    // ─── RGPD endpoints ──────────────────────────────────
    case "export":
      if (method === "GET") return exportUserData(ctx);
      return apiBadRequest("GET required for /user/export");

    case "delete-account":
      if (method === "POST") return deleteAccount(ctx);
      return apiBadRequest("POST required for /user/delete-account");

    default:
      // GET /api/user → return profile
      if (!resource) return getProfile(ctx);
      return apiBadRequest("Unknown user resource");
  }
}

// ─── Profile ────────────────────────────────────────────────

async function handleProfile(ctx: RouteContext): Promise<Response> {
  switch (ctx.method) {
    case "GET":
      return getProfile(ctx);
    case "PUT":
    case "PATCH":
      return updateProfile(ctx);
    default:
      return apiBadRequest("GET or PUT/PATCH required");
  }
}

async function getProfile(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const userId = ctx.auth!.user.id;

  const { data, error } = await db
    .from("consumer_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[User] Profile fetch error:", error);
    return apiServerError("Failed to fetch profile");
  }

  if (!data) {
    // Auto-create profile if missing (e.g., user registered before migration)
    const { data: newProfile, error: createError } = await db
      .from("consumer_profiles")
      .insert({
        id: userId,
        email: ctx.auth!.user.email,
      })
      .select()
      .single();

    if (createError) {
      return apiNotFound("Profile not found");
    }
    return apiSuccess(newProfile);
  }

  return apiSuccess(data);
}

async function updateProfile(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const userId = ctx.auth!.user.id;
  const body = await ctx.req.json();

  // Whitelist updatable fields
  const allowed: Record<string, unknown> = {};
  const fields = [
    "full_name", "phone", "profile_picture_url",
    "is_company", "company_name", "user_type",
    "preferred_language", "push_notifications",
  ];

  for (const f of fields) {
    if (body[f] !== undefined) allowed[f] = body[f];
  }

  if (Object.keys(allowed).length === 0) {
    return apiBadRequest("No valid fields to update");
  }

  const { data, error } = await db
    .from("consumer_profiles")
    .update(allowed)
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    console.error("[User] Profile update error:", error);
    return apiServerError("Failed to update profile");
  }

  return apiSuccess(data);
}

// ─── Vehicles ───────────────────────────────────────────────

async function handleVehicles(ctx: RouteContext): Promise<Response> {
  const vehicleId = ctx.segments[1] ?? "";
  const action = ctx.segments[2] ?? "";

  switch (ctx.method) {
    case "GET":
      if (vehicleId) return getVehicle(ctx, vehicleId);
      return listVehicles(ctx);

    case "POST":
      return createVehicle(ctx);

    case "PUT":
      if (action === "default") return setDefaultVehicle(ctx, vehicleId);
      if (vehicleId) return updateVehicle(ctx, vehicleId);
      return apiBadRequest("Vehicle ID required for PUT");

    case "DELETE":
      if (vehicleId) return deleteVehicle(ctx, vehicleId);
      return apiBadRequest("Vehicle ID required for DELETE");

    default:
      return apiBadRequest("Unsupported method");
  }
}

async function listVehicles(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();

  const { data, error } = await db
    .from("user_vehicles")
    .select("*")
    .eq("user_id", ctx.auth!.user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return apiServerError("Failed to fetch vehicles");
  return apiSuccess(data ?? []);
}

async function getVehicle(ctx: RouteContext, vehicleId: string): Promise<Response> {
  const db = getServiceClient();

  const { data, error } = await db
    .from("user_vehicles")
    .select("*")
    .eq("id", vehicleId)
    .eq("user_id", ctx.auth!.user.id)
    .maybeSingle();

  if (error || !data) return apiNotFound("Vehicle not found");
  return apiSuccess(data);
}

async function createVehicle(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const body = await ctx.req.json();

  const { data, error } = await db
    .from("user_vehicles")
    .insert({
      user_id: ctx.auth!.user.id,
      brand: body.brand,
      model: body.model,
      year: body.year ?? null,
      battery_capacity_kwh: body.battery_capacity_kwh ?? null,
      max_charging_power_kw: body.max_charging_power_kw ?? null,
      connector_types: body.connector_types ?? [],
      license_plate: body.license_plate ?? null,
      color: body.color ?? null,
      photo_url: body.photo_url ?? null,
      is_default: body.is_default ?? false,
    })
    .select()
    .single();

  if (error) {
    console.error("[User] Vehicle create error:", error);
    return apiBadRequest("Failed to create vehicle");
  }

  return apiCreated(data);
}

async function updateVehicle(ctx: RouteContext, vehicleId: string): Promise<Response> {
  const db = getServiceClient();
  const body = await ctx.req.json();

  const allowed: Record<string, unknown> = {};
  const fields = [
    "brand", "model", "year", "battery_capacity_kwh",
    "max_charging_power_kw", "connector_types", "license_plate",
    "color", "photo_url", "is_default",
  ];

  for (const f of fields) {
    if (body[f] !== undefined) allowed[f] = body[f];
  }

  const { data, error } = await db
    .from("user_vehicles")
    .update(allowed)
    .eq("id", vehicleId)
    .eq("user_id", ctx.auth!.user.id)
    .select()
    .single();

  if (error) return apiServerError("Failed to update vehicle");
  return apiSuccess(data);
}

async function setDefaultVehicle(ctx: RouteContext, vehicleId: string): Promise<Response> {
  const db = getServiceClient();

  const { data, error } = await db
    .from("user_vehicles")
    .update({ is_default: true })
    .eq("id", vehicleId)
    .eq("user_id", ctx.auth!.user.id)
    .select()
    .single();

  if (error || !data) return apiNotFound("Vehicle not found");
  return apiSuccess(data);
}

async function deleteVehicle(ctx: RouteContext, vehicleId: string): Promise<Response> {
  const db = getServiceClient();

  const { error } = await db
    .from("user_vehicles")
    .delete()
    .eq("id", vehicleId)
    .eq("user_id", ctx.auth!.user.id);

  if (error) return apiServerError("Failed to delete vehicle");
  return apiSuccess({ deleted: true });
}

// ─── Favorites ──────────────────────────────────────────────

async function handleFavorites(ctx: RouteContext): Promise<Response> {
  const stationId = ctx.segments[1] ?? "";

  switch (ctx.method) {
    case "GET":
      return listFavorites(ctx);

    case "POST":
      return addFavorite(ctx);

    case "DELETE":
      if (stationId) return removeFavorite(ctx, stationId);
      return apiBadRequest("Station ID required for DELETE");

    default:
      return apiBadRequest("Unsupported method");
  }
}

async function listFavorites(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();

  const { data, error } = await db
    .from("user_favorites")
    .select(`
      id, station_id, created_at,
      stations (
        id, name, address, city, latitude, longitude,
        ocpp_status, is_online, connectors, max_power_kw,
        avg_rating, review_count
      )
    `)
    .eq("user_id", ctx.auth!.user.id)
    .order("created_at", { ascending: false });

  if (error) return apiServerError("Failed to fetch favorites");
  return apiSuccess(data ?? []);
}

async function addFavorite(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const body = await ctx.req.json();

  if (!body.station_id) return apiBadRequest("station_id required");

  const { data, error } = await db
    .from("user_favorites")
    .insert({
      user_id: ctx.auth!.user.id,
      station_id: body.station_id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return apiBadRequest("Station already in favorites");
    }
    return apiServerError("Failed to add favorite");
  }

  return apiCreated(data);
}

async function removeFavorite(ctx: RouteContext, stationId: string): Promise<Response> {
  const db = getServiceClient();

  const { error } = await db
    .from("user_favorites")
    .delete()
    .eq("user_id", ctx.auth!.user.id)
    .eq("station_id", stationId);

  if (error) return apiServerError("Failed to remove favorite");
  return apiSuccess({ removed: true });
}

// ─── IBAN ───────────────────────────────────────────────────

async function updateIban(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const body = await ctx.req.json();

  if (!body.iban_encrypted) {
    return apiBadRequest("iban_encrypted required");
  }

  const { data, error } = await db
    .from("consumer_profiles")
    .update({ iban_encrypted: body.iban_encrypted })
    .eq("id", ctx.auth!.user.id)
    .select("id, iban_encrypted")
    .single();

  if (error) return apiServerError("Failed to update IBAN");
  return apiSuccess({ updated: true });
}

// ─── RGPD: Export user data ─────────────────────────────────

async function exportUserData(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const userId = ctx.auth!.user.id;

  try {
    // Collect all user data in parallel
    const [
      profileRes,
      vehiclesRes,
      favoritesRes,
      rfidRes,
      subscriptionsRes,
      transactionsRes,
      invoicesRes,
      reviewsRes,
      reportsRes,
      devicesRes,
    ] = await Promise.all([
      db.from("consumer_profiles").select("*").eq("id", userId).maybeSingle(),
      db.from("user_vehicles").select("*").eq("user_id", userId),
      db.from("user_favorites").select("*, stations(name, city)").eq("user_id", userId),
      db.from("rfid_cards").select("*").eq("user_id", userId),
      db.from("user_subscriptions").select("*, subscription_offers(*)").eq("user_id", userId),
      db.from("ocpp_transactions").select("*").eq("consumer_id", userId).order("started_at", { ascending: false }).limit(1000),
      db.from("invoices").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      db.from("station_reviews").select("*").eq("user_id", userId),
      db.from("station_reports").select("*").eq("user_id", userId),
      db.from("user_devices").select("*").eq("user_id", userId),
    ]);

    const exportData = {
      export_date: new Date().toISOString(),
      export_format: "RGPD Article 20 - Droit à la portabilité",
      user_id: userId,
      profile: profileRes.data ?? null,
      vehicles: vehiclesRes.data ?? [],
      favorites: favoritesRes.data ?? [],
      rfid_cards: rfidRes.data ?? [],
      subscriptions: subscriptionsRes.data ?? [],
      charging_sessions: transactionsRes.data ?? [],
      invoices: invoicesRes.data ?? [],
      reviews: reviewsRes.data ?? [],
      reports: reportsRes.data ?? [],
      devices: devicesRes.data ?? [],
    };

    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="ezdrive-data-export-${userId.slice(0, 8)}.json"`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("[User] RGPD export error:", err);
    return apiServerError("Failed to export user data");
  }
}

// ─── RGPD: Delete account ───────────────────────────────────

async function deleteAccount(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const userId = ctx.auth!.user.id;

  try {
    // 1. Cancel active Stripe subscriptions
    const { data: activeSubs } = await db
      .from("user_subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", userId)
      .eq("status", "ACTIVE");

    for (const sub of activeSubs ?? []) {
      if (sub.stripe_subscription_id) {
        try {
          const { cancelSubscription } = await import("../../_shared/stripe-client.ts");
          await cancelSubscription(sub.stripe_subscription_id);
        } catch (err) {
          console.error("[User] Stripe cancel error:", err);
        }
      }
    }

    // 2. Delete Stripe customer
    const { data: profile } = await db
      .from("consumer_profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.stripe_customer_id) {
      try {
        const { getStripe } = await import("../../_shared/stripe-client.ts");
        await getStripe().customers.del(profile.stripe_customer_id);
      } catch (err) {
        console.error("[User] Stripe customer delete error:", err);
      }
    }

    // 3. Delete personal data (keep financial records anonymized for legal)
    await Promise.all([
      db.from("user_vehicles").delete().eq("user_id", userId),
      db.from("user_favorites").delete().eq("user_id", userId),
      db.from("user_devices").delete().eq("user_id", userId),
      db.from("station_reviews").delete().eq("user_id", userId),
      db.from("station_reports").delete().eq("user_id", userId),
    ]);

    // 4. Revoke RFID cards
    await db
      .from("rfid_cards")
      .update({ status: "REVOKED", revoked_at: new Date().toISOString() })
      .eq("user_id", userId);

    // 5. Cancel all subscriptions
    await db
      .from("user_subscriptions")
      .update({ status: "CANCELLED", cancelled_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("status", ["ACTIVE", "PENDING", "PAST_DUE"]);

    // 6. Anonymize profile (keep record for financial obligation)
    await db
      .from("consumer_profiles")
      .update({
        full_name: "Utilisateur supprime",
        email: null,
        phone: null,
        iban_encrypted: null,
        profile_picture_url: null,
        stripe_customer_id: null,
        address: null,
        city: null,
        postal_code: null,
        company_name: null,
        company_siret: null,
      })
      .eq("id", userId);

    // 7. Anonymize OCPP transactions (keep for accounting but remove consumer link)
    await db
      .from("ocpp_transactions")
      .update({ consumer_id: null })
      .eq("consumer_id", userId);

    // 8. Delete auth account
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    await adminClient.auth.admin.deleteUser(userId);

    return apiSuccess({
      deleted: true,
      message: "Votre compte a ete supprime. Vos donnees financieres sont conservees anonymisees conformement aux obligations legales (10 ans).",
    });
  } catch (err) {
    console.error("[User] Account deletion error:", err);
    return apiServerError("Failed to delete account");
  }
}
