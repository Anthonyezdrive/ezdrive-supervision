-- Reservation System: OCPP ReserveNow + OCPI Reservations

CREATE TYPE reservation_status AS ENUM ('pending', 'active', 'completed', 'cancelled', 'expired', 'no_show');

CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  consumer_id uuid REFERENCES consumer_profiles(id) ON DELETE SET NULL,
  station_id uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  evse_uid text,
  connector_id int DEFAULT 1,
  ocpp_reservation_id int, -- ID used in OCPP ReserveNow
  id_tag text, -- RFID token for authorization
  status reservation_status NOT NULL DEFAULT 'pending',
  start_time timestamptz NOT NULL DEFAULT now(),
  expiry_time timestamptz NOT NULL,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  no_show_fee_cents int DEFAULT 0,
  no_show_grace_minutes int DEFAULT 15,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_reservations_station ON reservations(station_id, status);
CREATE INDEX idx_reservations_user ON reservations(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_reservations_active ON reservations(station_id, evse_uid) WHERE status IN ('pending', 'active');
CREATE INDEX idx_reservations_expiry ON reservations(expiry_time) WHERE status IN ('pending', 'active');

-- Sequence for OCPP reservation IDs (must be int)
CREATE SEQUENCE IF NOT EXISTS ocpp_reservation_id_seq START 1000;

-- Function: expire reservations
CREATE OR REPLACE FUNCTION expire_reservations() RETURNS int AS $$
DECLARE
  v_count int;
BEGIN
  WITH expired AS (
    UPDATE reservations
    SET status = 'expired', updated_at = now()
    WHERE status IN ('pending', 'active')
      AND expiry_time < now()
    RETURNING id, user_id, station_id, no_show_fee_cents
  )
  SELECT count(*) INTO v_count FROM expired;

  -- TODO: trigger no-show fee calculation and push notifications

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Check for conflicting reservations
CREATE OR REPLACE FUNCTION check_reservation_conflict(
  p_station_id uuid,
  p_evse_uid text,
  p_start_time timestamptz,
  p_expiry_time timestamptz
) RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM reservations
    WHERE station_id = p_station_id
      AND (p_evse_uid IS NULL OR evse_uid = p_evse_uid)
      AND status IN ('pending', 'active')
      AND start_time < p_expiry_time
      AND expiry_time > p_start_time
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- RLS
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own reservations" ON reservations FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator')
  ));
CREATE POLICY "Service full reservations" ON reservations FOR ALL TO service_role USING (true) WITH CHECK (true);
