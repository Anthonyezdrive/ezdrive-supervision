// ============================================================
// EZDrive Admin API — Customers CRM Module
// Admin CRUD for consumer profiles, RFID cards, subscriptions
//
// Endpoints:
//   GET    /api/customers                     — List customers (search, filter, paginate)
//   GET    /api/customers/stats               — Dashboard KPIs
//   GET    /api/customers/:id                 — Customer detail (profile + RFID + subs + sessions)
//   POST   /api/customers                     — Create customer (auth + profile)
//   PUT    /api/customers/:id                 — Update customer profile
//   GET    /api/customers/:id/rfid            — Customer's RFID cards
//   POST   /api/customers/:id/rfid            — Create RFID card + OCPI token + Gireve push
//   PUT    /api/customers/rfid/:cardId        — Update card status + sync OCPI
//   DELETE /api/customers/rfid/:cardId        — Deactivate card + invalidate OCPI token
//   GET    /api/customers/:id/subscriptions   — Customer's subscription history
//   POST   /api/customers/:id/subscriptions   — Assign subscription (admin override)
//   PUT    /api/customers/subscriptions/:subId — Update subscription status
//   GET    /api/customers/:id/sessions        — Customer's charging sessions (paginated)
// ============================================================

import {
  apiSuccess,
  apiCreated,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiServerError,
  apiPaginated,
  parsePagination,
} from "../../_shared/api-response.ts";
import { getServiceClient } from "../../_shared/auth-middleware.ts";
import type { RouteContext } from "../index.ts";

// ─── Main router ────────────────────────────────────────────

export async function handleCustomers(ctx: RouteContext): Promise<Response> {
  const { method, segments, auth } = ctx;

  if (!auth) return apiForbidden("Authentication required");

  // ── Verify admin/operator role ──
  const db = getServiceClient();
  const { data: profile } = await db
    .from("ezdrive_profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  if (!profile || !["admin", "operator"].includes(profile.role)) {
    return apiForbidden("Only admin and operator roles can access customer management");
  }

  const action = segments[0] ?? "";
  const subAction = segments[1] ?? "";
  const subSubAction = segments[2] ?? "";

  // ── Route matching ──
  // GET /customers → list
  // GET /customers/stats → dashboard KPIs
  // POST /customers → create
  // GET /customers/:id → detail
  // PUT /customers/:id → update profile
  // GET /customers/:id/rfid → customer RFID cards
  // POST /customers/:id/rfid → create RFID card
  // PUT /customers/rfid/:cardId → update RFID card
  // DELETE /customers/rfid/:cardId → deactivate RFID card
  // GET /customers/:id/subscriptions → subscription history
  // POST /customers/:id/subscriptions → assign subscription
  // PUT /customers/subscriptions/:subId → update subscription
  // GET /customers/:id/sessions → charging sessions

  // Stats
  if (action === "stats" && method === "GET") {
    return await getStats(ctx);
  }

  // RFID management (PUT/DELETE on rfid/:cardId)
  if (action === "rfid" && subAction) {
    if (method === "PUT") return await updateRfidCard(ctx, subAction);
    if (method === "DELETE") return await deactivateRfidCard(ctx, subAction);
    return apiBadRequest("PUT or DELETE /customers/rfid/:cardId");
  }

  // Subscription management (PUT on subscriptions/:subId)
  if (action === "subscriptions" && subAction) {
    if (method === "PUT") return await updateSubscription(ctx, subAction);
    return apiBadRequest("PUT /customers/subscriptions/:subId");
  }

  // Root-level actions
  if (!action) {
    if (method === "GET") return await listCustomers(ctx);
    if (method === "POST") return await createCustomer(ctx);
    return apiBadRequest("GET or POST /customers");
  }

  // Customer-specific routes (:id based)
  const customerId = action;

  if (!subAction) {
    if (method === "GET") return await getCustomerDetail(ctx, customerId);
    if (method === "PUT") return await updateCustomer(ctx, customerId);
    return apiBadRequest("GET or PUT /customers/:id");
  }

  switch (subAction) {
    case "rfid":
      if (method === "GET") return await getCustomerRfid(ctx, customerId);
      if (method === "POST") return await createCustomerRfid(ctx, customerId);
      return apiBadRequest("GET or POST /customers/:id/rfid");

    case "subscriptions":
      if (method === "GET") return await getCustomerSubscriptions(ctx, customerId);
      if (method === "POST") return await assignSubscription(ctx, customerId);
      return apiBadRequest("GET or POST /customers/:id/subscriptions");

    case "sessions":
      if (method === "GET") return await getCustomerSessions(ctx, customerId);
      return apiBadRequest("GET /customers/:id/sessions");

    default:
      return apiNotFound(`Unknown customer endpoint: ${subAction}`);
  }
}

