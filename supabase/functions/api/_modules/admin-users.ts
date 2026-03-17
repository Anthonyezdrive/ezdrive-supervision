// ============================================================
// EZDrive Supervision API — Admin Users Module
// Create, invite, and manage supervision users (ezdrive_profiles)
// Requires: authenticated admin user
// ============================================================

import {
  apiSuccess,
  apiCreated,
  apiBadRequest,
  apiForbidden,
  apiServerError,
} from "../../_shared/api-response.ts";
import { getServiceClient } from "../../_shared/auth-middleware.ts";
import type { RouteContext } from "../index.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const APP_URL = "https://pro.ezdrive.fr";

export async function handleAdminUsers(ctx: RouteContext): Promise<Response> {
  const { method, segments } = ctx;
  const action = segments[0] ?? "";

  // Require admin role
  if (ctx.auth) {
    const db = getServiceClient();
    const { data: profile } = await db
      .from("ezdrive_profiles")
      .select("role")
      .eq("id", ctx.auth.user.id)
      .maybeSingle();

    if (!profile || profile.role !== "admin") {
      return apiForbidden("Admin access required");
    }
  }

  switch (action) {
    case "create":
      if (method !== "POST") return apiBadRequest("POST required");
      return createUser(ctx);

    case "invite":
      if (method !== "POST") return apiBadRequest("POST required");
      return inviteUser(ctx);

    case "update":
      if (method !== "POST") return apiBadRequest("POST required");
      return updateUser(ctx);

    case "reset-password":
      if (method !== "POST") return apiBadRequest("POST required");
      return resetPasswordAdmin(ctx);

    case "consumer":
      if (method !== "POST") return apiBadRequest("POST required");
      return createConsumer(ctx);

    default:
      return apiBadRequest("Unknown admin-users action. Use: create, invite, update, reset-password");
  }
}

// ─── Create User ─────────────────────────────────────────────

async function createUser(ctx: RouteContext): Promise<Response> {
  const body = await ctx.req.json();
  const { email, full_name, password, role, cpo_id, territory } = body;

  if (!email) return apiBadRequest("Email required");
  if (!password || password.length < 8) {
    return apiBadRequest("Password must be at least 8 characters");
  }

  const db = getServiceClient();

  // 1. Create auth user via Admin API (service_role bypasses all checks)
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Auto-confirm email
    user_metadata: { full_name: full_name ?? email.split("@")[0] },
  });

  if (authError) {
    console.error("[AdminUsers] Create user error:", authError);
    if (authError.message?.includes("already")) {
      return apiBadRequest("Cet email est déjà enregistré");
    }
    return apiServerError("Erreur création utilisateur: " + authError.message);
  }

  if (!authData.user) {
    return apiServerError("User creation returned no user");
  }

  // 2. Update ezdrive_profiles (trigger should have created it)
  // Wait a moment for trigger to fire, then update
  const updates: Record<string, unknown> = {
    role: role ?? "operator",
    full_name: full_name ?? email.split("@")[0],
  };
  if (cpo_id !== undefined) updates.cpo_id = cpo_id;
  if (territory !== undefined) updates.territory = territory;

  // Retry profile update (trigger may be async)
  let profileUpdated = false;
  for (let i = 0; i < 3; i++) {
    const { error: updateError } = await db
      .from("ezdrive_profiles")
      .update(updates)
      .eq("id", authData.user.id);

    if (!updateError) {
      profileUpdated = true;
      break;
    }

    // If profile doesn't exist yet, insert it
    if (updateError.code === "PGRST116" || !profileUpdated) {
      const { error: insertError } = await db
        .from("ezdrive_profiles")
        .upsert({
          id: authData.user.id,
          email,
          ...updates,
        });
      if (!insertError) {
        profileUpdated = true;
        break;
      }
    }

    // Wait 200ms before retry
    await new Promise((r) => setTimeout(r, 200));
  }

  return apiCreated({
    user: {
      id: authData.user.id,
      email: authData.user.email,
      full_name: full_name ?? email.split("@")[0],
      role: role ?? "operator",
      cpo_id: cpo_id ?? null,
    },
    message: "Utilisateur créé avec succès",
  });
}

