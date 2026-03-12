-- ============================================================
-- Migration 008: OCPI 2.2.1 Schema
-- EZDrive CPO + eMSP — Gireve IOP Integration
-- ============================================================

-- --------------------------------------------------------
-- 1. OCPI Credentials (connexion Gireve)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ocpi_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('CPO', 'EMSP')),
  country_code text NOT NULL CHECK (length(country_code) = 2),  -- FR
  party_id text NOT NULL CHECK (length(party_id) = 3),          -- EZD

  -- Token A = Gireve sends to us (we validate incoming requests)
  token_a text,
  -- Token B = We send to Gireve (they validate our requests)
  token_b text,
  -- Token C = New token during rotation
  token_c text,

  -- Gireve IOP endpoints
  versions_url text,
  -- Our endpoints (what we expose)
  our_versions_url text,
  our_base_url text,

  -- Connection status
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONNECTED', 'SUSPENDED', 'BLOCKED')),

  -- Gireve platform
  platform text NOT NULL DEFAULT 'PREPROD' CHECK (platform IN ('PREPROD', 'PROD')),
  -- FR107 = preprod, FR007 = prod
  gireve_country_code text DEFAULT 'FR',
  gireve_party_id text DEFAULT '107',  -- 107 preprod, 007 prod

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(role, country_code, party_id, platform)
);

-- --------------------------------------------------------
-- 2. OCPI Locations (CPO: nos bornes exposées via OCPI)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ocpi_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- OCPI identifiers
  ocpi_id text NOT NULL,              -- Location ID (max 36 chars)
  country_code text NOT NULL CHECK (length(country_code) = 2),
  party_id text NOT NULL CHECK (length(party_id) = 3),

  -- Location data
  name text,
  address text NOT NULL,
  city text NOT NULL,
  postal_code text,
  country text NOT NULL DEFAULT 'FRA',
  latitude numeric(10,7) NOT NULL,
  longitude numeric(10,7) NOT NULL,

  -- Operator info
  operator_name text,
  operator_website text,

  -- Publish flag (OCPI 2.2.1)
  publish boolean NOT NULL DEFAULT true,

  -- Time zone
  time_zone text NOT NULL DEFAULT 'America/Martinique',

  -- Link to internal station(s)
  station_id uuid REFERENCES stations(id) ON DELETE SET NULL,

  -- OCPI metadata
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Gireve extension
  gireve_id text,

  UNIQUE(country_code, party_id, ocpi_id)
);

-- --------------------------------------------------------
-- 3. OCPI EVSEs (bornes de charge dans une location)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ocpi_evses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES ocpi_locations(id) ON DELETE CASCADE,

  -- EVSE identifiers (eMI3 standard)
  uid text NOT NULL,                  -- Internal unique ID
  evse_id text,                       -- eMI3 format: FR*EZD*E{uid}

  -- Status
  status text NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN (
    'AVAILABLE', 'BLOCKED', 'CHARGING', 'INOPERATIVE',
    'OUTOFORDER', 'PLANNED', 'REMOVED', 'RESERVED', 'UNKNOWN'
  )),

  -- Physical reference
  floor_level text,
  physical_reference text,

  -- Directions
  directions jsonb,

  -- Capabilities
  capabilities jsonb DEFAULT '[]'::jsonb,
  -- e.g. ["CHARGING_PROFILE_CAPABLE", "REMOTE_START_STOP_CAPABLE", "RFID_READER"]

  -- Parking restrictions
  parking_restrictions jsonb DEFAULT '[]'::jsonb,

  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(location_id, uid)
);

-- --------------------------------------------------------
-- 4. OCPI Connectors
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ocpi_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evse_id uuid NOT NULL REFERENCES ocpi_evses(id) ON DELETE CASCADE,

  -- Connector identifier
  connector_id text NOT NULL,         -- "1", "2", etc.

  -- Technical specs
  standard text NOT NULL,             -- IEC_62196_T2, CHADEMO, IEC_62196_T2_COMBO, etc.
  format text NOT NULL,               -- SOCKET, CABLE
  power_type text NOT NULL,           -- AC_1_PHASE, AC_3_PHASE, DC
  max_voltage integer,
  max_amperage integer,
  max_electric_power integer,         -- Watts

  -- Tariff link
  tariff_ids jsonb DEFAULT '[]'::jsonb,

  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(evse_id, connector_id)
);

