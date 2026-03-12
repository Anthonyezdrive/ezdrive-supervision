-- ============================================
-- EZDrive Supervision – ROAD/E-Flux Integration
-- Adds source field, road_id, ROAD CPO operator
-- and updates views to include new fields
-- ============================================

-- 1. Add source column to track which API populated each station
ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'gfx'
    CHECK (source IN ('gfx', 'road'));

-- 2. Add road_id column for ROAD/E-Flux unique identifier
ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS road_id text;

-- 3. Add unique index on road_id (partial: only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stations_road_id_unique
  ON stations (road_id)
  WHERE road_id IS NOT NULL;

-- 4. Make gfx_id nullable so ROAD stations don't need one
ALTER TABLE stations
  ALTER COLUMN gfx_id DROP NOT NULL;

-- 5. Ensure every station has at least one external ID
ALTER TABLE stations
  DROP CONSTRAINT IF EXISTS chk_station_has_id;
ALTER TABLE stations
  ADD CONSTRAINT chk_station_has_id
    CHECK (gfx_id IS NOT NULL OR road_id IS NOT NULL);

-- 6. Index for source column (for efficient GFX vs ROAD filtering)
CREATE INDEX IF NOT EXISTS idx_stations_source ON stations (source);

-- 7. Add ROAD EZDrive as a CPO operator (distinct color from GFX EZDrive)
INSERT INTO cpo_operators (name, code, color)
  VALUES ('ROAD EZDrive', 'road-ezdrive', '#4ECDC4')
ON CONFLICT (code) DO NOTHING;

-- 8. Update stations_enriched view to include source, road_id, cpo_color
CREATE OR REPLACE VIEW stations_enriched AS
SELECT
  s.id,
  s.gfx_id,
  s.road_id,
  s.source,
  s.gfx_location_id,
  s.name,
  s.address,
  s.city,
  s.postal_code,
  s.latitude,
  s.longitude,
  s.cpo_id,
  c.name  AS cpo_name,
  c.code  AS cpo_code,
  c.color AS cpo_color,
  s.territory_id,
  t.name  AS territory_name,
  t.code  AS territory_code,
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
LEFT JOIN territories t   ON s.territory_id = t.id;

-- 9. Update maintenance_stations view to include source, road_id
CREATE OR REPLACE VIEW maintenance_stations AS
SELECT
  s.id,
  s.gfx_id,
  s.road_id,
  s.source,
  s.name,
  s.address,
  s.city,
  s.ocpp_status,
  s.status_since,
  s.is_online,
  s.connectors,
  s.max_power_kw,
  c.name  AS cpo_name,
  c.code  AS cpo_code,
  t.name  AS territory_name,
  t.code  AS territory_code,
  EXTRACT(EPOCH FROM (now() - s.status_since)) / 3600 AS hours_in_fault,
  s.last_synced_at
FROM stations s
LEFT JOIN cpo_operators c ON s.cpo_id = c.id
LEFT JOIN territories t   ON s.territory_id = t.id
WHERE s.ocpp_status IN ('Faulted', 'Unavailable')
   OR NOT s.is_online
ORDER BY s.status_since ASC;

-- 10. station_kpis view is unchanged (aggregate on all stations)
-- No update needed for station_kpis
