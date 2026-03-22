# Road.io Platform Phase 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest tokens, drivers, and tariffs from Road.io API; enhance frontend pages (RfidPage, DriversPage, TariffsPage) with unified Road + GFX display; enrich B2B portal with station/driver/token details.

**Architecture:** Three new sync edge functions (`road-token-sync`, `road-driver-sync`, `road-tariff-sync`) following the same multi-account pattern as `road-sync` and `road-cdr-sync`. One action function (`road-token-action`) for block/unblock. All write to existing tables (`gfx_tokens`, `gfx_consumers`, `ocpi_tariffs`) with `source: "road"`. Frontend pages get source filters and unified display.

**Tech Stack:** Supabase Edge Functions (Deno), PostgreSQL, React + TanStack Query + Tailwind CSS, road-client.ts shared module.

**Key DB tables:**
- `gfx_tokens` — operational token table (RfidPage reads this). Columns: token_uid, visual_number, token_type, contract_id, driver_external_id, driver_name, customer_group, status, cpo_id, total_sessions, total_energy_kwh, source (default 'cdr_sync')
- `gfx_consumers` — driver table (DriversPage reads this). Columns: driver_external_id, full_name, email, phone, cpo_id, source, status, billing_mode, etc.
- `ocpi_tariffs` — tariff table (TariffsPage reads this). Columns: tariff_id, currency, type, elements (jsonb). Missing: source, road_tariff_id, cpo_id — to add in migration.
- `consumer_profiles` — mobile app users (linked to auth.users). Has `road_user_id` already.

**Shared module:** `supabase/functions/_shared/road-client.ts` — `getRoadAccounts()`, `roadPostWithAuth()`, `RoadAccountConfig`

---

### Task 1: Migration 060 — Phase 2 Schema Extensions

**Files:**
- Create: `supabase/migrations/060_road_phase2_schema.sql`

**Purpose:** Add columns needed for Road token sync, driver sync, and tariff sync.

- [ ] **Step 1: Write migration SQL**

