-- ============================================================
-- Migration 039: Extended Consumer Profile Fields
-- Adds address, account manager, validity, banking, cost center
-- per Jean-Luc brief requirements
-- ============================================================

-- Address fields
ALTER TABLE consumer_profiles
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'FR';

-- Account management
ALTER TABLE consumer_profiles
  ADD COLUMN IF NOT EXISTS account_manager text,
  ADD COLUMN IF NOT EXISTS validity_date timestamptz,
  ADD COLUMN IF NOT EXISTS cost_center text;

-- Company extended (B2B)
ALTER TABLE consumer_profiles
  ADD COLUMN IF NOT EXISTS siret text,
  ADD COLUMN IF NOT EXISTS vat_number text;

-- Billing mode
ALTER TABLE consumer_profiles
  ADD COLUMN IF NOT EXISTS billing_mode text DEFAULT 'POSTPAID'
    CHECK (billing_mode IN ('PREPAID', 'POSTPAID'));

-- Status field (active/inactive/suspended)
ALTER TABLE consumer_profiles
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'suspended'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_consumer_city ON consumer_profiles (city);
CREATE INDEX IF NOT EXISTS idx_consumer_status ON consumer_profiles (status);
CREATE INDEX IF NOT EXISTS idx_consumer_validity ON consumer_profiles (validity_date) WHERE validity_date IS NOT NULL;