// ═══════════════════════════════════════════════════════════
// LIST CUSTOMERS
// GET /api/customers?search=&type=&is_active=&offset=&limit=
// ═══════════════════════════════════════════════════════════

async function listCustomers(ctx: RouteContext): Promise<Response> {
  try {
    const db = getServiceClient();
    const { offset, limit } = parsePagination(ctx.url);
    const search = ctx.url.searchParams.get("search") ?? "";
    const userType = ctx.url.searchParams.get("type");
    const isActive = ctx.url.searchParams.get("is_active");

    // Count query
    let countQuery = db
      .from("consumer_profiles")
      .select("id", { count: "exact", head: true });

    // Data query
    let dataQuery = db
      .from("consumer_profiles")
      .select(`
        id, email, full_name, phone, user_type,
        company_name, is_company, is_active, admin_notes,
        stripe_customer_id, created_at, updated_at
      `)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (search) {
      const filter = `full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`;
      countQuery = countQuery.or(filter);
      dataQuery = dataQuery.or(filter);
    }

    if (userType) {
      countQuery = countQuery.eq("user_type", userType);
      dataQuery = dataQuery.eq("user_type", userType);
    }

    if (isActive !== null && isActive !== undefined && isActive !== "") {
      const active = isActive === "true";
      countQuery = countQuery.eq("is_active", active);
      dataQuery = dataQuery.eq("is_active", active);
    }

    const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);

    if (dataResult.error) throw dataResult.error;

    return apiPaginated(dataResult.data ?? [], {
      total: countResult.count ?? 0,
      offset,
      limit,
    });
  } catch (err) {
    console.error("[Customers] listCustomers error:", err);
    return apiServerError("Failed to fetch customers");
  }
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD STATS
// GET /api/customers/stats
// ═══════════════════════════════════════════════════════════

async function getStats(ctx: RouteContext): Promise<Response> {
  try {
    const db = getServiceClient();

    // Run all stat queries in parallel
    const [
      totalResult,
      activeResult,
      typeProfiles,
      rfidResult,
      subsResult,
      topUsageResult,
    ] = await Promise.all([
      // Total customers
      db.from("consumer_profiles").select("id", { count: "exact", head: true }),

      // Active customers
      db.from("consumer_profiles").select("id", { count: "exact", head: true }).eq("is_active", true),

      // All profiles for type breakdown
      db.from("consumer_profiles").select("user_type"),

      // RFID cards by status
      db.from("rfid_cards").select("status"),

      // Subscriptions by offer
      db.from("user_subscriptions")
        .select(`status, subscription_offers ( type, name )`)
        .in("status", ["ACTIVE", "PENDING"]),

      // Top customers by usage (RPC created in migration 020)
      db.rpc("get_top_customers_by_usage", { limit_count: 5 }),
    ]);

    // Process type breakdown
    const typeBreakdown: Record<string, number> = {};
    if (typeProfiles.data) {
      for (const p of typeProfiles.data) {
        const t = p.user_type ?? "UNKNOWN";
        typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
      }
    }

    // Process RFID stats
    const rfidStats: Record<string, number> = {};
    if (rfidResult.data) {
      for (const card of rfidResult.data) {
        rfidStats[card.status] = (rfidStats[card.status] || 0) + 1;
      }
    }

    // Process subscription stats
    const subStats: Record<string, number> = {};
    if (subsResult.data) {
      for (const sub of subsResult.data as Record<string, unknown>[]) {
        const offer = sub.subscription_offers as Record<string, unknown> | null;
        const offerType = (offer?.type as string) ?? "UNKNOWN";
        subStats[offerType] = (subStats[offerType] || 0) + 1;
      }
    }

    return apiSuccess({
      customers: {
        total: totalResult.count ?? 0,
        active: activeResult.count ?? 0,
        inactive: (totalResult.count ?? 0) - (activeResult.count ?? 0),
        by_type: typeBreakdown,
      },
      rfid_cards: {
        total: rfidResult.data?.length ?? 0,
        by_status: rfidStats,
      },
      subscriptions: {
        active_total: subsResult.data?.length ?? 0,
        by_offer: subStats,
      },
      top_customers_by_usage: topUsageResult?.data ?? [],
    });
  } catch (err) {
    console.error("[Customers] getStats error:", err);
    return apiServerError("Failed to fetch customer stats");
  }
}