-- --------------------------------------------------------
-- 5. OCPI Tokens (eMSP: tokens d'identification utilisateurs)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ocpi_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- OCPI identifiers
  country_code text NOT NULL CHECK (length(country_code) = 2),
  party_id text NOT NULL CHECK (length(party_id) = 3),
  uid text NOT NULL,                  -- Token UID (RFID, APP_USER, etc.)

  -- Token type
  type text NOT NULL CHECK (type IN ('RFID', 'APP_USER', 'AD_HOC_USER', 'OTHER')),
  contract_id text NOT NULL,          -- Contract ID (eMI3)

  -- Auth
  auth_method text NOT NULL DEFAULT 'AUTH_REQUEST' CHECK (auth_method IN (
    'AUTH_REQUEST', 'COMMAND', 'WHITELIST'
  )),

  -- Visual
  visual_number text,
  issuer text NOT NULL DEFAULT 'EZDrive',

  -- Validity
  valid boolean NOT NULL DEFAULT true,
  whitelist text NOT NULL DEFAULT 'ALLOWED' CHECK (whitelist IN (
    'ALWAYS', 'ALLOWED', 'ALLOWED_OFFLINE', 'NEVER'
  )),

  -- Language
  language text DEFAULT 'fr',

  -- Profile type
  profile_type text CHECK (profile_type IN ('CHEAP', 'FAST', 'GREEN', 'REGULAR') OR profile_type IS NULL),

  -- Internal link
  user_id uuid,  -- Link to ezdrive_profiles

  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(country_code, party_id, uid)
);

-- --------------------------------------------------------
-- 6. OCPI Sessions (sessions de charge en cours)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ocpi_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- OCPI identifiers
  country_code text NOT NULL,
  party_id text NOT NULL,
  session_id text NOT NULL,           -- OCPI session ID

  -- Gireve extension
  gireve_id text,
  authorization_reference text,

  -- Timing
  start_date_time timestamptz NOT NULL,
  end_date_time timestamptz,

  -- Energy
  kwh numeric(10,4) NOT NULL DEFAULT 0,

  -- Token used
  cdr_token jsonb NOT NULL,           -- {country_code, party_id, uid, type, contract_id}

  -- Location
  location_id text NOT NULL,
  evse_uid text NOT NULL,
  connector_id text NOT NULL,

  -- Meter
  meter_id text,

  -- Currency
  currency text NOT NULL DEFAULT 'EUR',
  total_cost jsonb,                   -- {excl_vat: number, incl_vat: number}

  -- Status
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'ACTIVE', 'COMPLETED', 'INVALID', 'PENDING', 'RESERVATION'
  )),

  -- Charging periods
  charging_periods jsonb DEFAULT '[]'::jsonb,

  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(country_code, party_id, session_id)
);

-- --------------------------------------------------------
-- 7. OCPI CDRs (Charge Detail Records — factures finales)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ocpi_cdrs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- OCPI identifiers
  country_code text NOT NULL,
  party_id text NOT NULL,
  cdr_id text NOT NULL,

  -- Gireve extension
  gireve_id text,
  authorization_reference text,

  -- Timing
  start_date_time timestamptz NOT NULL,
  end_date_time timestamptz NOT NULL,

  -- Session link
  session_id text,

  -- Token used
  cdr_token jsonb NOT NULL,

  -- Location snapshot
  cdr_location jsonb NOT NULL,

  -- Meter
  meter_id text,

  -- Energy
  total_energy numeric(10,4) NOT NULL,
  total_time numeric(10,4) NOT NULL,        -- hours
  total_parking_time numeric(10,4),          -- hours

  -- Cost
  currency text NOT NULL DEFAULT 'EUR',
  total_cost numeric(10,4) NOT NULL,
  total_fixed_cost numeric(10,4),
  total_energy_cost numeric(10,4),
  total_time_cost numeric(10,4),
  total_parking_cost numeric(10,4),

  -- Charging periods
  charging_periods jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Tariff
  tariffs jsonb DEFAULT '[]'::jsonb,

  -- Remark
  remark text,

  -- Credit CDR
  credit boolean NOT NULL DEFAULT false,
  credit_reference_id text,

  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(country_code, party_id, cdr_id)
);

