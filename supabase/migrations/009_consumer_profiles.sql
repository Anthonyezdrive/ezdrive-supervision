-- ============================================================
-- Migration 009: Consumer Profiles (Mobile App Users)
-- Distinct from ezdrive_profiles (admin/operator/tech)
-- Port from Resonovia user-service user_identities table
-- ============================================================

-- Consumer profiles for mobile app users
CREATE TABLE IF NOT EXISTS consumer_profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               text NOT NULL,
  full_name           text,
  phone               text,
  profile_picture_url text,

  -- Company info (B2B users)
  is_company          boolean NOT NULL DEFAULT false,
  company_name        text,

  -- External provider IDs (port from Resonovia multi-provider auth)
  road_user_id        text,           -- ROAD / e-Flux account ID
  gfx_user_id         text,           -- GreenFlux ChargeAssist account ID
  stripe_customer_id  text,           -- Stripe customer ID

  -- IBAN for refunds (encrypted at app level before storage)
  iban_encrypted      text,

  -- User type
  user_type           text NOT NULL DEFAULT 'INDIVIDUAL'
                        CHECK (user_type IN ('INDIVIDUAL', 'BUSINESS', 'FLEET_MANAGER')),

  -- Preferences
  preferred_language  text DEFAULT 'fr',
  push_notifications  boolean NOT NULL DEFAULT true,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_consumer_profiles_email    ON consumer_profiles (email);
CREATE INDEX idx_consumer_profiles_road     ON consumer_profiles (road_user_id) WHERE road_user_id IS NOT NULL;
CREATE INDEX idx_consumer_profiles_gfx      ON consumer_profiles (gfx_user_id) WHERE gfx_user_id IS NOT NULL;
CREATE INDEX idx_consumer_profiles_stripe   ON consumer_profiles (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Auto-update trigger (reuses existing function from 002)
CREATE TRIGGER trg_consumer_profiles_updated_at
  BEFORE UPDATE ON consumer_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE consumer_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own profile
CREATE POLICY "consumers_read_own"
  ON consumer_profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

CREATE POLICY "consumers_update_own"
  ON consumer_profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Service role has full access (for edge functions)
CREATE POLICY "service_manage_consumers"
  ON consumer_profiles FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Admins can read all consumer profiles
CREATE POLICY "admins_read_consumers"
  ON consumer_profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Device registrations (port from Resonovia devices.py)
CREATE TABLE IF NOT EXISTS device_registrations (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id     text NOT NULL,
  platform      text NOT NULL CHECK (platform IN ('ANDROID', 'IOS', 'WEB')),
  push_token    text,
  app_version   text,
  os_version    text,
  device_model  text,
  is_active     boolean NOT NULL DEFAULT true,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE(user_id, device_id)
);

CREATE INDEX idx_device_reg_user     ON device_registrations (user_id);
CREATE INDEX idx_device_reg_active   ON device_registrations (is_active) WHERE is_active = true;

CREATE TRIGGER trg_device_reg_updated_at
  BEFORE UPDATE ON device_registrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE device_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_devices"
  ON device_registrations FOR ALL
  TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_manage_devices"
  ON device_registrations FOR ALL
  TO service_role USING (true) WITH CHECK (true);
