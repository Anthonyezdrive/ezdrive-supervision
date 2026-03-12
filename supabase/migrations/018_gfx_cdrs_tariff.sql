-- ================================================================
-- Migration 018: GFX CDR Fields + Sync Watermarks + CDR Cron
-- Extends ocpi_cdrs for GFX B2B data, adds incremental sync table
-- ================================================================

-- --------------------------------------------------------
-- 1. Extend ocpi_cdrs with GFX B2B fields
-- --------------------------------------------------------

-- GFX CDR identifier
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS gfx_cdr_id text;

-- Source tracking (ocpp = from OCPP server, gfx = from GreenFlux, road = from E-Flux)
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS source text DEFAULT 'ocpp'
  CHECK (source IN ('ocpp', 'gfx', 'road'));

-- B2B client info
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS customer_external_id text;
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS retail_package_id text;
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS custom_groups text[];
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS charger_type text;
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS driver_external_id text;

-- Retail costs (what the B2B client actually pays)
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS total_retail_cost numeric(10,4);
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS total_retail_cost_incl_vat numeric(10,4);
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS total_retail_vat numeric(10,4);
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS retail_vat_rate numeric(5,2);

-- Costs with VAT
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS total_cost_incl_vat numeric(10,4);
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS total_vat numeric(10,4);
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2);

-- EMSP info (for roaming)
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS emsp_country_code text;
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS emsp_party_id text;
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS emsp_external_id text;

-- Station link
ALTER TABLE ocpi_cdrs ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES stations(id);

-- --------------------------------------------------------
-- 2. Make cdr_token and cdr_location nullable
--    (GFX CDRs don't have OCPI-standard token/location format)
-- --------------------------------------------------------
ALTER TABLE ocpi_cdrs ALTER COLUMN cdr_token DROP NOT NULL;
ALTER TABLE ocpi_cdrs ALTER COLUMN cdr_location DROP NOT NULL;

-- --------------------------------------------------------
-- 3. Indexes for GFX CDR queries
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ocpi_cdrs_gfx_id ON ocpi_cdrs (gfx_cdr_id) WHERE gfx_cdr_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ocpi_cdrs_source ON ocpi_cdrs (source);
CREATE INDEX IF NOT EXISTS idx_ocpi_cdrs_customer ON ocpi_cdrs (customer_external_id) WHERE customer_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ocpi_cdrs_station ON ocpi_cdrs (station_id) WHERE station_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ocpi_cdrs_retail_pkg ON ocpi_cdrs (retail_package_id) WHERE retail_package_id IS NOT NULL;

-- --------------------------------------------------------
-- 4. Sync watermarks table (for incremental sync)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_watermarks (
  id text PRIMARY KEY,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  last_offset integer DEFAULT 0,
  last_record_date timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb
);

INSERT INTO sync_watermarks (id) VALUES ('gfx-cdr-sync')
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------
-- 5. Cron job: GFX CDR sync every 6 hours
-- --------------------------------------------------------
SELECT cron.schedule(
  'gfx-cdr-sync',
  '15 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://phnqtqvwofzrhpuydoom.supabase.co/functions/v1/gfx-cdr-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