// ═══════════════════════════════════════════════════════════
// CUSTOMER DETAIL
// GET /api/customers/:id
// ═══════════════════════════════════════════════════════════

async function getCustomerDetail(ctx: RouteContext, customerId: string): Promise<Response> {
  try {
    const db = getServiceClient();

    // Fetch profile + related data in parallel
    const [profileResult, rfidResult, subsResult, sessionsResult, vehiclesResult] = await Promise.all([
      // Profile
      db.from("consumer_profiles")
        .select("*")
        .eq("id", customerId)
        .maybeSingle(),

      // RFID cards with OCPI tokens
      db.from("rfid_cards")
        .select(`
          id, card_number, visual_number, status, shipping_address,
          tracking_number, activated_at, expires_at, admin_notes,
          managed_by, created_at,
          ocpi_tokens (
            id, uid, type, contract_id, valid, whitelist, last_updated
          )
        `)
        .eq("user_id", customerId)
        .order("created_at", { ascending: false }),

      // Subscriptions with offer details
      db.from("user_subscriptions")
        .select(`
          id, offer_id, status, started_at, expires_at, cancelled_at,
          stripe_subscription_id, assigned_by, admin_notes, created_at,
          subscription_offers (
            id, type, name, price_cents, currency, billing_period
          )
        `)
        .eq("user_id", customerId)
        .order("created_at", { ascending: false }),

      // Last 10 charging sessions
      db.from("ocpp_transactions")
        .select(`
          id, chargepoint_id, connector_id, id_tag,
          energy_kwh, started_at, stopped_at, status,
          ocpp_chargepoints (
            identity,
            stations ( name, city )
          )
        `)
        .eq("consumer_id", customerId)
        .order("started_at", { ascending: false })
        .limit(10),

      // Vehicles
      db.from("user_vehicles")
        .select("*")
        .eq("user_id", customerId)
        .order("is_default", { ascending: false }),
    ]);

    if (profileResult.error || !profileResult.data) {
      return apiNotFound("Customer not found");
    }

    return apiSuccess({
      profile: profileResult.data,
      rfid_cards: rfidResult.data ?? [],
      subscriptions: subsResult.data ?? [],
      recent_sessions: sessionsResult.data ?? [],
      vehicles: vehiclesResult.data ?? [],
    });
  } catch (err) {
    console.error("[Customers] getCustomerDetail error:", err);
    return apiServerError("Failed to fetch customer detail");
  }
}

// ═══════════════════════════════════════════════════════════
// CREATE CUSTOMER
// POST /api/customers
// Body: { email, full_name, phone?, user_type?, company_name?, password? }
// ═══════════════════════════════════════════════════════════

