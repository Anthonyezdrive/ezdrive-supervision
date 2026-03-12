-- ============================================================
-- EZDrive Migration 024 — Networks, Agreements, Reimbursement
-- GreenFlux parity: roaming CPO/eMSP tables
-- ============================================================

-- ── 1. CPO Networks ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cpo_networks (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type                 text NOT NULL DEFAULT 'internal' CHECK (type IN ('internal', 'external')),
  name                 text NOT NULL,
  remarks              text,
  cpo_contracts_count  int NOT NULL DEFAULT 0,
  agreements_count     int NOT NULL DEFAULT 0,
  updated_by           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cpo_networks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access on cpo_networks" ON cpo_networks;
CREATE POLICY "Authenticated full access on cpo_networks"
  ON cpo_networks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 2. CPO Contracts ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cpo_contracts (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type            text NOT NULL DEFAULT 'internal' CHECK (type IN ('internal', 'external')),
  name            text NOT NULL,
  network_id      uuid REFERENCES cpo_networks(id) ON DELETE SET NULL,
  country_code    text NOT NULL DEFAULT 'FR',
  party_id        text,
  contract_code   text,
  currency        text NOT NULL DEFAULT 'EUR',
  url             text,
  updated_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cpo_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access on cpo_contracts" ON cpo_contracts;
CREATE POLICY "Authenticated full access on cpo_contracts"
  ON cpo_contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 3. eMSP Networks ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS emsp_networks (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type                  text NOT NULL DEFAULT 'internal' CHECK (type IN ('internal', 'external')),
  name                  text NOT NULL,
  remarks               text,
  emsp_contracts_count  int NOT NULL DEFAULT 0,
  agreements_count      int NOT NULL DEFAULT 0,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE emsp_networks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access on emsp_networks" ON emsp_networks;
CREATE POLICY "Authenticated full access on emsp_networks"
  ON emsp_networks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 4. eMSP Contracts ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS emsp_contracts (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type            text NOT NULL DEFAULT 'internal' CHECK (type IN ('internal', 'external')),
  name            text NOT NULL,
  network_id      uuid REFERENCES emsp_networks(id) ON DELETE SET NULL,
  country_code    text NOT NULL DEFAULT 'FR',
  party_id        text,
  contract_code   text,
  currency        text NOT NULL DEFAULT 'EUR',
  url             text,
  updated_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE emsp_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access on emsp_contracts" ON emsp_contracts;
CREATE POLICY "Authenticated full access on emsp_contracts"
  ON emsp_contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 5. eMSP Entities ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS emsp_entities (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type            text NOT NULL DEFAULT 'internal' CHECK (type IN ('internal', 'external')),
  name            text NOT NULL,
  external_id     text,
  network_id      uuid REFERENCES emsp_networks(id) ON DELETE SET NULL,
  contract_id     uuid REFERENCES emsp_contracts(id) ON DELETE SET NULL,
  crm_id          text,
  ocpi_url        text,
  updated_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE emsp_entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access on emsp_entities" ON emsp_entities;
CREATE POLICY "Authenticated full access on emsp_entities"
  ON emsp_entities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 6. Roaming Agreements ────────────────────────────────────

CREATE TABLE IF NOT EXISTS roaming_agreements (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'planned')),
  management            text,
  cpo_network_id        uuid REFERENCES cpo_networks(id) ON DELETE SET NULL,
  cpo_contract_id       uuid REFERENCES cpo_contracts(id) ON DELETE SET NULL,
  emsp_network_id       uuid REFERENCES emsp_networks(id) ON DELETE SET NULL,
  emsp_contract_id      uuid REFERENCES emsp_contracts(id) ON DELETE SET NULL,
  connection_method     text,
  valid_from            date,
  valid_to              date,
  professional_contact  text,
  technical_contact     text,
  remarks               text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE roaming_agreements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access on roaming_agreements" ON roaming_agreements;
CREATE POLICY "Authenticated full access on roaming_agreements"
  ON roaming_agreements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 7. Reimbursement Rules ───────────────────────────────────

CREATE TABLE IF NOT EXISTS reimbursement_rules (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'planned')),
  cpo_network_id      uuid REFERENCES cpo_networks(id) ON DELETE SET NULL,
  cpo_contract_id     uuid REFERENCES cpo_contracts(id) ON DELETE SET NULL,
  cpo_name            text,
  emsp_network_id     uuid REFERENCES emsp_networks(id) ON DELETE SET NULL,
  emsp_contract_id    uuid REFERENCES emsp_contracts(id) ON DELETE SET NULL,
  emsp_name           text,
  agreement_id        uuid REFERENCES roaming_agreements(id) ON DELETE SET NULL,
  valid_from          date,
  valid_to            date,
  price_per_kwh       numeric(10,4) NOT NULL DEFAULT 0,
  price_per_min       numeric(10,4) NOT NULL DEFAULT 0,
  start_fee           numeric(10,2) NOT NULL DEFAULT 0,
  idle_fee_per_min    numeric(10,4) NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'EUR',
  remarks             text,
  updated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reimbursement_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access on reimbursement_rules" ON reimbursement_rules;
CREATE POLICY "Authenticated full access on reimbursement_rules"
  ON reimbursement_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Seed Data ────────────────────────────────────────────────

-- CPO Networks
INSERT INTO cpo_networks (type, name, remarks, cpo_contracts_count, agreements_count, updated_by) VALUES
  ('internal', 'EZDrive Martinique', 'Réseau principal EZDrive', 2, 3, 'admin@ezdrive.eco'),
  ('internal', 'EZDrive Guadeloupe', 'Réseau Guadeloupe', 1, 1, 'admin@ezdrive.eco'),
  ('external', 'Ionity France', 'Réseau autoroute Ionity', 1, 2, 'admin@ezdrive.eco');

-- CPO Contracts
INSERT INTO cpo_contracts (type, name, network_id, country_code, party_id, contract_code, currency, url, updated_by)
SELECT 'internal', 'Contrat CPO Martinique', id, 'MQ', 'EZD', 'CPO-MQ-001', 'EUR', 'https://ezdrive.eco', 'admin@ezdrive.eco'
FROM cpo_networks WHERE name = 'EZDrive Martinique' LIMIT 1;

INSERT INTO cpo_contracts (type, name, network_id, country_code, party_id, contract_code, currency, url, updated_by)
SELECT 'internal', 'Contrat CPO Guadeloupe', id, 'GP', 'EZD', 'CPO-GP-001', 'EUR', 'https://ezdrive.eco', 'admin@ezdrive.eco'
FROM cpo_networks WHERE name = 'EZDrive Guadeloupe' LIMIT 1;

INSERT INTO cpo_contracts (type, name, network_id, country_code, party_id, contract_code, currency, url, updated_by)
SELECT 'external', 'Contrat Ionity', id, 'FR', 'ION', 'CPO-ION-001', 'EUR', 'https://ionity.eu', 'admin@ezdrive.eco'
FROM cpo_networks WHERE name = 'Ionity France' LIMIT 1;

-- eMSP Networks
INSERT INTO emsp_networks (type, name, remarks, emsp_contracts_count, agreements_count, updated_by) VALUES
  ('internal', 'EZDrive eMSP', 'Service eMSP interne EZDrive', 1, 2, 'admin@ezdrive.eco'),
  ('external', 'ChargeMap', 'Réseau ChargeMap France', 1, 1, 'admin@ezdrive.eco'),
  ('external', 'Freshmile', 'Réseau Freshmile', 1, 1, 'admin@ezdrive.eco');

-- eMSP Contracts
INSERT INTO emsp_contracts (type, name, network_id, country_code, party_id, contract_code, currency, url, updated_by)
SELECT 'internal', 'Contrat eMSP EZDrive', id, 'MQ', 'EZD', 'EMSP-EZD-001', 'EUR', 'https://ezdrive.eco', 'admin@ezdrive.eco'
FROM emsp_networks WHERE name = 'EZDrive eMSP' LIMIT 1;

INSERT INTO emsp_contracts (type, name, network_id, country_code, party_id, contract_code, currency, url, updated_by)
SELECT 'external', 'Contrat ChargeMap', id, 'FR', 'CMP', 'EMSP-CMP-001', 'EUR', 'https://chargemap.com', 'admin@ezdrive.eco'
FROM emsp_networks WHERE name = 'ChargeMap' LIMIT 1;

INSERT INTO emsp_contracts (type, name, network_id, country_code, party_id, contract_code, currency, url, updated_by)
SELECT 'external', 'Contrat Freshmile', id, 'FR', 'FRM', 'EMSP-FRM-001', 'EUR', 'https://freshmile.com', 'admin@ezdrive.eco'
FROM emsp_networks WHERE name = 'Freshmile' LIMIT 1;

-- eMSP Entities
INSERT INTO emsp_entities (type, name, external_id, network_id, contract_id, crm_id, ocpi_url, updated_by)
SELECT 'internal', 'EZDrive eMSP Principal', 'EZD-EMSP-001',
  n.id, c.id, 'CRM-001', 'https://api.ezdrive.eco/ocpi', 'admin@ezdrive.eco'
FROM emsp_networks n, emsp_contracts c
WHERE n.name = 'EZDrive eMSP' AND c.name = 'Contrat eMSP EZDrive' LIMIT 1;

INSERT INTO emsp_entities (type, name, external_id, network_id, contract_id, crm_id, ocpi_url, updated_by)
SELECT 'external', 'ChargeMap France', 'CMP-FR-001',
  n.id, c.id, 'CRM-002', 'https://api.chargemap.com/ocpi', 'admin@ezdrive.eco'
FROM emsp_networks n, emsp_contracts c
WHERE n.name = 'ChargeMap' AND c.name = 'Contrat ChargeMap' LIMIT 1;

-- Roaming Agreements
INSERT INTO roaming_agreements (status, management, cpo_network_id, cpo_contract_id, emsp_network_id, emsp_contract_id, connection_method, valid_from, valid_to, professional_contact, technical_contact, remarks, updated_by)
SELECT 'active', 'Bilatéral', cn.id, cc.id, en.id, ec.id,
  'OCPI 2.2.1', '2025-01-01', '2026-12-31',
  'contact@ezdrive.eco', 'tech@ezdrive.eco',
  'Accord roaming interne EZDrive', 'admin@ezdrive.eco'
FROM cpo_networks cn, cpo_contracts cc, emsp_networks en, emsp_contracts ec
WHERE cn.name = 'EZDrive Martinique' AND cc.name = 'Contrat CPO Martinique'
  AND en.name = 'EZDrive eMSP' AND ec.name = 'Contrat eMSP EZDrive' LIMIT 1;

INSERT INTO roaming_agreements (status, management, cpo_network_id, cpo_contract_id, emsp_network_id, emsp_contract_id, connection_method, valid_from, valid_to, professional_contact, technical_contact, remarks, updated_by)
SELECT 'active', 'Hub Gireve', cn.id, cc.id, en.id, ec.id,
  'OCPI 2.2.1 via Gireve', '2025-06-01', '2027-05-31',
  'partenaires@ezdrive.eco', 'tech@ezdrive.eco',
  'Accord roaming ChargeMap via Gireve', 'admin@ezdrive.eco'
FROM cpo_networks cn, cpo_contracts cc, emsp_networks en, emsp_contracts ec
WHERE cn.name = 'EZDrive Martinique' AND cc.name = 'Contrat CPO Martinique'
  AND en.name = 'ChargeMap' AND ec.name = 'Contrat ChargeMap' LIMIT 1;

INSERT INTO roaming_agreements (status, management, cpo_network_id, emsp_network_id, connection_method, valid_from, valid_to, professional_contact, technical_contact, remarks, updated_by)
SELECT 'planned', 'Hub Gireve', cn.id, en.id,
  'OCPI 2.2.1 via Gireve', '2026-06-01', '2028-05-31',
  'partenaires@ezdrive.eco', 'tech@ezdrive.eco',
  'Accord futur Freshmile', 'admin@ezdrive.eco'
FROM cpo_networks cn, emsp_networks en
WHERE cn.name = 'EZDrive Guadeloupe' AND en.name = 'Freshmile' LIMIT 1;

-- Reimbursement Rules
INSERT INTO reimbursement_rules (status, cpo_network_id, cpo_contract_id, cpo_name, emsp_network_id, emsp_contract_id, emsp_name, valid_from, valid_to, price_per_kwh, price_per_min, start_fee, idle_fee_per_min, currency, remarks, updated_by)
SELECT 'active', cn.id, cc.id, 'EZDrive Martinique', en.id, ec.id, 'EZDrive eMSP',
  '2025-01-01', '2026-12-31', 0.35, 0.05, 1.00, 0.10, 'EUR',
  'Tarif interne standard', 'admin@ezdrive.eco'
FROM cpo_networks cn, cpo_contracts cc, emsp_networks en, emsp_contracts ec
WHERE cn.name = 'EZDrive Martinique' AND cc.name = 'Contrat CPO Martinique'
  AND en.name = 'EZDrive eMSP' AND ec.name = 'Contrat eMSP EZDrive' LIMIT 1;

INSERT INTO reimbursement_rules (status, cpo_network_id, cpo_contract_id, cpo_name, emsp_network_id, emsp_contract_id, emsp_name, valid_from, valid_to, price_per_kwh, price_per_min, start_fee, idle_fee_per_min, currency, remarks, updated_by)
SELECT 'active', cn.id, cc.id, 'EZDrive Martinique', en.id, ec.id, 'ChargeMap',
  '2025-06-01', '2027-05-31', 0.42, 0.08, 1.50, 0.15, 'EUR',
  'Tarif roaming ChargeMap', 'admin@ezdrive.eco'
FROM cpo_networks cn, cpo_contracts cc, emsp_networks en, emsp_contracts ec
WHERE cn.name = 'EZDrive Martinique' AND cc.name = 'Contrat CPO Martinique'
  AND en.name = 'ChargeMap' AND ec.name = 'Contrat ChargeMap' LIMIT 1;

INSERT INTO reimbursement_rules (status, cpo_name, emsp_name, valid_from, valid_to, price_per_kwh, price_per_min, start_fee, idle_fee_per_min, currency, remarks, updated_by) VALUES
  ('expired', 'EZDrive Martinique', 'Ancien partenaire', '2024-01-01', '2024-12-31', 0.30, 0.04, 0.50, 0.08, 'EUR', 'Ancien tarif expiré', 'admin@ezdrive.eco');

-- ── updated_at trigger function ──────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON cpo_networks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON cpo_contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON emsp_networks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON emsp_contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON emsp_entities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON roaming_agreements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON reimbursement_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
