-- ============================================================
-- X-DRIVE Multi-Tenant Partner Portal Schema
-- ============================================================

-- Partner configuration (theming, modules, portal settings)
CREATE TABLE IF NOT EXISTS xdrive_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  b2b_client_id UUID REFERENCES b2b_clients(id) ON DELETE CASCADE,
  partner_code TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  portal_subdomain TEXT,
  logo_url TEXT,
  theme_config JSONB DEFAULT '{
    "primaryColor": "#1B3A5C",
    "accentColor": "#5BB033",
    "logoHeight": 40
  }',
  enabled_modules TEXT[] DEFAULT ARRAY['dashboard','cdrs','breakdown','exports'],
  contact_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- BPU pricing configuration per partner
CREATE TABLE IF NOT EXISTS xdrive_bpu_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES xdrive_partners(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  -- Fixed fees
  supervision_monthly NUMERIC NOT NULL DEFAULT 3750,
  support_monthly_per_territory NUMERIC NOT NULL DEFAULT 1950,
  support_territories INTEGER NOT NULL DEFAULT 3,
  floor_monthly NUMERIC NOT NULL DEFAULT 9000,
  -- Pricing tiers (by PdC count range)
  pricing_tiers JSONB NOT NULL DEFAULT '[
    {
      "min_pdc": 1, "max_pdc": 249,
      "ac22_public": 14.90, "ac_privatif": 9.90, "dc_50_100": 49.90
    },
    {
      "min_pdc": 250, "max_pdc": 499,
      "ac22_public": 13.90, "ac_privatif": 7.90, "dc_50_100": 44.90
    },
    {
      "min_pdc": 500, "max_pdc": null,
      "ac22_public": 12.90, "ac_privatif": 6.90, "dc_50_100": 44.90
    }
  ]',
  -- Transaction rates by PdC type
  transaction_rates JSONB NOT NULL DEFAULT '{
    "ac22_privatif": 0.1714,
    "dc25_privatif": 0.1750,
    "ac_dc_public": 0.3300
  }',
  -- Optional services catalog
  optional_services JSONB DEFAULT '[
    {"code": "app_version", "label": "Diffusion version app", "unit_price": 290, "unit": "par version"},
    {"code": "formation", "label": "Jeton formation EZAcademy", "unit_price": 980, "unit": "par jeton"},
    {"code": "pilotage_puissance", "label": "Paramétrage dynamique puissance", "unit_price": 950, "unit": "par grappe"},
    {"code": "signal_edf", "label": "Pilotage signal EDF SEI", "unit_price": 99, "unit": "par an par PdC"}
  ]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monthly financial reconciliation
CREATE TABLE IF NOT EXISTS xdrive_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES xdrive_partners(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  -- CA from CDRs
  ca_cdrs_ht NUMERIC DEFAULT 0,
  ca_cdrs_ttc NUMERIC DEFAULT 0,
  sessions_count INTEGER DEFAULT 0,
  energy_kwh NUMERIC DEFAULT 0,
  -- Encaissements by channel
  encaissements_cb NUMERIC DEFAULT 0,
  encaissements_emsp NUMERIC DEFAULT 0,
  encaissements_app NUMERIC DEFAULT 0,
  total_encaisse NUMERIC DEFAULT 0,
  -- Computed
  ecart_brut NUMERIC DEFAULT 0,
  ecart_details JSONB DEFAULT '{}',
  -- Workflow
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'verified', 'approved')),
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(partner_id, period_month)
);

-- BPU invoices SURAYA → Partner
CREATE TABLE IF NOT EXISTS xdrive_bpu_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES xdrive_partners(id) ON DELETE CASCADE,
  invoice_number TEXT UNIQUE NOT NULL,
  period_month DATE NOT NULL,
  -- Calculated amounts
  supervision_amount NUMERIC DEFAULT 0,
  connectivity_amount NUMERIC DEFAULT 0,
  transaction_amount NUMERIC DEFAULT 0,
  floor_applied BOOLEAN DEFAULT FALSE,
  support_amount NUMERIC DEFAULT 0,
  optional_amount NUMERIC DEFAULT 0,
  total_ht NUMERIC DEFAULT 0,
  tva_rate NUMERIC DEFAULT 0.085,
  tva_amount NUMERIC DEFAULT 0,
  total_ttc NUMERIC DEFAULT 0,
  -- Detail
  line_items JSONB NOT NULL DEFAULT '[]',
  pdc_inventory JSONB DEFAULT '{}',
  -- Workflow
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'validated', 'sent', 'paid')),
  validated_by UUID REFERENCES auth.users(id),
  validated_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partner invoices Partner → EZDrive
