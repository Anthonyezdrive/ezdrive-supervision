-- ============================================================
-- Migration 046: Billing Rules for Antilles-Guyane
-- Complex tarification: kWh, minute, parking, no-show
-- Local VAT rates per territory
-- ============================================================

-- Territory-specific VAT rates
CREATE TABLE IF NOT EXISTS territory_vat_rates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  territory text NOT NULL,
  vat_rate numeric(5,2) NOT NULL DEFAULT 20.00,
  label text NOT NULL DEFAULT 'TVA',
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz DEFAULT now()
);

INSERT INTO territory_vat_rates (territory, vat_rate, label) VALUES
  ('Guadeloupe', 8.50, 'TVA DOM'),
  ('Martinique', 8.50, 'TVA DOM'),
  ('Guyane', 0.00, 'Exonéré TVA'),
  ('Réunion', 8.50, 'TVA DOM'),
  ('Mayotte', 0.00, 'Exonéré TVA'),
  ('Métropole', 20.00, 'TVA')
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_territory_vat ON territory_vat_rates (territory);

-- Billing profiles per CPO (links CPO to Stripe Connect account + billing entity)
CREATE TABLE IF NOT EXISTS cpo_billing_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cpo_id text NOT NULL,
  cpo_name text NOT NULL,
  stripe_connect_account_id text,
  billing_entity_name text NOT NULL,
  billing_entity_address text,
  billing_entity_siret text,
  billing_entity_vat_number text,
  commission_rate numeric(5,2) DEFAULT 5.00,
  commission_type text DEFAULT 'percentage' CHECK (commission_type IN ('percentage', 'fixed')),
  commission_fixed_amount numeric(10,2),
  default_currency text DEFAULT 'EUR',
  invoice_prefix text,
  invoice_footer text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO cpo_billing_profiles (cpo_id, cpo_name, stripe_connect_account_id, billing_entity_name, commission_rate, invoice_prefix) VALUES
  ('vcity-ag', 'V-CiTY AG', 'acct_1TCeTjL4IOusGgnX', 'V-CITY AG', 5.00, 'VCITY'),
  ('ezdrive-ag', 'EZDrive AG', NULL, 'EZDrive Antilles et Guyane', 0.00, 'EZD-AG'),
  ('totalenergies', 'TotalEnergies', NULL, 'TotalEnergies Antilles', 5.00, 'TOTAL'),
  ('ezdrive-reunion', 'EZDrive Réunion', NULL, 'EZDrive Réunion', 0.00, 'EZD-RE')
ON CONFLICT DO NOTHING;

ALTER TABLE cpo_billing_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON cpo_billing_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
ALTER TABLE territory_vat_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON territory_vat_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Complex tariff rules per station/EVSE
CREATE TABLE IF NOT EXISTS station_tariff_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id text,
  evse_id text,
  cpo_id text NOT NULL,
  rule_name text NOT NULL,
  price_per_kwh numeric(10,4) DEFAULT 0,
  price_per_minute numeric(10,4) DEFAULT 0,
  session_fee numeric(10,2) DEFAULT 0,
  parking_fee_per_minute numeric(10,4) DEFAULT 0,
  parking_grace_period_minutes int DEFAULT 15,
  no_show_fee numeric(10,2) DEFAULT 0,
  no_show_grace_period_minutes int DEFAULT 15,
  reservation_fee_per_minute numeric(10,4) DEFAULT 0,
  max_session_fee numeric(10,2),
  min_session_fee numeric(10,2) DEFAULT 0,
  currency text DEFAULT 'EUR',
  is_default boolean DEFAULT false,
  valid_from timestamptz DEFAULT now(),
  valid_to timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE station_tariff_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON station_tariff_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_tariff_rules_cpo ON station_tariff_rules (cpo_id);
CREATE INDEX IF NOT EXISTS idx_tariff_rules_station ON station_tariff_rules (station_id) WHERE station_id IS NOT NULL;

-- Function to calculate session cost with complex rules
CREATE OR REPLACE FUNCTION calculate_session_cost(
  p_cpo_id text,
  p_station_id text,
  p_evse_id text,
  p_energy_kwh numeric,
  p_duration_minutes numeric,
  p_parking_minutes numeric DEFAULT 0,
  p_is_no_show boolean DEFAULT false,
  p_territory text DEFAULT 'Guadeloupe'
) RETURNS json AS $$
DECLARE
  v_rule record;
  v_vat_rate numeric;
  v_energy_cost numeric := 0;
  v_time_cost numeric := 0;
  v_session_fee numeric := 0;
  v_parking_cost numeric := 0;
  v_no_show_cost numeric := 0;
  v_subtotal numeric;
  v_vat_amount numeric;
  v_total numeric;
BEGIN
  -- Get applicable tariff rule (station-specific first, then CPO default)
  SELECT * INTO v_rule FROM station_tariff_rules
  WHERE cpo_id = p_cpo_id
    AND (station_id = p_station_id OR station_id IS NULL)
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY station_id NULLS LAST, created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'No tariff rule found for this CPO/station');
  END IF;

  -- Calculate costs
  v_energy_cost := p_energy_kwh * v_rule.price_per_kwh;
  v_time_cost := p_duration_minutes * v_rule.price_per_minute;
  v_session_fee := v_rule.session_fee;

  -- Parking fee (after grace period)
  IF p_parking_minutes > v_rule.parking_grace_period_minutes THEN
    v_parking_cost := (p_parking_minutes - v_rule.parking_grace_period_minutes) * v_rule.parking_fee_per_minute;
  END IF;

  -- No-show fee
  IF p_is_no_show THEN
    v_no_show_cost := v_rule.no_show_fee;
  END IF;

  v_subtotal := v_energy_cost + v_time_cost + v_session_fee + v_parking_cost + v_no_show_cost;

  -- Apply min/max
  IF v_rule.min_session_fee IS NOT NULL AND v_subtotal < v_rule.min_session_fee THEN
    v_subtotal := v_rule.min_session_fee;
  END IF;
  IF v_rule.max_session_fee IS NOT NULL AND v_subtotal > v_rule.max_session_fee THEN
    v_subtotal := v_rule.max_session_fee;
  END IF;

  -- Get VAT rate for territory
  SELECT vat_rate INTO v_vat_rate FROM territory_vat_rates
  WHERE territory = p_territory AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
  ORDER BY effective_from DESC LIMIT 1;

  IF v_vat_rate IS NULL THEN v_vat_rate := 20.00; END IF;

  v_vat_amount := ROUND(v_subtotal * v_vat_rate / 100, 2);
  v_total := ROUND(v_subtotal + v_vat_amount, 2);

  RETURN json_build_object(
    'energy_cost', ROUND(v_energy_cost, 2),
    'time_cost', ROUND(v_time_cost, 2),
    'session_fee', ROUND(v_session_fee, 2),
    'parking_cost', ROUND(v_parking_cost, 2),
    'no_show_cost', ROUND(v_no_show_cost, 2),
    'subtotal_ht', ROUND(v_subtotal, 2),
    'vat_rate', v_vat_rate,
    'vat_amount', v_vat_amount,
    'total_ttc', v_total,
    'currency', v_rule.currency,
    'rule_name', v_rule.rule_name,
    'territory', p_territory
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