-- --------------------------------------------------------
-- 8. OCPI Tariffs (tarification B2B)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ocpi_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- OCPI identifiers
  country_code text NOT NULL,
  party_id text NOT NULL,
  tariff_id text NOT NULL,

  -- Tariff details
  currency text NOT NULL DEFAULT 'EUR',
  type text CHECK (type IN ('AD_HOC_PAYMENT', 'PROFILE_CHEAP', 'PROFILE_FAST', 'PROFILE_GREEN', 'REGULAR') OR type IS NULL),

  -- Tariff elements (pricing rules)
  elements jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{price_components: [{type, price, vat, step_size}], restrictions: {...}}]

  -- Validity
  start_date_time timestamptz,
  end_date_time timestamptz,

  -- Display text
  tariff_alt_text jsonb DEFAULT '[]'::jsonb,
  tariff_alt_url text,

  -- Energy mix
  energy_mix jsonb,

  -- Gireve extension: eMSP-specific tariff
  target_operator_country_code text,
  target_operator_party_id text,

  -- Gireve extension
  gireve_id text,

  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(country_code, party_id, tariff_id, COALESCE(target_operator_country_code, ''), COALESCE(target_operator_party_id, ''))
);

-- --------------------------------------------------------
-- 9. OCPI Commands (START_SESSION, STOP_SESSION, etc.)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ocpi_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Command type
  command text NOT NULL CHECK (command IN (
    'START_SESSION', 'STOP_SESSION', 'RESERVE_NOW', 'CANCEL_RESERVATION', 'UNLOCK_CONNECTOR'
  )),

  -- Source
  source text NOT NULL CHECK (source IN ('RECEIVED', 'SENT')),

  -- Request data
  request_data jsonb NOT NULL,

  -- Response
  response_url text,
  result text CHECK (result IN (
    'ACCEPTED', 'CANCELED_RESERVATION', 'EVSE_OCCUPIED', 'EVSE_INOPERATIVE',
    'FAILED', 'NOT_SUPPORTED', 'REJECTED', 'TIMEOUT', 'UNKNOWN_RESERVATION'
  ) OR result IS NULL),

  -- Callback result
  callback_data jsonb,
  callback_sent boolean NOT NULL DEFAULT false,

  -- Timing
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------
-- 10. OCPI Push Queue (file de messages sortants vers Gireve)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ocpi_push_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What to push
  module text NOT NULL CHECK (module IN ('locations', 'sessions', 'cdrs', 'tariffs', 'tokens')),
  action text NOT NULL CHECK (action IN ('PUT', 'PATCH', 'POST', 'DELETE')),

  -- Object reference
  object_type text NOT NULL,          -- 'location', 'evse', 'connector', 'session', 'cdr', 'tariff', 'token'
  object_id text NOT NULL,

  -- OCPI path
  ocpi_path text NOT NULL,            -- e.g. /locations/FR/EZD/LOC001

  -- Payload
  payload jsonb NOT NULL,

  -- Processing status
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'RETRY')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  last_error text,

  -- FIFO ordering (Store and Forward per Gireve spec)
  priority integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  next_retry_at timestamptz
);

-- --------------------------------------------------------
-- 11. OCPI Push Log (historique des pushes)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ocpi_push_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  module text NOT NULL,
  action text NOT NULL,
  ocpi_path text NOT NULL,

  -- Request
  request_headers jsonb,
  request_body jsonb,

  -- Response
  response_status integer,
  response_body jsonb,

  -- Correlation
  x_request_id text,
  x_correlation_id text,

  -- Timing
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------
-- INDEXES
-- --------------------------------------------------------