// ─── Invite User (send branded email) ────────────────────────

async function inviteUser(ctx: RouteContext): Promise<Response> {
  const body = await ctx.req.json();
  const { email, full_name, role, cpo_name, cpo_color, temporary_password } = body;

  if (!email) return apiBadRequest("Email required");

  if (!RESEND_API_KEY) {
    console.warn("[AdminUsers] RESEND_API_KEY not set, skipping email");
    return apiSuccess({ sent: false, message: "Email service not configured" });
  }

  const displayName = full_name ?? email.split("@")[0];
  const roleFr = getRoleFrench(role ?? "operator");
  const entityName = cpo_name ?? "EZDrive";
  const brandColor = cpo_color ?? "#00D4AA";

  const html = buildInvitationEmail({
    displayName,
    email,
    roleFr,
    entityName,
    brandColor,
    temporaryPassword: temporary_password,
    loginUrl: `${APP_URL}/login`,
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "EZDrive Supervision <noreply@ezdrive.fr>",
        to: [email],
        subject: `Bienvenue sur EZDrive Supervision — ${entityName}`,
        html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[AdminUsers] Resend error:", res.status, errBody);
      return apiServerError("Erreur envoi email: " + errBody);
    }

    const resData = await res.json();
    return apiSuccess({
      sent: true,
      email_id: resData.id,
      message: `Invitation envoyée à ${email}`,
    });
  } catch (err) {
    console.error("[AdminUsers] Email send error:", err);
    return apiServerError("Erreur envoi email");
  }
}

// ─── Update User (email, name, password) ────────────────────

async function updateUser(ctx: RouteContext): Promise<Response> {
  const body = await ctx.req.json();
  const { user_id, email, full_name, password, role, cpo_id, territory, b2b_client_id } = body;

  if (!user_id) return apiBadRequest("user_id required");

  const db = getServiceClient();

  // 1. Update auth.users via Admin API (email, password, metadata)
  const authUpdates: Record<string, unknown> = {};
  if (email) authUpdates.email = email;
  if (password) {
    if (password.length < 8) return apiBadRequest("Mot de passe : 8 caractères minimum");
    authUpdates.password = password;
  }
  if (full_name !== undefined) {
    authUpdates.user_metadata = { full_name };
  }

  if (Object.keys(authUpdates).length > 0) {
    const { error: authError } = await db.auth.admin.updateUserById(user_id, authUpdates);
    if (authError) {
      console.error("[AdminUsers] Update auth error:", authError);
      return apiServerError("Erreur mise à jour auth: " + authError.message);
    }
  }

  // 2. Update ezdrive_profiles
  const profileUpdates: Record<string, unknown> = {};
  if (email) profileUpdates.email = email;
  if (full_name !== undefined) profileUpdates.full_name = full_name;
  if (role) profileUpdates.role = role;
  if (cpo_id !== undefined) profileUpdates.cpo_id = cpo_id;
  if (territory !== undefined) profileUpdates.territory = territory;

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileError } = await db
      .from("ezdrive_profiles")
      .update(profileUpdates)
      .eq("id", user_id);

    if (profileError) {
      console.error("[AdminUsers] Update profile error:", profileError);
      return apiServerError("Erreur mise à jour profil: " + profileError.message);
    }
  }

  // 3. Update b2b_client_access if b2b_client_id is provided
  if (b2b_client_id !== undefined) {
    // Remove existing B2B client access for this user
    const { error: deleteError } = await db
      .from("b2b_client_access")
      .delete()
      .eq("user_id", user_id);

    if (deleteError) {
      console.error("[AdminUsers] Delete b2b_client_access error:", deleteError);
      return apiServerError("Erreur suppression accès B2B: " + deleteError.message);
    }

    // If a new b2b_client_id is specified, insert the new association
    if (b2b_client_id) {
      const { error: insertError } = await db
        .from("b2b_client_access")
        .insert({ user_id, b2b_client_id });

      if (insertError) {
        console.error("[AdminUsers] Insert b2b_client_access error:", insertError);
        return apiServerError("Erreur association B2B: " + insertError.message);
      }
    }
  }

  return apiSuccess({ message: "Utilisateur mis à jour" });
}

