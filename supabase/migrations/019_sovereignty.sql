-- ============================================
-- Migration 019: Sovereignty — Station-Tariff assignment + Enhanced Auth
-- Enables per-station tariff pricing and improved OCPP authorization
-- ============================================

-- =====================
-- 1. station_tariffs — Assigns specific tariffs to specific stations
-- =====================
CREATE TABLE IF NOT EXISTS station_tariffs (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id     uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  tariff_id      uuid NOT NULL REFERENCES ocpi_tariffs(id) ON DELETE CASCADE,
  priority       integer NOT NULL DEFAULT 0,
  connector_type text CHECK (connector_type IN ('AC', 'DC') OR connector_type IS NULL),
  valid_from     timestamptz,
  valid_to       timestamptz,
  source         text NOT NULL DEFAULT 'manual'
                 CHECK (source IN ('manual', 'gfx_inferred', 'ocpi_sync')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Unique: one tariff per station + connector type combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_st_unique
  ON station_tariffs (station_id, tariff_id, COALESCE(connector_type, 'ANY'));

CREATE INDEX IF NOT EXISTS idx_st_station ON station_tariffs (station_id);
CREATE INDEX IF NOT EXISTS idx_st_active ON station_tariffs (station_id, connector_type)
  WHERE valid_to IS NULL;

-- =====================
-- 2. package_tariff_map — Maps GFX retail_package_id → OCPI tariffs
-- =====================
CREATE TABLE IF NOT EXISTS package_tariff_map (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  retail_package_id text NOT NULL,
  tariff_id         uuid NOT NULL REFERENCES ocpi_tariffs(id) ON DELETE CASCADE,
  connector_type    text CHECK (connector_type IN ('AC', 'DC') OR connector_type IS NULL),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ptm_unique
  ON package_tariff_map (retail_package_id, COALESCE(connector_type, 'ANY'));

-- =====================
-- 3. Enhanced auth columns
-- =====================
ALTER TABLE rfid_cards ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE ocpi_tokens ADD COLUMN IF NOT EXISTS max_concurrent_tx integer DEFAULT 1;

-- =====================
-- 4. Analysis view — station ↔ package mapping from CDR history
-- =====================
CREATE OR REPLACE VIEW v_station_package_analysis AS
SELECT
  s.id as station_id,
  s.name as station_name,
  s.city,
  c.retail_package_id,
  c.charger_type,
  COUNT(*) as cdr_count,
  ROUND(AVG(c.total_cost::numeric), 2) as avg_cost,
  ROUND(AVG(c.total_energy::numeric), 2) as avg_kwh
FROM ocpi_cdrs c
JOIN stations s ON c.station_id = s.id
WHERE c.source = 'gfx' AND c.retail_package_id IS NOT NULL
GROUP BY s.id, s.name, s.city, c.retail_package_id, c.charger_type
ORDER BY s.name, cdr_count DESC;

-- =====================
-- 5. RLS policies
-- =====================
ALTER TABLE station_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_tariff_map ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_station_tariffs" ON station_tariffs
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_package_tariff_map" ON package_tariff_map
  FOR ALL USING (true) WITH CHECK (true);

-- Authenticated read-only
CREATE POLICY "auth_read_station_tariffs" ON station_tariffs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_package_tariff_map" ON package_tariff_map
  FOR SELECT TO authenticated USING (true);

-- =====================
-- 6. Auto-update updated_at trigger
-- =====================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_station_tariffs_updated ON station_tariffs;
CREATE TRIGGER trg_station_tariffs_updated
  BEFORE UPDATE ON station_tariffs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
