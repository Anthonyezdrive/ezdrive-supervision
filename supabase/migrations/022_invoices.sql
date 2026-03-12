-- ============================================================
-- EZDrive Migration 022 — Invoices + Feature Toggles
-- Covers CDC priorities: PDF invoices, CSV export, pay-per-session, feature toggles
-- ============================================================

-- ─── 1. Invoices table ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id                       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number           text NOT NULL UNIQUE,  -- 'EZD-2026-000001'
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Période couverte
  period_start             timestamptz NOT NULL,
  period_end               timestamptz NOT NULL,

  -- Montants
  subtotal_cents           int NOT NULL DEFAULT 0,
  vat_cents                int NOT NULL DEFAULT 0,
  total_cents              int NOT NULL DEFAULT 0,
  currency                 text NOT NULL DEFAULT 'EUR',
  vat_rate                 numeric(5,2) NOT NULL DEFAULT 8.5, -- TVA DOM-TOM

  -- Détails lignes
  line_items               jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Format: [{date, station_name, station_city, energy_kwh, duration_min, amount_cents, description}]

  -- Liens
  subscription_id          uuid REFERENCES user_subscriptions(id),
  stripe_payment_intent_id text,  -- For pay-per-session

  -- Type & statut
  type                     text NOT NULL DEFAULT 'session'
                           CHECK (type IN ('session', 'subscription', 'rfid', 'credit_note')),
  status                   text NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'issued', 'paid', 'cancelled', 'refunded')),

  -- Dates
  issued_at                timestamptz,
  paid_at                  timestamptz,

  -- PDF Storage
  pdf_url                  text,  -- URL Supabase Storage or signed URL

  -- Métadonnées
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_user       ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status     ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_type       ON invoices(type);
CREATE INDEX IF NOT EXISTS idx_invoices_period     ON invoices(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_pi  ON invoices(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_number     ON invoices(invoice_number);

-- Trigger updated_at
CREATE TRIGGER trg_invoices_updated
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_invoices" ON invoices
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "admins_manage_invoices" ON invoices
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ezdrive_profiles
    WHERE id = auth.uid() AND role IN ('admin', 'operator')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ezdrive_profiles
    WHERE id = auth.uid() AND role IN ('admin', 'operator')
  ));

CREATE POLICY "service_manage_invoices" ON invoices
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── 2. Invoice number sequence ─────────────────────────────

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1 INCREMENT BY 1;

-- Helper function to generate invoice numbers: EZD-YYYY-NNNNNN
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS text AS $$
DECLARE
  seq_val bigint;
BEGIN
  seq_val := nextval('invoice_number_seq');
  RETURN 'EZD-' || to_char(now(), 'YYYY') || '-' || lpad(seq_val::text, 6, '0');
END;
$$ LANGUAGE plpgsql;


-- ─── 3. Feature Toggles table ───────────────────────────────

CREATE TABLE IF NOT EXISTS feature_toggles (
  key         text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT false,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id)
);

-- RLS
ALTER TABLE feature_toggles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_toggles" ON feature_toggles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admins_manage_toggles" ON feature_toggles
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ezdrive_profiles
    WHERE id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ezdrive_profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "service_manage_toggles" ON feature_toggles
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed feature toggles
INSERT INTO feature_toggles (key, enabled, description) VALUES
  ('use_internal_stations', true,  'Utiliser le module stations interne au lieu de Road'),
  ('use_internal_charging', true,  'Utiliser OCPP direct au lieu de Road pour le charging'),
  ('use_gfx_sync',          false, 'Activer la synchronisation GreenFlux'),
  ('use_road_sync',         false, 'Activer la synchronisation Road/e-flux'),
  ('stripe_live_mode',      true,  'Utiliser Stripe en mode live'),
  ('enable_smart_charging', true,  'Activer le Smart Charging OCPP'),
  ('enable_pay_per_session', true, 'Activer le paiement à la session via Stripe')
ON CONFLICT (key) DO NOTHING;


-- ─── 4. Add discount_percent to subscription_offers ─────────

ALTER TABLE subscription_offers
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) DEFAULT 0;

-- Update existing offers with their discounts
UPDATE subscription_offers SET discount_percent = 0   WHERE type = 'PAY_AS_YOU_GO';
UPDATE subscription_offers SET discount_percent = 5   WHERE type = 'RFID_FIDELITY';
UPDATE subscription_offers SET discount_percent = 15  WHERE type = 'PREMIUM_MONTHLY';
UPDATE subscription_offers SET discount_percent = 20  WHERE type = 'PREMIUM_YEARLY';
UPDATE subscription_offers SET discount_percent = 0   WHERE type = 'BUSINESS';


-- ─── 5. Supabase Storage bucket for invoices ────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoices',
  'invoices',
  false,
  5242880,  -- 5MB max
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can read their own invoices, admins can read all
CREATE POLICY "users_read_own_invoice_pdfs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "admins_read_all_invoice_pdfs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoices'
    AND EXISTS (
      SELECT 1 FROM ezdrive_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'operator')
    )
  );

CREATE POLICY "service_manage_invoice_pdfs" ON storage.objects
  TO service_role
  USING (bucket_id = 'invoices')
  WITH CHECK (bucket_id = 'invoices');
