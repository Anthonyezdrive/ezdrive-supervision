-- ============================================================
-- EZDrive — Maintenance Tickets
-- Operational ticket management for faulted stations
-- ============================================================

CREATE TABLE IF NOT EXISTS maintenance_tickets (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id      uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  station_name    text,
  title           text NOT NULL,
  description     text,
  status          text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'in_progress', 'resolved', 'closed')),
  priority        text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assigned_to     text,
  resolution_note text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_station
  ON maintenance_tickets (station_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_status
  ON maintenance_tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_priority
  ON maintenance_tickets (priority, status);

CREATE TRIGGER trg_maintenance_tickets_updated_at
  BEFORE UPDATE ON maintenance_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE maintenance_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_maintenance_tickets"
  ON maintenance_tickets FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_maintenance_tickets"
  ON maintenance_tickets FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update_maintenance_tickets"
  ON maintenance_tickets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_delete_maintenance_tickets"
  ON maintenance_tickets FOR DELETE TO authenticated USING (true);
