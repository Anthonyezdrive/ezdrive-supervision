// ============================================================
// EZDrive — Spot Payment Edge Function
// Pre-authorization by 20€ tiers with automatic capture
//
// Flow:
// 1. User scans QR / launches charge via app
// 2. POST /spot-payment/authorize → creates PaymentIntent (manual capture) for 20€
// 3. Charge starts (RemoteStartTransaction)
// 4. During charge, MeterValues tracked. When cost hits ~18€:
//    POST /spot-payment/extend → creates NEW PaymentIntent for next 20€
//    If Stripe rejects → RemoteStopTransaction → finishing
// 5. On charge complete:
//    POST /spot-payment/capture → captures actual amount on all PIs
//    POST /spot-payment/finalize → generates invoice
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createPaymentIntent,
  capturePaymentIntent,
  cancelPaymentIntent,
} from "../_shared/stripe-client.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TIER_AMOUNT_CENTS = 2000; // 20€ per authorization tier
const SAFETY_THRESHOLD_CENTS = 1800; // Trigger next tier at 18€ consumed
const DEFAULT_CURRENCY = "eur";

// ─── Types ────────────────────────────────────────────────

interface SpotSession {
  id: string;
  transaction_id: string;
  consumer_id: string | null;
  station_id: string;
  station_name: string;
  connector_id: number;
  stripe_customer_id: string;
  connected_account_id: string | null; // For Stripe Connect (V-CiTY etc.)
  application_fee_pct: number; // EZDrive commission %
  payment_intents: SpotPaymentIntent[];
  total_authorized_cents: number;
  total_consumed_cents: number;
  status: "pending" | "charging" | "finishing" | "completed" | "failed";
  coupon_code: string | null;
  coupon_discount_cents: number;
  created_at: string;
}

interface SpotPaymentIntent {
  id: string;
  stripe_pi_id: string;
  amount_cents: number;
  captured_cents: number | null;
  status: "authorized" | "captured" | "cancelled" | "failed";
  tier_number: number;
  created_at: string;
}

