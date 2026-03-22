-- Access Groups: permission-based access to stations with group-specific tariffs

CREATE TYPE access_group_type AS ENUM ('public', 'employee', 'vip', 'fleet', 'visitor', 'partner', 'custom');

CREATE TABLE IF NOT EXISTS access_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  type access_group_type NOT NULL DEFAULT 'custom',
  cpo_id uuid REFERENCES cpo_operators(id) ON DELETE SET NULL,
  b2b_client_id uuid REFERENCES b2b_clients(id) ON DELETE SET NULL,
  is_default boolean NOT NULL DEFAULT false,
  color text DEFAULT '#6B7280',
  member_count int NOT NULL DEFAULT 0,
  station_count int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_group_id uuid NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
  token_uid text, -- RFID token
  driver_id text, -- GFX consumer ID or driver ID
  consumer_id uuid REFERENCES consumer_profiles(id) ON DELETE CASCADE,
  added_by uuid REFERENCES auth.users(id),
  added_at timestamptz DEFAULT now(),
  CONSTRAINT chk_member_ref CHECK (
    token_uid IS NOT NULL OR driver_id IS NOT NULL OR consumer_id IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS access_group_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_group_id uuid NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  added_at timestamptz DEFAULT now(),
  UNIQUE(access_group_id, station_id)
);

CREATE TABLE IF NOT EXISTS access_group_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_group_id uuid NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
  tariff_id uuid NOT NULL REFERENCES ocpi_tariffs(id) ON DELETE CASCADE,
  priority int NOT NULL DEFAULT 0,
  valid_from date,
  valid_to date,
  created_at timestamptz DEFAULT now(),
  UNIQUE(access_group_id, tariff_id)
);

CREATE INDEX idx_ag_members_group ON access_group_members(access_group_id);
CREATE INDEX idx_ag_members_token ON access_group_members(token_uid) WHERE token_uid IS NOT NULL;
CREATE INDEX idx_ag_members_driver ON access_group_members(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX idx_ag_stations_group ON access_group_stations(access_group_id);
CREATE INDEX idx_ag_stations_station ON access_group_stations(station_id);
CREATE INDEX idx_ag_tariffs_group ON access_group_tariffs(access_group_id);

-- Function: resolve tariff for a token/driver at a station
CREATE OR REPLACE FUNCTION resolve_access_group_tariff(
  p_token_uid text,
  p_station_id uuid
) RETURNS uuid AS $$
DECLARE
  v_tariff_id uuid;
BEGIN
  -- Find highest priority group tariff for this token at this station
  SELECT agt.tariff_id INTO v_tariff_id
  FROM access_group_members agm
  JOIN access_group_stations ags ON ags.access_group_id = agm.access_group_id
  JOIN access_group_tariffs agt ON agt.access_group_id = agm.access_group_id
  WHERE agm.token_uid = p_token_uid
    AND ags.station_id = p_station_id
    AND (agt.valid_from IS NULL OR agt.valid_from <= CURRENT_DATE)
    AND (agt.valid_to IS NULL OR agt.valid_to >= CURRENT_DATE)
  ORDER BY agt.priority DESC
  LIMIT 1;

  RETURN v_tariff_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Auto-update member_count trigger
CREATE OR REPLACE FUNCTION update_access_group_counts() RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'access_group_members' THEN
    UPDATE access_groups SET member_count = (
      SELECT count(*) FROM access_group_members WHERE access_group_id = COALESCE(NEW.access_group_id, OLD.access_group_id)
    ) WHERE id = COALESCE(NEW.access_group_id, OLD.access_group_id);
  ELSIF TG_TABLE_NAME = 'access_group_stations' THEN
    UPDATE access_groups SET station_count = (
      SELECT count(*) FROM access_group_stations WHERE access_group_id = COALESCE(NEW.access_group_id, OLD.access_group_id)
    ) WHERE id = COALESCE(NEW.access_group_id, OLD.access_group_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ag_member_count AFTER INSERT OR DELETE ON access_group_members
FOR EACH ROW EXECUTE FUNCTION update_access_group_counts();

CREATE TRIGGER trg_ag_station_count AFTER INSERT OR DELETE ON access_group_stations
FOR EACH ROW EXECUTE FUNCTION update_access_group_counts();

-- Seed default groups
INSERT INTO access_groups (name, description, type, is_default) VALUES
('Public', 'Tarif public standard pour tous les utilisateurs', 'public', true),
('Employés B2B', 'Tarif réduit pour les employés des clients B2B', 'employee', false),
('VIP', 'Tarif préférentiel pour les clients VIP', 'vip', false),
('Fleet', 'Tarif fleet pour les gestionnaires de flotte', 'fleet', false)
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE access_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_group_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_group_tariffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read access_groups" ON access_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service full access_groups" ON access_groups FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Auth read ag_members" ON access_group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service full ag_members" ON access_group_members FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Auth read ag_stations" ON access_group_stations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service full ag_stations" ON access_group_stations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Auth read ag_tariffs" ON access_group_tariffs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service full ag_tariffs" ON access_group_tariffs FOR ALL TO service_role USING (true) WITH CHECK (true);
