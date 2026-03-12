// ============================================================
// EZDrive Consumer API — Business Contacts Module
// B2B contact form (no auth required)
// Email notification via Resend
// ============================================================

import {
  apiSuccess,
  apiCreated,
  apiBadRequest,
  apiServerError,
} from "../../_shared/api-response.ts";
import { getServiceClient } from "../../_shared/auth-middleware.ts";
import type { RouteContext } from "../index.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "contact@ezdrive.fr";

export async function handleBusiness(ctx: RouteContext): Promise<Response> {
  if (ctx.method !== "POST") {
    return apiBadRequest("POST required for business contact");
  }

  return createContact(ctx);
}

async function createContact(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const body = await ctx.req.json();

  // Validate required fields
  if (!body.company_name || !body.contact_name || !body.email) {
    return apiBadRequest("company_name, contact_name, and email required");
  }

  // Basic email validation
  if (!body.email.includes("@") || !body.email.includes(".")) {
    return apiBadRequest("Invalid email format");
  }

  // Create contact record
  const { data, error } = await db
    .from("business_contacts")
    .insert({
      company_name: body.company_name,
      contact_name: body.contact_name,
      email: body.email,
      phone: body.phone ?? null,
      fleet_size: body.fleet_size ?? null,
      message: body.message ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[Business] Contact creation error:", error);
    return apiServerError("Failed to submit contact request");
  }

  // Send notification email (non-blocking)
  sendNotificationEmail(data).catch((err) =>
    console.error("[Business] Email notification failed:", err)
  );

  return apiCreated({
    ...data,
    message: "Business contact request submitted. We will reach out within 48 hours.",
  });
}

// ─── Email notification via Resend ──────────────────────────

async function sendNotificationEmail(contact: Record<string, unknown>): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn("[Business] No RESEND_API_KEY configured, skipping email");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "EZDrive <noreply@ezdrive.fr>",
      to: [ADMIN_EMAIL],
      subject: `[EZDrive B2B] New contact: ${contact.company_name}`,
      html: `
        <h2>New Business Contact Request</h2>
        <table style="border-collapse: collapse; width: 100%;">
          <tr><td style="padding: 8px; font-weight: bold;">Company</td><td style="padding: 8px;">${contact.company_name}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Contact</td><td style="padding: 8px;">${contact.contact_name}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Email</td><td style="padding: 8px;">${contact.email}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Phone</td><td style="padding: 8px;">${contact.phone ?? "N/A"}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Fleet Size</td><td style="padding: 8px;">${contact.fleet_size ?? "N/A"}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Message</td><td style="padding: 8px;">${contact.message ?? "N/A"}</td></tr>
        </table>
      `,
    }),
  });

  if (!res.ok) {
    console.error("[Business] Resend API error:", await res.text());
  } else {
    console.log("[Business] Notification email sent for", contact.company_name);
  }
}