```sql
-- ============================================================
-- Migration 060: Road.io Phase 2 Schema Extensions
-- Token sync: road_token_id on gfx_tokens
-- Driver sync: road_account_id + billing_plan on gfx_consumers
-- Tariff sync: source + road_tariff_id + cpo_id on ocpi_tariffs
-- ============================================================

-- 1. gfx_tokens: add Road-specific fields
ALTER TABLE gfx_tokens
  ADD COLUMN IF NOT EXISTS road_token_id text,
  ADD COLUMN IF NOT EXISTS issuer text;

CREATE INDEX IF NOT EXISTS idx_gfx_tokens_road_id
  ON gfx_tokens (road_token_id) WHERE road_token_id IS NOT NULL;

-- 2. gfx_consumers: add Road-specific fields
ALTER TABLE gfx_consumers
  ADD COLUMN IF NOT EXISTS road_account_id text,
  ADD COLUMN IF NOT EXISTS billing_plan text;

CREATE INDEX IF NOT EXISTS idx_gfx_consumers_road_id
  ON gfx_consumers (road_account_id) WHERE road_account_id IS NOT NULL;

-- 3. ocpi_tariffs: add source, road_tariff_id, cpo_id
ALTER TABLE ocpi_tariffs
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'gfx',
  ADD COLUMN IF NOT EXISTS road_tariff_id text,
  ADD COLUMN IF NOT EXISTS cpo_id uuid REFERENCES cpo_operators(id);

CREATE INDEX IF NOT EXISTS idx_ocpi_tariffs_source ON ocpi_tariffs (source);
CREATE INDEX IF NOT EXISTS idx_ocpi_tariffs_cpo ON ocpi_tariffs (cpo_id) WHERE cpo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ocpi_tariffs_road_id
  ON ocpi_tariffs (road_tariff_id) WHERE road_tariff_id IS NOT NULL;

-- 4. sync_watermarks for new sync functions
INSERT INTO sync_watermarks (id, last_offset, last_synced_at, last_record_date, metadata)
VALUES
  ('road-token-sync-reunion', 0, now(), now(), '{"type":"token-sync","account":"ezdrive-reunion"}'::jsonb),
  ('road-token-sync-vcity', 0, now(), now(), '{"type":"token-sync","account":"vcity-ag"}'::jsonb),
  ('road-driver-sync-reunion', 0, now(), now(), '{"type":"driver-sync","account":"ezdrive-reunion"}'::jsonb),
  ('road-driver-sync-vcity', 0, now(), now(), '{"type":"driver-sync","account":"vcity-ag"}'::jsonb),
  ('road-tariff-sync-reunion', 0, now(), now(), '{"type":"tariff-sync","account":"ezdrive-reunion"}'::jsonb),
  ('road-tariff-sync-vcity', 0, now(), now(), '{"type":"tariff-sync","account":"vcity-ag"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Apply migration to remote DB via Supabase MCP `execute_sql`**

- [ ] **Step 3: Verify columns exist**

Run: `SELECT column_name FROM information_schema.columns WHERE table_name = 'gfx_tokens' AND column_name IN ('road_token_id', 'issuer')`
Expected: 2 rows

---

### Task 2: road-token-sync Edge Function

**Files:**
- Create: `supabase/functions/road-token-sync/index.ts`

**Purpose:** Sync RFID/APP tokens from Road.io `POST /1/tokens/search` into `gfx_tokens` table. Multi-account, paginated, deduplication by `token_uid`.

**Road.io token fields to map:**
- `uid` → `token_uid` (RFID UID)
- `_id` → `road_token_id` (Road internal ID)
- `contractId` → `contract_id`
- `type` → `token_type` (RFID / APP_USER / AD_HOC)
- `visualNumber` → `visual_number`
- `issuer` → `issuer`
- `status` (valid/blocked) → `status` (active/blocked)
- `userId` → `driver_external_id` (links to driver)
- `user.firstName + lastName` → `driver_name`

**Pattern:** Follow `road-cdr-sync` pattern exactly — `getRoadAccounts()` loop, `roadPostWithAuth()`, paginated with `limit/skip`, watermark tracking via `sync_watermarks`.

- [ ] **Step 1: Create edge function**

- [ ] **Step 2: Deploy via Supabase CLI**

Run: `supabase functions deploy road-token-sync --project-ref phnqtqvwofzrhpuydoom`

- [ ] **Step 3: Invoke and verify**

Run: `curl -X POST https://phnqtqvwofzrhpuydoom.supabase.co/functions/v1/road-token-sync`
Expected: JSON with `total_fetched`, `total_ingested`, `accounts` array

---

### Task 3: road-token-action Edge Function

**Files:**
- Create: `supabase/functions/road-token-action/index.ts`

**Purpose:** Block/unblock a token via Road.io API, update local `gfx_tokens` status accordingly.

**Endpoints:**
- Block: `POST /1/tokens/{road_token_id}/block`
- Unblock: `POST /1/tokens/{road_token_id}/unblock`

**Request body:** `{ tokenUid: string, action: "block" | "unblock" }`
- Looks up `gfx_tokens` by `token_uid` to get `road_token_id` and `cpo_id`
- Determines account from `cpo_id` → `cpoCode` → `getRoadAccounts()` match
- Calls Road.io API
- Updates local `gfx_tokens.status`

- [ ] **Step 1: Create edge function**

- [ ] **Step 2: Deploy via Supabase CLI**

---

### Task 4: road-driver-sync Edge Function

**Files:**
- Create: `supabase/functions/road-driver-sync/index.ts`

**Purpose:** Sync driver/account data from Road.io `POST /1/accounts/search` into `gfx_consumers` table. Multi-account, deduplication by email or road_account_id.

**Road.io account fields to map:**
- `_id` → `road_account_id`
- `firstName` → `first_name`
- `lastName` → `last_name`
- `firstName + " " + lastName` → `full_name`
- `email` → `email`
- `phone` → `phone`
- `status` → `status` (active/inactive)
- `billingPlan.name` → `billing_plan`
- `address.country` → `country`

**Deduplication strategy:**
1. First try match by `road_account_id` (exact Road ID match)
2. Then try match by `email` (cross-source dedup with GFX drivers)
3. If neither found, INSERT new row with `source: "road"`

- [ ] **Step 1: Create edge function**

- [ ] **Step 2: Deploy via Supabase CLI**

- [ ] **Step 3: Invoke and verify**

---

### Task 5: road-tariff-sync Edge Function

