// ============================================================
// EZDrive — Stripe Client for Deno
// Port from Resonovia billing-service/stripe_module (392 lines Python)
// Improved: typed responses, error handling, auth enforcement
// ============================================================

import Stripe from "https://esm.sh/stripe@17?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

let _stripeInstance: Stripe | null = null;

/**
 * Get configured Stripe instance (singleton)
 */
export function getStripe(): Stripe {
  if (!_stripeInstance) {
    if (!STRIPE_SECRET_KEY) {
      throw new Error("Missing STRIPE_SECRET_KEY environment variable");
    }
    _stripeInstance = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });
  }
  return _stripeInstance;
}

// ─── Customer Operations ───────────────────────────────────

export async function createCustomer(params: {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Customer> {
  const stripe = getStripe();
  return stripe.customers.create({
    email: params.email,
    name: params.name,
    metadata: params.metadata ?? {},
  });
}

export async function getCustomer(customerId: string): Promise<Stripe.Customer> {
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) {
    throw new StripeNotFoundError(`Customer ${customerId} has been deleted`);
  }
  return customer as Stripe.Customer;
}

// ─── Payment Intent Operations ─────────────────────────────

export async function createPaymentIntent(params: {
  amountCents: number;
  currency?: string;
  customerId?: string;
  description?: string;
  metadata?: Record<string, string>;
  captureMethod?: "automatic" | "manual";
  connectedAccountId?: string;
  applicationFeeAmount?: number;
}): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  const createParams: Stripe.PaymentIntentCreateParams = {
    amount: params.amountCents,
    currency: params.currency ?? "eur",
    customer: params.customerId,
    description: params.description,
    payment_method_types: ["card"],
    metadata: params.metadata ?? {},
  };
  if (params.captureMethod) {
    createParams.capture_method = params.captureMethod;
  }
  if (params.applicationFeeAmount) {
    createParams.application_fee_amount = params.applicationFeeAmount;
  }
  const options: Stripe.RequestOptions = {};
  if (params.connectedAccountId) {
    options.stripeAccount = params.connectedAccountId;
  }
  return stripe.paymentIntents.create(createParams, options);
}

/**
 * Capture a previously authorized PaymentIntent (capture_method: manual)
 * Used for spot charging: authorize 20€, then capture actual amount
 */
export async function capturePaymentIntent(
  paymentIntentId: string,
  amountToCaptureCents?: number,
  connectedAccountId?: string,
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  const options: Stripe.RequestOptions = {};
  if (connectedAccountId) {
    options.stripeAccount = connectedAccountId;
  }
  return stripe.paymentIntents.capture(
    paymentIntentId,
    amountToCaptureCents ? { amount_to_capture: amountToCaptureCents } : {},
    options,
  );
}

/**
 * Cancel a PaymentIntent (e.g., if charging fails to start)
 */
export async function cancelPaymentIntent(
  paymentIntentId: string,
  connectedAccountId?: string,
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  const options: Stripe.RequestOptions = {};
  if (connectedAccountId) {
    options.stripeAccount = connectedAccountId;
  }
  return stripe.paymentIntents.cancel(paymentIntentId, {}, options);
}

// ─── Checkout Session Operations ───────────────────────────

export async function createCheckoutSession(params: {
  lineItems: Array<{
    price?: string;
    priceData?: Stripe.Checkout.SessionCreateParams.LineItem.PriceData;
    quantity: number;
  }>;
  successUrl: string;
  cancelUrl: string;
  mode?: Stripe.Checkout.SessionCreateParams.Mode;
  customerEmail?: string;
  customerId?: string;
  clientReferenceId?: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const lineItems = params.lineItems.map((item) => ({
    ...(item.price ? { price: item.price } : {}),
    ...(item.priceData ? { price_data: item.priceData } : {}),
    quantity: item.quantity,
  }));

  return stripe.checkout.sessions.create({
    line_items: lineItems,
    mode: params.mode ?? "payment",
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    customer: params.customerId,
    customer_email: params.customerId ? undefined : params.customerEmail,
    client_reference_id: params.clientReferenceId,
    metadata: params.metadata ?? {},
  });
}

// ─── Subscription Operations ───────────────────────────────

export async function createSubscription(params: {
  customerId: string;
  priceId: string;
  trialPeriodDays?: number;
  metadata?: Record<string, string>;
}): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.create({
    customer: params.customerId,
    items: [{ price: params.priceId }],
    trial_period_days: params.trialPeriodDays,
    metadata: params.metadata ?? {},
    expand: ["latest_invoice"],
  });
}