async function createCustomer(ctx: RouteContext): Promise<Response> {
  try {
    const db = getServiceClient();
    const body = await ctx.req.json();

    if (!body.email) return apiBadRequest("email is required");
    if (!body.full_name) return apiBadRequest("full_name is required");

    // Generate temporary password if not provided
    const tempPassword = body.password ??
      `EzD${Math.random().toString(36).substring(2, 10)}!`;

    // 1. Create auth user with service role (admin createUser)
    const { data: authData, error: authError } = await db.auth.admin.createUser({
      email: body.email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm email for admin-created users
      user_metadata: {
        full_name: body.full_name,
        created_by_admin: "true", // Prevents trigger from creating ezdrive_profiles
      },
    });

    if (authError) {
      console.error("[Customers] Auth user creation error:", authError);
      if (authError.message?.includes("already")) {
        return apiBadRequest("A user with this email already exists");
      }
      return apiServerError(`Failed to create auth user: ${authError.message}`);
    }

    const userId = authData.user.id;

    // 2. Create consumer profile
    const { data: profile, error: profileError } = await db
      .from("consumer_profiles")
      .insert({
        id: userId,
        email: body.email,
        full_name: body.full_name,
        phone: body.phone ?? null,
        user_type: body.user_type ?? "INDIVIDUAL",
        company_name: body.company_name ?? null,
        is_company: body.user_type === "BUSINESS" || body.is_company === true,
        is_active: true,
        created_by: ctx.auth!.user.id,
        admin_notes: body.admin_notes ?? null,
      })
      .select()
      .single();

    if (profileError) {
      console.error("[Customers] Profile creation error:", profileError);
      // Rollback: delete auth user if profile creation fails
      await db.auth.admin.deleteUser(userId);
      return apiServerError("Failed to create customer profile");
    }

    console.log(`[Customers] Customer created by admin: ${body.email} (${userId})`);

    return apiCreated({
      ...profile,
      temporary_password: tempPassword,
      message: "Customer created. Share the temporary password with the customer.",
    });
  } catch (err) {
    console.error("[Customers] createCustomer error:", err);
    return apiServerError("Failed to create customer");
  }
}

// ═══════════════════════════════════════════════════════════
// UPDATE CUSTOMER
// PUT /api/customers/:id
// Body: { full_name?, phone?, user_type?, company_name?, is_active?, admin_notes? }
// ═══════════════════════════════════════════════════════════

