-- ============================================
-- EZDrive Admin Stations & Smart Charging — Phase 3b
-- CRUD stations dashboard + OCPP Smart Charging profiles
-- ============================================

-- --------------------------------------------------------
-- 1. RLS : Admin peut gérer les stations (INSERT/UPDATE/DELETE)
-- --------------------------------------------------------
-- Note: service_write_stations (service_role ALL) existe déjà (migration 002)
-- On ajoute une policy pour admin/operator authenticated

CREATE POLICY "admins_manage_stations"
  ON stations FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  );

-- Admin peut aussi gérer les chargepoints
CREATE POLICY "admins_manage_chargepoints"
  ON ocpp_chargepoints FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  );

-- Admin peut lire/écrire dans station_status_log
CREATE POLICY "admins_manage_status_log"
  ON station_status_log FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  );

-- --------------------------------------------------------
-- 2. Ajouter 'manual' comme source valide pour les stations
-- --------------------------------------------------------
ALTER TABLE stations DROP CONSTRAINT IF EXISTS stations_source_check;
ALTER TABLE stations ADD CONSTRAINT stations_source_check
  CHECK (source IN ('gfx', 'road', 'ocpp', 'manual'));

-- Relâcher la contrainte d'ID pour les stations manuelles
ALTER TABLE stations DROP CONSTRAINT IF EXISTS chk_station_has_id;
ALTER TABLE stations ALTER COLUMN gfx_id DROP NOT NULL;

-- --------------------------------------------------------
-- 3. Ajouter GetCompositeSchedule au command_queue
-- --------------------------------------------------------
ALTER TABLE ocpp_command_queue DROP CONSTRAINT IF EXISTS ocpp_command_queue_command_check;
ALTER TABLE ocpp_command_queue ADD CONSTRAINT ocpp_command_queue_command_check
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
    'GetCompositeSchedule',
    'GetDiagnostics',
    'UpdateFirmware',
    'ChangeAvailability'
  ));

-- --------------------------------------------------------
-- 4. Table charging_profiles (historique + profils actifs)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS charging_profiles (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chargepoint_id  uuid NOT NULL REFERENCES ocpp_chargepoints(id) ON DELETE CASCADE,
  connector_id    int NOT NULL DEFAULT 0,  -- 0 = all connectors

  -- OCPP ChargingProfile fields (OCPP 1.6 Section 7.8)
  stack_level     int NOT NULL DEFAULT 0,
  purpose         text NOT NULL DEFAULT 'TxDefaultProfile'
                    CHECK (purpose IN ('ChargePointMaxProfile', 'TxDefaultProfile', 'TxProfile')),
  kind            text NOT NULL DEFAULT 'Relative'
                    CHECK (kind IN ('Absolute', 'Recurring', 'Relative')),
  recurrency_kind text CHECK (recurrency_kind IN ('Daily', 'Weekly') OR recurrency_kind IS NULL),
  valid_from      timestamptz,
  valid_to        timestamptz,

  -- Charging schedule (jsonb)
  -- Format: { duration, startSchedule, chargingRateUnit, chargingSchedulePeriod[] }
  schedule        jsonb NOT NULL,

  -- Management
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES auth.users(id),
  command_id      uuid REFERENCES ocpp_command_queue(id),
  admin_notes     text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cp_chargepoint ON charging_profiles (chargepoint_id);
CREATE INDEX IF NOT EXISTS idx_cp_active ON charging_profiles (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cp_purpose ON charging_profiles (purpose);

-- Auto-update trigger
CREATE TRIGGER trg_charging_profiles_updated_at
  BEFORE UPDATE ON charging_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE charging_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_charging_profiles"
  ON charging_profiles FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  );

CREATE POLICY "service_manage_charging_profiles"
  ON charging_profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);