**Files:**
- Create: `supabase/functions/road-tariff-sync/index.ts`

**Purpose:** Sync tariff profiles from Road.io `POST /1/tariff-profiles/search` into `ocpi_tariffs` table. Multi-account, deduplication by `road_tariff_id`.

**Road.io tariff fields to map:**
- `_id` → `road_tariff_id`
- `"road-" + _id` → `tariff_id`
- `currency` → `currency` (default EUR)
- `pricePerKwh` → elements: `{type: "ENERGY", price: X}`
- `pricePerSession` → elements: `{type: "FLAT", price: X}`
- `pricePerMinute` → elements: `{type: "TIME", price: X}`
- `name` → `tariff_alt_text`: `[{language: "fr", text: name}]`
- `"road"` → `source`
- Account's cpo_id → `cpo_id`

- [ ] **Step 1: Create edge function**

- [ ] **Step 2: Deploy via Supabase CLI**

- [ ] **Step 3: Invoke and verify**

---

### Task 6: RfidPage Enhancement — Source Filter + Road Tokens

**Files:**
- Modify: `src/components/rfid/RfidPage.tsx`

**Purpose:** Add source filter (Toutes/Road.io/GreenFlux) to RfidPage. Display Road tokens alongside GFX tokens. Add block/unblock action for Road tokens.

**Changes:**
1. Add `source` state and dropdown filter (same pattern as FilterBar source filter from Phase 1)
2. Apply `.eq("source", source)` filter to Supabase query when source is selected
3. Add "Source" column to table with colored badges (blue=Road, purple=GFX)
4. Add block/unblock button for Road tokens (calls `road-token-action` edge function)
5. Show `issuer` column

- [ ] **Step 1: Add source filter state + dropdown**
- [ ] **Step 2: Add source column to table**
- [ ] **Step 3: Add block/unblock action for Road tokens**

---

### Task 7: DriversPage Enhancement — Road Drivers

**Files:**
- Modify: `src/components/customers/DriversPage.tsx` (or equivalent)

**Purpose:** Display Road drivers alongside GFX drivers with source filter.

**Changes:**
1. Add source filter dropdown
2. Apply source filter to query
3. Add source badge column
4. Show `billing_plan` for Road drivers
5. Show `road_account_id` in detail view

- [ ] **Step 1: Add source filter + column**
- [ ] **Step 2: Show billing plan for Road drivers**

---

### Task 8: TariffsPage Enhancement — Road Tariffs

**Files:**
- Modify: `src/components/tariffs/TariffsPage.tsx`

**Purpose:** Display Road tariff profiles alongside existing tariffs with source filter.

**Changes:**
1. Add source filter dropdown
2. Query ocpi_tariffs with optional source filter
3. Add source badge column
4. Show CPO name for Road tariffs
5. Display price components breakdown (energy/flat/time)

- [ ] **Step 1: Add source filter + CPO column**
- [ ] **Step 2: Show price breakdown for Road tariffs**

---

### Task 9: B2B Portal Enrichments

**Files:**
- Modify: `src/components/b2b/B2BSessionsPage.tsx`
- Modify: `src/hooks/useB2BCdrs.ts`

**Purpose:** Enrich B2B session display with station name, driver name, token used from the now-synced Road data.

**Changes:**
1. In `useB2BCdrs`, join station name from `stations_enriched` via `station_id`
2. In B2BSessionsPage, display station name, driver info, token info columns
3. Add utilization metrics (sessions per station)

- [ ] **Step 1: Enrich CDR query with station name join**
- [ ] **Step 2: Add enriched columns to B2B sessions table**

---

### Task 10: Cron Scheduling + Build Verification

**Files:**
- Modify: `supabase/migrations/060_road_phase2_schema.sql` (add pg_cron schedules)

**Purpose:** Schedule the 3 new sync functions and verify the full build.

**Cron schedules:**
- `road-token-sync`: every 6 hours
- `road-driver-sync`: every 24 hours (at 03:00 UTC)
- `road-tariff-sync`: every 24 hours (at 04:00 UTC)

- [ ] **Step 1: Add pg_cron jobs via execute_sql**
- [ ] **Step 2: Run `vite build` to verify 0 errors**
- [ ] **Step 3: Invoke all 3 sync functions to populate data**
