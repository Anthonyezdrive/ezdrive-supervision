// ============================================================
// EZDrive Consumer API — Subscriptions Module
// Port from Resonovia billing-service + Stripe integration
// Improvement: auth on all endpoints, proper webhook handling
// ============================================================

import {
  apiSuccess,
  apiCreated,
  apiBadRequest,
  apiNotFound,
  apiServerError,
} from "../../_shared/api-response.ts";
import { getServiceClient } from "../../_shared/auth-middleware.ts";
import {
  getStripe,
  createCustomer,
  createCheckoutSession,
  cancelSubscription as stripeCancelSub,
} from "../../_shared/stripe-client.ts";
import type { RouteContext } from "../index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

export async function handleSubscriptions(ctx: RouteContext): Promise<Response> {
  const { method, segments } = ctx;
  const action = segments[0] ?? "";

  switch (action) {
    case "offers":
      if (method === "GET") return getOffers(ctx);
      return apiBadRequest("GET required");

    case "current":
      if (method === "GET") return getCurrentSubscription(ctx);
      return apiBadRequest("GET required");

    case "subscribe":
      if (method === "POST") return subscribe(ctx);
      return apiBadRequest("POST required");

    case "cancel":
      if (method === "POST") return cancelSubscription(ctx);
      return apiBadRequest("POST required");

    default:
      if (!action && method === "GET") return getCurrentSubscription(ctx);
      return apiBadRequest("Unknown subscription action");
  }
}

// ─── List offers ────────────────────────────────────────────

async function getOffers(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();

  const { data, error } = await db
    .from("subscription_offers")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (error) return apiServerError("Failed to fetch offers");
  return apiSuccess(data ?? []);
}

// ─── Current subscription ───────────────────────────────────

async function getCurrentSubscription(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();

  const { data, error } = await db
    .from("user_subscriptions")
    .select(`
      *,
      subscription_offers ( * )
    `)
    .eq("user_id", ctx.auth!.user.id)
    .in("status", ["ACTIVE", "PENDING", "PAST_DUE"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[Subscriptions] Fetch error:", error);
    return apiServerError("Failed to fetch subscription");
  }

  return apiSuccess(data);
}

// ─── Subscribe (create Stripe checkout) ─────────────────────

async function subscribe(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const body = await ctx.req.json();
  const userId = ctx.auth!.user.id;

  if (!body.offer_id) {
    return apiBadRequest("offer_id required");
  }

  // 1. Get the offer
  const { data: offer, error: offerErr } = await db
    .from("subscription_offers")
    .select("*")
    .eq("id", body.offer_id)
    .eq("is_active", true)
    .maybeSingle();

  if (offerErr || !offer) {
    return apiNotFound("Offer not found");
  }

  // 2. Free tier (PAY_AS_YOU_GO) — no Stripe needed
  if (offer.price_cents === 0 && offer.type === "PAY_AS_YOU_GO") {
    const { data: sub, error: subErr } = await db
      .from("user_subscriptions")
      .insert({
        user_id: userId,
        offer_id: offer.id,
        status: "ACTIVE",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (subErr) return apiServerError("Failed to create subscription");
    return apiCreated(sub);
  }

  // 3. Ensure Stripe customer exists
  const { data: profile } = await db
    .from("consumer_profiles")
    .select("stripe_customer_id, email, full_name")
    .eq("id", userId)
    .single();

  let stripeCustomerId = profile?.stripe_customer_id;

  if (!stripeCustomerId) {
    try {
      const customer = await createCustomer({
        email: profile?.email ?? ctx.auth!.user.email,
        name: profile?.full_name ?? undefined,
        metadata: { ezdrive_user_id: userId },
      });
      stripeCustomerId = customer.id;

      await db
        .from("consumer_profiles")
        .update({ stripe_customer_id: customer.id })
        .eq("id", userId);
    } catch (err) {
      console.error("[Subscriptions] Stripe customer error:", err);
      return apiServerError("Failed to create payment customer");
    }
  }

  // 4. Determine Stripe mode
  const isRecurring = offer.billing_period === "MONTHLY" || offer.billing_period === "YEARLY";

  // 5. Create checkout session
  try {
    const successUrl = body.success_url ?? `${SUPABASE_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = body.cancel_url ?? `${SUPABASE_URL}/subscription/cancel`;

    const lineItems = offer.stripe_price_id
      ? [{ price: offer.stripe_price_id, quantity: 1 }]
      : [{
          priceData: {
            currency: offer.currency.toLowerCase(),
            unit_amount: offer.price_cents,
            product_data: { name: offer.name, description: offer.description ?? undefined },
            ...(isRecurring
              ? { recurring: { interval: offer.billing_period === "MONTHLY" ? "month" : "year" } }
              : {}),
          },
          quantity: 1,
        }];

    const session = await createCheckoutSession({
      lineItems,
      mode: isRecurring ? "subscription" : "payment",
      customerId: stripeCustomerId,
      successUrl,
      cancelUrl,
      clientReferenceId: userId,
      metadata: {
        ezdrive_user_id: userId,
        offer_id: offer.id,
        offer_type: offer.type,
      },
    });

    // 6. Create pending subscription record
    const { data: sub } = await db
      .from("user_subscriptions")
      .insert({
        user_id: userId,
        offer_id: offer.id,
        stripe_checkout_id: session.id,
        status: "PENDING",
      })
      .select()
      .single();

    return apiCreated({
      checkout_url: session.url,
      session_id: session.id,
      subscription: sub,
    });
  } catch (err) {
    console.error("[Subscriptions] Checkout error:", err);
    return apiServerError("Failed to create checkout session");
  }
}

// ─── Cancel subscription ────────────────────────────────────

async function cancelSubscription(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const userId = ctx.auth!.user.id;

  // Find active subscription
  const { data: sub, error } = await db
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error || !sub) {
    return apiNotFound("No active subscription found");
  }

  // Cancel on Stripe if it's a recurring subscription
  if (sub.stripe_subscription_id) {
    try {
      await stripeCancelSub(sub.stripe_subscription_id);
    } catch (err) {
      console.error("[Subscriptions] Stripe cancel error:", err);
      // Continue with local cancellation even if Stripe fails
    }
  }

  // Update local status
  const { data: updated } = await db
    .from("user_subscriptions")
    .update({
      status: "CANCELLED",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", sub.id)
    .select()
    .single();

  return apiSuccess(updated);
}
