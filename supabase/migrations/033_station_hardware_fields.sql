-- ============================================
-- 033 — Station hardware & connectivity fields
-- New fields from GreenFlux API (expanded API key)
-- ============================================

-- 1. Add new columns to stations table
ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS connectivity_status  text,            -- 'Online' | null
  ADD COLUMN IF NOT EXISTS remote_manageable    boolean,
  ADD COLUMN IF NOT EXISTS protocol_version     text,            -- 'Ocpp16' etc.
  ADD COLUMN IF NOT EXISTS firmware_version     text,
  ADD COLUMN IF NOT EXISTS charge_point_vendor  text,
  ADD COLUMN IF NOT EXISTS charge_point_model   text,
  ADD COLUMN IF NOT EXISTS charger_type         text,            -- 'Public' | 'Business' | 'Home'
  ADD COLUMN IF NOT EXISTS charging_speed       text,            -- 'Slow' | 'Fast' | 'Mix_AC_DC'
  ADD COLUMN IF NOT EXISTS deploy_state         text,            -- 'Production' | 'Stock' | 'Deprecated'
  ADD COLUMN IF NOT EXISTS heartbeat_interval   integer,
  ADD COLUMN IF NOT EXISTS iso_15118_enabled    boolean DEFAULT false;

-- 2. Index for filtering by connectivity and charger type
CREATE INDEX IF NOT EXISTS idx_stations_connectivity ON stations (connectivity_status);
CREATE INDEX IF NOT EXISTS idx_stations_charger_type ON stations (charger_type);
CREATE INDEX IF NOT EXISTS idx_stations_deploy_state ON stations (deploy_state);

-- 3. Drop + recreate views (column order changed)
DROP VIEW IF EXISTS maintenance_stations;
DROP VIEW IF EXISTS stations_enriched;

CREATE OR REPLACE VIEW stations_enriched AS
SELECT
  s.id,
  s.gfx_id,
  s.road_id,
  s.ocpp_identity,
  s.source,
  s.gfx_location_id,
  s.name,
  s.address,
  s.city,
  s.postal_code,
  s.latitude,
  s.longitude,
  s.cpo_id,
  c.name AS cpo_name,
  c.code AS cpo_code,
  c.color AS cpo_color,
  s.territory_id,
  t.name AS territory_name,
  t.code AS territory_code,
  s.ocpp_status,
  s.status_since,
  s.is_online,
  s.connectors,
  s.max_power_kw,
  EXTRACT(EPOCH FROM (now() - s.status_since)) / 3600 AS hours_in_status,
  s.last_synced_at,
  s.created_at,
  -- New hardware fields (migration 033)
  s.connectivity_status,
  s.remote_manageable,
  s.protocol_version,
  s.firmware_version,
  s.charge_point_vendor,
  s.charge_point_model,
  s.charger_type,
  s.charging_speed,
  s.deploy_state,
  s.heartbeat_interval,
  s.iso_15118_enabled
FROM stations s
LEFT JOIN cpo_operators c ON s.cpo_id = c.id
LEFT JOIN territories t ON s.territory_id = t.id;

-- 4. Recreate maintenance view with hardware context
CREATE OR REPLACE VIEW maintenance_stations AS
SELECT
  s.id,
  s.gfx_id,
  s.name,
  s.address,
  s.city,
  s.ocpp_status,
  s.status_since,
  s.is_online,
  s.connectors,
  s.max_power_kw,
  c.name AS cpo_name,
  c.code AS cpo_code,
  t.name AS territory_name,
  t.code AS territory_code,
  EXTRACT(EPOCH FROM (now() - s.status_since)) / 3600 AS hours_in_fault,
  s.last_synced_at,
  -- Hardware context for maintenance
  s.connectivity_status,
  s.firmware_version,
  s.charge_point_vendor,
  s.charge_point_model,
  s.protocol_version
FROM stations s
LEFT JOIN cpo_operators c ON s.cpo_id = c.id
LEFT JOIN territories t ON s.territory_id = t.id
WHERE s.ocpp_status IN ('Faulted', 'Unavailable')
   OR NOT s.is_online
ORDER BY s.status_since ASC;
