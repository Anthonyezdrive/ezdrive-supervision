// ============================================================
// EZDrive — Feature Toggles Helper
// CDC: Feature toggles Road ↔ Interne
// Stores toggles in Supabase table instead of Redis
// ============================================================

import { getServiceClient } from "./auth-middleware.ts";

/**
 * Check if a feature toggle is enabled
 * Falls back to defaultValue if toggle not found
 */
export async function isFeatureEnabled(
  key: string,
  defaultValue = false,
): Promise<boolean> {
  try {
    const db = getServiceClient();
    const { data } = await db
      .from("feature_toggles")
      .select("enabled")
      .eq("key", key)
      .maybeSingle();

    return data?.enabled ?? defaultValue;
  } catch (err) {
    console.error(`[FeatureToggles] Error reading toggle '${key}':`, err);
    return defaultValue;
  }
}

/**
 * Get all feature toggles as a map
 */
export async function getAllToggles(): Promise<Record<string, boolean>> {
  try {
    const db = getServiceClient();
    const { data } = await db
      .from("feature_toggles")
      .select("key, enabled");

    const toggles: Record<string, boolean> = {};
    for (const row of data ?? []) {
      toggles[row.key] = row.enabled;
    }
    return toggles;
  } catch (err) {
    console.error("[FeatureToggles] Error reading all toggles:", err);
    return {};
  }
}

/**
 * Update a feature toggle (admin only — caller must check auth)
 */
export async function setFeatureToggle(
  key: string,
  enabled: boolean,
  updatedBy?: string,
): Promise<boolean> {
  try {
    const db = getServiceClient();
    const { error } = await db
      .from("feature_toggles")
      .update({
        enabled,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy ?? null,
      })
      .eq("key", key);

    return !error;
  } catch {
    return false;
  }
}

// Known toggle keys
export const TOGGLES = {
  USE_INTERNAL_STATIONS: "use_internal_stations",
  USE_INTERNAL_CHARGING: "use_internal_charging",
  USE_GFX_SYNC: "use_gfx_sync",
  USE_ROAD_SYNC: "use_road_sync",
  STRIPE_LIVE_MODE: "stripe_live_mode",
  ENABLE_SMART_CHARGING: "enable_smart_charging",
  ENABLE_PAY_PER_SESSION: "enable_pay_per_session",
} as const;
