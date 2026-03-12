// ============================================================
// EZDrive Consumer API — Auth Module
// Port from Resonovia user-service login.py / signup.py
// Improvement: Supabase Auth replaces Auth0 (native rate limiting,
// bcrypt, email confirm, password reset)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  apiSuccess,
  apiCreated,
  apiBadRequest,
  apiUnauthorized,
  apiServerError,
} from "../../_shared/api-response.ts";
import { getServiceClient } from "../../_shared/auth-middleware.ts";
import type { RouteContext } from "../index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// ROAD integration for account creation
const ROAD_BASE_URL = Deno.env.get("ROAD_BASE_URL") ?? "https://api.e-flux.nl";
const ROAD_API_TOKEN = Deno.env.get("ROAD_API_TOKEN") ?? "";

export async function handleAuth(ctx: RouteContext): Promise<Response> {
  const { method, segments } = ctx;
  const action = segments[0] ?? "";

  switch (action) {
    case "login":
      if (method !== "POST") return apiBadRequest("POST required");
      return login(ctx);

    case "register":
      if (method !== "POST") return apiBadRequest("POST required");
      return register(ctx);

    case "logout":
      if (method !== "POST") return apiBadRequest("POST required");
      return logout(ctx);

    case "refresh":
      if (method !== "POST") return apiBadRequest("POST required");
      return refreshToken(ctx);

    case "password":
      if (segments[1] === "reset" && method === "POST") return resetPassword(ctx);
      if (segments[1] === "update" && method === "POST") return updatePassword(ctx);
      return apiBadRequest("Unknown password action");

    default:
      return apiBadRequest("Unknown auth action");
  }
}

// ─── Login ──────────────────────────────────────────────────

async function login(ctx: RouteContext): Promise<Response> {
  const body = await ctx.req.json();
  const { email, password } = body;

  if (!email || !password) {
    return apiBadRequest("Email and password required");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return apiUnauthorized("Invalid email or password");
  }

  // Fetch consumer profile
  const db = getServiceClient();
  const { data: profile } = await db
    .from("consumer_profiles")
    .select("*")
    .eq("id", data.user.id)
    .maybeSingle();

  return apiSuccess({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    token_type: "bearer",
    user: {
      id: data.user.id,
      email: data.user.email,
      ...profile,
    },
  });
}

// ─── Register ───────────────────────────────────────────────

async function register(ctx: RouteContext): Promise<Response> {
  const body = await ctx.req.json();
  const { email, password, full_name, phone } = body;

  if (!email || !password) {
    return apiBadRequest("Email and password required");
  }

  if (password.length < 8) {
    return apiBadRequest("Password must be at least 8 characters");
  }

  // 1. Create Supabase auth user
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, phone },
    },
  });

  if (authError) {
    console.error("[Auth] Registration error:", authError);
    if (authError.message.includes("already registered")) {
      return apiBadRequest("Email already registered");
    }
    return apiServerError("Registration failed");
  }

  if (!authData.user) {
    return apiServerError("User creation failed");
  }

  // 2. Create consumer profile
  const db = getServiceClient();
  const { error: profileError } = await db
    .from("consumer_profiles")
    .insert({
      id: authData.user.id,
      email,
      full_name: full_name ?? null,
      phone: phone ?? null,
    });

  if (profileError) {
    console.error("[Auth] Profile creation error:", profileError);
    // User exists in auth but profile failed — still return success
    // Profile can be created later on first login
  }

  // 3. Create ROAD account (async, non-blocking)
  createRoadAccount(authData.user.id, email, full_name).catch((err) =>
    console.error("[Auth] ROAD account creation failed (non-blocking):", err)
  );

  return apiCreated({
    user: {
      id: authData.user.id,
      email: authData.user.email,
      full_name,
    },
    access_token: authData.session?.access_token ?? null,
    refresh_token: authData.session?.refresh_token ?? null,
    message: "Account created. Please verify your email.",
  });
}

// ─── ROAD Account Creation (background) ─────────────────────

async function createRoadAccount(
  userId: string,
  email: string,
  fullName?: string,
): Promise<void> {
  if (!ROAD_API_TOKEN || !ROAD_BASE_URL) return;

  try {
    const res = await fetch(`${ROAD_BASE_URL}/api/v1/accounts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ROAD_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        name: fullName ?? email.split("@")[0],
        type: "individual",
      }),
    });

    if (res.ok) {
      const roadData = await res.json();
      // Update profile with ROAD user ID
      const db = getServiceClient();
      await db
        .from("consumer_profiles")
        .update({ road_user_id: roadData.id ?? roadData._id })
        .eq("id", userId);

      console.log(`[Auth] ROAD account created for user ${userId}`);
    } else {
      console.warn(`[Auth] ROAD account creation returned ${res.status}`);
    }
  } catch (err) {
    console.error("[Auth] ROAD account error:", err);
  }
}

// ─── Logout ─────────────────────────────────────────────────

async function logout(ctx: RouteContext): Promise<Response> {
  // Client-side logout is sufficient with JWTs
  // Optionally invalidate refresh token server-side
  return apiSuccess({ message: "Logged out" });
}

// ─── Refresh Token ──────────────────────────────────────────

async function refreshToken(ctx: RouteContext): Promise<Response> {
  const body = await ctx.req.json();
  const { refresh_token } = body;

  if (!refresh_token) {
    return apiBadRequest("refresh_token required");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token,
  });

  if (error || !data.session) {
    return apiUnauthorized("Invalid or expired refresh token");
  }

  return apiSuccess({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    token_type: "bearer",
  });
}

// ─── Password Reset ─────────────────────────────────────────

async function resetPassword(ctx: RouteContext): Promise<Response> {
  const body = await ctx.req.json();
  const { email } = body;

  if (!email) {
    return apiBadRequest("Email required");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    console.error("[Auth] Password reset error:", error);
    // Don't reveal if email exists or not
  }

  // Always return success to prevent email enumeration
  return apiSuccess({ message: "Password reset email sent if account exists" });
}

// ─── Update Password (requires auth) ────────────────────────

async function updatePassword(ctx: RouteContext): Promise<Response> {
  const token = ctx.req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return apiUnauthorized("Authentication required");

  const body = await ctx.req.json();
  const { new_password } = body;

  if (!new_password || new_password.length < 8) {
    return apiBadRequest("New password must be at least 8 characters");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { error } = await supabase.auth.updateUser({
    password: new_password,
  });

  if (error) {
    return apiBadRequest("Failed to update password: " + error.message);
  }

  return apiSuccess({ message: "Password updated successfully" });
}
