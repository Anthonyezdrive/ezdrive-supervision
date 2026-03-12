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