CREATE TABLE IF NOT EXISTS xdrive_partner_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES xdrive_partners(id) ON DELETE CASCADE,
  invoice_number TEXT,
  period_month DATE NOT NULL,
  ca_reseau_ttc NUMERIC DEFAULT 0,
  facture_bpu_ref UUID REFERENCES xdrive_bpu_invoices(id),
  facture_bpu_amount NUMERIC DEFAULT 0,
  solde_net NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'sent', 'paid', 'disputed')),
  generated_by UUID REFERENCES auth.users(id),
  generated_at TIMESTAMPTZ,
  pdf_url TEXT,
  cdr_annexe_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_xdrive_partners_client ON xdrive_partners(b2b_client_id);
CREATE INDEX idx_xdrive_bpu_config_partner ON xdrive_bpu_config(partner_id);
CREATE INDEX idx_xdrive_reconciliations_partner_month ON xdrive_reconciliations(partner_id, period_month);
CREATE INDEX idx_xdrive_bpu_invoices_partner ON xdrive_bpu_invoices(partner_id, period_month);
CREATE INDEX idx_xdrive_partner_invoices_partner ON xdrive_partner_invoices(partner_id, period_month);

-- RLS Policies
ALTER TABLE xdrive_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE xdrive_bpu_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE xdrive_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE xdrive_bpu_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE xdrive_partner_invoices ENABLE ROW LEVEL SECURITY;

-- Admin/operator can see all
CREATE POLICY xdrive_partners_admin ON xdrive_partners FOR ALL
  USING (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator')));

CREATE POLICY xdrive_bpu_config_admin ON xdrive_bpu_config FOR ALL
  USING (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator')));

CREATE POLICY xdrive_reconciliations_admin ON xdrive_reconciliations FOR ALL
  USING (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator')));

CREATE POLICY xdrive_bpu_invoices_admin ON xdrive_bpu_invoices FOR ALL
  USING (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator')));

CREATE POLICY xdrive_partner_invoices_admin ON xdrive_partner_invoices FOR ALL
  USING (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator')));

-- B2B clients can see their own partner data
CREATE POLICY xdrive_partners_b2b ON xdrive_partners FOR SELECT
  USING (b2b_client_id IN (
    SELECT b2b_client_id FROM b2b_client_access WHERE user_id = auth.uid()
  ));

CREATE POLICY xdrive_reconciliations_b2b ON xdrive_reconciliations FOR SELECT
  USING (partner_id IN (
    SELECT xp.id FROM xdrive_partners xp
    JOIN b2b_client_access bca ON bca.b2b_client_id = xp.b2b_client_id
    WHERE bca.user_id = auth.uid()
  ));

CREATE POLICY xdrive_bpu_invoices_b2b ON xdrive_bpu_invoices FOR SELECT
  USING (partner_id IN (
    SELECT xp.id FROM xdrive_partners xp
    JOIN b2b_client_access bca ON bca.b2b_client_id = xp.b2b_client_id
    WHERE bca.user_id = auth.uid()
  ));

CREATE POLICY xdrive_partner_invoices_b2b ON xdrive_partner_invoices FOR ALL
  USING (partner_id IN (
    SELECT xp.id FROM xdrive_partners xp
    JOIN b2b_client_access bca ON bca.b2b_client_id = xp.b2b_client_id
    WHERE bca.user_id = auth.uid()
  ));

-- ============================================================
-- Seed TotalEnergies as X-DRIVE partner
-- ============================================================

INSERT INTO xdrive_partners (b2b_client_id, partner_code, display_name, portal_subdomain, theme_config, enabled_modules, contact_email)
SELECT
  id,
  'total',
  'TotalEnergies',
  'total.ezdrive.re',
  '{"primaryColor": "#FF0000", "accentColor": "#1B3A5C", "secondaryColor": "#003366", "logoHeight": 44}',
  ARRAY['dashboard', 'cdrs', 'breakdown', 'reconciliation', 'bpu', 'billing', 'exports'],
  'total-drive@totalenergies.com'
FROM b2b_clients
WHERE slug = 'total-energies'
ON CONFLICT DO NOTHING;

-- Seed BPU config for Total (effective from Jan 2024 as per CSM)
INSERT INTO xdrive_bpu_config (partner_id, effective_from)
SELECT id, '2024-01-01'
FROM xdrive_partners WHERE partner_code = 'total'
ON CONFLICT DO NOTHING;
