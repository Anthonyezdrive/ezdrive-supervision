-- Google/Apple Maps Feed: public station data export

-- Materialized view for public station feed (fast queries)
CREATE MATERIALIZED VIEW IF NOT EXISTS public_stations_feed AS
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
  s.max_power_kw,
  s.connectors,
  s.source,
  co.name as cpo_name,
  co.code as cpo_code,
  t.name as territory_name,
  t.code as territory_code,
  CASE
    WHEN s.ocpp_status = 'Available' THEN 'AVAILABLE'
    WHEN s.ocpp_status = 'Charging' THEN 'IN_USE'
    WHEN s.ocpp_status IN ('Faulted', 'Unavailable') THEN 'OUT_OF_SERVICE'
    ELSE 'UNKNOWN'
  END as maps_status,
  CASE
    WHEN s.max_power_kw <= 22 THEN 'AC'
    WHEN s.max_power_kw <= 60 THEN 'DC_FAST'
    ELSE 'DC_ULTRA_FAST'
  END as power_category,
  -- Count connector types from jsonb
  jsonb_array_length(COALESCE(s.connectors, '[]'::jsonb)) as connector_count
FROM stations s
LEFT JOIN cpo_operators co ON co.id = s.cpo_id
LEFT JOIN territories t ON t.id = s.territory_id
WHERE s.latitude IS NOT NULL
  AND s.longitude IS NOT NULL;

CREATE UNIQUE INDEX idx_public_feed_id ON public_stations_feed(id);
CREATE INDEX idx_public_feed_status ON public_stations_feed(maps_status);
CREATE INDEX idx_public_feed_territory ON public_stations_feed(territory_code);

-- Add feature toggle for maps feed
INSERT INTO feature_toggles (key, enabled, description)
VALUES ('enable_maps_feed', true, 'Export public des bornes vers Google/Apple Maps')
ON CONFLICT (key) DO NOTHING;

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_public_stations_feed() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public_stations_feed;
END;
$$ LANGUAGE plpgsql;
