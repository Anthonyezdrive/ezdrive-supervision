-- ============================================
-- EZDrive Supervision – Alertes & Config
-- ============================================

-- Configuration des alertes (1 seule ligne)
CREATE TABLE IF NOT EXISTS alert_config (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  threshold_hours     numeric(8,2) NOT NULL DEFAULT 4,
  email_recipients    text[] NOT NULL DEFAULT '{}',
  is_active           boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO alert_config (threshold_hours, email_recipients, is_active)
VALUES (4, '{}', false)
ON CONFLICT DO NOTHING;

CREATE TRIGGER trg_alert_config_updated_at
  BEFORE UPDATE ON alert_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Historique des alertes envoyées (anti-spam 12h)
CREATE TABLE IF NOT EXISTS alert_history (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id  uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  alert_type  text NOT NULL DEFAULT 'fault_threshold',
  hours_in_fault numeric(8,2),
  sent_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_history_station ON alert_history (station_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_sent_at ON alert_history (sent_at DESC);

-- RLS
ALTER TABLE alert_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_alert_config"    ON alert_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_alert_config"   ON alert_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_insert_alert_config"  ON alert_config FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_read_alert_history"   ON alert_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_alert_history" ON alert_history FOR ALL TO service_role USING (true) WITH CHECK (true);
