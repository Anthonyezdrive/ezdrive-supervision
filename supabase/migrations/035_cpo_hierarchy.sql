-- ============================================
-- 035 — CPO Hierarchy (3-level model)
--
-- Level 0: EZDrive (eMSP root)
-- Level 1: CPOs (EZDrive AG, EZDrive Réunion, V-CiTY AG, V-CiTY Réunion, TotalEnergies)
-- Level 2: Sub-CPOs (B2B enterprise clients)
-- ============================================

BEGIN;

-- ─────────────────────────────────────────────
-- 1. ALTER cpo_operators — add hierarchy columns
-- ─────────────────────────────────────────────

ALTER TABLE cpo_operators
  ADD COLUMN IF NOT EXISTS parent_id       uuid REFERENCES cpo_operators(id),
  ADD COLUMN IF NOT EXISTS level           smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_white_label  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS logo_url        text,
  ADD COLUMN IF NOT EXISTS territory_ids   uuid[],
  ADD COLUMN IF NOT EXISTS description     text;

-- ─────────────────────────────────────────────
-- 2. UPDATE EZDrive → Level 0 eMSP root
-- ─────────────────────────────────────────────

UPDATE cpo_operators
SET
  level       = 0,
  parent_id   = NULL,
  description = 'eMSP — Plateforme de supervision'
WHERE id = '7ca93115-2c35-412d-ada5-df4f45cb942e';

-- ─────────────────────────────────────────────
-- 3. INSERT Level 1 CPOs
-- ─────────────────────────────────────────────

-- EZDrive AG
INSERT INTO cpo_operators (name, code, color, parent_id, level, is_white_label, territory_ids, description)
VALUES (
  'EZDrive AG',
  'ezdrive-ag',
  '#00D4AA',
  '7ca93115-2c35-412d-ada5-df4f45cb942e',
  1,
  false,
  ARRAY[
    'dba538fa-4e69-4c8a-a1c6-1234f4f9f372'::uuid,  -- 971 Guadeloupe
    'a32dcf77-a21e-455a-84f0-ba4817e767d4'::uuid,  -- 972 Martinique
    'c0b62118-c0e7-4540-a8a8-a9c85d775de9'::uuid   -- 973 Guyane
  ],
  'CPO EZDrive — Antilles-Guyane'
)
ON CONFLICT (code) DO UPDATE SET
  parent_id      = EXCLUDED.parent_id,
  level          = EXCLUDED.level,
  is_white_label = EXCLUDED.is_white_label,
  territory_ids  = EXCLUDED.territory_ids,
  description    = EXCLUDED.description,
  color          = EXCLUDED.color;

-- EZDrive Réunion
INSERT INTO cpo_operators (name, code, color, parent_id, level, is_white_label, territory_ids, description)
VALUES (
  'EZDrive Réunion',
  'ezdrive-reunion',
  '#00D4AA',
  '7ca93115-2c35-412d-ada5-df4f45cb942e',
  1,
  false,
  ARRAY[
    '53045774-7169-4a9d-8e59-16b15629f4d9'::uuid   -- 974 Réunion
  ],
  'CPO EZDrive — Réunion'
)
ON CONFLICT (code) DO UPDATE SET
  parent_id      = EXCLUDED.parent_id,
  level          = EXCLUDED.level,
  is_white_label = EXCLUDED.is_white_label,
  territory_ids  = EXCLUDED.territory_ids,
  description    = EXCLUDED.description,
  color          = EXCLUDED.color;

-- V-CiTY AG
INSERT INTO cpo_operators (name, code, color, parent_id, level, is_white_label, territory_ids, description)
VALUES (
  'V-CiTY AG',
  'vcity-ag',
  '#6366F1',
  '7ca93115-2c35-412d-ada5-df4f45cb942e',
  1,
  true,
  ARRAY[
    'dba538fa-4e69-4c8a-a1c6-1234f4f9f372'::uuid,  -- 971 Guadeloupe
    'a32dcf77-a21e-455a-84f0-ba4817e767d4'::uuid,  -- 972 Martinique
    'c0b62118-c0e7-4540-a8a8-a9c85d775de9'::uuid   -- 973 Guyane
  ],
  'White-label V-CiTY — Antilles-Guyane'
)
ON CONFLICT (code) DO UPDATE SET
  parent_id      = EXCLUDED.parent_id,
  level          = EXCLUDED.level,
  is_white_label = EXCLUDED.is_white_label,
  territory_ids  = EXCLUDED.territory_ids,
  description    = EXCLUDED.description,
  color          = EXCLUDED.color;

-- V-CiTY Réunion
INSERT INTO cpo_operators (name, code, color, parent_id, level, is_white_label, territory_ids, description)
VALUES (
  'V-CiTY Réunion',
  'vcity-reunion',
  '#6366F1',
  '7ca93115-2c35-412d-ada5-df4f45cb942e',
  1,
  true,
  ARRAY[
    '53045774-7169-4a9d-8e59-16b15629f4d9'::uuid   -- 974 Réunion
  ],
  'White-label V-CiTY — Réunion'
)
ON CONFLICT (code) DO UPDATE SET
  parent_id      = EXCLUDED.parent_id,
  level          = EXCLUDED.level,
  is_white_label = EXCLUDED.is_white_label,
  territory_ids  = EXCLUDED.territory_ids,
  description    = EXCLUDED.description,
  color          = EXCLUDED.color;

