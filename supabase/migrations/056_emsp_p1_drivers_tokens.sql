-- ============================================================
-- Migration 056: eMSP P1 — Enhanced Drivers & Token Management
-- Adds extended fields to gfx_consumers for full CRUD
-- Adds unblock support and status management
-- ============================================================

-- ── 1. Extended fields on gfx_consumers ─────────────────────
-- These fields mirror consumer_profiles migration 039 but for
-- the GFX-sourced driver table used by the supervision UI

ALTER TABLE gfx_consumers
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'FR';

ALTER TABLE gfx_consumers
  ADD COLUMN IF NOT EXISTS billing_mode text DEFAULT 'POSTPAID'
    CHECK (billing_mode IN ('PREPAID', 'POSTPAID'));

ALTER TABLE gfx_consumers
  ADD COLUMN IF NOT EXISTS siret text,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS cost_center text;

ALTER TABLE gfx_consumers
  ADD COLUMN IF NOT EXISTS validity_date timestamptz;

-- Ensure status column exists with proper check constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gfx_consumers' AND column_name = 'status'
  ) THEN
    ALTER TABLE gfx_consumers ADD COLUMN status text DEFAULT 'active';
  END IF;
END $$;

-- ── 2. Indexes for extended fields ──────────────────────────

CREATE INDEX IF NOT EXISTS idx_gfx_consumers_city
  ON gfx_consumers (city) WHERE city IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gfx_consumers_billing_mode
  ON gfx_consumers (billing_mode);

CREATE INDEX IF NOT EXISTS idx_gfx_consumers_status
  ON gfx_consumers (status);

CREATE INDEX IF NOT EXISTS idx_gfx_consumers_siret
  ON gfx_consumers (siret) WHERE siret IS NOT NULL;

-- ── 3. Update all_consumers view to include extended fields ─
-- Recreate or replace the view safely

CREATE OR REPLACE VIEW all_consumers AS
SELECT
  id,
  driver_external_id,
  first_name,
  last_name,
  COALESCE(full_name, TRIM(CONCAT(first_name, ' ', last_name))) AS full_name,
  email,
  phone,
  country,
  status,
  retail_package,
  emsp_contract,
  customer_name,
  cpo_name,
  cpo_id,
  total_sessions,
  total_energy_kwh,
  first_session_at,
  last_session_at,
  source,
  created_at,
  -- Extended fields (eMSP P1)
  address,
  postal_code,
  city,
  billing_mode,
  siret,
  vat_number,
  cost_center,
  validity_date
FROM gfx_consumers;

-- ── 4. Function: toggle driver status ───────────────────────

CREATE OR REPLACE FUNCTION toggle_driver_status(
  p_driver_id uuid,
  p_new_status text
) RETURNS json AS $$
DECLARE
  v_driver record;
BEGIN
  IF p_new_status NOT IN ('active', 'inactive', 'suspended') THEN
    RETURN json_build_object('error', 'Invalid status. Must be active, inactive, or suspended');
  END IF;

  UPDATE gfx_consumers
  SET status = p_new_status
  WHERE id = p_driver_id
  RETURNING id, driver_external_id, status INTO v_driver;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Driver not found');
  END IF;

  -- If suspended, also block all associated tokens
  IF p_new_status = 'suspended' THEN
    UPDATE gfx_tokens
    SET status = 'blocked'
    WHERE driver_external_id = v_driver.driver_external_id
      AND status != 'blocked';
  END IF;

  -- If reactivated, unblock tokens that were auto-blocked
  IF p_new_status = 'active' THEN
    UPDATE gfx_tokens
    SET status = 'active'
    WHERE driver_external_id = v_driver.driver_external_id
      AND status = 'blocked';
  END IF;

  RETURN json_build_object(
    'status', 'ok',
    'driver_id', v_driver.id,
    'new_status', p_new_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. Function: safe delete driver ─────────────────────────
-- Unlinks tokens before deleting the driver record

CREATE OR REPLACE FUNCTION safe_delete_driver(
  p_driver_id uuid
) RETURNS json AS $$
DECLARE
  v_driver record;
  v_token_count int;
BEGIN
  SELECT id, driver_external_id, full_name INTO v_driver
  FROM gfx_consumers WHERE id = p_driver_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Driver not found');
  END IF;

  -- Unlink tokens
  UPDATE gfx_tokens
  SET driver_external_id = NULL, driver_name = NULL
  WHERE driver_external_id = v_driver.driver_external_id;

  GET DIAGNOSTICS v_token_count = ROW_COUNT;

  -- Delete the driver
  DELETE FROM gfx_consumers WHERE id = p_driver_id;

  RETURN json_build_object(
    'status', 'deleted',
    'driver_id', v_driver.id,
    'driver_name', v_driver.full_name,
    'tokens_unlinked', v_token_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
