-- Dynamic Tariffs: Peak/Off-Peak + Idle Fees configuration
-- Adds time-based tariff scheduling and idle fee detection

-- Tariff schedules for peak/off-peak pricing
CREATE TABLE IF NOT EXISTS tariff_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tariff_id uuid REFERENCES ocpi_tariffs(id) ON DELETE CASCADE,
  day_of_week int[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}', -- OCPI: 1=Monday-7=Sunday
  start_time time NOT NULL DEFAULT '00:00',
  end_time time NOT NULL DEFAULT '23:59',
  peak_type text NOT NULL DEFAULT 'normal' CHECK (peak_type IN ('peak', 'off_peak', 'super_off_peak', 'normal')),
  price_multiplier numeric(4,2) NOT NULL DEFAULT 1.0, -- 1.0=normal, 1.5=peak, 0.7=off-peak
  label text, -- "Heures creuses", "Heures pleines"
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_tariff_schedules_tariff ON tariff_schedules(tariff_id);
CREATE INDEX idx_tariff_schedules_active ON tariff_schedules(is_active) WHERE is_active = true;

-- Idle fee configuration per station/group
CREATE TABLE IF NOT EXISTS idle_fee_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid REFERENCES stations(id) ON DELETE CASCADE,
  cpo_id uuid REFERENCES cpo_operators(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  fee_per_minute numeric(6,4) NOT NULL DEFAULT 0.05, -- €/minute
  grace_period_minutes int NOT NULL DEFAULT 15,
  max_fee numeric(8,2) DEFAULT NULL, -- Max cap in €
  applies_after text NOT NULL DEFAULT 'charge_complete' CHECK (applies_after IN ('charge_complete', 'session_end')),
  notification_at_minutes int DEFAULT 5, -- Push notification X minutes before fee starts
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT chk_one_scope CHECK (
    (station_id IS NOT NULL AND cpo_id IS NULL) OR
    (station_id IS NULL AND cpo_id IS NOT NULL)
  )
);

CREATE INDEX idx_idle_fee_station ON idle_fee_config(station_id) WHERE station_id IS NOT NULL;
CREATE INDEX idx_idle_fee_cpo ON idle_fee_config(cpo_id) WHERE cpo_id IS NOT NULL;

-- Add parking_duration_minutes to ocpp_transactions for idle tracking
ALTER TABLE ocpp_transactions ADD COLUMN IF NOT EXISTS parking_duration_minutes numeric(8,2) DEFAULT 0;
ALTER TABLE ocpp_transactions ADD COLUMN IF NOT EXISTS idle_fee_cents int DEFAULT 0;

-- Seed default schedules for existing tariffs
INSERT INTO tariff_schedules (tariff_id, day_of_week, start_time, end_time, peak_type, price_multiplier, label)
SELECT id, '{1,2,3,4,5}', '08:00', '20:00', 'peak', 1.0, 'Heures pleines (Semaine)'
FROM ocpi_tariffs
WHERE tariff_id IN ('STANDARD-AC', 'STANDARD-DC')
ON CONFLICT DO NOTHING;

INSERT INTO tariff_schedules (tariff_id, day_of_week, start_time, end_time, peak_type, price_multiplier, label)
SELECT id, '{1,2,3,4,5}', '22:00', '06:00', 'off_peak', 0.7, 'Heures creuses (Nuit)'
FROM ocpi_tariffs
WHERE tariff_id IN ('STANDARD-AC', 'STANDARD-DC')
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE tariff_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE idle_fee_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read tariff_schedules" ON tariff_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full tariff_schedules" ON tariff_schedules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can read idle_fee_config" ON idle_fee_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full idle_fee_config" ON idle_fee_config FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Function: resolve tariff with peak/off-peak multiplier
CREATE OR REPLACE FUNCTION resolve_tariff_multiplier(
  p_tariff_id uuid,
  p_session_time timestamptz DEFAULT now()
) RETURNS numeric AS $$
DECLARE
  v_multiplier numeric := 1.0;
  v_day int;
  v_time time;
BEGIN
  -- OCPI day: 1=Monday-7=Sunday
  v_day := EXTRACT(ISODOW FROM p_session_time);
  v_time := p_session_time::time;

  SELECT price_multiplier INTO v_multiplier
  FROM tariff_schedules
  WHERE tariff_id = p_tariff_id
    AND is_active = true
    AND v_day = ANY(day_of_week)
    AND v_time >= start_time
    AND v_time < end_time
  ORDER BY peak_type = 'peak' DESC -- Prefer peak if overlap
  LIMIT 1;

  RETURN COALESCE(v_multiplier, 1.0);
END;
$$ LANGUAGE plpgsql STABLE;
