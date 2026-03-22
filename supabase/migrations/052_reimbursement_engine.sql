-- Employee Reimbursement Engine

CREATE TYPE reimbursement_status AS ENUM ('pending', 'calculated', 'approved', 'paid', 'rejected');
CREATE TYPE charging_location_type AS ENUM ('home', 'work', 'public', 'roaming');

-- Config per B2B client
CREATE TABLE IF NOT EXISTS reimbursement_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  b2b_client_id uuid NOT NULL REFERENCES b2b_clients(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  rate_per_kwh numeric(6,4) NOT NULL DEFAULT 0.25, -- €/kWh reimbursement rate
  charging_types charging_location_type[] NOT NULL DEFAULT '{home,work}',
  max_monthly_amount numeric(8,2), -- Monthly cap per employee
  payment_method text DEFAULT 'invoice' CHECK (payment_method IN ('invoice', 'bank_transfer', 'stripe')),
  iban text, -- For bank transfer
  billing_day int DEFAULT 1 CHECK (billing_day BETWEEN 1 AND 28),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(b2b_client_id)
);

-- Monthly reimbursement runs
CREATE TABLE IF NOT EXISTS reimbursement_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  b2b_client_id uuid NOT NULL REFERENCES b2b_clients(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status reimbursement_status NOT NULL DEFAULT 'pending',
  total_drivers int DEFAULT 0,
  total_kwh numeric(10,2) DEFAULT 0,
  total_amount_cents int DEFAULT 0,
  invoice_id uuid REFERENCES invoices(id),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(b2b_client_id, period_start, period_end)
);

-- Per-driver line items
CREATE TABLE IF NOT EXISTS reimbursement_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES reimbursement_runs(id) ON DELETE CASCADE,
  driver_id text NOT NULL, -- external driver ID or name
  driver_name text,
  driver_email text,
  session_count int DEFAULT 0,
  total_kwh numeric(10,2) DEFAULT 0,
  rate_per_kwh numeric(6,4),
  amount_cents int NOT NULL,
  charging_type charging_location_type DEFAULT 'home',
  capped boolean DEFAULT false, -- Hit monthly max
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_reimb_config_client ON reimbursement_config(b2b_client_id);
CREATE INDEX idx_reimb_runs_client ON reimbursement_runs(b2b_client_id, period_start);
CREATE INDEX idx_reimb_runs_status ON reimbursement_runs(status);
CREATE INDEX idx_reimb_items_run ON reimbursement_line_items(run_id);

-- RLS
ALTER TABLE reimbursement_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE reimbursement_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reimbursement_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read reimb_config" ON reimbursement_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service full reimb_config" ON reimbursement_config FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Auth read reimb_runs" ON reimbursement_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service full reimb_runs" ON reimbursement_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Auth read reimb_items" ON reimbursement_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service full reimb_items" ON reimbursement_line_items FOR ALL TO service_role USING (true) WITH CHECK (true);