export async function cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.cancel(subscriptionId);
}

// ─── Invoice Operations ────────────────────────────────────

export async function getInvoice(invoiceId: string): Promise<Stripe.Invoice> {
  const stripe = getStripe();
  return stripe.invoices.retrieve(invoiceId);
}

// ─── SEPA Mandate Operations ────────────────────────────────

/**
 * Check if a customer has a valid SEPA mandate
 * Returns the default SEPA payment method if available
 */
export async function getCustomerSepaPaymentMethod(
  customerId: string,
  connectedAccountId?: string,
): Promise<Stripe.PaymentMethod | null> {
  const stripe = getStripe();
  const options: Stripe.RequestOptions = {};
  if (connectedAccountId) {
    options.stripeAccount = connectedAccountId;
  }
  const paymentMethods = await stripe.paymentMethods.list(
    { customer: customerId, type: "sepa_debit", limit: 1 },
    options,
  );
  return paymentMethods.data.length > 0 ? paymentMethods.data[0] : null;
}

/**
 * Create a confirmed PaymentIntent with SEPA debit (post-session charge)
 * Unlike card pre-auth, SEPA debits are confirmed immediately but take 3-5 days to settle
 */
export async function createSepaPaymentIntent(params: {
  amountCents: number;
  currency?: string;
  customerId: string;
  paymentMethodId: string;
  description?: string;
  metadata?: Record<string, string>;
  connectedAccountId?: string;
  applicationFeeAmount?: number;
}): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  const createParams: Stripe.PaymentIntentCreateParams = {
    amount: params.amountCents,
    currency: params.currency ?? "eur",
    customer: params.customerId,
    payment_method: params.paymentMethodId,
    payment_method_types: ["sepa_debit"],
    confirm: true,
    description: params.description,
    metadata: params.metadata ?? {},
    mandate_data: {
      customer_acceptance: {
        type: "online",
        online: {
          ip_address: "0.0.0.0",
          user_agent: "EZDrive-OCPP-Server",
        },
      },
    },
  };
  if (params.applicationFeeAmount) {
    createParams.application_fee_amount = params.applicationFeeAmount;
  }
  const options: Stripe.RequestOptions = {};
  if (params.connectedAccountId) {
    options.stripeAccount = params.connectedAccountId;
  }
  return stripe.paymentIntents.create(createParams, options);
}

/**
 * Create a SetupIntent for SEPA mandate collection (one-time setup)
 */
export async function createSepaSetupIntent(params: {
  customerId: string;
  connectedAccountId?: string;
}): Promise<Stripe.SetupIntent> {
  const stripe = getStripe();
  const options: Stripe.RequestOptions = {};
  if (params.connectedAccountId) {
    options.stripeAccount = params.connectedAccountId;
  }
  return stripe.setupIntents.create(
    {
      customer: params.customerId,
      payment_method_types: ["sepa_debit"],
      usage: "off_session",
    },
    options,
  );
}

// ─── Webhook Operations ────────────────────────────────────

/**
 * Verify and construct Stripe webhook event
 * Improved over Resonovia: always verifies signature (no fallback to unverified)
 */
export function constructWebhookEvent(
  payload: string,
  signature: string,
): Stripe.Event {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET environment variable");
  }
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
}

// ─── Error Types ───────────────────────────────────────────

export class StripeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeNotFoundError";
  }
}

export { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET };
