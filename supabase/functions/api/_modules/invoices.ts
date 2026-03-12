// ============================================================
// EZDrive Consumer API — Invoices Module
// CDC: Factures PDF + Export CSV + Listing + Admin
// ============================================================

import {
  apiSuccess,
  apiCreated,
  apiBadRequest,
  apiNotFound,
  apiServerError,
  apiForbidden,
} from "../../_shared/api-response.ts";
import { getServiceClient } from "../../_shared/auth-middleware.ts";
import type { RouteContext } from "../index.ts";

// ─── Router ─────────────────────────────────────────────────

export async function handleInvoices(ctx: RouteContext): Promise<Response> {
  const { method, segments } = ctx;
  const action = segments[0] ?? "";

  // Admin routes
  if (action === "admin") {
    return handleAdminInvoices(ctx);
  }

  // Generate (admin)
  if (action === "generate" && method === "POST") {
    return generateInvoices(ctx);
  }

  // Consumer routes
  switch (action) {
    case "":
      if (method === "GET") return listMyInvoices(ctx);
      return apiBadRequest("GET required");

    default: {
      // /api/invoices/:id  or  /api/invoices/:id/pdf  or /api/invoices/:id/csv
      const invoiceId = action;
      const subAction = segments[1] ?? "";

      if (subAction === "pdf" && method === "GET") return downloadPdf(ctx, invoiceId);
      if (subAction === "csv" && method === "GET") return downloadCsv(ctx, invoiceId);
      if (!subAction && method === "GET") return getInvoice(ctx, invoiceId);

      return apiBadRequest("Unknown invoice action");
    }
  }
}

// ─── Admin sub-router ───────────────────────────────────────

async function handleAdminInvoices(ctx: RouteContext): Promise<Response> {
  const { method, segments } = ctx;
  const subAction = segments[1] ?? "";

  // Check admin role
  const isAdmin = await checkAdminRole(ctx.auth!.user.id);
  if (!isAdmin) return apiForbidden("Admin access required");

  switch (subAction) {
    case "":
      if (method === "GET") return adminListInvoices(ctx);
      return apiBadRequest("GET required");

    case "export":
      if (method === "GET") return adminExportCsv(ctx);
      return apiBadRequest("GET required");

    case "stats":
      if (method === "GET") return adminStats(ctx);
      return apiBadRequest("GET required");

    default:
      return apiBadRequest("Unknown admin invoice action");
  }
}

// ─── Helpers ────────────────────────────────────────────────

async function checkAdminRole(userId: string): Promise<boolean> {
  const db = getServiceClient();
  const { data } = await db
    .from("ezdrive_profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return data?.role === "admin" || data?.role === "operator";
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ─── 1. List my invoices (consumer) ─────────────────────────

async function listMyInvoices(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const userId = ctx.auth!.user.id;
  const page = parseInt(ctx.url.searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(ctx.url.searchParams.get("limit") ?? "20"), 100);
  const offset = (page - 1) * limit;
  const status = ctx.url.searchParams.get("status");
  const type = ctx.url.searchParams.get("type");

  let query = db
    .from("invoices")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (type) query = query.eq("type", type);

  const { data, error, count } = await query;

  if (error) {
    console.error("[Invoices] List error:", error);
    return apiServerError("Failed to fetch invoices");
  }

  return apiSuccess({
    invoices: data ?? [],
    pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
  });
}

// ─── 2. Get invoice detail (consumer) ───────────────────────

async function getInvoice(ctx: RouteContext, invoiceId: string): Promise<Response> {
  const db = getServiceClient();
  const userId = ctx.auth!.user.id;

  const { data, error } = await db
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[Invoices] Get error:", error);
    return apiServerError("Failed to fetch invoice");
  }

  if (!data) return apiNotFound("Invoice not found");
  return apiSuccess(data);
}

// ─── 3. Download PDF ────────────────────────────────────────

async function downloadPdf(ctx: RouteContext, invoiceId: string): Promise<Response> {
  const db = getServiceClient();
  const userId = ctx.auth!.user.id;

  // Check admin or owner
  const isAdmin = await checkAdminRole(userId);
  let query = db.from("invoices").select("*").eq("id", invoiceId);
  if (!isAdmin) query = query.eq("user_id", userId);

  const { data: invoice } = await query.maybeSingle();
  if (!invoice) return apiNotFound("Invoice not found");

  // Get user profile for PDF
  const { data: profile } = await db
    .from("consumer_profiles")
    .select("full_name, email, phone, address, city, postal_code, is_company, company_name, company_siret")
    .eq("id", invoice.user_id)
    .maybeSingle();

  // Generate PDF in-memory
  const pdfBytes = generateInvoicePdf(invoice, profile);

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="facture-${invoice.invoice_number}.pdf"`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ─── 4. Download CSV (single invoice) ───────────────────────

async function downloadCsv(ctx: RouteContext, invoiceId: string): Promise<Response> {
  const db = getServiceClient();
  const userId = ctx.auth!.user.id;

  const isAdmin = await checkAdminRole(userId);
  let query = db.from("invoices").select("*").eq("id", invoiceId);
  if (!isAdmin) query = query.eq("user_id", userId);

  const { data: invoice } = await query.maybeSingle();
  if (!invoice) return apiNotFound("Invoice not found");

  const lineItems = (invoice.line_items as Array<Record<string, unknown>>) ?? [];
  const header = "Date,Station,Ville,Durée (min),Énergie (kWh),Montant HT (€),TVA (€),Total TTC (€)";
  const rows = lineItems.map((item) => {
    const ht = Number(item.amount_cents ?? 0);
    const vatAmount = Math.round(ht * (invoice.vat_rate / 100));
    const ttc = ht + vatAmount;
    return [
      formatDate(item.date as string),
      `"${item.station_name ?? ""}"`,
      `"${item.station_city ?? ""}"`,
      item.duration_min ?? "",
      item.energy_kwh ?? "",
      formatCents(ht),
      formatCents(vatAmount),
      formatCents(ttc),
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="facture-${invoice.invoice_number}.csv"`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ─── 5. Generate invoices for period (admin) ────────────────

async function generateInvoices(ctx: RouteContext): Promise<Response> {
  const isAdmin = await checkAdminRole(ctx.auth!.user.id);
  if (!isAdmin) return apiForbidden("Admin access required");

  const body = await ctx.req.json();
  const { period_start, period_end, user_id } = body;

  if (!period_start || !period_end) {
    return apiBadRequest("period_start and period_end required");
  }

  const db = getServiceClient();
  const startDate = new Date(period_start);
  const endDate = new Date(period_end);

  // Build user filter
  let usersQuery = db
    .from("ocpp_transactions")
    .select("consumer_id")
    .not("consumer_id", "is", null)
    .gte("started_at", startDate.toISOString())
    .lte("started_at", endDate.toISOString())
    .eq("status", "Completed");

  if (user_id) {
    usersQuery = usersQuery.eq("consumer_id", user_id);
  }

  const { data: userRows } = await usersQuery;
  const uniqueUserIds = [...new Set((userRows ?? []).map((r) => r.consumer_id))];

  if (uniqueUserIds.length === 0) {
    return apiSuccess({ generated: 0, message: "No completed sessions found for this period" });
  }

  const generated: Array<Record<string, unknown>> = [];

  for (const uid of uniqueUserIds) {
    try {
      // Get completed transactions for this user in period
      const { data: transactions } = await db
        .from("ocpp_transactions")
        .select(`
          id, started_at, stopped_at, energy_kwh, status,
          chargepoint_id
        `)
        .eq("consumer_id", uid)
        .eq("status", "Completed")
        .gte("started_at", startDate.toISOString())
        .lte("started_at", endDate.toISOString())
        .order("started_at");

      if (!transactions || transactions.length === 0) continue;

      // Get user's subscription discount
      const discount = await getSubscriptionDiscount(db, uid);

      // Get station info for each transaction
      const lineItems: Array<Record<string, unknown>> = [];
      let subtotalCents = 0;

      for (const tx of transactions) {
        // Get station info via chargepoint
        let stationName = "Borne EZDrive";
        let stationCity = "";

        if (tx.chargepoint_id) {
          const { data: cp } = await db
            .from("ocpp_chargepoints")
            .select("station_id")
            .eq("id", tx.chargepoint_id)
            .maybeSingle();

          if (cp?.station_id) {
            const { data: station } = await db
              .from("stations")
              .select("name, city")
              .eq("id", cp.station_id)
              .maybeSingle();
            if (station) {
              stationName = station.name ?? stationName;
              stationCity = station.city ?? "";
            }
          }
        }

        // Calculate cost based on tariff
        const energyKwh = Number(tx.energy_kwh ?? 0);
        const durationMin = tx.stopped_at && tx.started_at
          ? Math.round((new Date(tx.stopped_at).getTime() - new Date(tx.started_at).getTime()) / 60000)
          : 0;

        // Get tariff for station (via station_tariffs → ocpi_tariffs)
        const costCents = await calculateTransactionCost(db, tx.chargepoint_id, energyKwh, durationMin, discount);

        lineItems.push({
          date: tx.started_at,
          station_name: stationName,
          station_city: stationCity,
          energy_kwh: energyKwh,
          duration_min: durationMin,
          amount_cents: costCents,
          transaction_id: tx.id,
          description: `Recharge ${energyKwh.toFixed(2)} kWh - ${durationMin} min`,
        });

        subtotalCents += costCents;
      }

      if (subtotalCents === 0) continue;

      // Calculate VAT (8.5% DOM-TOM)
      const vatRate = 8.5;
      const vatCents = Math.round(subtotalCents * (vatRate / 100));
      const totalCents = subtotalCents + vatCents;

      // Generate invoice number
      const { data: numRow } = await db.rpc("generate_invoice_number");
      const invoiceNumber = numRow ?? `EZD-${new Date().getFullYear()}-${Date.now()}`;

      // Insert invoice
      const { data: invoice, error: invErr } = await db
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          user_id: uid,
          period_start: startDate.toISOString(),
          period_end: endDate.toISOString(),
          subtotal_cents: subtotalCents,
          vat_cents: vatCents,
          total_cents: totalCents,
          vat_rate: vatRate,
          line_items: lineItems,
          type: "session",
          status: "issued",
          issued_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (invErr) {
        console.error(`[Invoices] Error generating for user ${uid}:`, invErr);
        continue;
      }

      generated.push(invoice);
    } catch (err) {
      console.error(`[Invoices] Error processing user ${uid}:`, err);
    }
  }

  return apiCreated({
    generated: generated.length,
    invoices: generated,
  });
}

// ─── 6. Admin: List all invoices ────────────────────────────

async function adminListInvoices(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const page = parseInt(ctx.url.searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(ctx.url.searchParams.get("limit") ?? "20"), 100);
  const offset = (page - 1) * limit;
  const status = ctx.url.searchParams.get("status");
  const type = ctx.url.searchParams.get("type");
  const userId = ctx.url.searchParams.get("user_id");
  const month = ctx.url.searchParams.get("month"); // YYYY-MM

  let query = db
    .from("invoices")
    .select("*, consumer_profiles!invoices_user_id_fkey(full_name, email)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (type) query = query.eq("type", type);
  if (userId) query = query.eq("user_id", userId);
  if (month) {
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    query = query.gte("period_start", start.toISOString()).lt("period_end", end.toISOString());
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[Invoices] Admin list error:", error);
    // Fallback without join if FK doesn't exist
    const { data: fallback, error: fbErr, count: fbCount } = await db
      .from("invoices")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (fbErr) return apiServerError("Failed to fetch invoices");
    return apiSuccess({
      invoices: fallback ?? [],
      pagination: { page, limit, total: fbCount ?? 0, pages: Math.ceil((fbCount ?? 0) / limit) },
    });
  }

  return apiSuccess({
    invoices: data ?? [],
    pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
  });
}

// ─── 7. Admin: Export CSV global ────────────────────────────

async function adminExportCsv(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const month = ctx.url.searchParams.get("month");
  const status = ctx.url.searchParams.get("status");

  let query = db
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false });

  if (month) {
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    query = query.gte("period_start", start.toISOString()).lt("period_end", end.toISOString());
  }
  if (status) query = query.eq("status", status);

  const { data: invoices, error } = await query;
  if (error) return apiServerError("Failed to fetch invoices");

  // Get user emails
  const userIds = [...new Set((invoices ?? []).map((i) => i.user_id))];
  const { data: profiles } = await db
    .from("consumer_profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const header = "N° Facture,Client,Email,Type,Période début,Période fin,Sous-total HT (€),TVA (€),Total TTC (€),Statut,Date émission";
  const rows = (invoices ?? []).map((inv) => {
    const profile = profileMap.get(inv.user_id);
    return [
      inv.invoice_number,
      `"${profile?.full_name ?? "Inconnu"}"`,
      profile?.email ?? "",
      inv.type,
      formatDate(inv.period_start),
      formatDate(inv.period_end),
      formatCents(inv.subtotal_cents),
      formatCents(inv.vat_cents),
      formatCents(inv.total_cents),
      inv.status,
      formatDate(inv.issued_at),
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");
  const filename = month ? `factures-${month}.csv` : `factures-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ─── 8. Admin: Invoice stats ────────────────────────────────

async function adminStats(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const month = ctx.url.searchParams.get("month");

  // Total revenue
  let revenueQuery = db.from("invoices").select("total_cents, status, type");
  if (month) {
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    revenueQuery = revenueQuery.gte("period_start", start.toISOString()).lt("period_end", end.toISOString());
  }

  const { data: allInvoices } = await revenueQuery;
  const invoices = allInvoices ?? [];

  const totalRevenueCents = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + (i.total_cents ?? 0), 0);

  const totalIssuedCents = invoices
    .filter((i) => i.status === "issued")
    .reduce((sum, i) => sum + (i.total_cents ?? 0), 0);

  const totalDraftCents = invoices
    .filter((i) => i.status === "draft")
    .reduce((sum, i) => sum + (i.total_cents ?? 0), 0);

  const byType = {
    session: invoices.filter((i) => i.type === "session").length,
    subscription: invoices.filter((i) => i.type === "subscription").length,
    rfid: invoices.filter((i) => i.type === "rfid").length,
  };

  const byStatus = {
    draft: invoices.filter((i) => i.status === "draft").length,
    issued: invoices.filter((i) => i.status === "issued").length,
    paid: invoices.filter((i) => i.status === "paid").length,
    cancelled: invoices.filter((i) => i.status === "cancelled").length,
  };

  return apiSuccess({
    period: month ?? "all",
    total_invoices: invoices.length,
    revenue_paid_cents: totalRevenueCents,
    revenue_paid_eur: formatCents(totalRevenueCents),
    outstanding_issued_cents: totalIssuedCents,
    outstanding_issued_eur: formatCents(totalIssuedCents),
    pending_draft_cents: totalDraftCents,
    pending_draft_eur: formatCents(totalDraftCents),
    by_type: byType,
    by_status: byStatus,
  });
}

// ─── Tariff calculation ─────────────────────────────────────

async function calculateTransactionCost(
  db: ReturnType<typeof getServiceClient>,
  chargepointId: string | null,
  energyKwh: number,
  _durationMin: number,
  discountPercent: number,
): Promise<number> {
  if (!chargepointId || energyKwh <= 0) return 0;

  // Get station from chargepoint
  const { data: cp } = await db
    .from("ocpp_chargepoints")
    .select("station_id")
    .eq("id", chargepointId)
    .maybeSingle();

  if (!cp?.station_id) {
    // Default tariff: 0.35€/kWh
    const base = Math.round(energyKwh * 35);
    return Math.round(base * (1 - discountPercent / 100));
  }

  // Get station tariff → ocpi_tariff
  const { data: stationTariff } = await db
    .from("station_tariffs")
    .select("tariff_id")
    .eq("station_id", cp.station_id)
    .is("valid_to", null)
    .order("priority", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!stationTariff?.tariff_id) {
    const base = Math.round(energyKwh * 35);
    return Math.round(base * (1 - discountPercent / 100));
  }

  // Get OCPI tariff elements
  const { data: tariff } = await db
    .from("ocpi_tariffs")
    .select("elements, currency")
    .eq("id", stationTariff.tariff_id)
    .maybeSingle();

  if (!tariff?.elements) {
    const base = Math.round(energyKwh * 35);
    return Math.round(base * (1 - discountPercent / 100));
  }

  // Parse OCPI tariff elements
  const elements = tariff.elements as Array<{
    price_components: Array<{ type: string; price: number; step_size: number; vat?: number }>;
  }>;

  let totalCents = 0;

  for (const element of elements) {
    for (const comp of element.price_components ?? []) {
      switch (comp.type) {
        case "ENERGY":
          // price is per kWh
          totalCents += Math.round(energyKwh * comp.price * 100);
          break;
        case "TIME":
          // price is per hour
          totalCents += Math.round((_durationMin / 60) * comp.price * 100);
          break;
        case "FLAT":
          totalCents += Math.round(comp.price * 100);
          break;
        case "PARKING_TIME":
          // Idle fee — simplified: assume 0 idle for now
          break;
      }
    }
  }

  // Apply subscription discount
  totalCents = Math.round(totalCents * (1 - discountPercent / 100));

  return totalCents;
}

async function getSubscriptionDiscount(
  db: ReturnType<typeof getServiceClient>,
  userId: string,
): Promise<number> {
  const { data: sub } = await db
    .from("user_subscriptions")
    .select("offer_id, subscription_offers(discount_percent)")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) return 0;

  const offer = sub.subscription_offers as unknown as { discount_percent: number } | null;
  return offer?.discount_percent ?? 0;
}

// ─── PDF Generation ─────────────────────────────────────────
// Simple text-based PDF (no external library dependency)
// Uses a minimal PDF structure that works in all viewers

function generateInvoicePdf(
  invoice: Record<string, unknown>,
  profile: Record<string, unknown> | null,
): Uint8Array {
  const lineItems = (invoice.line_items as Array<Record<string, unknown>>) ?? [];
  const invoiceNumber = invoice.invoice_number as string;
  const issuedAt = invoice.issued_at ? formatDate(invoice.issued_at as string) : formatDate(invoice.created_at as string);
  const periodStart = formatDate(invoice.period_start as string);
  const periodEnd = formatDate(invoice.period_end as string);

  // Build text content
  const lines: string[] = [];
  lines.push("EZ DRIVE - Supervision de recharge electrique");
  lines.push("");
  lines.push(`FACTURE N° ${invoiceNumber}`);
  lines.push(`Date d'emission : ${issuedAt}`);
  lines.push(`Periode : ${periodStart} - ${periodEnd}`);
  lines.push("");

  // Client info
  lines.push("CLIENT :");
  if (profile) {
    if (profile.is_company && profile.company_name) {
      lines.push(`  Entreprise : ${profile.company_name}`);
      if (profile.company_siret) lines.push(`  SIRET : ${profile.company_siret}`);
    }
    lines.push(`  Nom : ${profile.full_name ?? "Non renseigne"}`);
    lines.push(`  Email : ${profile.email ?? ""}`);
    if (profile.phone) lines.push(`  Tel : ${profile.phone}`);
    if (profile.address) lines.push(`  Adresse : ${profile.address}`);
    if (profile.city) lines.push(`  Ville : ${profile.postal_code ?? ""} ${profile.city}`);
  } else {
    lines.push("  Non renseigne");
  }
  lines.push("");

  // Table header
  lines.push("DETAIL DES PRESTATIONS :");
  lines.push("-".repeat(80));
  lines.push(padRight("Date", 12) + padRight("Station", 25) + padRight("Energie", 12) + padRight("Duree", 10) + padRight("Montant HT", 12));
  lines.push("-".repeat(80));

  // Line items
  for (const item of lineItems) {
    const date = item.date ? formatDate(item.date as string) : "";
    const station = truncate(item.station_name as string ?? "", 23);
    const energy = `${Number(item.energy_kwh ?? 0).toFixed(2)} kWh`;
    const duration = `${item.duration_min ?? 0} min`;
    const amount = `${formatCents(Number(item.amount_cents ?? 0))} EUR`;
    lines.push(padRight(date, 12) + padRight(station, 25) + padRight(energy, 12) + padRight(duration, 10) + padRight(amount, 12));
  }

  lines.push("-".repeat(80));
  lines.push("");

  // Totals
  const subtotal = formatCents(invoice.subtotal_cents as number);
  const vat = formatCents(invoice.vat_cents as number);
  const total = formatCents(invoice.total_cents as number);
  const vatRate = invoice.vat_rate as number;

  lines.push(`  Sous-total HT :    ${subtotal} EUR`);
  lines.push(`  TVA (${vatRate}%) :       ${vat} EUR`);
  lines.push(`  ─────────────────────────`);
  lines.push(`  TOTAL TTC :        ${total} EUR`);
  lines.push("");

  // Footer
  lines.push("-".repeat(80));
  lines.push("EZ Drive SAS - Supervision de recharge electrique");
  lines.push("Guadeloupe - DOM-TOM - TVA applicable : 8.5%");
  lines.push("Contact : contact@ezdrive.fr");
  lines.push(`Statut : ${(invoice.status as string).toUpperCase()}`);

  // Build minimal valid PDF
  return buildMinimalPdf(lines);
}

function padRight(str: string, len: number): string {
  return str.substring(0, len).padEnd(len);
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.substring(0, len - 2) + ".." : str;
}

function buildMinimalPdf(textLines: string[]): Uint8Array {
  // Build a minimal valid PDF 1.4
  const encoder = new TextEncoder();

  // Escape special PDF characters
  const escapeText = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  // Page content: text at fixed positions
  const fontSize = 10;
  const lineHeight = 14;
  const marginTop = 780;
  const marginLeft = 40;
  const pageHeight = 842; // A4
  const pageWidth = 595;
  const maxLinesPerPage = Math.floor((marginTop - 40) / lineHeight);

  // Split into pages
  const pages: string[][] = [];
  for (let i = 0; i < textLines.length; i += maxLinesPerPage) {
    pages.push(textLines.slice(i, i + maxLinesPerPage));
  }

  const objects: string[] = [];
  let objNum = 1;

  // Obj 1: Catalog
  const catalogObjNum = objNum++;
  objects.push(`${catalogObjNum} 0 obj\n<< /Type /Catalog /Pages ${catalogObjNum + 1} 0 R >>\nendobj`);

  // Obj 2: Pages
  const pagesObjNum = objNum++;
  const pageObjNums: number[] = [];

  // Reserve page object numbers
  for (let i = 0; i < pages.length; i++) {
    pageObjNums.push(objNum + i * 2); // each page has page obj + stream obj
  }

  const kidsStr = pageObjNums.map((n) => `${n} 0 R`).join(" ");
  objects.push(
    `${pagesObjNum} 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${pages.length} /MediaBox [0 0 ${pageWidth} ${pageHeight}] >>\nendobj`,
  );

  // Create page + stream objects for each page
  for (let p = 0; p < pages.length; p++) {
    const pageLines = pages[p];
    const pageObjNum = objNum++;
    const streamObjNum = objNum++;

    // Build stream content
    let streamContent = `BT\n/F1 ${fontSize} Tf\n`;
    let y = marginTop;
    for (const line of pageLines) {
      if (line.startsWith("FACTURE") || line.startsWith("EZ DRIVE")) {
        streamContent += `/F1 12 Tf\n`;
      } else if (line.startsWith("CLIENT") || line.startsWith("DETAIL") || line.startsWith("  TOTAL")) {
        streamContent += `/F1 11 Tf\n`;
      } else {
        streamContent += `/F1 ${fontSize} Tf\n`;
      }
      streamContent += `${marginLeft} ${y} Td\n(${escapeText(line)}) Tj\n0 ${-lineHeight} Td\n`;
      y -= lineHeight;
    }
    streamContent += "ET";

    // Page object
    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent ${pagesObjNum} 0 R /Resources << /Font << /F1 ${objNum} 0 R >> >> /Contents ${streamObjNum} 0 R >>\nendobj`,
    );

    // Stream object
    const streamBytes = encoder.encode(streamContent);
    objects.push(
      `${streamObjNum} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${streamContent}\nendstream\nendobj`,
    );
  }

  // Font object (Courier for fixed-width invoice)
  const fontObjNum = objNum++;
  objects.push(
    `${fontObjNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj`,
  );

  // Build full PDF
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  for (const obj of objects) {
    offsets.push(encoder.encode(pdf).length);
    pdf += obj + "\n";
  }

  // xref
  const xrefOffset = encoder.encode(pdf).length;
  pdf += "xref\n";
  pdf += `0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  // trailer
  pdf += "trailer\n";
  pdf += `<< /Size ${objects.length + 1} /Root ${catalogObjNum} 0 R >>\n`;
  pdf += "startxref\n";
  pdf += `${xrefOffset}\n`;
  pdf += "%%EOF";

  return encoder.encode(pdf);
}
