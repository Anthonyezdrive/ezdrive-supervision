-- Migration 058: Road.io enriched station fields
-- Adds new columns to stations and recreates dependent views

-- 1. Add new columns to stations
ALTER TABLE stations ADD COLUMN IF NOT EXISTS setup_status text;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS access_group_ids jsonb DEFAULT '[]'::jsonb;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS roaming_credential_ids jsonb DEFAULT '[]'::jsonb;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS ocpp_charging_station_id text;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS numeric_identity integer;

-- 2. Drop dependent views in cascade order
DROP VIEW IF EXISTS user_accessible_stations;
DROP VIEW IF EXISTS maintenance_stations;
DROP VIEW IF EXISTS stations_enriched;

-- 3. Recreate stations_enriched with new fields
CREATE OR REPLACE VIEW stations_enriched AS
SELECT
  s.id, s.gfx_id, s.road_id, s.ocpp_identity, s.source, s.gfx_location_id,
  s.name, s.address, s.city, s.postal_code, s.latitude, s.longitude,
  s.cpo_id, c.name AS cpo_name, c.code AS cpo_code, c.color AS cpo_color,
  s.territory_id, t.name AS territory_name, t.code AS territory_code,
  s.ocpp_status, s.status_since, s.is_online, s.connectors,
  s.max_power_kw,
  EXTRACT(EPOCH FROM (now() - s.status_since)) / 3600 AS hours_in_status,
  s.last_synced_at, s.created_at,
  -- Hardware fields (migration 033)
  s.connectivity_status, s.remote_manageable, s.protocol_version,
  s.firmware_version, s.charge_point_vendor, s.charge_point_model,
  s.charger_type, s.charging_speed, s.deploy_state,
  s.heartbeat_interval, s.iso_15118_enabled,
  -- Road enriched fields (migration 058)
  s.setup_status, s.access_group_ids, s.roaming_credential_ids,
  s.ocpp_charging_station_id, s.numeric_identity
FROM stations s
LEFT JOIN cpo_operators c ON s.cpo_id = c.id
LEFT JOIN territories t ON s.territory_id = t.id;

-- 4. Recreate maintenance_stations view (exact column list from migration 033)
CREATE OR REPLACE VIEW maintenance_stations AS
SELECT
  s.id, s.gfx_id, s.name, s.address, s.city,
  s.ocpp_status, s.status_since, s.is_online, s.connectors, s.max_power_kw,
  c.name AS cpo_name, c.code AS cpo_code,
  t.name AS territory_name, t.code AS territory_code,
  EXTRACT(EPOCH FROM (now() - s.status_since)) / 3600 AS hours_in_fault,
  s.last_synced_at,
  s.connectivity_status, s.firmware_version,
  s.charge_point_vendor, s.charge_point_model, s.protocol_version,
  -- New fields (migration 058)
  s.setup_status, s.source
FROM stations s
LEFT JOIN cpo_operators c ON s.cpo_id = c.id
LEFT JOIN territories t ON s.territory_id = t.id
WHERE s.ocpp_status IN ('Faulted', 'Unavailable')
   OR (s.connectivity_status IS NULL AND s.source = 'road');

-- 5. Recreate user_accessible_stations view (migration 036 pattern)
-- CRITICAL: must include user_can_access_cpo() security filter
CREATE OR REPLACE VIEW user_accessible_stations AS
SELECT se.*
FROM stations_enriched se
WHERE user_can_access_cpo(se.cpo_id);

-- 6. Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_stations_setup_status ON stations(setup_status) WHERE setup_status IS NOT NULL;
