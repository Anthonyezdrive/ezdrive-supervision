// ============================================================
// EZDrive Consumer API — Reviews Module
// Station reviews with ratings, helpful votes, user reviews
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

export async function handleReviews(ctx: RouteContext): Promise<Response> {
  const { method, segments } = ctx;
  const action = segments[0] ?? "";

  // GET /api/reviews/user — current user's reviews
  if (action === "user" && method === "GET") {
    return getUserReviews(ctx);
  }

  // GET /api/reviews/station/{stationId}
  if (action === "station" && segments[1]) {
    if (method === "GET") return getStationReviews(ctx, segments[1]);
    return apiBadRequest("GET required for station reviews");
  }

  // POST /api/reviews/{reviewId}/helpful
  if (segments[1] === "helpful" && method === "POST") {
    return voteHelpful(ctx, action);
  }

  switch (method) {
    case "GET":
      if (action) return getReview(ctx, action);
      return apiBadRequest("Specify /reviews/station/{id} or /reviews/user");

    case "POST":
      return createReview(ctx);

    case "PUT":
      if (action) return updateReview(ctx, action);
      return apiBadRequest("Review ID required");

    case "DELETE":
      if (action) return deleteReview(ctx, action);
      return apiBadRequest("Review ID required");

    default:
      return apiBadRequest("Unsupported method");
  }
}

// ─── Station reviews ────────────────────────────────────────

async function getStationReviews(ctx: RouteContext, stationId: string): Promise<Response> {
  const db = getServiceClient();
  const { offset, limit } = parsePagination(ctx.url);
  const sortBy = ctx.url.searchParams.get("sort") ?? "created_at";

  const validSorts: Record<string, string> = {
    created_at: "created_at",
    rating: "overall_rating",
    helpful: "helpful_count",
  };
  const orderCol = validSorts[sortBy] ?? "created_at";

  const { data, error, count } = await db
    .from("station_reviews")
    .select(`
      *,
      consumer_profiles ( full_name, profile_picture_url )
    `, { count: "exact" })
    .eq("station_id", stationId)
    .order(orderCol, { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[Reviews] Fetch error:", error);
    return apiServerError("Failed to fetch reviews");
  }

  return apiPaginated(data ?? [], { total: count ?? 0, offset, limit });
}

// ─── Single review ──────────────────────────────────────────

async function getReview(ctx: RouteContext, reviewId: string): Promise<Response> {
  const db = getServiceClient();

  const { data, error } = await db
    .from("station_reviews")
    .select(`*, consumer_profiles ( full_name, profile_picture_url )`)
    .eq("id", reviewId)
    .maybeSingle();

  if (error || !data) return apiNotFound("Review not found");
  return apiSuccess(data);
}

// ─── Create review ──────────────────────────────────────────

async function createReview(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const body = await ctx.req.json();

  if (!body.station_id || !body.overall_rating) {
    return apiBadRequest("station_id and overall_rating required");
  }

  if (body.overall_rating < 1 || body.overall_rating > 5) {
    return apiBadRequest("Rating must be between 1 and 5");
  }

  const { data, error } = await db
    .from("station_reviews")
    .insert({
      station_id: body.station_id,
      user_id: ctx.auth!.user.id,
      overall_rating: body.overall_rating,
      reliability: body.reliability ?? null,
      price_quality: body.price_quality ?? null,
      location_rating: body.location_rating ?? null,
      security: body.security ?? null,
      comment: body.comment ?? null,
      photos: body.photos ?? [],
      is_verified_charge: body.is_verified_charge ?? false,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return apiBadRequest("You already reviewed this station. Use PUT to update.");
    }
    console.error("[Reviews] Create error:", error);
    return apiServerError("Failed to create review");
  }

  return apiCreated(data);
}

// ─── Update review ──────────────────────────────────────────

async function updateReview(ctx: RouteContext, reviewId: string): Promise<Response> {
  const db = getServiceClient();
  const body = await ctx.req.json();

  const allowed: Record<string, unknown> = {};
  const fields = [
    "overall_rating", "reliability", "price_quality",
    "location_rating", "security", "comment", "photos",
  ];

  for (const f of fields) {
    if (body[f] !== undefined) allowed[f] = body[f];
  }

  if (allowed.overall_rating && (Number(allowed.overall_rating) < 1 || Number(allowed.overall_rating) > 5)) {
    return apiBadRequest("Rating must be between 1 and 5");
  }

  const { data, error } = await db
    .from("station_reviews")
    .update(allowed)
    .eq("id", reviewId)
    .eq("user_id", ctx.auth!.user.id)
    .select()
    .single();

  if (error) {
    console.error("[Reviews] Update error:", error);
    return apiNotFound("Review not found or not yours");
  }

  return apiSuccess(data);
}

// ─── Delete review ──────────────────────────────────────────

async function deleteReview(ctx: RouteContext, reviewId: string): Promise<Response> {
  const db = getServiceClient();

  const { error } = await db
    .from("station_reviews")
    .delete()
    .eq("id", reviewId)
    .eq("user_id", ctx.auth!.user.id);

  if (error) return apiServerError("Failed to delete review");
  return apiSuccess({ deleted: true });
}

// ─── Helpful vote ───────────────────────────────────────────

async function voteHelpful(ctx: RouteContext, reviewId: string): Promise<Response> {
  const db = getServiceClient();

  // Insert vote (unique constraint prevents double-vote)
  const { error: voteError } = await db
    .from("review_helpful_votes")
    .insert({
      review_id: reviewId,
      user_id: ctx.auth!.user.id,
    });

  if (voteError) {
    if (voteError.code === "23505") {
      return apiBadRequest("Already voted");
    }
    return apiServerError("Failed to vote");
  }

  // Increment count
  const { data: review } = await db
    .from("station_reviews")
    .select("helpful_count")
    .eq("id", reviewId)
    .single();

  if (review) {
    await db
      .from("station_reviews")
      .update({ helpful_count: (review.helpful_count ?? 0) + 1 })
      .eq("id", reviewId);
  }

  return apiSuccess({ voted: true });
}

// ─── User's reviews ─────────────────────────────────────────

async function getUserReviews(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const { offset, limit } = parsePagination(ctx.url);

  const { data, error, count } = await db
    .from("station_reviews")
    .select(`
      *,
      stations ( id, name, address, city )
    `, { count: "exact" })
    .eq("user_id", ctx.auth!.user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return apiServerError("Failed to fetch your reviews");
  return apiPaginated(data ?? [], { total: count ?? 0, offset, limit });
}
