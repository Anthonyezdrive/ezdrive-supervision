// ============================================================
// EZDrive — SEPA Mandate Setup via Open Banking
// Creates a Stripe SetupIntent with SEPA redirect flow
//
// POST /sepa-setup  — Create SetupIntent for SEPA mandate
// POST /sepa-setup/confirm — Confirm mandate after redirect
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const isConfirm = url.pathname.endsWith("/confirm");

  try {
    const body = await req.json();

    if (isConfirm) {
      return await handleConfirm(body);
    }
    return await handleSetup(body);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});

async function handleSetup(body: Record<string, unknown>): Promise<Response> {
  const { user_id, return_url } = body as { user_id: string; return_url?: string };
  if (!user_id) return json({ error: "user_id required" }, 400);

  // Get or create Stripe customer
  const { data: profile } = await db
    .from("consumer_profiles")
    .select("stripe_customer_id, email, first_name, last_name")
    .eq("id", user_id)
    .maybeSingle();

  if (!profile) return json({ error: "User not found" }, 404);

  let customerId = profile.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email,
      name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || undefined,
      metadata: { user_id },
    });
    customerId = customer.id;
    await db.from("consumer_profiles").update({ stripe_customer_id: customerId }).eq("id", user_id);
  }

  // Create SetupIntent with SEPA debit
  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["sepa_debit"],
    metadata: { user_id },
    mandate_data: {
      customer_acceptance: {
        type: "online",
        online: {
          ip_address: "0.0.0.0",
          user_agent: "EZDrive App",
        },
      },
    },
  });

  // Ephemeral key for mobile PaymentSheet
  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: customerId },
    { apiVersion: "2023-10-16" }
  );

  return json({
    setup_intent_id: setupIntent.id,
    client_secret: setupIntent.client_secret,
    ephemeral_key: ephemeralKey.secret,
    customer_id: customerId,
    return_url: return_url ?? "https://app.ezdrive.fr/payment/complete",
  });
}

async function handleConfirm(body: Record<string, unknown>): Promise<Response> {
  const { setup_intent_id, user_id } = body as { setup_intent_id: string; user_id: string };
  if (!setup_intent_id) return json({ error: "setup_intent_id required" }, 400);

  const setupIntent = await stripe.setupIntents.retrieve(setup_intent_id);

  if (setupIntent.status === "succeeded") {
    // Save payment method to profile
    await db.from("consumer_profiles").update({
      default_payment_method: setupIntent.payment_method as string,
      payment_type: "sepa",
    }).eq("id", user_id);

    return json({
      success: true,
      payment_method_id: setupIntent.payment_method,
      status: "active",
      message: "Mandat SEPA activé avec succès",
    });
  }

  return json({
    success: false,
    status: setupIntent.status,
    message: "Le mandat SEPA n'a pas été confirmé",
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
