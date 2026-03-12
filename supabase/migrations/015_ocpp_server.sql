-- ============================================
-- EZDrive Supervision – OCPP 1.6-J Server Schema
-- Adds tables for direct chargepoint management:
--   ocpp_chargepoints, ocpp_transactions,
--   ocpp_meter_values, ocpp_command_queue
-- Extends stations table for OCPP source
-- ============================================

-- --------------------------------------------------------
-- 1. EXTEND STATIONS TABLE FOR OCPP SOURCE
-- --------------------------------------------------------

-- Add OCPP identity column (ChargeBox ID)
ALTER TABLE stations ADD COLUMN IF NOT EXISTS ocpp_identity text;

-- Unique index on ocpp_identity (partial: only non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stations_ocpp_identity
  ON stations (ocpp_identity)
  WHERE ocpp_identity IS NOT NULL;

-- Extend source CHECK to include 'ocpp'
ALTER TABLE stations DROP CONSTRAINT IF EXISTS stations_source_check;
ALTER TABLE stations ADD CONSTRAINT stations_source_check
  CHECK (source IN ('gfx', 'road', 'ocpp'));

-- Extend ID constraint to accept ocpp_identity as valid identifier
ALTER TABLE stations DROP CONSTRAINT IF EXISTS chk_station_has_id;
ALTER TABLE stations ADD CONSTRAINT chk_station_has_id
  CHECK (gfx_id IS NOT NULL OR road_id IS NOT NULL OR ocpp_identity IS NOT NULL);

-- --------------------------------------------------------
-- 2. OCPP CHARGEPOINTS REGISTRY
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS ocpp_chargepoints (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id           uuid REFERENCES stations(id) ON DELETE SET NULL,
  identity             text UNIQUE NOT NULL,  -- ChargeBox Identity (matches WS path)

  -- Hardware info (from BootNotification)
  vendor               text,
  model                text,
  serial_number        text,
  firmware_version     text,
  iccid                text,
  imsi                 text,

  -- Protocol
  ocpp_protocol        text NOT NULL DEFAULT 'ocpp1.6'
                         CHECK (ocpp_protocol IN ('ocpp1.6', 'ocpp2.0.1')),

  -- Connection state
  is_connected         boolean NOT NULL DEFAULT false,
  last_heartbeat       timestamptz,
  connected_at         timestamptz,
  disconnected_at      timestamptz,

  -- Registration
  registration_status  text NOT NULL DEFAULT 'Pending'
                         CHECK (registration_status IN ('Accepted', 'Pending', 'Rejected')),

  -- Cached configuration (from GetConfiguration)
  configuration        jsonb DEFAULT '{}'::jsonb,

  -- Number of connectors (from BootNotification or config)
  number_of_connectors int DEFAULT 0,

  -- Metadata
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup by station
CREATE INDEX IF NOT EXISTS idx_ocpp_cp_station ON ocpp_chargepoints (station_id);

-- Index for connected chargepoints
CREATE INDEX IF NOT EXISTS idx_ocpp_cp_connected ON ocpp_chargepoints (is_connected) WHERE is_connected = true;

-- Auto-link: when a chargepoint registers with an identity matching stations.ocpp_identity
-- the server code will set station_id accordingly

-- --------------------------------------------------------
-- 3. OCPP TRANSACTIONS (charging sessions)
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS ocpp_transactions (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chargepoint_id       uuid NOT NULL REFERENCES ocpp_chargepoints(id) ON DELETE CASCADE,
  connector_id         int NOT NULL,

  -- OCPP transaction ID (returned by chargepoint)
  ocpp_transaction_id  int NOT NULL,

  -- Authorization
  id_tag               text NOT NULL,  -- RFID UID or token

  -- Metering
  meter_start          int,            -- Wh at start
  meter_stop           int,            -- Wh at stop
  energy_kwh           numeric(10, 3), -- Computed: (meter_stop - meter_start) / 1000

  -- Timestamps
  started_at           timestamptz NOT NULL DEFAULT now(),
  stopped_at           timestamptz,

  -- Stop reason (Remote, EVDisconnected, PowerLoss, Reboot, Other, etc.)
  stop_reason          text,

  -- Status
  status               text NOT NULL DEFAULT 'Active'
                         CHECK (status IN ('Active', 'Completed', 'Faulted')),

  -- OCPI links (created by ocpi-bridge service)
  ocpi_session_id      uuid,  -- FK to ocpi_sessions (soft ref, may not exist yet)
  ocpi_cdr_id          uuid,  -- FK to ocpi_cdrs (soft ref, created on stop)

  -- Metadata
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Each chargepoint has unique transaction IDs
  UNIQUE (chargepoint_id, ocpp_transaction_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ocpp_tx_chargepoint ON ocpp_transactions (chargepoint_id);
CREATE INDEX IF NOT EXISTS idx_ocpp_tx_status ON ocpp_transactions (status) WHERE status = 'Active';
CREATE INDEX IF NOT EXISTS idx_ocpp_tx_id_tag ON ocpp_transactions (id_tag);
CREATE INDEX IF NOT EXISTS idx_ocpp_tx_started ON ocpp_transactions (started_at DESC);

-- --------------------------------------------------------
-- 4. OCPP METER VALUES
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS ocpp_meter_values (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id       uuid NOT NULL REFERENCES ocpp_transactions(id) ON DELETE CASCADE,
  chargepoint_id       uuid NOT NULL REFERENCES ocpp_chargepoints(id) ON DELETE CASCADE,
  connector_id         int NOT NULL,

  -- Timestamp from the chargepoint
  timestamp            timestamptz NOT NULL DEFAULT now(),

  -- Array of sampled values (measurand, value, unit, context, format, phase, location)
  sampled_values       jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Extracted key values for easy querying
  energy_wh            numeric(12, 3),  -- Energy.Active.Import.Register
  power_w              numeric(10, 3),  -- Power.Active.Import
  current_a            numeric(8, 3),   -- Current.Import
  voltage_v            numeric(8, 3),   -- Voltage
  soc_percent          numeric(5, 2),   -- SoC

  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Index for querying meter values by transaction
CREATE INDEX IF NOT EXISTS idx_ocpp_mv_transaction ON ocpp_meter_values (transaction_id, timestamp);
-- Index for time-range queries
CREATE INDEX IF NOT EXISTS idx_ocpp_mv_timestamp ON ocpp_meter_values (timestamp DESC);

-- --------------------------------------------------------
-- 5. OCPP COMMAND QUEUE (Edge Functions -> OCPP Server)
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS ocpp_command_queue (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chargepoint_id       uuid NOT NULL REFERENCES ocpp_chargepoints(id) ON DELETE CASCADE,

  -- Command type
  command              text NOT NULL
                         CHECK (command IN (
                           'RemoteStartTransaction',
                           'RemoteStopTransaction',
                           'Reset',
                           'UnlockConnector',
                           'ChangeConfiguration',
                           'GetConfiguration',
                           'ClearCache',
                           'TriggerMessage',
                           'SetChargingProfile',
                           'ClearChargingProfile',
                           'GetDiagnostics',
                           'UpdateFirmware',
                           'ChangeAvailability'
                         )),

  -- Command payload (varies by command type)
  payload              jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Execution status
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'sent', 'accepted', 'rejected', 'timeout', 'error')),

  -- Result from chargepoint
  result               jsonb,

  -- Who requested this command (user or system)
  requested_by         uuid,  -- auth.users id (nullable for system commands)

  -- Timing
  created_at           timestamptz NOT NULL DEFAULT now(),
  processed_at         timestamptz,
  expires_at           timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);

-- Index for pending commands per chargepoint (the server polls this)
CREATE INDEX IF NOT EXISTS idx_ocpp_cmd_pending
  ON ocpp_command_queue (chargepoint_id, created_at)
  WHERE status = 'pending';

-- Index for cleanup of expired commands
CREATE INDEX IF NOT EXISTS idx_ocpp_cmd_expires
  ON ocpp_command_queue (expires_at)
  WHERE status = 'pending';

-- --------------------------------------------------------
-- 6. TRIGGER: NOTIFY on new command insertion
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_ocpp_command()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('ocpp_commands', json_build_object(
    'id', NEW.id,
    'chargepoint_id', NEW.chargepoint_id,
    'command', NEW.command
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ocpp_command_notify
  AFTER INSERT ON ocpp_command_queue
  FOR EACH ROW EXECUTE FUNCTION notify_ocpp_command();

-- --------------------------------------------------------
-- 7. TRIGGER: Auto-update updated_at
-- --------------------------------------------------------

CREATE TRIGGER trg_ocpp_chargepoints_updated
  BEFORE UPDATE ON ocpp_chargepoints
  FOR EACH ROW EXECUTE FUNCTION update_ocpi_updated_at();

CREATE TRIGGER trg_ocpp_transactions_updated
  BEFORE UPDATE ON ocpp_transactions
  FOR EACH ROW EXECUTE FUNCTION update_ocpi_updated_at();

-- --------------------------------------------------------
-- 8. TRIGGER: Auto-expire stale commands
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION expire_ocpp_commands()
RETURNS void AS $$
BEGIN
  UPDATE ocpp_command_queue
  SET status = 'timeout', processed_at = now()
  WHERE status = 'pending'
    AND expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------
-- 9. RLS POLICIES
-- --------------------------------------------------------

ALTER TABLE ocpp_chargepoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocpp_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocpp_meter_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocpp_command_queue ENABLE ROW LEVEL SECURITY;

-- Admin read access (supervision dashboard)
CREATE POLICY ocpp_chargepoints_admin_read ON ocpp_chargepoints
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  );

CREATE POLICY ocpp_transactions_admin_read ON ocpp_transactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  );

CREATE POLICY ocpp_meter_values_admin_read ON ocpp_meter_values
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  );

CREATE POLICY ocpp_command_queue_admin_read ON ocpp_command_queue
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  );

-- Admin can create commands (via API)
CREATE POLICY ocpp_command_queue_admin_insert ON ocpp_command_queue
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  );

-- Service role has full access (for the OCPP server itself)
CREATE POLICY ocpp_chargepoints_service ON ocpp_chargepoints
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ocpp_transactions_service ON ocpp_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ocpp_meter_values_service ON ocpp_meter_values
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ocpp_command_queue_service ON ocpp_command_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- --------------------------------------------------------
-- 10. UPDATE VIEWS to include OCPP data
-- --------------------------------------------------------

-- Update stations_enriched to include ocpp_identity
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

-- Update maintenance_stations to include ocpp_identity
CREATE OR REPLACE VIEW maintenance_stations AS
SELECT
  s.id,
  s.gfx_id,
  s.road_id,
  s.ocpp_identity,
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

-- --------------------------------------------------------
-- 11. ADD OCPP CPO OPERATOR
-- --------------------------------------------------------

INSERT INTO cpo_operators (name, code, color)
  VALUES ('OCPP Direct', 'ocpp-direct', '#FF6B35')
ON CONFLICT (code) DO NOTHING;

-- --------------------------------------------------------
-- DONE
-- --------------------------------------------------------
