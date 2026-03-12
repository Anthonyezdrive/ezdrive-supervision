-- ============================================
-- EZDrive Admin CRM — Phase 3
-- Gestion clients, RFID, abonnements (admin)
-- ============================================

-- 1. Extension trigram pour recherche floue
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Colonnes admin sur consumer_profiles
ALTER TABLE consumer_profiles
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_consumer_search
  ON consumer_profiles USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_consumer_active
  ON consumer_profiles (is_active);
CREATE INDEX IF NOT EXISTS idx_consumer_type
  ON consumer_profiles (user_type);
CREATE INDEX IF NOT EXISTS idx_consumer_email_search
  ON consumer_profiles USING gin (email gin_trgm_ops);

-- 3. Colonnes admin sur user_subscriptions
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS admin_notes text;

-- 4. Colonnes admin sur rfid_cards
ALTER TABLE rfid_cards
  ADD COLUMN IF NOT EXISTS managed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS admin_notes text;

-- 5. RLS : admin peut gérer consumer_profiles
CREATE POLICY "admins_manage_consumers"
  ON consumer_profiles FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  );

-- 6. RLS : admin peut gérer user_subscriptions
CREATE POLICY "admins_manage_all_subs"
  ON user_subscriptions FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  );

-- 7. RLS : admin peut gérer rfid_cards
CREATE POLICY "admins_manage_all_rfid"
  ON rfid_cards FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
  );

-- 8. RPC : top clients par consommation
CREATE OR REPLACE FUNCTION get_top_customers_by_usage(limit_count integer DEFAULT 5)
RETURNS TABLE (
  consumer_id uuid,
  full_name text,
  email text,
  total_energy_kwh numeric,
  session_count bigint
) AS $$
  SELECT
    t.consumer_id,
    cp.full_name,
    cp.email,
    COALESCE(SUM(t.energy_kwh), 0) as total_energy_kwh,
    COUNT(*) as session_count
  FROM ocpp_transactions t
  JOIN consumer_profiles cp ON cp.id = t.consumer_id
  WHERE t.consumer_id IS NOT NULL
    AND t.energy_kwh IS NOT NULL
  GROUP BY t.consumer_id, cp.full_name, cp.email
  ORDER BY total_energy_kwh DESC
  LIMIT limit_count;
$$ LANGUAGE sql SECURITY DEFINER;

-- 9. Fix trigger : ignorer les consumers créés par admin
CREATE OR REPLACE FUNCTION handle_new_ezdrive_user()
RETURNS trigger AS $$
BEGIN
  -- Ne pas créer de profil ezdrive pour les consumers créés par admin
  IF NEW.raw_user_meta_data->>'created_by_admin' = 'true' THEN
    RETURN NEW;
  END IF;
  INSERT INTO ezdrive_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
