-- Settlement Engine: Automated monthly billing and settlement

CREATE TYPE settlement_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

CREATE TABLE IF NOT EXISTS settlement_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  cpo_id uuid REFERENCES cpo_operators(id),
  territory_id uuid REFERENCES territories(id),
  status settlement_status NOT NULL DEFAULT 'pending',
  total_sessions int DEFAULT 0,
  total_energy_kwh numeric(12,2) DEFAULT 0,
  total_amount_cents int DEFAULT 0,
  total_vat_cents int DEFAULT 0,
  total_with_vat_cents int DEFAULT 0,
  commission_rate numeric(5,4) DEFAULT 0, -- EZDrive commission
  commission_cents int DEFAULT 0,
  net_payout_cents int DEFAULT 0,
  invoice_id uuid REFERENCES invoices(id),
  stripe_transfer_id text,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(period_start, period_end, cpo_id)
);

CREATE TABLE IF NOT EXISTS settlement_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_run_id uuid NOT NULL REFERENCES settlement_runs(id) ON DELETE CASCADE,
  cdr_id uuid, -- Reference to ocpi_cdrs
  transaction_id uuid, -- Reference to ocpp_transactions
  session_date timestamptz,
  station_name text,
  energy_kwh numeric(10,2),
  duration_minutes numeric(10,2),
  amount_cents int NOT NULL,
  vat_cents int DEFAULT 0,
  tariff_type text,
  driver_id text,
  token_uid text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_settlement_runs_period ON settlement_runs(period_start, period_end);
CREATE INDEX idx_settlement_runs_cpo ON settlement_runs(cpo_id);
CREATE INDEX idx_settlement_runs_status ON settlement_runs(status);
CREATE INDEX idx_settlement_items_run ON settlement_line_items(settlement_run_id);
CREATE INDEX idx_settlement_items_cdr ON settlement_line_items(cdr_id) WHERE cdr_id IS NOT NULL;

-- Function: generate monthly settlement for a CPO
CREATE OR REPLACE FUNCTION generate_monthly_settlement(
  p_cpo_id uuid,
  p_year int,
  p_month int
) RETURNS uuid AS $$
DECLARE
  v_settlement_id uuid;
  v_period_start date;
  v_period_end date;
  v_total_sessions int;
  v_total_energy numeric;
  v_total_amount int;
  v_vat_rate numeric;
BEGIN
  v_period_start := make_date(p_year, p_month, 1);
  v_period_end := (v_period_start + interval '1 month')::date;

  -- Check no existing settlement
  IF EXISTS (SELECT 1 FROM settlement_runs WHERE period_start = v_period_start AND cpo_id = p_cpo_id AND status != 'failed') THEN
    RAISE EXCEPTION 'Settlement already exists for this period and CPO';
  END IF;

  -- Get VAT rate (default 8.5% for DOM-TOM)
  v_vat_rate := 8.5;

  -- Create settlement run
  INSERT INTO settlement_runs (period_start, period_end, cpo_id, status)
  VALUES (v_period_start, v_period_end, p_cpo_id, 'processing')
  RETURNING id INTO v_settlement_id;

  -- Insert line items from CDRs
  INSERT INTO settlement_line_items (settlement_run_id, cdr_id, session_date, station_name, energy_kwh, duration_minutes, amount_cents, tariff_type, driver_id, token_uid)
  SELECT
    v_settlement_id,
    c.id,
    c.start_date_time,
    COALESCE((c.cdr_location->>'name')::text, 'N/A'),
    c.total_energy,
    c.total_time * 60, -- hours to minutes
    COALESCE(((c.total_cost->>'excl_vat')::numeric * 100)::int, 0),
    COALESCE((c.tariffs->0->>'type')::text, 'REGULAR'),
    COALESCE((c.cdr_token->>'uid')::text, ''),
    COALESCE((c.cdr_token->>'uid')::text, '')
  FROM ocpi_cdrs c
  JOIN stations s ON s.gfx_id = (c.cdr_location->>'id')::text OR s.name = (c.cdr_location->>'name')::text
  WHERE s.cpo_id = p_cpo_id
    AND c.start_date_time >= v_period_start
    AND c.start_date_time < v_period_end;

  -- Calculate totals
  SELECT
    count(*),
    COALESCE(sum(energy_kwh), 0),
    COALESCE(sum(amount_cents), 0)
  INTO v_total_sessions, v_total_energy, v_total_amount
  FROM settlement_line_items
  WHERE settlement_run_id = v_settlement_id;

  -- Update settlement run
  UPDATE settlement_runs SET
    total_sessions = v_total_sessions,
    total_energy_kwh = v_total_energy,
    total_amount_cents = v_total_amount,
    total_vat_cents = ROUND(v_total_amount * v_vat_rate / 100),
    total_with_vat_cents = v_total_amount + ROUND(v_total_amount * v_vat_rate / 100),
    status = 'completed',
    processed_at = now(),
    updated_at = now()
  WHERE id = v_settlement_id;

  RETURN v_settlement_id;
END;
$$ LANGUAGE plpgsql;

-- RLS
ALTER TABLE settlement_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read settlements" ON settlement_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service full settlements" ON settlement_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Auth read settlement_items" ON settlement_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service full settlement_items" ON settlement_line_items FOR ALL TO service_role USING (true) WITH CHECK (true);