// ─── Main Handler ─────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
      },
    });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  try {
    const body = await req.json().catch(() => ({}));
    const sb = createClient(supabaseUrl, supabaseServiceKey);

    switch (path) {
      case "authorize":
        return await handleAuthorize(sb, body);
      case "extend":
        return await handleExtend(sb, body);
      case "capture":
        return await handleCapture(sb, body);
      case "finalize":
        return await handleFinalize(sb, body);
      case "status":
        return await handleStatus(sb, body);
      default:
        return json({ error: "Unknown action. Use: authorize, extend, capture, finalize, status" }, 400);
    }
  } catch (err) {
    console.error("[spot-payment] Error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

// ─── 1. AUTHORIZE — Initial 20€ pre-authorization ────────

async function handleAuthorize(
  sb: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
): Promise<Response> {
  const {
    station_id,
    connector_id = 1,
    stripe_customer_id,
    consumer_id = null,
    connected_account_id = null,
    application_fee_pct = 0,
    coupon_code = null,
  } = body as {
    station_id: string;
    connector_id?: number;
    stripe_customer_id: string;
    consumer_id?: string;
    connected_account_id?: string;
    application_fee_pct?: number;
    coupon_code?: string;
  };

  if (!station_id || !stripe_customer_id) {
    return json({ error: "station_id and stripe_customer_id required" }, 400);
  }

  // Get station name
  const { data: station } = await sb
    .from("stations")
    .select("name, city")
    .eq("id", station_id)
    .single();
  const stationName = station?.name ?? "Borne EZDrive";

  // Validate coupon if provided
  let couponDiscountCents = 0;
  if (coupon_code) {
    const { data: couponResult } = await sb.rpc("validate_and_apply_coupon", {
      p_coupon_code: coupon_code,
      p_amount_cents: TIER_AMOUNT_CENTS,
      p_driver_id: consumer_id,
    });
    if (couponResult?.valid) {
      couponDiscountCents = couponResult.discount_cents ?? 0;
    }
  }

  // Calculate authorization amount (tier - coupon discount)
  const authAmount = Math.max(100, TIER_AMOUNT_CENTS - couponDiscountCents); // min 1€

  // Create PaymentIntent with manual capture
  const applicationFee = connected_account_id
    ? Math.round(authAmount * (application_fee_pct as number) / 100)
    : undefined;

  const pi = await createPaymentIntent({
    amountCents: authAmount,
    currency: DEFAULT_CURRENCY,
    customerId: stripe_customer_id,
    description: `Recharge SPOT — ${stationName} — Autorisation palier 1`,
    captureMethod: "manual",
    connectedAccountId: connected_account_id ?? undefined,
    applicationFeeAmount: applicationFee,
    metadata: {
      type: "spot_charging",
      station_id,
      connector_id: String(connector_id),
      tier: "1",
    },
  });

  // Create spot_sessions record
  const sessionData = {
    station_id,
    station_name: stationName,
    connector_id,
    consumer_id,
    stripe_customer_id,
    connected_account_id,
    application_fee_pct,
    total_authorized_cents: authAmount,
    total_consumed_cents: 0,
    status: "pending",
    coupon_code,
    coupon_discount_cents: couponDiscountCents,
  };

  const { data: session, error: sessionError } = await sb
    .from("spot_sessions")
    .insert(sessionData)
    .select()
    .single();

  if (sessionError) {
    console.error("[spot-payment] Session create error:", sessionError);
    // Still return PI info even if session tracking fails
  }

  // Track PI
  if (session) {
    await sb.from("spot_payment_intents").insert({
      session_id: session.id,
      stripe_pi_id: pi.id,
      amount_cents: authAmount,
      tier_number: 1,
      status: "authorized",
    });
  }

  return json({
    success: true,
    session_id: session?.id,
    payment_intent_id: pi.id,
    client_secret: pi.client_secret,
    authorized_cents: authAmount,
    coupon_applied: couponDiscountCents > 0,
    coupon_discount_cents: couponDiscountCents,
    message: `Autorisation de ${(authAmount / 100).toFixed(2)}€ créée. Confirmez le paiement pour démarrer la charge.`,
  });
}

// ─── 2. EXTEND — Next 20€ tier when threshold reached ────

async function handleExtend(
  sb: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
): Promise<Response> {
  const { session_id, consumed_cents } = body as {
    session_id: string;
    consumed_cents: number;
  };

  if (!session_id) {
    return json({ error: "session_id required" }, 400);
  }

  // Get session
  const { data: session, error } = await sb
    .from("spot_sessions")
    .select("*, spot_payment_intents(*)")
    .eq("id", session_id)
    .single();

  if (error || !session) {
    return json({ error: "Session not found" }, 404);
  }

  // Update consumed amount
  await sb
    .from("spot_sessions")
    .update({ total_consumed_cents: consumed_cents })
    .eq("id", session_id);

  // Check if we need a new tier
  const currentTier = session.spot_payment_intents?.length ?? 1;
  const remainingAuthorized = session.total_authorized_cents - consumed_cents;

  if (remainingAuthorized > (TIER_AMOUNT_CENTS - SAFETY_THRESHOLD_CENTS)) {
    // Still enough headroom, no need to extend
    return json({
      success: true,
      extended: false,
      remaining_cents: remainingAuthorized,
      message: "Autorisation suffisante, pas besoin d'extension.",
    });
  }

  // Try to authorize next tier
  try {
    const applicationFee = session.connected_account_id
      ? Math.round(TIER_AMOUNT_CENTS * session.application_fee_pct / 100)
      : undefined;

    const pi = await createPaymentIntent({
      amountCents: TIER_AMOUNT_CENTS,
      currency: DEFAULT_CURRENCY,
      customerId: session.stripe_customer_id,
      description: `Recharge SPOT — ${session.station_name} — Autorisation palier ${currentTier + 1}`,
      captureMethod: "manual",
      connectedAccountId: session.connected_account_id ?? undefined,
      applicationFeeAmount: applicationFee,
      metadata: {
        type: "spot_charging",
        station_id: session.station_id,
        session_id,
        tier: String(currentTier + 1),
      },
    });

    // Track new PI
    await sb.from("spot_payment_intents").insert({
      session_id,
      stripe_pi_id: pi.id,
      amount_cents: TIER_AMOUNT_CENTS,
      tier_number: currentTier + 1,
      status: "authorized",
    });

    // Update total authorized
    await sb
      .from("spot_sessions")
      .update({
        total_authorized_cents: session.total_authorized_cents + TIER_AMOUNT_CENTS,
      })
      .eq("id", session_id);

    return json({
      success: true,
      extended: true,
      payment_intent_id: pi.id,
      client_secret: pi.client_secret,
      new_tier: currentTier + 1,
      total_authorized_cents: session.total_authorized_cents + TIER_AMOUNT_CENTS,
      message: `Nouvelle autorisation de ${(TIER_AMOUNT_CENTS / 100).toFixed(2)}€ (palier ${currentTier + 1}).`,
    });
  } catch (err) {
    // PAYMENT FAILED — Funds insufficient
    // → Stop the charge immediately
    console.warn("[spot-payment] Extend failed:", (err as Error).message);

    await sb
      .from("spot_sessions")
      .update({ status: "finishing" })
      .eq("id", session_id);

    return json({
      success: false,
      extended: false,
      reason: "insufficient_funds",
      message: "Fonds insuffisants. La charge va s'arrêter. Le véhicule passe en finishing.",
      action: "REMOTE_STOP",
    }, 402);
  }
}

// ─── 3. CAPTURE — Capture actual amounts on all PIs ──────

async function handleCapture(
  sb: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
): Promise<Response> {
  const { session_id, final_amount_cents } = body as {
    session_id: string;
    final_amount_cents: number;
  };

  if (!session_id || final_amount_cents === undefined) {
    return json({ error: "session_id and final_amount_cents required" }, 400);
  }

  // Get session with all PIs
  const { data: session } = await sb
    .from("spot_sessions")
    .select("*, spot_payment_intents(*)")
    .eq("id", session_id)
    .single();

  if (!session) {
    return json({ error: "Session not found" }, 404);
  }

  const pis = (session.spot_payment_intents ?? [])
    .filter((p: SpotPaymentIntent) => p.status === "authorized")
    .sort((a: SpotPaymentIntent, b: SpotPaymentIntent) => a.tier_number - b.tier_number);

  let remainingToCapture = final_amount_cents - session.coupon_discount_cents;
  remainingToCapture = Math.max(0, remainingToCapture);
  const results: Array<{ pi_id: string; captured: number; action: string }> = [];

  for (const pi of pis) {
    if (remainingToCapture <= 0) {
      // Cancel unused PI
      try {
        await cancelPaymentIntent(pi.stripe_pi_id, session.connected_account_id);
        await sb
          .from("spot_payment_intents")
          .update({ status: "cancelled", captured_cents: 0 })
          .eq("id", pi.id);
        results.push({ pi_id: pi.stripe_pi_id, captured: 0, action: "cancelled" });
      } catch (e) {
        console.warn("[spot-payment] Cancel PI failed:", (e as Error).message);
      }
    } else {
      // Capture actual amount (min of remaining and authorized)
      const captureAmount = Math.min(remainingToCapture, pi.amount_cents);
      try {
        await capturePaymentIntent(pi.stripe_pi_id, captureAmount, session.connected_account_id);
        await sb
          .from("spot_payment_intents")
          .update({ status: "captured", captured_cents: captureAmount })
          .eq("id", pi.id);
        results.push({ pi_id: pi.stripe_pi_id, captured: captureAmount, action: "captured" });
        remainingToCapture -= captureAmount;
      } catch (e) {
        console.warn("[spot-payment] Capture PI failed:", (e as Error).message);
        results.push({ pi_id: pi.stripe_pi_id, captured: 0, action: "error" });
      }
    }
  }

  // Update session
  const totalCaptured = results.reduce((sum, r) => sum + r.captured, 0);
  await sb
    .from("spot_sessions")
    .update({
      status: "completed",
      total_consumed_cents: totalCaptured + session.coupon_discount_cents,
    })
    .eq("id", session_id);

  return json({
    success: true,
    total_captured_cents: totalCaptured,
    coupon_discount_cents: session.coupon_discount_cents,
    total_charge_cents: totalCaptured + session.coupon_discount_cents,
    payment_intents: results,
    message: `Paiement capturé: ${(totalCaptured / 100).toFixed(2)}€ + coupon ${(session.coupon_discount_cents / 100).toFixed(2)}€`,
  });
}

// ─── 4. FINALIZE — Generate invoice after capture ────────

async function handleFinalize(
  sb: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
): Promise<Response> {
  const { session_id, transaction_id, energy_kwh, duration_min, finishing_min = 0, finishing_cost_cents = 0 } = body as {
    session_id: string;
    transaction_id?: string;
    energy_kwh?: number;
    duration_min?: number;
    finishing_min?: number;
    finishing_cost_cents?: number;
  };

  if (!session_id) {
    return json({ error: "session_id required" }, 400);
  }

  const { data: session } = await sb
    .from("spot_sessions")
    .select("*")
    .eq("id", session_id)
    .single();

  if (!session) {
    return json({ error: "Session not found" }, 404);
  }

  // Generate invoice number
  const { data: invoiceNum } = await sb.rpc("generate_invoice_number");

  // Create invoice
  const { data: invoice, error: invError } = await sb
    .from("invoices")
    .insert({
      invoice_number: invoiceNum ?? `SPOT-${Date.now()}`,
      consumer_id: session.consumer_id,
      type: "session",
      status: "paid",
      currency: DEFAULT_CURRENCY,
      subtotal_cents: session.total_consumed_cents,
      vat_rate: 8.5,
      vat_cents: Math.round(session.total_consumed_cents * 0.085),
      total_cents: session.total_consumed_cents + Math.round(session.total_consumed_cents * 0.085),
      line_items: [
        {
          description: `Recharge SPOT — ${session.station_name}`,
          energy_kwh: energy_kwh ?? 0,
          duration_min: duration_min ?? 0,
          amount_cents: session.total_consumed_cents - (finishing_cost_cents ?? 0),
        },
        ...(finishing_min > 0 ? [{
          description: `Stationnement finishing — ${finishing_min} min`,
          duration_min: finishing_min,
          amount_cents: finishing_cost_cents,
        }] : []),
        ...(session.coupon_discount_cents > 0 ? [{
          description: `Coupon ${session.coupon_code} appliqué`,
          amount_cents: -session.coupon_discount_cents,
        }] : []),
      ],
      metadata: {
        spot_session_id: session_id,
        transaction_id,
        connected_account_id: session.connected_account_id,
      },
    })
    .select()
    .single();

  if (invError) {
    console.error("[spot-payment] Invoice error:", invError);
    return json({ error: "Invoice creation failed" }, 500);
  }

  return json({
    success: true,
    invoice_id: invoice?.id,
    invoice_number: invoice?.invoice_number,
    total_cents: invoice?.total_cents,
    message: `Facture ${invoice?.invoice_number} générée.`,
  });
}

// ─── 5. STATUS — Get session status ─────────────────────

async function handleStatus(
  sb: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
): Promise<Response> {
  const { session_id } = body as { session_id: string };

  if (!session_id) {
    return json({ error: "session_id required" }, 400);
  }

  const { data: session } = await sb
    .from("spot_sessions")
    .select("*, spot_payment_intents(*)")
    .eq("id", session_id)
    .single();

  if (!session) {
    return json({ error: "Session not found" }, 404);
  }

  return json({
    success: true,
    session,
  });
}

// ─── Helpers ─────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