async function updateCustomer(ctx: RouteContext, customerId: string): Promise<Response> {
  try {
    const db = getServiceClient();
    const body = await ctx.req.json();

    // Whitelist updatable fields
    const allowed: Record<string, unknown> = {};
    const fields = [
      "full_name", "phone", "user_type", "company_name",
      "is_company", "is_active", "admin_notes",
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
      .eq("id", customerId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") return apiNotFound("Customer not found");
      throw error;
    }

    console.log(`[Customers] Customer updated by admin: ${customerId}`);
    return apiSuccess(data);
  } catch (err) {
    console.error("[Customers] updateCustomer error:", err);
    return apiServerError("Failed to update customer");
  }
}

// ═══════════════════════════════════════════════════════════
// CUSTOMER RFID CARDS
// GET /api/customers/:id/rfid
// ═══════════════════════════════════════════════════════════

async function getCustomerRfid(ctx: RouteContext, customerId: string): Promise<Response> {
  try {
    const db = getServiceClient();

    const { data, error } = await db
      .from("rfid_cards")
      .select(`
        id, card_number, visual_number, status, shipping_address,
        tracking_number, activated_at, expires_at, admin_notes,
        managed_by, created_at,
        ocpi_tokens (
          id, uid, type, contract_id, valid, whitelist, last_updated
        )
      `)
      .eq("user_id", customerId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return apiSuccess(data ?? []);
  } catch (err) {
    console.error("[Customers] getCustomerRfid error:", err);
    return apiServerError("Failed to fetch RFID cards");
  }
}

// ═══════════════════════════════════════════════════════════
// CREATE RFID CARD (Admin)
// POST /api/customers/:id/rfid
// Body: { status?, card_number?, admin_notes? }
// ═══════════════════════════════════════════════════════════

async function createCustomerRfid(ctx: RouteContext, customerId: string): Promise<Response> {
  try {
    const db = getServiceClient();
    const body = await ctx.req.json();

    // Verify customer exists
    const { data: customer } = await db
      .from("consumer_profiles")
      .select("id, full_name, email")
      .eq("id", customerId)
      .maybeSingle();

    if (!customer) return apiNotFound("Customer not found");

    // Generate card number if not provided
    const cardNumber = body.card_number ??
      `EZD${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const visualNumber = cardNumber.substring(0, 12);

    // 1. Create RFID card
    const { data: card, error: cardError } = await db
      .from("rfid_cards")
      .insert({
        user_id: customerId,
        card_number: cardNumber,
        visual_number: visualNumber,
        status: body.status ?? "ACTIVE",
        shipping_address: body.shipping_address ?? null,
        managed_by: ctx.auth!.user.id,
        admin_notes: body.admin_notes ?? null,
        activated_at: body.status === "ACTIVE" ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (cardError) {
      console.error("[Customers] RFID card creation error:", cardError);
      return apiServerError("Failed to create RFID card");
    }

    // 2. Create OCPI token for Gireve interop
    try {
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
          valid: body.status === "ACTIVE",
          whitelist: body.status === "ACTIVE" ? "ALLOWED" : "NEVER",
          language: "fr",
          last_updated: new Date().toISOString(),
        })
        .select()
        .single();

      if (tokenError) {
        console.error("[Customers] OCPI token creation error:", tokenError);
      } else if (token) {
        // Link card to OCPI token
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

        console.log(`[Customers] RFID + OCPI token created and queued for Gireve: ${cardNumber}`);
      }
    } catch (err) {
      console.error("[Customers] OCPI integration error (non-blocking):", err);
    }

    return apiCreated({
      ...card,
      message: `RFID card created for ${customer.full_name}`,
    });
  } catch (err) {
    console.error("[Customers] createCustomerRfid error:", err);
    return apiServerError("Failed to create RFID card");
  }
}

// ═══════════════════════════════════════════════════════════
// UPDATE RFID CARD STATUS
// PUT /api/customers/rfid/:cardId
// Body: { status, admin_notes? }
// ═══════════════════════════════════════════════════════════

async function updateRfidCard(ctx: RouteContext, cardId: string): Promise<Response> {
  try {
    const db = getServiceClient();
    const body = await ctx.req.json();

    if (!body.status) return apiBadRequest("status is required (ACTIVE, SUSPENDED, CANCELLED, LOST)");

    const validStatuses = ["ACTIVE", "SUSPENDED", "CANCELLED", "LOST", "REQUESTED"];
    if (!validStatuses.includes(body.status)) {
      return apiBadRequest(`Invalid status. Allowed: ${validStatuses.join(", ")}`);
    }

    // Build update payload
    const update: Record<string, unknown> = {
      status: body.status,
      managed_by: ctx.auth!.user.id,
    };

    if (body.admin_notes !== undefined) update.admin_notes = body.admin_notes;
    if (body.status === "ACTIVE") update.activated_at = new Date().toISOString();

    // Update card
    const { data: card, error } = await db
      .from("rfid_cards")
      .update(update)
      .eq("id", cardId)
      .select("*, ocpi_token_id")
      .single();

    if (error) {
      if (error.code === "PGRST116") return apiNotFound("RFID card not found");
      throw error;
    }

    // Sync OCPI token status
    if (card.ocpi_token_id) {
      const isValid = body.status === "ACTIVE";
      const whitelist = isValid ? "ALLOWED" : "NEVER";

      await db
        .from("ocpi_tokens")
        .update({
          valid: isValid,
          whitelist,
          last_updated: new Date().toISOString(),
        })
        .eq("id", card.ocpi_token_id);

      // Queue Gireve push
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

      console.log(`[Customers] RFID card ${cardId} status → ${body.status}, OCPI synced`);
    }

    return apiSuccess(card);
  } catch (err) {
    console.error("[Customers] updateRfidCard error:", err);
    return apiServerError("Failed to update RFID card");
  }
}

// ═══════════════════════════════════════════════════════════
// DEACTIVATE RFID CARD
// DELETE /api/customers/rfid/:cardId
// ═══════════════════════════════════════════════════════════

async function deactivateRfidCard(ctx: RouteContext, cardId: string): Promise<Response> {
  try {
    const db = getServiceClient();

    // Update card status to CANCELLED
    const { data: card, error } = await db
      .from("rfid_cards")
      .update({
        status: "CANCELLED",
        managed_by: ctx.auth!.user.id,
      })
      .eq("id", cardId)
      .select("*, ocpi_token_id")
      .single();

    if (error) {
      if (error.code === "PGRST116") return apiNotFound("RFID card not found");
      throw error;
    }

    // Invalidate OCPI token
    if (card.ocpi_token_id) {
      await db
        .from("ocpi_tokens")
        .update({
          valid: false,
          whitelist: "NEVER",
          last_updated: new Date().toISOString(),
        })
        .eq("id", card.ocpi_token_id);

      // Queue Gireve push
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

      console.log(`[Customers] RFID card ${cardId} deactivated, OCPI token invalidated`);
    }

    return apiSuccess({
      ...card,
      message: "RFID card deactivated and OCPI token invalidated",
    });
  } catch (err) {
    console.error("[Customers] deactivateRfidCard error:", err);
    return apiServerError("Failed to deactivate RFID card");
  }
}

// ═══════════════════════════════════════════════════════════
// CUSTOMER SUBSCRIPTIONS
// GET /api/customers/:id/subscriptions
// ═══════════════════════════════════════════════════════════

async function getCustomerSubscriptions(ctx: RouteContext, customerId: string): Promise<Response> {
  try {
    const db = getServiceClient();

    const { data, error } = await db
      .from("user_subscriptions")
      .select(`
        id, offer_id, status, started_at, expires_at, cancelled_at,
        stripe_subscription_id, assigned_by, admin_notes, created_at,
        subscription_offers (
          id, type, name, price_cents, currency, billing_period
        )
      `)
      .eq("user_id", customerId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return apiSuccess(data ?? []);
  } catch (err) {
    console.error("[Customers] getCustomerSubscriptions error:", err);
    return apiServerError("Failed to fetch subscriptions");
  }
}

// ═══════════════════════════════════════════════════════════
// ASSIGN SUBSCRIPTION (Admin override — no Stripe)
// POST /api/customers/:id/subscriptions
// Body: { offer_id, admin_notes? }
// ═══════════════════════════════════════════════════════════

async function assignSubscription(ctx: RouteContext, customerId: string): Promise<Response> {
  try {
    const db = getServiceClient();
    const body = await ctx.req.json();

    if (!body.offer_id) return apiBadRequest("offer_id is required");

    // Verify customer exists
    const { data: customer } = await db
      .from("consumer_profiles")
      .select("id, full_name")
      .eq("id", customerId)
      .maybeSingle();

    if (!customer) return apiNotFound("Customer not found");

    // Verify offer exists
    const { data: offer } = await db
      .from("subscription_offers")
      .select("*")
      .eq("id", body.offer_id)
      .maybeSingle();

    if (!offer) return apiNotFound("Subscription offer not found");

    // Cancel any existing active subscription
    const { data: activeSubs } = await db
      .from("user_subscriptions")
      .select("id")
      .eq("user_id", customerId)
      .eq("status", "ACTIVE");

    if (activeSubs && activeSubs.length > 0) {
      await db
        .from("user_subscriptions")
        .update({
          status: "CANCELLED",
          cancelled_at: new Date().toISOString(),
          admin_notes: "Cancelled by admin — replaced by new assignment",
        })
        .in("id", activeSubs.map((s: { id: string }) => s.id));
    }

    // Create new subscription (admin override — no Stripe)
    const { data: sub, error: subError } = await db
      .from("user_subscriptions")
      .insert({
        user_id: customerId,
        offer_id: body.offer_id,
        status: "ACTIVE",
        started_at: new Date().toISOString(),
        expires_at: body.expires_at ?? null,
        assigned_by: ctx.auth!.user.id,
        admin_notes: body.admin_notes ?? `Assigned by admin`,
      })
      .select(`
        *,
        subscription_offers ( type, name )
      `)
      .single();

    if (subError) {
      console.error("[Customers] Subscription assignment error:", subError);
      return apiServerError("Failed to assign subscription");
    }

    console.log(`[Customers] Subscription ${offer.type} assigned to ${customer.full_name} by admin`);

    return apiCreated({
      ...sub,
      message: `Subscription ${offer.name} assigned to ${customer.full_name}`,
    });
  } catch (err) {
    console.error("[Customers] assignSubscription error:", err);
    return apiServerError("Failed to assign subscription");
  }
}

// ═══════════════════════════════════════════════════════════
// UPDATE SUBSCRIPTION STATUS
// PUT /api/customers/subscriptions/:subId
// Body: { status, admin_notes? }
// ═══════════════════════════════════════════════════════════

async function updateSubscription(ctx: RouteContext, subId: string): Promise<Response> {
  try {
    const db = getServiceClient();
    const body = await ctx.req.json();

    if (!body.status) return apiBadRequest("status is required (ACTIVE, CANCELLED, EXPIRED, SUSPENDED)");

    const validStatuses = ["ACTIVE", "PENDING", "CANCELLED", "EXPIRED", "SUSPENDED", "PAST_DUE"];
    if (!validStatuses.includes(body.status)) {
      return apiBadRequest(`Invalid status. Allowed: ${validStatuses.join(", ")}`);
    }

    const update: Record<string, unknown> = { status: body.status };
    if (body.admin_notes !== undefined) update.admin_notes = body.admin_notes;
    if (body.status === "CANCELLED") update.cancelled_at = new Date().toISOString();

    const { data, error } = await db
      .from("user_subscriptions")
      .update(update)
      .eq("id", subId)
      .select(`
        *,
        subscription_offers ( type, name )
      `)
      .single();

    if (error) {
      if (error.code === "PGRST116") return apiNotFound("Subscription not found");
      throw error;
    }

    console.log(`[Customers] Subscription ${subId} status → ${body.status}`);
    return apiSuccess(data);
  } catch (err) {
    console.error("[Customers] updateSubscription error:", err);
    return apiServerError("Failed to update subscription");
  }
}

// ═══════════════════════════════════════════════════════════
// CUSTOMER CHARGING SESSIONS
// GET /api/customers/:id/sessions?offset=&limit=
// ═══════════════════════════════════════════════════════════

async function getCustomerSessions(ctx: RouteContext, customerId: string): Promise<Response> {
  try {
    const db = getServiceClient();
    const { offset, limit } = parsePagination(ctx.url);

    // Count
    const { count } = await db
      .from("ocpp_transactions")
      .select("id", { count: "exact", head: true })
      .eq("consumer_id", customerId);

    // Data
    const { data, error } = await db
      .from("ocpp_transactions")
      .select(`
        id, chargepoint_id, connector_id, id_tag,
        energy_kwh, meter_start, meter_stop,
        started_at, stopped_at, status,
        ocpp_chargepoints (
          identity,
          stations ( name, city, address )
        )
      `)
      .eq("consumer_id", customerId)
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Enrich with duration
    const enriched = (data ?? []).map((s: Record<string, unknown>) => {
      const cp = s.ocpp_chargepoints as Record<string, unknown> | null;
      const station = cp?.stations as Record<string, unknown> | null;
      const startTime = s.started_at ? new Date(s.started_at as string) : null;
      const stopTime = s.stopped_at ? new Date(s.stopped_at as string) : null;
      const durationMinutes = startTime && stopTime
        ? Math.round((stopTime.getTime() - startTime.getTime()) / 60000)
        : startTime
          ? Math.round((Date.now() - startTime.getTime()) / 60000)
          : null;

      return {
        ...s,
        station_name: station?.name ?? null,
        station_city: station?.city ?? null,
        chargepoint_identity: cp?.identity ?? null,
        duration_minutes: durationMinutes,
      };
    });

    return apiPaginated(enriched, {
      total: count ?? 0,
      offset,
      limit,
    });
  } catch (err) {
    console.error("[Customers] getCustomerSessions error:", err);
    return apiServerError("Failed to fetch charging sessions");
  }
}