// ─── Create Consumer (mobile app user) ──────────────────────
async function createConsumer(ctx: RouteContext): Promise<Response> {
  const body = await ctx.req.json();
  const { email, full_name, phone, user_type, is_company, company_name, admin_notes } = body;

  if (!email) return apiBadRequest("Email requis");

  const db = getServiceClient();

  // 1. Create auth user (auto-confirm, with metadata)
  const tempPassword = Math.random().toString(36).slice(-12) + "A1!";
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: full_name ?? email.split("@")[0], created_by_admin: "true" },
  });

  if (authError) {
    if (authError.message?.includes("already")) return apiBadRequest("Cet email est déjà enregistré");
    return apiServerError("Erreur création auth: " + authError.message);
  }
  if (!authData.user) return apiServerError("Aucun utilisateur retourné");

  // 2. Insert consumer_profile
  const { error: profileError } = await db.from("consumer_profiles").insert({
    id: authData.user.id,
    email,
    full_name: full_name ?? email.split("@")[0],
    phone: phone ?? null,
    user_type: user_type ?? "INDIVIDUAL",
    is_company: is_company ?? false,
    company_name: company_name ?? null,
    admin_notes: admin_notes ?? null,
    is_active: true,
    created_by: ctx.auth?.user?.id ?? null,
  });

  if (profileError) {
    console.error("[AdminUsers] Create consumer profile error:", profileError);
    // Cleanup auth user
    await db.auth.admin.deleteUser(authData.user.id);
    return apiServerError("Erreur création profil: " + profileError.message);
  }

  return apiCreated({
    consumer: {
      id: authData.user.id,
      email,
      full_name: full_name ?? email.split("@")[0],
    },
    message: "Client eMSP créé avec succès",
  });
}

// ─── Reset Password (admin sends reset email or sets new password) ───

async function resetPasswordAdmin(ctx: RouteContext): Promise<Response> {
  const body = await ctx.req.json();
  const { user_id, email, new_password, send_reset_email } = body;

  if (!user_id && !email) return apiBadRequest("user_id or email required");

  const db = getServiceClient();

  // Option 1: Set a new password directly
  if (new_password) {
    if (new_password.length < 8) return apiBadRequest("Mot de passe : 8 caractères minimum");

    const targetId = user_id;
    if (!targetId) return apiBadRequest("user_id required to set password");

    const { error } = await db.auth.admin.updateUserById(targetId, {
      password: new_password,
    });

    if (error) {
      console.error("[AdminUsers] Reset password error:", error);
      return apiServerError("Erreur réinitialisation: " + error.message);
    }

    return apiSuccess({ message: "Mot de passe modifié avec succès" });
  }

  // Option 2: Send a password reset email via Supabase
  if (send_reset_email && email) {
    // Use Supabase's built-in password reset
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const res = await fetch(`${supabaseUrl}/auth/v1/recover`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[AdminUsers] Recovery email error:", res.status, errBody);
      return apiServerError("Erreur envoi email de réinitialisation");
    }

    return apiSuccess({
      message: `Email de réinitialisation envoyé à ${email}`,
      sent: true,
    });
  }

  return apiBadRequest("Specify new_password or send_reset_email: true");
}

// ─── Helpers ─────────────────────────────────────────────────

function getRoleFrench(role: string): string {
  const map: Record<string, string> = {
    admin: "Administrateur",
    operator: "Opérateur",
    tech: "Technicien",
    viewer: "Lecteur",
    b2b_client: "Client B2B",
  };
  return map[role] ?? role;
}

interface EmailParams {
  displayName: string;
  email: string;
  roleFr: string;
  entityName: string;
  brandColor: string;
  temporaryPassword?: string;
  loginUrl: string;
}