-- ─────────────────────────────────────────────
-- 4. UPDATE TotalEnergies → Level 1
-- ─────────────────────────────────────────────

UPDATE cpo_operators
SET
  level          = 1,
  parent_id      = '7ca93115-2c35-412d-ada5-df4f45cb942e',
  is_white_label = true,
  territory_ids  = ARRAY[
    'dba538fa-4e69-4c8a-a1c6-1234f4f9f372'::uuid,
    'a32dcf77-a21e-455a-84f0-ba4817e767d4'::uuid,
    'c0b62118-c0e7-4540-a8a8-a9c85d775de9'::uuid
  ]
WHERE id = 'b865b7cd-2a90-46f2-b202-5c509d43be03';

-- ─────────────────────────────────────────────
-- 5. UPDATE OCPP Direct & ROAD EZDrive → Level 1
-- ─────────────────────────────────────────────

UPDATE cpo_operators
SET
  level     = 1,
  parent_id = '7ca93115-2c35-412d-ada5-df4f45cb942e'
WHERE id IN (
  'f5445e11-057e-4350-b272-b1cdf890e632',  -- OCPP Direct
  '760c774a-527e-4d3c-957c-0fc55699f529'   -- ROAD EZDrive
);

-- ─────────────────────────────────────────────
-- 6. Reassign stations from old "EZDrive" CPO
--    to new EZDrive AG / EZDrive Réunion
-- ─────────────────────────────────────────────

DO $$
DECLARE
  v_ezdrive_ag_id      uuid;
  v_ezdrive_reunion_id uuid;
  v_reunion_territory  uuid := '53045774-7169-4a9d-8e59-16b15629f4d9';
BEGIN
  -- Fetch the IDs of newly created CPOs
  SELECT id INTO v_ezdrive_ag_id
    FROM cpo_operators WHERE code = 'ezdrive-ag';

  SELECT id INTO v_ezdrive_reunion_id
    FROM cpo_operators WHERE code = 'ezdrive-reunion';

  IF v_ezdrive_ag_id IS NULL OR v_ezdrive_reunion_id IS NULL THEN
    RAISE EXCEPTION 'Could not find ezdrive-ag or ezdrive-reunion CPOs';
  END IF;

  -- Stations in Réunion → EZDrive Réunion
  UPDATE stations
  SET cpo_id = v_ezdrive_reunion_id
  WHERE cpo_id = '7ca93115-2c35-412d-ada5-df4f45cb942e'
    AND territory_id = v_reunion_territory;

  RAISE NOTICE 'Reassigned % Réunion stations to EZDrive Réunion', FOUND;

  -- All remaining EZDrive stations → EZDrive AG
  UPDATE stations
  SET cpo_id = v_ezdrive_ag_id
  WHERE cpo_id = '7ca93115-2c35-412d-ada5-df4f45cb942e';

  RAISE NOTICE 'Reassigned % remaining stations to EZDrive AG', FOUND;
END;
$$;

-- Also reassign station_cpo_overrides
DO $$
DECLARE
  v_ezdrive_ag_id      uuid;
  v_ezdrive_reunion_id uuid;
  v_reunion_territory  uuid := '53045774-7169-4a9d-8e59-16b15629f4d9';
BEGIN
  SELECT id INTO v_ezdrive_ag_id
    FROM cpo_operators WHERE code = 'ezdrive-ag';

  SELECT id INTO v_ezdrive_reunion_id
    FROM cpo_operators WHERE code = 'ezdrive-reunion';

  IF v_ezdrive_ag_id IS NULL OR v_ezdrive_reunion_id IS NULL THEN
    RAISE EXCEPTION 'Could not find ezdrive-ag or ezdrive-reunion CPOs';
  END IF;

  -- Overrides for Réunion stations → EZDrive Réunion
  UPDATE station_cpo_overrides o
  SET cpo_id = v_ezdrive_reunion_id
  WHERE o.cpo_id = '7ca93115-2c35-412d-ada5-df4f45cb942e'
    AND EXISTS (
      SELECT 1 FROM stations s
      WHERE s.gfx_id = o.gfx_id
        AND s.territory_id = v_reunion_territory
    );

  -- Remaining overrides → EZDrive AG
  UPDATE station_cpo_overrides
  SET cpo_id = v_ezdrive_ag_id
  WHERE cpo_id = '7ca93115-2c35-412d-ada5-df4f45cb942e';
END;
$$;

-- ─────────────────────────────────────────────
-- 7. Add cpo_id to b2b_clients (sub-CPO link)
-- ─────────────────────────────────────────────

ALTER TABLE b2b_clients
  ADD COLUMN IF NOT EXISTS cpo_id uuid REFERENCES cpo_operators(id);

-- ─────────────────────────────────────────────
-- 8. Indexes
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_cpo_operators_parent_id ON cpo_operators(parent_id);
CREATE INDEX IF NOT EXISTS idx_b2b_clients_cpo_id      ON b2b_clients(cpo_id);

-- ─────────────────────────────────────────────
-- 9. RLS — authenticated users can read cpo_operators
-- ─────────────────────────────────────────────

ALTER TABLE cpo_operators ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cpo_operators'
      AND policyname = 'Authenticated users can read cpo_operators'
  ) THEN
    CREATE POLICY "Authenticated users can read cpo_operators"
      ON cpo_operators
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END;
$$;

COMMIT;
