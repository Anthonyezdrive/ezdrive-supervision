-- 036_cpo_isolation.sql
-- Multi-tenant CPO data isolation (RLS)
-- Hierarchy: Level 0 = EZDrive admins (cpo_id NULL → sees everything)
--            Level 1 = CPO users (cpo_id set → sees own + children data)

BEGIN;

-- ============================================================
-- 1. Add cpo_id to ezdrive_profiles
-- ============================================================
ALTER TABLE ezdrive_profiles
  ADD COLUMN IF NOT EXISTS cpo_id uuid REFERENCES cpo_operators(id);

CREATE INDEX IF NOT EXISTS idx_ezdrive_profiles_cpo_id
  ON ezdrive_profiles(cpo_id);

-- ============================================================
-- 2. Helper: get_user_cpo_id()
--    Returns the current authenticated user's assigned cpo_id.
--    NULL means admin/root (sees everything).
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_cpo_id()
RETURNS uuid AS $$
  SELECT cpo_id FROM ezdrive_profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- 3. Helper: user_can_access_cpo(target_cpo_id)
--    TRUE when:
--      - user cpo_id IS NULL  (admin → full access)
--      - user cpo_id = target (direct match)
--      - target's parent_id = user cpo_id (child CPO)
-- ============================================================
CREATE OR REPLACE FUNCTION user_can_access_cpo(target_cpo_id uuid)
RETURNS boolean AS $$
DECLARE
  v_user_cpo uuid;
BEGIN
  SELECT cpo_id INTO v_user_cpo
    FROM ezdrive_profiles
   WHERE id = auth.uid();

  -- NULL cpo_id = admin, sees everything
  IF v_user_cpo IS NULL THEN
    RETURN true;
  END IF;

  -- Direct match
  IF v_user_cpo = target_cpo_id THEN
    RETURN true;
  END IF;

  -- Target is a child of user's CPO
  IF EXISTS (
    SELECT 1 FROM cpo_operators
     WHERE id = target_cpo_id
       AND parent_id = v_user_cpo
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 4. RLS on stations – replace overly-permissive policy
-- ============================================================
DROP POLICY IF EXISTS "auth_read_stations" ON stations;

CREATE POLICY "cpo_scoped_read_stations" ON stations
  FOR SELECT TO authenticated
  USING (user_can_access_cpo(cpo_id));

-- ============================================================
-- 5. RLS on ocpi_cdrs – simple admin-only via RLS,
--    CPO filtering handled by frontend/API for performance
-- ============================================================
ALTER TABLE ocpi_cdrs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cpo_scoped_read_cdrs" ON ocpi_cdrs;

CREATE POLICY "cpo_scoped_read_cdrs" ON ocpi_cdrs
  FOR SELECT TO authenticated
  USING (
    get_user_cpo_id() IS NULL
    OR user_can_access_cpo(
         (SELECT s.cpo_id FROM stations s WHERE s.id = ocpi_cdrs.station_id)
       )
  );

-- ============================================================
-- 6. RLS on ocpp_transactions
--    Uses chargepoint_id (FK to stations.id), not station_id
-- ============================================================
ALTER TABLE ocpp_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cpo_scoped_read_transactions" ON ocpp_transactions;

CREATE POLICY "cpo_scoped_read_transactions" ON ocpp_transactions
  FOR SELECT TO authenticated
  USING (
    get_user_cpo_id() IS NULL
    OR user_can_access_cpo(
         (SELECT s.cpo_id FROM stations s WHERE s.id = ocpp_transactions.chargepoint_id)
       )
  );

-- ============================================================
-- 7. RLS on b2b_clients (direct cpo_id column)
-- ============================================================
ALTER TABLE b2b_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cpo_scoped_read_b2b_clients" ON b2b_clients;

CREATE POLICY "cpo_scoped_read_b2b_clients" ON b2b_clients
  FOR SELECT TO authenticated
  USING (user_can_access_cpo(cpo_id));

-- ============================================================
-- 8. Convenience view: user_accessible_stations
-- ============================================================
CREATE OR REPLACE VIEW user_accessible_stations AS
SELECT se.*
  FROM stations_enriched se
 WHERE user_can_access_cpo(se.cpo_id);

COMMIT;