-- Locations
CREATE INDEX idx_ocpi_locations_station ON ocpi_locations(station_id);
CREATE INDEX idx_ocpi_locations_ocpi_id ON ocpi_locations(country_code, party_id, ocpi_id);

-- EVSEs
CREATE INDEX idx_ocpi_evses_location ON ocpi_evses(location_id);
CREATE INDEX idx_ocpi_evses_status ON ocpi_evses(status);

-- Connectors
CREATE INDEX idx_ocpi_connectors_evse ON ocpi_connectors(evse_id);

-- Tokens
CREATE INDEX idx_ocpi_tokens_uid ON ocpi_tokens(uid);
CREATE INDEX idx_ocpi_tokens_contract ON ocpi_tokens(contract_id);
CREATE INDEX idx_ocpi_tokens_valid ON ocpi_tokens(valid);

-- Sessions
CREATE INDEX idx_ocpi_sessions_status ON ocpi_sessions(status);
CREATE INDEX idx_ocpi_sessions_dates ON ocpi_sessions(start_date_time, end_date_time);

-- CDRs
CREATE INDEX idx_ocpi_cdrs_dates ON ocpi_cdrs(start_date_time, end_date_time);
CREATE INDEX idx_ocpi_cdrs_session ON ocpi_cdrs(session_id);

-- Tariffs
CREATE INDEX idx_ocpi_tariffs_tariff_id ON ocpi_tariffs(tariff_id);

-- Commands
CREATE INDEX idx_ocpi_commands_type ON ocpi_commands(command, source);

-- Push Queue
CREATE INDEX idx_ocpi_push_queue_status ON ocpi_push_queue(status, priority, created_at);
CREATE INDEX idx_ocpi_push_queue_retry ON ocpi_push_queue(next_retry_at) WHERE status IN ('PENDING', 'RETRY');
CREATE INDEX idx_ocpi_push_queue_module ON ocpi_push_queue(module, object_type, object_id);

-- Push Log
CREATE INDEX idx_ocpi_push_log_module ON ocpi_push_log(module, created_at DESC);
CREATE INDEX idx_ocpi_push_log_correlation ON ocpi_push_log(x_correlation_id);

-- --------------------------------------------------------
-- AUTO-UPDATE TRIGGERS
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION update_ocpi_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ocpi_credentials_updated
  BEFORE UPDATE ON ocpi_credentials
  FOR EACH ROW EXECUTE FUNCTION update_ocpi_updated_at();

CREATE TRIGGER trg_ocpi_commands_updated
  BEFORE UPDATE ON ocpi_commands
  FOR EACH ROW EXECUTE FUNCTION update_ocpi_updated_at();

-- --------------------------------------------------------
-- PUSH QUEUE TRIGGER (auto-queue on station status change)
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION queue_ocpi_evse_status_push()
RETURNS TRIGGER AS $$
DECLARE
  v_location ocpi_locations%ROWTYPE;
  v_evse ocpi_evses%ROWTYPE;
  v_ocpp_to_ocpi text;
