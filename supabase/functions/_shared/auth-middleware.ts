// ============================================================
// EZDrive Consumer API — Auth Middleware
// Validates Supabase JWT and returns user + profile
// Replaces Resonovia's auth.py multi-provider chain
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthResult {
  user: AuthUser;
  token: string;
}

/**
 * Get a service-role Supabase client (for DB operations bypassing RLS)
 */
export function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Get a user-scoped Supabase client (respects RLS)
 */
export function getUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Extract Bearer token from Authorization header
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  return parts[1];
}

/**
 * Require authenticated user — returns AuthResult or throws
 * Usage: const { user, token } = await requireAuth(req);
 */
export async function requireAuth(req: Request): Promise<AuthResult> {
  const token = extractToken(req);
  if (!token) {
    throw new AuthError("Missing or invalid Authorization header");
  }

  // Use anon key client with the user's token to verify
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthError("Invalid or expired token");
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? "",
    },
    token,
  };
}

/**
 * Optional auth — returns AuthResult | null (no throw)
 */
export async function optionalAuth(req: Request): Promise<AuthResult | null> {
  try {
    return await requireAuth(req);
  } catch {
    return null;
  }
}

/**
 * Custom error class for auth failures
 */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