function buildInvitationEmail(p: EmailParams): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0f1c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">

    <!-- Header -->
    <div style="text-align:center;padding:32px 24px;background:linear-gradient(135deg,#0d1426 0%,#131b33 100%);border-radius:16px 16px 0 0;border:1px solid #1e293b;border-bottom:none;">
      <div style="display:inline-block;background:${p.brandColor};width:56px;height:56px;border-radius:14px;line-height:56px;text-align:center;margin-bottom:16px;">
        <span style="color:#fff;font-size:24px;font-weight:700;">⚡</span>
      </div>
      <h1 style="color:#fff;font-size:24px;margin:0 0 8px;font-weight:700;">Bienvenue sur EZDrive</h1>
      <p style="color:#8892b0;font-size:14px;margin:0;">Plateforme de supervision — ${p.entityName}</p>
    </div>

    <!-- Body -->
    <div style="background:#111827;padding:32px 24px;border:1px solid #1e293b;border-top:none;border-bottom:none;">
      <p style="color:#e2e8f0;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Bonjour <strong>${p.displayName}</strong>,
      </p>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Votre compte a été créé sur la plateforme de supervision EZDrive.
        Vous avez été assigné(e) en tant que <strong style="color:${p.brandColor};">${p.roleFr}</strong>
        pour l'entité <strong style="color:${p.brandColor};">${p.entityName}</strong>.
      </p>

      <!-- Credentials box -->
      <div style="background:#0d1426;border:1px solid #1e293b;border-radius:12px;padding:20px;margin:0 0 24px;">
        <p style="color:#8892b0;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;font-weight:600;">Vos identifiants</p>
        <table style="width:100%;">
          <tr>
            <td style="color:#8892b0;font-size:13px;padding:6px 0;width:100px;">Email</td>
            <td style="color:#e2e8f0;font-size:13px;font-weight:600;padding:6px 0;">${p.email}</td>
          </tr>
          ${p.temporaryPassword ? `<tr>
            <td style="color:#8892b0;font-size:13px;padding:6px 0;">Mot de passe</td>
            <td style="color:#e2e8f0;font-size:13px;font-weight:600;padding:6px 0;font-family:monospace;letter-spacing:1px;">${p.temporaryPassword}</td>
          </tr>` : ""}
        </table>
      </div>

      ${p.temporaryPassword ? `<p style="color:#f59e0b;font-size:12px;line-height:1.5;margin:0 0 24px;padding:12px;background:#f59e0b10;border:1px solid #f59e0b30;border-radius:8px;">
        ⚠️ Nous vous recommandons de changer votre mot de passe lors de votre première connexion.
      </p>` : ""}

      <!-- CTA Button -->
      <div style="text-align:center;margin:28px 0;">
        <a href="${p.loginUrl}" style="display:inline-block;background:${p.brandColor};color:#fff;text-decoration:none;padding:14px 40px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:0.3px;">
          Se connecter
        </a>
      </div>

      <!-- Role info -->
      <div style="background:#0d1426;border:1px solid #1e293b;border-radius:12px;padding:16px 20px;margin:24px 0 0;">
        <p style="color:#8892b0;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;font-weight:600;">Votre accès</p>
        <p style="color:#cbd5e1;font-size:13px;line-height:1.5;margin:0;">
          ${getRoleDescription(p.roleFr)}
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#0d1426;padding:20px 24px;border-radius:0 0 16px 16px;border:1px solid #1e293b;border-top:none;text-align:center;">
      <p style="color:#475569;font-size:12px;margin:0 0 4px;">
        EZDrive Supervision — Plateforme de gestion de bornes de recharge
      </p>
      <p style="color:#334155;font-size:11px;margin:0;">
        Cet email a été envoyé automatiquement. Ne pas répondre.
      </p>
    </div>

  </div>
</body>
</html>`;
}

function getRoleDescription(roleFr: string): string {
  switch (roleFr) {
    case "Administrateur":
      return "Accès complet : gestion des bornes, sessions, facturation, utilisateurs et toutes les entités CPO.";
    case "Opérateur":
      return "Gestion opérationnelle : suivi des bornes, sessions de charge, alertes et maintenance de votre entité.";
    case "Technicien":
      return "Accès technique : interventions sur les bornes, diagnostics OCPP et suivi de maintenance.";
    case "Client B2B":
      return "Portail dédié : suivi de consommation, facturation et gestion de vos collaborateurs.";
    default:
      return "Accès en lecture seule aux données de supervision de votre entité.";
  }
}
