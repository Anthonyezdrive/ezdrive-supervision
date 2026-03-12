-- ============================================================
-- Migration 016: OCPP Consumer Link
-- Links OCPP transactions to consumer app users
-- Enables unified session history (ROAD + OCPP)
-- ============================================================

-- 1) Add consumer_id column to ocpp_transactions
ALTER TABLE ocpp_transactions ADD COLUMN IF NOT EXISTS consumer_id uuid REFERENCES auth.users(id);

-- 2) Index for fast lookups by consumer
CREATE INDEX IF NOT EXISTS idx_ocpp_tx_consumer ON ocpp_transactions (consumer_id) WHERE consumer_id IS NOT NULL;

-- 3) RLS policy: consumers can view their own OCPP transactions
-- (admins/operators already have access via is_ezdrive_admin() policies)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ocpp_transactions' AND policyname = 'Consumers can view their own OCPP transactions'
  ) THEN
    CREATE POLICY "Consumers can view their own OCPP transactions"
      ON ocpp_transactions FOR SELECT
      USING (consumer_id = auth.uid());
  END IF;
END $$;

-- 4) RLS policy: consumers can view meter values for their transactions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ocpp_meter_values' AND policyname = 'Consumers can view meter values of their transactions'
  ) THEN
    CREATE POLICY "Consumers can view meter values of their transactions"
      ON ocpp_meter_values FOR SELECT
      USING (
        transaction_id IN (
          SELECT id FROM ocpp_transactions WHERE consumer_id = auth.uid()
        )
      );
  END IF;
END $$;
