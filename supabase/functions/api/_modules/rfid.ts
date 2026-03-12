// ============================================================
// EZDrive Consumer API — RFID Cards Module
// RFID card management with OCPI token integration
// Creates token in ocpi_tokens + queues push to Gireve
// ============================================================

import {
  apiSuccess,
  apiCreated,
  apiBadRequest,
  apiNotFound,
  apiServerError,
} from "../../_shared/api-response.ts";
import { getServiceClient } from "../../_shared/auth-middleware.ts";
import type { RouteContext } from "../index.ts";

export async function handleRfid(ctx: RouteContext): Promise<Response> {
  const { method, segments } = ctx;
  const action = segments[0] ?? "";

  switch (method) {
    case "GET":
      if (action) return getCard(ctx, action);
      return listCards(ctx);

    case "POST":
      if (action === "report-lost") return reportLost(ctx);
      return requestCard(ctx);

    default:
      return apiBadRequest("Unsupported method");
  }
}

// ─── List user's RFID cards ─────────────────────────────────

async function listCards(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();

  const { data, error } = await db
    .from("rfid_cards")
    .select("*")
    .eq("user_id", ctx.auth!.user.id)
    .order("created_at", { ascending: false });

  if (error) return apiServerError("Failed to fetch RFID cards");
  return apiSuccess(data ?? []);
}

// ─── Get single card ────────────────────────────────────────

async function getCard(ctx: RouteContext, cardId: string): Promise<Response> {
  const db = getServiceClient();

  const { data, error } = await db
    .from("rfid_cards")
    .select("*")
    .eq("id", cardId)
    .eq("user_id", ctx.auth!.user.id)
    .maybeSingle();

  if (error || !data) return apiNotFound("RFID card not found");
  return apiSuccess(data);
}

// ─── Request new RFID card ──────────────────────────────────

async function requestCard(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const body = await ctx.req.json();
  const userId = ctx.auth!.user.id;

  // Validate shipping address
  if (!body.shipping_address) {
    return apiBadRequest("shipping_address required");
  }

  // Generate unique card number (EZD + timestamp + random)
  const cardNumber = `EZD${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const visualNumber = cardNumber.substring(0, 12);

  // 1. Create RFID card
  const { data: card, error: cardError } = await db
    .from("rfid_cards")
    .insert({
      user_id: userId,
      card_number: cardNumber,
      visual_number: visualNumber,
      shipping_address: body.shipping_address,
      status: "REQUESTED",
    })
    .select()
    .single();

  if (cardError) {
    console.error("[RFID] Card creation error:", cardError);
    return apiServerError("Failed to create RFID card");
  }

  // 2. Create OCPI token for Gireve interop
  try {
    const { data: profile } = await db
      .from("consumer_profiles")
      .select("full_name, email")
      .eq("id", userId)
      .single();

    // Create OCPI token (eMSP token for roaming)
    const { data: token, error: tokenError } = await db
      .from("ocpi_tokens")
      .insert({
        country_code: "FR",
        party_id: "EZD",
        uid: cardNumber,
        type: "RFID",
        contract_id: `FR-EZD-C${cardNumber.substring(3, 15)}`,
        auth_method: "AUTH_REQUEST",
        issuer: "EZ Drive",
        valid: true,
        whitelist: "ALLOWED",
        language: "fr",
        last_updated: new Date().toISOString(),
      })
      .select()
      .single();

    if (tokenError) {
      console.error("[RFID] OCPI token creation error:", tokenError);
    } else if (token) {
      // Update card with OCPI token reference
      await db
        .from("rfid_cards")
        .update({ ocpi_token_id: token.id })
        .eq("id", card.id);

      // 3. Queue push to Gireve
      await db
        .from("ocpi_push_queue")
        .insert({
          module: "tokens",
          action: "PUT",
          object_type: "token",
          object_id: token.id,
          ocpi_path: `/tokens/FR/EZD/${cardNumber}`,
          payload: token,
          status: "PENDING",
        });

      console.log(`[RFID] Token created and queued for Gireve push: ${cardNumber}`);
    }
  } catch (err) {
    console.error("[RFID] OCPI integration error (non-blocking):", err);
    // Card is still created even if OCPI fails
  }

  return apiCreated({
    ...card,
    message: "RFID card requested. You will receive it within 5-7 business days.",
  });
}

// ─── Report card lost ───────────────────────────────────────

async function reportLost(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const body = await ctx.req.json();

  if (!body.card_id) {
    return apiBadRequest("card_id required");
  }

  // Update card status
  const { data: card, error } = await db
    .from("rfid_cards")
    .update({ status: "LOST" })
    .eq("id", body.card_id)
    .eq("user_id", ctx.auth!.user.id)
    .select()
    .single();

  if (error || !card) {
    return apiNotFound("RFID card not found");
  }

  // Invalidate OCPI token
  if (card.ocpi_token_id) {
    await db
      .from("ocpi_tokens")
      .update({ valid: false, whitelist: "NEVER", last_updated: new Date().toISOString() })
      .eq("id", card.ocpi_token_id);

    // Queue push to Gireve to invalidate token
    const { data: token } = await db
      .from("ocpi_tokens")
      .select("*")
      .eq("id", card.ocpi_token_id)
      .single();

    if (token) {
      await db
        .from("ocpi_push_queue")
        .insert({
          module: "tokens",
          action: "PUT",
          object_type: "token",
          object_id: card.ocpi_token_id,
          ocpi_path: `/tokens/${token.country_code}/${token.party_id}/${token.uid}`,
          payload: token,
          status: "PENDING",
        });
    }
  }

  return apiSuccess({
    ...card,
    message: "Card reported as lost. RFID token has been invalidated.",
  });
}
