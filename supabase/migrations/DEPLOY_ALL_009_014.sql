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
-- ============================================================
-- Migration 010: PostGIS + Geo Search + Networks + Ratings
-- Enables mobile app station search by radius
-- ============================================================

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geography column for spatial queries
ALTER TABLE stations ADD COLUMN IF NOT EXISTS geog geography(Point, 4326);

-- Populate geog from existing lat/lng
UPDATE stations
SET geog = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND geog IS NULL;

-- Spatial index for ST_DWithin queries
CREATE INDEX IF NOT EXISTS idx_stations_geog ON stations USING GIST (geog);

-- Auto-update geog when lat/lng changes
CREATE OR REPLACE FUNCTION update_station_geog()
RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geog := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  ELSE
    NEW.geog := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_station_geog
  BEFORE INSERT OR UPDATE OF latitude, longitude ON stations
  FOR EACH ROW EXECUTE FUNCTION update_station_geog();

-- Charging networks
CREATE TABLE IF NOT EXISTS charging_networks (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  code        text NOT NULL UNIQUE,
  logo_url    text,
  website     text,
  color       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO charging_networks (name, code, color) VALUES
  ('EZDrive', 'ezdrive', '#00D4AA'),
  ('ROAD / e-Flux', 'road', '#FF6B00'),
  ('GreenFlux', 'greenflux', '#00B050')
ON CONFLICT (code) DO NOTHING;

-- Add network reference + ratings to stations
ALTER TABLE stations ADD COLUMN IF NOT EXISTS network_id uuid REFERENCES charging_networks(id);
ALTER TABLE stations ADD COLUMN IF NOT EXISTS avg_rating numeric(3,2) DEFAULT 0;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS review_count integer DEFAULT 0;

-- Add full-text search index on station name/address/city
CREATE INDEX IF NOT EXISTS idx_stations_search
  ON stations USING gin (
    to_tsvector('french', coalesce(name, '') || ' ' || coalesce(address, '') || ' ' || coalesce(city, ''))
  );

-- RLS for charging_networks (public read)
ALTER TABLE charging_networks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_networks"
  ON charging_networks FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "service_manage_networks"
  ON charging_networks FOR ALL
  TO service_role USING (true) WITH CHECK (true);
-- ============================================================
-- Migration 011: User Vehicles & Station Favorites
-- Mobile app user data (port from Android app contract)
-- ============================================================

-- User vehicles (for charger compatibility filtering)
CREATE TABLE IF NOT EXISTS user_vehicles (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand                 text NOT NULL,
  model                 text NOT NULL,
  year                  integer,
  battery_capacity_kwh  numeric(8,2),
  max_charging_power_kw numeric(8,2),
  connector_types       text[] DEFAULT '{}',  -- e.g. {'CCS2', 'Type2'}
  license_plate         text,
  color                 text,
  photo_url             text,
  is_default            boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehicles_user    ON user_vehicles (user_id);
CREATE INDEX idx_vehicles_default ON user_vehicles (user_id) WHERE is_default = true;

CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON user_vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Ensure only one default vehicle per user
CREATE OR REPLACE FUNCTION enforce_single_default_vehicle()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE user_vehicles
    SET is_default = false
    WHERE user_id = NEW.user_id AND id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_single_default_vehicle
  BEFORE INSERT OR UPDATE OF is_default ON user_vehicles
  FOR EACH ROW WHEN (NEW.is_default = true)
  EXECUTE FUNCTION enforce_single_default_vehicle();

-- RLS for vehicles
ALTER TABLE user_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_vehicles"
  ON user_vehicles FOR ALL
  TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_manage_vehicles"
  ON user_vehicles FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Station favorites
CREATE TABLE IF NOT EXISTS user_favorites (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  station_id  uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE(user_id, station_id)
);

CREATE INDEX idx_favorites_user    ON user_favorites (user_id);
CREATE INDEX idx_favorites_station ON user_favorites (station_id);

ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_favorites"
  ON user_favorites FOR ALL
  TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_manage_favorites"
  ON user_favorites FOR ALL
  TO service_role USING (true) WITH CHECK (true);
-- ============================================================
-- Migration 012: Station Reviews & Reports
-- Community features for mobile app
-- ============================================================

-- Station reviews
CREATE TABLE IF NOT EXISTS station_reviews (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id        uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Ratings (1-5 scale)
  overall_rating    integer NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  reliability       integer CHECK (reliability BETWEEN 1 AND 5),
  price_quality     integer CHECK (price_quality BETWEEN 1 AND 5),
  location_rating   integer CHECK (location_rating BETWEEN 1 AND 5),
  security          integer CHECK (security BETWEEN 1 AND 5),

  -- Content
  comment           text,
  photos            text[] DEFAULT '{}',

  -- Meta
  helpful_count     integer NOT NULL DEFAULT 0,
  is_verified_charge boolean NOT NULL DEFAULT false,  -- true if user has a session at this station

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- One review per user per station
  UNIQUE(station_id, user_id)
);

CREATE INDEX idx_reviews_station   ON station_reviews (station_id);
CREATE INDEX idx_reviews_user      ON station_reviews (user_id);
CREATE INDEX idx_reviews_rating    ON station_reviews (overall_rating);
CREATE INDEX idx_reviews_created   ON station_reviews (created_at DESC);

CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON station_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Prevent double-voting on helpful
CREATE TABLE IF NOT EXISTS review_helpful_votes (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id   uuid NOT NULL REFERENCES station_reviews(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE(review_id, user_id)
);

-- Auto-update station avg_rating and review_count
CREATE OR REPLACE FUNCTION update_station_rating()
RETURNS trigger AS $$
DECLARE
  v_station_id uuid;
BEGIN
  v_station_id := COALESCE(NEW.station_id, OLD.station_id);

  UPDATE stations SET
    avg_rating = COALESCE((
      SELECT ROUND(AVG(overall_rating)::numeric, 2)
      FROM station_reviews WHERE station_id = v_station_id
    ), 0),
    review_count = (
      SELECT COUNT(*) FROM station_reviews WHERE station_id = v_station_id
    )
  WHERE id = v_station_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_station_rating
  AFTER INSERT OR UPDATE OR DELETE ON station_reviews
  FOR EACH ROW EXECUTE FUNCTION update_station_rating();

-- Station reports (out of order, damaged, etc.)
CREATE TABLE IF NOT EXISTS station_reports (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id      uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  report_type     text NOT NULL CHECK (report_type IN (
    'OUT_OF_ORDER', 'DAMAGED_CONNECTOR', 'ACCESS_BLOCKED',
    'WRONG_INFO', 'SAFETY_HAZARD', 'VANDALISM', 'OTHER'
  )),
  description     text,
  photos          text[] DEFAULT '{}',

  -- Workflow
  status          text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN (
    'SUBMITTED', 'IN_REVIEW', 'CONFIRMED', 'RESOLVED', 'REJECTED'
  )),
  admin_response  text,
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES auth.users(id),

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_station  ON station_reports (station_id);
CREATE INDEX idx_reports_user     ON station_reports (user_id);
CREATE INDEX idx_reports_status   ON station_reports (status);
CREATE INDEX idx_reports_type     ON station_reports (report_type);
CREATE INDEX idx_reports_created  ON station_reports (created_at DESC);

CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON station_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create alert when critical report is submitted
CREATE OR REPLACE FUNCTION report_to_alert()
RETURNS trigger AS $$
BEGIN
  IF NEW.report_type IN ('OUT_OF_ORDER', 'SAFETY_HAZARD', 'VANDALISM') THEN
    INSERT INTO alert_history (station_id, alert_type, severity, message)
    VALUES (
      NEW.station_id,
      'user_report',
      CASE NEW.report_type
        WHEN 'SAFETY_HAZARD' THEN 'critical'
        WHEN 'VANDALISM' THEN 'critical'
        ELSE 'warning'
      END,
      'User report: ' || NEW.report_type || COALESCE(' - ' || LEFT(NEW.description, 100), '')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_report_to_alert
  AFTER INSERT ON station_reports
  FOR EACH ROW EXECUTE FUNCTION report_to_alert();

-- RLS
ALTER TABLE station_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_helpful_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_reports ENABLE ROW LEVEL SECURITY;

-- Reviews: anyone authenticated can read, users manage own
CREATE POLICY "anyone_read_reviews"
  ON station_reviews FOR SELECT TO authenticated USING (true);

CREATE POLICY "users_create_reviews"
  ON station_reviews FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_reviews"
  ON station_reviews FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_delete_own_reviews"
  ON station_reviews FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "service_manage_reviews"
  ON station_reviews FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Helpful votes
CREATE POLICY "users_manage_own_votes"
  ON review_helpful_votes FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "anyone_read_votes"
  ON review_helpful_votes FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_manage_votes"
  ON review_helpful_votes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Reports: users can read own + create, admins can read/manage all
CREATE POLICY "users_read_own_reports"
  ON station_reports FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users_create_reports"
  ON station_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admins_manage_reports"
  ON station_reports FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "service_manage_reports"
  ON station_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
-- ============================================================
-- Migration 013: Subscriptions, RFID Cards & Business Contacts
-- Port from Resonovia billing-service + Android app contract
-- ============================================================

-- Subscription offers
CREATE TABLE IF NOT EXISTS subscription_offers (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type            text NOT NULL UNIQUE CHECK (type IN (
    'PAY_AS_YOU_GO', 'RFID_FIDELITY', 'PREMIUM_MONTHLY', 'PREMIUM_YEARLY', 'BUSINESS'
  )),
  name            text NOT NULL,
  description     text,
  price_cents     integer NOT NULL DEFAULT 0,
  currency        text NOT NULL DEFAULT 'EUR',
  billing_period  text CHECK (billing_period IN ('MONTHLY', 'YEARLY', 'ONE_TIME', NULL)),
  stripe_price_id text,
  benefits        text[] DEFAULT '{}',
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed subscription offers
INSERT INTO subscription_offers (type, name, description, price_cents, billing_period, benefits, sort_order) VALUES
  ('PAY_AS_YOU_GO', 'Pay As You Go', 'Paiement a la session, sans engagement', 0, NULL,
   ARRAY['Acces a toutes les bornes EZDrive', 'Paiement par CB', 'Historique des sessions'], 1),

  ('RFID_FIDELITY', 'Carte RFID Fidelite', 'Carte RFID avec avantages fidelite', 1500, 'ONE_TIME',
   ARRAY['Carte RFID personnalisee', 'Badge sans contact', '-5% sur toutes les recharges', 'Points fidelite'], 2),

  ('PREMIUM_MONTHLY', 'Premium Mensuel', 'Abonnement premium mensuel', 999, 'MONTHLY',
   ARRAY['Tous les avantages RFID', '-15% sur toutes les recharges', 'Support prioritaire', 'Reservations avancees'], 3),

  ('PREMIUM_YEARLY', 'Premium Annuel', 'Abonnement premium annuel (-20%)', 9590, 'YEARLY',
   ARRAY['Tous les avantages Premium', '-20% sur toutes les recharges', '2 mois offerts', 'Acces beta features'], 4),

  ('BUSINESS', 'Business / Flotte', 'Solution entreprise sur mesure', 0, 'MONTHLY',
   ARRAY['Tarifs flotte negocies', 'Dashboard multi-vehicules', 'Facturation centralisee', 'API dedicee', 'Account manager'], 5)
ON CONFLICT (type) DO NOTHING;

-- User subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_id                uuid NOT NULL REFERENCES subscription_offers(id),
  stripe_subscription_id  text,
  stripe_checkout_id      text,

  status                  text NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'
  )),

  started_at              timestamptz,
  expires_at              timestamptz,
  cancelled_at            timestamptz,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subs_user    ON user_subscriptions (user_id);
CREATE INDEX idx_subs_status  ON user_subscriptions (status);
CREATE INDEX idx_subs_stripe  ON user_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE TRIGGER trg_subs_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_subs"
  ON user_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "service_manage_subs"
  ON user_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admins_read_all_subs"
  ON user_subscriptions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'));

-- RFID Cards
CREATE TABLE IF NOT EXISTS rfid_cards (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_number     text NOT NULL UNIQUE,
  visual_number   text,           -- Printed on card (shorter)

  status          text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
    'REQUESTED', 'PRODUCTION', 'SHIPPED', 'ACTIVE', 'SUSPENDED', 'LOST', 'CANCELLED'
  )),

  -- Link to OCPI token (for Gireve interop)
  ocpi_token_id   uuid REFERENCES ocpi_tokens(id) ON DELETE SET NULL,

  -- Shipping
  shipping_address jsonb,
  tracking_number text,

  activated_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rfid_user       ON rfid_cards (user_id);
CREATE INDEX idx_rfid_status     ON rfid_cards (status);
CREATE INDEX idx_rfid_card_num   ON rfid_cards (card_number);
CREATE INDEX idx_rfid_ocpi_token ON rfid_cards (ocpi_token_id) WHERE ocpi_token_id IS NOT NULL;

CREATE TRIGGER trg_rfid_updated_at
  BEFORE UPDATE ON rfid_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE rfid_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_rfid"
  ON rfid_cards FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "service_manage_rfid"
  ON rfid_cards FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admins_manage_rfid"
  ON rfid_cards FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Business contact requests
CREATE TABLE IF NOT EXISTS business_contacts (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name  text NOT NULL,
  contact_name  text NOT NULL,
  email         text NOT NULL,
  phone         text,
  fleet_size    integer,
  message       text,

  status        text NOT NULL DEFAULT 'NEW' CHECK (status IN (
    'NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'CLOSED_WON', 'CLOSED_LOST'
  )),
  assigned_to   uuid REFERENCES auth.users(id),
  notes         text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_biz_status   ON business_contacts (status);
CREATE INDEX idx_biz_created  ON business_contacts (created_at DESC);

CREATE TRIGGER trg_biz_updated_at
  BEFORE UPDATE ON business_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE business_contacts ENABLE ROW LEVEL SECURITY;

-- Public can create (no auth required via service role)
CREATE POLICY "service_manage_biz"
  ON business_contacts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admins_manage_biz"
  ON business_contacts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Subscription offers are public read
ALTER TABLE subscription_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_offers"
  ON subscription_offers FOR SELECT TO authenticated USING (true);

CREATE POLICY "anon_read_offers"
  ON subscription_offers FOR SELECT TO anon USING (true);

CREATE POLICY "service_manage_offers"
  ON subscription_offers FOR ALL TO service_role USING (true) WITH CHECK (true);
-- ============================================================
-- Migration 014: Fixes & Functions for Consumer API
-- Adds missing columns, PostGIS search function, storage bucket
-- ============================================================

-- ─── 1. Add missing columns to alert_history ────────────────
-- Used by report_to_alert trigger in migration 012
ALTER TABLE alert_history ADD COLUMN IF NOT EXISTS severity text DEFAULT 'warning'
  CHECK (severity IN ('info', 'warning', 'critical'));
ALTER TABLE alert_history ADD COLUMN IF NOT EXISTS message text;

-- ─── 2. Fix report_to_alert trigger to match ocpi_push_queue schema ──
-- The trigger from 012 inserts into alert_history with severity/message
-- which now exists thanks to the ALTER above.

-- ─── 3. PostGIS search function for mobile app ──────────────
-- Used by api/_modules/stations.ts

CREATE OR REPLACE FUNCTION search_stations_geo(
  p_lat double precision,
  p_lng double precision,
  p_radius_meters double precision DEFAULT 50000,
  p_connector_type text DEFAULT NULL,
  p_min_power numeric DEFAULT NULL,
  p_network_code text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  city text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  ocpp_status text,
  is_online boolean,
  connectors jsonb,
  max_power_kw numeric,
  avg_rating numeric,
  review_count integer,
  network_id uuid,
  distance_meters double precision
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.address,
    s.city,
    s.postal_code,
    s.latitude,
    s.longitude,
    s.ocpp_status,
    s.is_online,
    s.connectors,
    s.max_power_kw,
    s.avg_rating,
    s.review_count,
    s.network_id,
    ST_Distance(
      s.geog,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) AS distance_meters
  FROM stations s
  LEFT JOIN charging_networks cn ON cn.id = s.network_id
  WHERE
    -- Geo filter
    s.geog IS NOT NULL
    AND ST_DWithin(
      s.geog,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_meters
    )
    -- Optional filters
    AND (p_status IS NULL OR s.ocpp_status = p_status)
    AND (p_min_power IS NULL OR s.max_power_kw >= p_min_power)
    AND (p_network_code IS NULL OR cn.code = p_network_code)
    AND (
      p_connector_type IS NULL
      OR s.connectors::text ILIKE '%' || p_connector_type || '%'
    )
  ORDER BY distance_meters ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── 4. Create storage bucket for media uploads ─────────────
-- Note: In Supabase, storage buckets are created via the dashboard or API,
-- not via SQL migrations. This INSERT works if the storage schema exists.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ezdrive-media',
  'ezdrive-media',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: authenticated users can upload to their own folder
CREATE POLICY "users_upload_own_media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ezdrive-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read access to media
CREATE POLICY "public_read_media"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'ezdrive-media');

-- Users can delete their own uploads
CREATE POLICY "users_delete_own_media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'ezdrive-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── 5. Fix RFID → OCPI push queue insert ──────────────────
-- The rfid.ts module inserts into ocpi_push_queue but the schema
-- requires object_type and ocpi_path which are NOT NULL.
-- Create a helper function that auto-fills these fields for token pushes.

CREATE OR REPLACE FUNCTION queue_ocpi_token_push()
RETURNS trigger AS $$
BEGIN
  -- Auto-queue PUT to Gireve when token is created or updated
  INSERT INTO ocpi_push_queue (
    module, action, object_type, object_id, ocpi_path, payload, priority
  ) VALUES (
    'tokens',
    CASE WHEN TG_OP = 'INSERT' THEN 'PUT' ELSE 'PATCH' END,
    'token',
    NEW.id::text,
    format('/tokens/%s/%s/%s', NEW.country_code, NEW.party_id, NEW.uid),
    row_to_json(NEW)::jsonb,
    5
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: auto-push token changes to Gireve
-- (This replaces the manual push_queue inserts in rfid.ts
--  but we keep both for redundancy — the module checks if already queued)
-- Disabled by default to avoid double-push; enable if you remove manual inserts
-- CREATE TRIGGER trg_auto_push_ocpi_token
--   AFTER INSERT OR UPDATE ON ocpi_tokens
--   FOR EACH ROW EXECUTE FUNCTION queue_ocpi_token_push();
