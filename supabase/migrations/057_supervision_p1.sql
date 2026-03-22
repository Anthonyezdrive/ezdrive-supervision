-- ============================================================
-- Migration 057: Supervision P1 — OCPP Logs, Capacity Alerts
-- 1. OCPP message log table for raw protocol visibility
-- 2. Site capacity monitoring table
-- 3. Enhanced alert rules for multi-type alerting
-- ============================================================

-- ── 1. OCPP Message Log ─────────────────────────────────────
-- Stores raw OCPP messages for debugging and audit trail

CREATE TABLE IF NOT EXISTS ocpp_message_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chargepoint_id text NOT NULL,
  identity text,
  direction text NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  message_type text NOT NULL, -- BootNotification, Heartbeat, StatusNotification, StartTransaction, etc.
  action text, -- The OCPP action name
  payload jsonb, -- Full message payload
  error_code text, -- For error responses
  error_description text,
  -- Timing
  received_at timestamptz NOT NULL DEFAULT now(),
  processing_time_ms integer,
  -- Metadata
  connector_id integer,
  transaction_id integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ocpp_msg_log_cp
  ON ocpp_message_log (chargepoint_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_ocpp_msg_log_type
  ON ocpp_message_log (message_type, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_ocpp_msg_log_time
  ON ocpp_message_log (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_ocpp_msg_log_identity
  ON ocpp_message_log (identity) WHERE identity IS NOT NULL;

-- RLS
ALTER TABLE ocpp_message_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read ocpp logs"
  ON ocpp_message_log FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ezdrive_profiles
    WHERE id = auth.uid() AND role IN ('admin', 'operator', 'technician')
  ));

CREATE POLICY "Service manage ocpp logs"
  ON ocpp_message_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Auto-cleanup: keep 30 days of logs
-- (Added to 055 cron jobs pattern)

-- ── 2. Site Capacity Monitoring ─────────────────────────────
-- Track electrical capacity per site for overload detection

CREATE TABLE IF NOT EXISTS site_capacity_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  site_name text,
  max_capacity_kw numeric(10,2) NOT NULL DEFAULT 100,
  warning_threshold_pct numeric(5,2) NOT NULL DEFAULT 80, -- Alert at 80% capacity
  critical_threshold_pct numeric(5,2) NOT NULL DEFAULT 95, -- Critical at 95%
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(station_id)
);

ALTER TABLE site_capacity_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth manage site capacity"
  ON site_capacity_config FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_site_capacity_updated
  BEFORE UPDATE ON site_capacity_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 3. Enhanced alert_rules table ───────────────────────────
-- Replaces simple alert_config with multi-type rules

CREATE TABLE IF NOT EXISTS alert_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type text NOT NULL CHECK (alert_type IN (
    'fault_threshold', 'offline_threshold', 'unavailable_threshold',
    'heartbeat_missing', 'session_stuck', 'connector_error',
    'energy_threshold', 'capacity_warning', 'capacity_critical'
  )),
  title text NOT NULL,
  description text,
  threshold_hours numeric(10,2) DEFAULT 4,
  threshold_value numeric(10,2), -- For energy/capacity thresholds
  notification_interval_hours numeric(10,2) DEFAULT 12,
  email_recipients text[] NOT NULL DEFAULT '{}',
  push_enabled boolean DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  -- Scope filters
  cpo_id text,
  station_id uuid,
  territory_id text,
  global_config boolean DEFAULT true,
  -- Hardware filters
  chargepoint_vendor text,
  chargepoint_model text,
  firmware_version text,
  -- Metadata
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_type
  ON alert_rules (alert_type) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_alert_rules_active
  ON alert_rules (is_active);

ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth manage alert rules"
  ON alert_rules FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Service manage alert rules"
  ON alert_rules FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_alert_rules_updated
  BEFORE UPDATE ON alert_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 4. Enhanced alert_history with type tracking ────────────

ALTER TABLE alert_history
  ADD COLUMN IF NOT EXISTS alert_rule_id uuid REFERENCES alert_rules(id),
  ADD COLUMN IF NOT EXISTS notification_channel text DEFAULT 'email'
    CHECK (notification_channel IN ('email', 'push', 'both')),
  ADD COLUMN IF NOT EXISTS details jsonb;

-- ── 5. Function: check capacity alerts ──────────────────────

CREATE OR REPLACE FUNCTION check_site_capacity()
RETURNS json AS $$
DECLARE
  v_site record;
  v_current_load numeric;
  v_alerts json[];
BEGIN
  v_alerts := ARRAY[]::json[];

  FOR v_site IN
    SELECT sc.*, s.name as station_name, s.city
    FROM site_capacity_config sc
    JOIN stations s ON s.id = sc.station_id
    WHERE sc.is_active = true
  LOOP
    -- Calculate current load from active OCPP transactions
    SELECT COALESCE(SUM(
      CASE
        WHEN mv.power_w IS NOT NULL THEN mv.power_w / 1000.0
        ELSE 0
      END
    ), 0) INTO v_current_load
    FROM ocpp_transactions ot
    LEFT JOIN LATERAL (
      SELECT power_w FROM ocpp_meter_values
      WHERE transaction_id = ot.id
      ORDER BY timestamp DESC LIMIT 1
    ) mv ON true
    WHERE ot.status = 'Active'
      AND ot.chargepoint_id IN (
        SELECT oc.id FROM ocpp_chargepoints oc
        WHERE oc.station_id = v_site.station_id
      );

    -- Check thresholds
    IF v_current_load >= (v_site.max_capacity_kw * v_site.critical_threshold_pct / 100) THEN
      v_alerts := v_alerts || json_build_object(
        'station_id', v_site.station_id,
        'station_name', v_site.station_name,
        'alert_level', 'critical',
        'current_load_kw', round(v_current_load, 2),
        'max_capacity_kw', v_site.max_capacity_kw,
        'usage_pct', round(v_current_load / v_site.max_capacity_kw * 100, 1)
      )::json;
    ELSIF v_current_load >= (v_site.max_capacity_kw * v_site.warning_threshold_pct / 100) THEN
      v_alerts := v_alerts || json_build_object(
        'station_id', v_site.station_id,
        'station_name', v_site.station_name,
        'alert_level', 'warning',
        'current_load_kw', round(v_current_load, 2),
        'max_capacity_kw', v_site.max_capacity_kw,
        'usage_pct', round(v_current_load / v_site.max_capacity_kw * 100, 1)
      )::json;
    END IF;
  END LOOP;

  RETURN json_build_object('capacity_alerts', v_alerts, 'checked_at', now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. Cron: cleanup OCPP logs older than 30 days ──────────

SELECT cron.schedule(
  'cleanup-ocpp-message-log',
  '0 3 * * 0', -- Weekly Sunday 3AM
  $$DELETE FROM ocpp_message_log WHERE received_at < now() - interval '30 days'$$
);
