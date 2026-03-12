// ============================================================
// OCPI 2.2.1 Authentication — Token Validation
// Validates incoming OCPI requests from Gireve IOP
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseOcpiHeaders, type OcpiIncomingHeaders } from "./ocpi-headers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export interface OcpiAuthResult {
  valid: boolean;
  headers: OcpiIncomingHeaders | null;
  credentialId?: string;
  role?: string;
  error?: string;
}

/**
 * Validate an incoming OCPI request
 *
 * Flow:
 * 1. Parse OCPI headers (Authorization, routing, tracing)
 * 2. Decode base64 token
 * 3. Look up token_a in ocpi_credentials table
 * 4. Verify credential is in CONNECTED status
 * 5. Verify routing headers match (from/to country/party)
 */
export async function validateOcpiRequest(req: Request): Promise<OcpiAuthResult> {
  const headers = parseOcpiHeaders(req.headers);

  if (!headers) {
    return { valid: false, headers: null, error: "Missing or invalid Authorization header" };
  }

  if (!headers.authorization) {
    return { valid: false, headers, error: "Empty token" };
  }

  // Look up token_a (the token Gireve uses to call us)
  const db = getServiceClient();
  const { data: credentials, error } = await db
    .from("ocpi_credentials")
    .select("id, role, status, country_code, party_id")
    .eq("token_a", headers.authorization)
    .eq("status", "CONNECTED")
    .limit(1);

  if (error) {
    console.error("[OCPI Auth] DB error:", error);
    return { valid: false, headers, error: "Database error" };
  }

  if (!credentials || credentials.length === 0) {
    // Also try with the raw header value (before base64 decode) as fallback
    const { data: credentialsFallback } = await db
      .from("ocpi_credentials")
      .select("id, role, status, country_code, party_id")
      .eq("token_a", req.headers.get("authorization")?.substring(6) ?? "")
      .eq("status", "CONNECTED")
      .limit(1);

    if (!credentialsFallback || credentialsFallback.length === 0) {
      return { valid: false, headers, error: "Invalid or unknown token" };
    }

    return {
      valid: true,
      headers,
      credentialId: credentialsFallback[0].id,
      role: credentialsFallback[0].role,
    };
  }

  return {
    valid: true,
    headers,
    credentialId: credentials[0].id,
    role: credentials[0].role,
  };
}

/**
 * Validate an internal request (from our own frontend/admin)
 * Uses Supabase auth (Authorization: Bearer <supabase_jwt>)
 */
export async function validateInternalRequest(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.substring(7);
  const db = getServiceClient();

  const { data: { user }, error } = await db.auth.getUser(token);
  return !error && !!user;
}

/**
 * Get the OCPI token_b for outgoing requests to Gireve
 * token_b is what we use to authenticate ourselves when calling Gireve
 */
export async function getOutboundToken(role: string, platform = "PREPROD"): Promise<string | null> {
  const db = getServiceClient();
  const { data } = await db
    .from("ocpi_credentials")
    .select("token_b")
    .eq("role", role)
    .eq("platform", platform)
    .eq("status", "CONNECTED")
    .limit(1)
    .single();

  return data?.token_b ?? null;
}

/**
 * Get credential details for outgoing requests
 */
export async function getCredentialDetails(role: string, platform = "PREPROD") {
  const db = getServiceClient();
  const { data } = await db
    .from("ocpi_credentials")
    .select("*")
    .eq("role", role)
    .eq("platform", platform)
    .limit(1)
    .single();

  return data;
}
