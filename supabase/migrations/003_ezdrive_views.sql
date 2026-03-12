-- ============================================
-- EZDrive Supervision – Views
-- ============================================

-- Dashboard KPIs
CREATE OR REPLACE VIEW station_kpis AS
SELECT
  COUNT(*) AS total_stations,
  COUNT(*) FILTER (WHERE ocpp_status = 'Available') AS available,
  COUNT(*) FILTER (WHERE ocpp_status = 'Charging') AS charging,
  COUNT(*) FILTER (WHERE ocpp_status = 'Faulted') AS faulted,
  COUNT(*) FILTER (WHERE ocpp_status IN ('Unavailable', 'Unknown') OR NOT is_online) AS offline,
  COUNT(*) FILTER (WHERE ocpp_status IN ('Preparing', 'SuspendedEVSE', 'SuspendedEV', 'Finishing')) AS other
FROM stations;

-- Enriched stations with CPO and territory names
CREATE OR REPLACE VIEW stations_enriched AS
SELECT
  s.id,
  s.gfx_id,
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
  s.created_at
FROM stations s
LEFT JOIN cpo_operators c ON s.cpo_id = c.id
LEFT JOIN territories t ON s.territory_id = t.id;

-- Maintenance view: faulted + offline stations
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
  s.last_synced_at
FROM stations s
LEFT JOIN cpo_operators c ON s.cpo_id = c.id
LEFT JOIN territories t ON s.territory_id = t.id
WHERE s.ocpp_status IN ('Faulted', 'Unavailable')
   OR NOT s.is_online
ORDER BY s.status_since ASC;
