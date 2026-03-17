-- ============================================
-- Migration 037: OCPP Audit Fixes
-- 1. Add ws_password column for per-chargepoint WebSocket auth
-- 2. Add charging_profile_seq for sequential profile IDs
-- ============================================

-- ── 1. Per-chargepoint WebSocket authentication ──
-- Supports OCPP Security Profile 1 (HTTP Basic Auth on WS upgrade).
-- When OCPP_WS_AUTH_ENABLED=true, the server checks this password
-- per chargepoint, falling back to a global shared secret.
ALTER TABLE ocpp_chargepoints
  ADD COLUMN IF NOT EXISTS ws_password text;

COMMENT ON COLUMN ocpp_chargepoints.ws_password IS
  'Per-chargepoint WebSocket password for OCPP Security Profile 1 (Basic Auth). NULL = use global shared password.';

-- ── 2. Sequence for deterministic chargingProfileId ──
-- OCPP 1.6 requires unique chargingProfileId per chargepoint.
-- Using a DB sequence avoids random collisions.
CREATE SEQUENCE IF NOT EXISTS charging_profile_id_seq START 1;

COMMENT ON SEQUENCE charging_profile_id_seq IS
  'Generates unique OCPP chargingProfileId values for SetChargingProfile commands';
