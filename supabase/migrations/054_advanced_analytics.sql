-- Advanced Analytics: materialized views for KPIs and reporting

-- Daily station statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_station_stats AS
SELECT
  DATE(c.start_date_time) as stat_date,
  s.id as station_id,
  s.name as station_name,
  s.cpo_id,
  s.territory_id,
  COUNT(*) as session_count,
  COALESCE(SUM(c.total_energy), 0) as energy_kwh,
  COALESCE(SUM(c.total_time), 0) as total_hours,
  COALESCE(SUM(((c.total_cost->>'excl_vat')::numeric)), 0) as revenue,
  COALESCE(AVG(c.total_energy), 0) as avg_energy_kwh,
  COALESCE(AVG(c.total_time * 60), 0) as avg_duration_min,
  COUNT(DISTINCT (c.cdr_token->>'uid')::text) as unique_drivers
FROM ocpi_cdrs c
JOIN stations s ON s.gfx_id = (c.cdr_location->>'id')::text OR s.name = (c.cdr_location->>'name')::text
WHERE c.start_date_time IS NOT NULL
GROUP BY DATE(c.start_date_time), s.id, s.name, s.cpo_id, s.territory_id;

CREATE UNIQUE INDEX idx_mv_daily_stats ON mv_daily_station_stats(stat_date, station_id);
CREATE INDEX idx_mv_daily_stats_cpo ON mv_daily_station_stats(cpo_id, stat_date);
CREATE INDEX idx_mv_daily_stats_territory ON mv_daily_station_stats(territory_id, stat_date);

-- Monthly CPO summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_cpo_summary AS
SELECT
  DATE_TRUNC('month', stat_date)::date as month,
  cpo_id,
  SUM(session_count) as total_sessions,
  SUM(energy_kwh) as total_energy_kwh,
  SUM(revenue) as total_revenue,
  SUM(total_hours) as total_hours,
  AVG(avg_energy_kwh) as avg_energy_per_session,
  AVG(avg_duration_min) as avg_duration_min,
  SUM(unique_drivers) as unique_drivers, -- Approximate (may overcount across days)
  COUNT(DISTINCT station_id) as active_stations
FROM mv_daily_station_stats
GROUP BY DATE_TRUNC('month', stat_date)::date, cpo_id;

CREATE UNIQUE INDEX idx_mv_monthly_cpo ON mv_monthly_cpo_summary(month, cpo_id);

-- Peak vs off-peak usage (requires tariff_schedules)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_peak_usage AS
SELECT
  DATE(c.start_date_time) as stat_date,
  s.cpo_id,
  CASE
    WHEN EXTRACT(HOUR FROM c.start_date_time) BETWEEN 8 AND 19
         AND EXTRACT(ISODOW FROM c.start_date_time) BETWEEN 1 AND 5
    THEN 'peak'
    WHEN EXTRACT(HOUR FROM c.start_date_time) BETWEEN 22 AND 23
         OR EXTRACT(HOUR FROM c.start_date_time) BETWEEN 0 AND 5
    THEN 'off_peak'
    ELSE 'normal'
  END as period_type,
  COUNT(*) as session_count,
  COALESCE(SUM(c.total_energy), 0) as energy_kwh,
  COALESCE(SUM(((c.total_cost->>'excl_vat')::numeric)), 0) as revenue
FROM ocpi_cdrs c
JOIN stations s ON s.gfx_id = (c.cdr_location->>'id')::text OR s.name = (c.cdr_location->>'name')::text
WHERE c.start_date_time IS NOT NULL
GROUP BY DATE(c.start_date_time), s.cpo_id,
  CASE
    WHEN EXTRACT(HOUR FROM c.start_date_time) BETWEEN 8 AND 19
         AND EXTRACT(ISODOW FROM c.start_date_time) BETWEEN 1 AND 5
    THEN 'peak'
    WHEN EXTRACT(HOUR FROM c.start_date_time) BETWEEN 22 AND 23
         OR EXTRACT(HOUR FROM c.start_date_time) BETWEEN 0 AND 5
    THEN 'off_peak'
    ELSE 'normal'
  END;

CREATE INDEX idx_mv_peak_usage ON mv_peak_usage(stat_date, cpo_id);

-- Utilization rate by station (hours charging / 24h)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_station_utilization AS
SELECT
  station_id,
  station_name,
  cpo_id,
  territory_id,
  DATE_TRUNC('month', stat_date)::date as month,
  SUM(total_hours) as charging_hours,
  COUNT(DISTINCT stat_date) as days_active,
  CASE
    WHEN COUNT(DISTINCT stat_date) > 0
    THEN ROUND((SUM(total_hours) / (COUNT(DISTINCT stat_date) * 24) * 100)::numeric, 1)
    ELSE 0
  END as utilization_pct
FROM mv_daily_station_stats
GROUP BY station_id, station_name, cpo_id, territory_id, DATE_TRUNC('month', stat_date)::date;

CREATE INDEX idx_mv_util_station ON mv_station_utilization(station_id, month);
CREATE INDEX idx_mv_util_cpo ON mv_station_utilization(cpo_id, month);

-- Function to refresh all analytics views
CREATE OR REPLACE FUNCTION refresh_analytics_views() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_station_stats;
  REFRESH MATERIALIZED VIEW mv_monthly_cpo_summary;
  REFRESH MATERIALIZED VIEW mv_peak_usage;
  REFRESH MATERIALIZED VIEW mv_station_utilization;
END;
$$ LANGUAGE plpgsql;

-- Add feature toggle
INSERT INTO feature_toggles (key, enabled, description)
VALUES ('enable_advanced_analytics', true, 'Analytics avancés avec vues matérialisées')
ON CONFLICT (key) DO NOTHING;
