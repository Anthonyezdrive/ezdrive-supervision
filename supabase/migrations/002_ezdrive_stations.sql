-- ============================================
-- EZDrive Supervision – Stations & Status Log
-- ============================================

-- CPO operators
CREATE TABLE IF NOT EXISTS cpo_operators (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text UNIQUE NOT NULL,
  code        text UNIQUE NOT NULL,
  color       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO cpo_operators (name, code, color) VALUES
  ('EZDrive', 'ezdrive', '#00D4AA'),
  ('TotalEnergies', 'totalenergies', '#FF6B6B')
ON CONFLICT (code) DO NOTHING;

-- Territories
CREATE TABLE IF NOT EXISTS territories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  code        text UNIQUE NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO territories (name, code) VALUES
  ('Guadeloupe', '971'),
  ('Martinique', '972'),
  ('Guyane', '973'),
  ('R\u00e9union', '974')
ON CONFLICT (code) DO NOTHING;

-- Stations (cached from GreenFlux)
CREATE TABLE IF NOT EXISTS stations (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  gfx_id              text UNIQUE NOT NULL,
  gfx_location_id     text,
  name                text NOT NULL,
  address             text,
  city                text,
  postal_code         text,
  latitude            double precision,
  longitude           double precision,
  cpo_id              uuid REFERENCES cpo_operators(id),
  territory_id        uuid REFERENCES territories(id),
  ocpp_status         text NOT NULL DEFAULT 'Unknown'
                        CHECK (ocpp_status IN (
                          'Available', 'Preparing', 'Charging',
                          'SuspendedEVSE', 'SuspendedEV', 'Finishing',
                          'Unavailable', 'Faulted', 'Unknown'
                        )),
  status_since        timestamptz NOT NULL DEFAULT now(),
  is_online           boolean NOT NULL DEFAULT true,
  connectors          jsonb DEFAULT '[]'::jsonb,
  max_power_kw        numeric(8,2),
  gfx_raw             jsonb DEFAULT '{}'::jsonb,
  last_synced_at      timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stations_gfx_id      ON stations (gfx_id);
CREATE INDEX idx_stations_ocpp_status ON stations (ocpp_status);
CREATE INDEX idx_stations_cpo         ON stations (cpo_id);
CREATE INDEX idx_stations_territory   ON stations (territory_id);
CREATE INDEX idx_stations_online      ON stations (is_online);

-- Status change log
CREATE TABLE IF NOT EXISTS station_status_log (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id      uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  previous_status text,
  new_status      text NOT NULL,
  changed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ssl_station    ON station_status_log (station_id);
CREATE INDEX idx_ssl_changed_at ON station_status_log (changed_at DESC);
CREATE INDEX idx_ssl_new_status ON station_status_log (new_status);

-- Manual CPO override table
CREATE TABLE IF NOT EXISTS station_cpo_overrides (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  gfx_id      text UNIQUE NOT NULL,
  cpo_id      uuid NOT NULL REFERENCES cpo_operators(id),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stations_updated_at
  BEFORE UPDATE ON stations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE stations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_status_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cpo_operators          ENABLE ROW LEVEL SECURITY;
ALTER TABLE territories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_cpo_overrides  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_stations"     ON stations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_status_log"   ON station_status_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_cpos"         ON cpo_operators FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_territories"  ON territories FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_overrides"    ON station_cpo_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_write_stations" ON stations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_write_log"      ON station_status_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admin_manage_overrides" ON station_cpo_overrides FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'));
