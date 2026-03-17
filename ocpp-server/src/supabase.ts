// ============================================
// EZDrive OCPP Server - Supabase Client
// For storage, auth validation, and RPC calls
//
// NOTE: Currently all DB queries go through pg direct (db.ts)
// for performance. This Supabase client is available for features
// that need Supabase-specific APIs (Storage, Auth admin, RPC).
// ============================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

let supabase: SupabaseClient;

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
}
