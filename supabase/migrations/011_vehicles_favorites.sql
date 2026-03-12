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