BEGIN
  -- Only trigger on status changes
  IF OLD.ocpp_status = NEW.ocpp_status THEN
    RETURN NEW;
  END IF;

  -- Find linked OCPI location
  SELECT * INTO v_location FROM ocpi_locations WHERE station_id = NEW.id LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Find linked EVSE
  SELECT * INTO v_evse FROM ocpi_evses WHERE location_id = v_location.id LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Map OCPP status to OCPI status
  v_ocpp_to_ocpi := CASE NEW.ocpp_status
    WHEN 'Available' THEN 'AVAILABLE'
    WHEN 'Preparing' THEN 'AVAILABLE'
    WHEN 'Charging' THEN 'CHARGING'
    WHEN 'SuspendedEVSE' THEN 'BLOCKED'
    WHEN 'SuspendedEV' THEN 'CHARGING'
    WHEN 'Finishing' THEN 'CHARGING'
    WHEN 'Reserved' THEN 'RESERVED'
    WHEN 'Unavailable' THEN 'INOPERATIVE'
    WHEN 'Faulted' THEN 'OUTOFORDER'
    ELSE 'UNKNOWN'
  END;

  -- Update EVSE status
  UPDATE ocpi_evses SET status = v_ocpp_to_ocpi, last_updated = now() WHERE id = v_evse.id;

  -- Queue PATCH to Gireve
  INSERT INTO ocpi_push_queue (module, action, object_type, object_id, ocpi_path, payload, priority)
  VALUES (
    'locations',
    'PATCH',
    'evse',
    v_evse.uid,
    format('/locations/%s/%s/%s/%s', v_location.country_code, v_location.party_id, v_location.ocpi_id, v_evse.evse_id),
    jsonb_build_object(
      'status', v_ocpp_to_ocpi,
      'last_updated', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ),
    10  -- High priority for real-time status
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_station_ocpi_push
  AFTER UPDATE ON stations
  FOR EACH ROW EXECUTE FUNCTION queue_ocpi_evse_status_push();

-- --------------------------------------------------------
-- RLS POLICIES
-- --------------------------------------------------------

ALTER TABLE ocpi_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocpi_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocpi_evses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocpi_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocpi_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocpi_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocpi_cdrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocpi_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocpi_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocpi_push_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocpi_push_log ENABLE ROW LEVEL SECURITY;

-- Service role (edge functions) can do everything
CREATE POLICY "Service role full access on ocpi_credentials"
  ON ocpi_credentials FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on ocpi_locations"
  ON ocpi_locations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on ocpi_evses"
  ON ocpi_evses FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on ocpi_connectors"
  ON ocpi_connectors FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on ocpi_tokens"
  ON ocpi_tokens FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on ocpi_sessions"
  ON ocpi_sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on ocpi_cdrs"
  ON ocpi_cdrs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on ocpi_tariffs"
  ON ocpi_tariffs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on ocpi_commands"
  ON ocpi_commands FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on ocpi_push_queue"
  ON ocpi_push_queue FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on ocpi_push_log"
  ON ocpi_push_log FOR ALL USING (auth.role() = 'service_role');

-- Authenticated users can read OCPI data
CREATE POLICY "Authenticated read ocpi_locations"
  ON ocpi_locations FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read ocpi_evses"
  ON ocpi_evses FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read ocpi_connectors"
  ON ocpi_connectors FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read ocpi_sessions"
  ON ocpi_sessions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read ocpi_cdrs"
  ON ocpi_cdrs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read ocpi_tariffs"
  ON ocpi_tariffs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read ocpi_push_log"
  ON ocpi_push_log FOR SELECT USING (auth.role() = 'authenticated');

-- --------------------------------------------------------
-- SEED: Initial EZDrive CPO + eMSP credentials (PREPROD)
-- --------------------------------------------------------
INSERT INTO ocpi_credentials (role, country_code, party_id, our_versions_url, our_base_url, platform, gireve_party_id)
VALUES
  ('CPO', 'FR', 'EZD', NULL, NULL, 'PREPROD', '107'),
  ('EMSP', 'FR', 'EZD', NULL, NULL, 'PREPROD', '107')
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------
-- SEED: Default EZDrive tariff (à adapter selon négociation Gireve)
-- --------------------------------------------------------
INSERT INTO ocpi_tariffs (country_code, party_id, tariff_id, currency, type, elements, start_date_time)
VALUES (
  'FR', 'EZD', 'STANDARD-AC',
  'EUR',
  'REGULAR',
  '[{"price_components": [{"type": "ENERGY", "price": 0.35, "step_size": 1}]}]'::jsonb,
  now()
), (
  'FR', 'EZD', 'STANDARD-DC',
  'EUR',
  'REGULAR',
  '[{"price_components": [{"type": "ENERGY", "price": 0.55, "step_size": 1}]}]'::jsonb,
  now()
)
ON CONFLICT DO NOTHING;
