-- ============================================================
-- Migration 027: Consumer Charging RLS Policies
-- Allow consumer (mobile app) users to:
--   1. INSERT charging commands (RemoteStart/Stop only)
--   2. VIEW their own command status
--   3. READ meter values for their own transactions
-- ============================================================

-- ─── 1. Consumer can insert charging commands ────────────────
-- The Edge Function uses service_role (bypasses RLS), but this
-- policy adds defense-in-depth if client ever calls directly.

CREATE POLICY "consumers_insert_charging_commands"
  ON ocpp_command_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND command IN ('RemoteStartTransaction', 'RemoteStopTransaction')
  );

-- ─── 2. Consumer can view their own commands ─────────────────

CREATE POLICY "consumers_view_own_commands"
  ON ocpp_command_queue
  FOR SELECT
  TO authenticated
  USING (requested_by = auth.uid());

-- ─── 3. Consumer can read meter values for their transactions ─

CREATE POLICY "consumers_read_own_meter_values"
  ON ocpp_meter_values
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ocpp_transactions t
      WHERE t.id = ocpp_meter_values.transaction_id
        AND t.consumer_id = auth.uid()
    )
  );

-- ─── 4. Consumer can read their own active transactions ──────
-- (extends 016_ocpp_consumer_link which only had SELECT)

-- Already exists from 016: "Consumers can view their own OCPP transactions"
-- This is a no-op if already applied. Add only if missing:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ocpp_transactions'
      AND policyname = 'Consumers can view their own OCPP transactions'
  ) THEN
    EXECUTE 'CREATE POLICY "Consumers can view their own OCPP transactions"
      ON ocpp_transactions FOR SELECT TO authenticated
      USING (consumer_id = auth.uid())';
  END IF;
END $$;
