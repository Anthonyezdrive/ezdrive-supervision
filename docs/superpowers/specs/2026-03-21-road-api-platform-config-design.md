# Road.io API Platform Configuration — Design Spec

**Date**: 2026-03-21
**Scope**: EZDrive Reunion (974) + VCity AG (971/972/973) via Road.io API
**Horizon**: 6 mois (3 phases)
**Status**: Approved

---

## Context

EZDrive Supervision manages charging infrastructure across multiple CPOs. Two sub-CPOs — **EZDrive Reunion** (73 stations, Reunion 974) and **VCity AG** (22 stations, Martinique/Guadeloupe/Guyane) — are connected via the Road.io (E-Flux) API with full credentials.

Current state:
- Station sync working (95 stations, real-time statuses)
- CDR sync working (192 sessions, 111 linked to stations)
- Multi-account isolation implemented (`road-client.ts`)
- Crons active (road-sync 5min, road-cdr-sync 6h)
- VCity has 0 CPO sessions (pending Road.io support response)

Other CPOs (EZDrive AG, TotalEnergies, etc.) remain on GreenFlux. Long-term, stations will progressively migrate to EZDrive's native OCPP server.

## Architecture

```
Frontend (React)
  Dashboard | B2B Portal | Mobile API
         |
  Unified Supabase Layer
  stations | ocpi_cdrs | ocpi_tokens | consumer_profiles
  (source: gfx | road | ocpp)
         |
  +-------+-------+-------+
  |  GFX  | Road  | OCPP  |
  |  API  |  API  | natif |
  +-------+-------+-------+
```

Each sync writes to the same tables with `source` field for traceability. The frontend consumes the unified layer — it never calls Road/GFX directly. Road.io is exclusively for EZDrive Reunion and VCity AG.

---

## Phase 1 — Foundations (Weeks 1-3)

### 1.1 Enriched Station Sync

Populate existing columns and add new ones to `stations` from Road.io controller data:

| Road.io field | DB column | Type | Action | Notes |
|---|---|---|---|---|
| `ocppIdentity` | `ocpp_identity` | text | **Populate existing** | Column already exists (migration 015). Road.io populates it for Road-sourced stations. |
| `connectivityState` | `connectivity_status` | text | **Populate existing** | Column exists (migration 033). Normalize: `"connected"` → `"Online"`, `"disconnected"` → `null` to match existing domain (convention: `"Online"` or `null`). |
| `enablePublicCharging` | `charger_type` | text | **Populate existing** | Column exists. Map: `true` → `"Public"`, `false` → `"Business"`. No new `is_public` column needed. |
| `setupProgress.state` | `setup_status` | text | **Add column** | "COMPLETED" / "IN_PROGRESS" |
| `accessGroupIds` | `access_group_ids` | jsonb | **Add column** | Road access group refs |
| `syncOcpiCredentialIds` | `roaming_credential_ids` | jsonb | **Add column** | Active roaming connections |
| `ocppChargingStationId` | `ocpp_charging_station_id` | text | **Add column** | Road internal UUID |
| `numericIdentity` | `numeric_identity` | integer | **Add column** | Road numeric ID |

**Files changed:**
- Migration SQL: add new columns to `stations` + **recreate views in cascade order**: first `DROP VIEW IF EXISTS user_accessible_stations` (migration 036, depends on `stations_enriched`), then recreate `stations_enriched` and `maintenance_stations` views with new fields, then recreate `user_accessible_stations`. Critical: `useStations.ts` reads from `stations_enriched`, not `stations` directly.
- `supabase/functions/road-sync/index.ts`: extract and store new fields, normalize `connectivityState` → `"Online"` / `null`, map `enablePublicCharging` → `charger_type`
- `src/types/station.ts`: add new fields to Station type

### 1.2 Alert System

**Existing infrastructure (migrations 004 + 057):**
- `alert_history` table: stores alert events (station_id, alert_type, hours_in_fault, sent_at, details jsonb)
- `alert_rules` table: configurable rules with types including `fault_threshold`, `offline_threshold`, `unavailable_threshold`, `heartbeat_missing`, etc.
- `alert_config` table: global alert settings (threshold_hours, email_recipients)

**Enhancement: extend existing `alert-check` edge function** (or create `road-alert-check` that writes to the same `alert_history` table)

New alert rule types to add to `alert_rules.alert_type` CHECK constraint:
- `"disconnection"`: `connectivity_status` changes from `"Online"` to `null`
- `"recovery"`: station returns to "Available" from fault/offline
- `"extended_outage"`: "Unavailable" or "Faulted" for > 24h

These new types extend the existing enum. The function writes to `alert_history` (not a new table), using `details` jsonb column (migration 057) for metadata like previous/new status.

**Deduplication:** Check `alert_history` for recent alerts of same type for same station (within `notification_interval_hours` from `alert_rules`) before creating new ones. Auto-resolve by inserting a `"recovery"` alert when station comes back online.

**Files changed:**
- Migration SQL: `ALTER TABLE alert_rules DROP CONSTRAINT ...; ADD CONSTRAINT ...` to extend `alert_type` enum with new values
- `supabase/functions/road-alert-check/index.ts` (new edge function, writes to existing `alert_history`)
- Cron: pg_cron schedule every 5 min

### 1.3 Dashboard Enrichments

**KPI additions (DashboardPage):**
- "Connectivity" card: X connected / Y disconnected (by CPO)
- "Road Activity" card: CPO sessions last 24h, total kWh
- Source badge on map markers (Road / GFX / OCPP icon/color)
- Source filter in FilterBar

**Station Detail View enrichments (StationDetailView):**
- Source badge (Road / GFX / OCPP)
- OCPP Identity + Numeric Identity
- Setup status (COMPLETED / IN_PROGRESS)
- Public/private badge
- Active roaming credentials count
- Last connection timestamp
- Alert history tab

**Files changed:**
- `src/components/dashboard/DashboardPage.tsx`
- `src/components/stations/StationDetailView.tsx`
- `src/components/ui/FilterBar.tsx`
- `src/components/map/MapPage.tsx`
- `src/hooks/useStations.ts`
- `src/hooks/useStationAlerts.ts` (new)

### 1.4 Data Cleanup

- Rename auto-generated station names (`ROAD-xxxxxx`) with Road.io `name` field (already done in sync, but retroactive cleanup needed)
- Complete missing `postal_code` from Road.io location data
- Assign correct `territory_id` for VCity stations (972 Martinique, 971 Guadeloupe, 973 Guyane) based on postal codes and city names
- Verify all 95 stations have lat/lng coordinates

**Files:** One-time migration SQL + data fix edge function.

---

## Phase 2 — Exploitation (Weeks 4-8)

### 2.1 Token Sync

**New edge function: `road-token-sync`** (cron every 6h)

Endpoint: `POST /1/tokens/search` — ~1226 tokens VCity, ~200 Reunion.

Ingests into existing `ocpi_tokens` table:

| Road.io field | DB column | Notes |
|---|---|---|
| `uid` | `uid` | RFID identifier |
| `contractId` | `contract_id` | eMSP contract |
| `type` | `type` | RFID / APP_USER / AD_HOC |
| `status` | `status` | ACTIVE / BLOCKED / EXPIRED |
| `visualNumber` | `visual_number` | Printed number on card (column exists, migration 008) |
| `issuer` | `issuer` | EZDrive / VCity (column exists, migration 008) |
| `lastUpdated` | `last_updated` | Timestamp |

Deduplication with existing GFX tokens via `uid` match. `source: "road"`, `cpo_id` per account.

**Frontend (RfidPage):**
- Unified display of Road + GFX tokens
- Filter by source, CPO, status
- Block/Unblock action via `road-token-action` edge function (proxies to Road API)

**New edge function: `road-token-action`** (on-demand, not cron)
- Accepts `{ tokenId, action: "block" | "unblock", accountIndex }` in POST body
- Calls Road.io `POST /1/tokens/{id}/block` or `POST /1/tokens/{id}/unblock` with correct account credentials
- Updates local `ocpi_tokens.status` accordingly
- Returns success/error to frontend

**Files:**
- `supabase/functions/road-token-sync/index.ts` (new, cron)
- `supabase/functions/road-token-action/index.ts` (new, on-demand)
- Migration SQL: add `road_account_id` to `ocpi_tokens` (`visual_number` and `issuer` already exist in migration 008)
- `src/components/rfid/RfidPage.tsx` (enhance)
- `src/hooks/useTokens.ts` (new or enhance)

### 2.2 Driver/Account Sync

**New edge function: `road-driver-sync`** (cron daily)

Endpoint: `POST /1/accounts/search` — 904 accounts VCity, ~50 Reunion.

Enriches `consumer_profiles` table:

| Road.io field | DB column | Notes |
|---|---|---|
| `firstName` + `lastName` | `full_name` | Full name |
| `email` | `email` | Contact |
| `_id` | `road_account_id` | New column |
| `status` | `status` | Active/inactive |
| `billingPlan.name` | `billing_plan` | New column |

**Join strategy:** Primary join via `consumer_profiles.road_account_id` → `ocpi_cdrs.driver_external_id` (both store the Road account ID). Secondary join via `ocpi_tokens.uid` for token-level detail. For drivers existing in both GFX and Road, deduplication is by email match — if a `consumer_profile` already exists with the same email (from GFX `gfx-driver-sync`), the Road sync updates it with `road_account_id` rather than creating a duplicate.

**Frontend (DriversPage + CustomerDetailPage):**
- Unified driver view (GFX + Road)
- Driver detail: associated tokens, charge history, billing plan
- CSV export by CPO

**Files:**
- `supabase/functions/road-driver-sync/index.ts` (new)
- Migration SQL: add columns to `consumer_profiles`
- `src/components/customers/DriversPage.tsx` (enhance)
- `src/components/customers/CustomerDetailPage.tsx` (enhance)
- `src/hooks/useDrivers.ts` (new or enhance)

### 2.3 Tariff Sync

**New edge function: `road-tariff-sync`** (cron daily)

Endpoints: `POST /1/tariff-profiles/search` + `POST /1/billing-plans/search`

Ingests into existing `ocpi_tariffs` table (migration 008):

| Road.io field | DB column | Notes |
|---|---|---|
| `id` | `tariff_id` | Road tariff profile ID (prefixed `road-`) |
| `currency` | `currency` | EUR default |
| `pricePerKwh` | `elements` jsonb | Stored as OCPI element: `[{price_components: [{type: "ENERGY", price: X}]}]` |
| `pricePerSession` | `elements` jsonb | Added as component: `{type: "FLAT", price: X}` |
| `pricePerMinute` | `elements` jsonb | Added as component: `{type: "TIME", price: X}` |
| `name` | `tariff_alt_text` | As `[{language: "fr", text: name}]` |
| — | `source` | New column: `"road"` (needs migration) |

**New columns on `ocpi_tariffs`:** `source text DEFAULT 'gfx'` (consistent with project convention: `gfx` / `road` / `ocpp`), `road_tariff_id text`, `cpo_id uuid REFERENCES cpo_operators(id)`.

Tariff ↔ station link via `accessGroupIds` → `access_group_tariffs` (existing table from migration 049).
Tariff ↔ billing plan ↔ user chain via `road-driver-sync` billing plan data.

Related: `tariff_schedules` (migration 047) for peak/off-peak pricing already exists.

**Frontend (TariffsPage):**
- Road tariffs by CPO (Reunion / VCity)
- Station → applied tariff view
- Driver → billing plan → effective tariff
- Public vs B2B tariff comparison

**Files:**
- `supabase/functions/road-tariff-sync/index.ts` (new)
- `src/components/tariffs/TariffsPage.tsx` (enhance)
- `src/hooks/useTariffs.ts` (new or enhance)

### 2.4 B2B Portal Enrichments

With tokens + drivers + tariffs + station-linked CDRs:

- **B2BSessionsPage**: show exact station name, driver name, token used, tariff applied
- **B2BMonthlyPage**: breakdown by VCity station (VITO Cluny, VITO Versailles, etc.)
- **B2BDriversPage**: RUBIS driver list with individual consumption
- **New metrics**: utilization rate per station, peak hours, most active drivers

RUBIS billing (VCity AG):
- Once CPO sessions become available (pending Road.io response), generate detailed invoices via existing `InvoiceGenerationWizard`
- Until then, display available MSP session data and station utilization metrics

### 2.5 Consolidated Cron Schedule

| Cron | Frequency | Function | Scope |
|---|---|---|---|
| `road-sync` | 5 min | Stations + statuses | Reunion + VCity |
| `road-alert-check` | 5 min | Disconnect/fault/recovery alerts | Reunion + VCity |
| `road-cdr-sync` | 6h | Sessions/CDRs | Reunion + VCity |
| `road-token-sync` | 6h | RFID/APP tokens | Reunion + VCity |
| `road-driver-sync` | 24h | User accounts | Reunion + VCity |
| `road-tariff-sync` | 24h | Tariffs + billing plans | Reunion + VCity |

All crons use the multi-account pattern from `road-client.ts` with hermetic CPO isolation.

---

## Phase 3 — Complete Platform (Month 3-6)

### 3.1 Progressive OCPP Migration

Stations currently managed via Road.io will progressively migrate to EZDrive's native OCPP server (Fly.io Paris CDG).

**Migration steps per station:**
1. Inventory: identify migrable stations via `ocpp_identity` from road-sync
2. Dual-listen: configure station to send OCPP to both Road.io AND EZDrive server
3. Switchover: change OCPP URL in station config (via Road API ChangeConfiguration or manual)
4. Completion: update `source` from `"road"` to `"ocpp"`. The `road-sync` function skips stations where `source != "road"`, so historical Road data is preserved but no longer overwritten. CDR sync continues for both sources — Road CDRs keep `source: "road"`, native OCPP transactions are stored in `ocpp_transactions`.

**New DB fields:**
- `stations.migration_status`: `null | "planned" | "dual" | "migrated"`

**Source transition logic:** When `migration_status` is set to `"migrated"`, an admin action updates `source` to `"ocpp"` AND sets `road_id` to `null`. This is critical: `road-sync` matches existing stations by `road_id` — if `road_id` is not nulled, the sync would skip the station on SELECT (filtered by `source = "road"`), then treat it as a new station and INSERT a duplicate row. Nulling `road_id` ensures Road.io data for this station is simply ignored. CDRs are not affected — historical Road CDRs remain with `source: "road"`.

**New admin page: "OCPP Migration"**
- List of stations with migration status
- "Start migration" button per station
- Post-migration health comparison (Road vs OCPP data)

### 3.2 Access Groups

**New edge function: `road-access-group-sync`** (cron daily)

Endpoint: `POST /1/access-groups/search`

**Existing tables (migration 049):** `access_groups`, `access_group_members`, `access_group_stations`, `access_group_tariffs` — all already exist with RLS, indexes, triggers, and `resolve_access_group_tariff()` function.

**Sync strategy:** The `road-access-group-sync` function populates these existing tables from Road.io data:
- Road access group → `access_groups` row (with `road_access_group_id` column to add)
- Road group's tokens → `access_group_members.token_uid`
- Road group's controllers → `access_group_stations.station_id` (via `stationByRoadId` lookup)
- Road group's tariff link → `access_group_tariffs` (via tariff sync)

**New column needed:** `access_groups.road_access_group_id text` — Road.io's internal ID for write-back operations.

**Frontend (AccessGroupsPage):**
- View Road access groups by CPO
- Edit members (add/remove token)
- Edit station assignments
- Write-back via Road API: `PUT /1/access-groups/{id}`

### 3.3 Smart Charging

Road API: `POST /1/evse-controllers/{id}/smart-charging`

**Features:**
- Power limitation per station (site load balancing)
- Scheduled charging profiles (off-peak/peak)
- Priority by access group (e.g., RUBIS fleet first)

**Frontend (SmartChargingPage):**
- Active profiles per site
- Configuration: site max power, distribution across stations
- Time-based scheduling
- Real-time distributed charge monitoring

### 3.4 Mobile API for End Users

The mobile app already uses a unified edge function router (`supabase/functions/api/index.ts`) with module-based routing: `/functions/v1/api/{module}/{action}`. Existing modules include `stations`, `user`, `charging`, `rfid`, `invoices`, `subscriptions`, etc.

**Enhancements to existing modules** (no new edge functions needed):

| Existing module | New action | Description |
|---|---|---|
| `user` | `sessions` | Driver's charge history from `ocpi_cdrs` (Road + GFX unified) |
| `rfid` | `block` | Report lost token — proxies to `road-token-action` for Road tokens |
| `stations` | `nearby` | Enhance with Road real-time availability data |
| `stations` | `availability` | Real-time connector status from Road sync |
| `invoices` | (existing) | Already serves invoices, enrich with Road CDR data |

**Files changed:**
- `supabase/functions/api/_modules/user.ts`: add `sessions` action
- `supabase/functions/api/_modules/rfid.ts`: add `block` action proxying to Road API
- `supabase/functions/api/_modules/stations.ts`: enhance `nearby` and add `availability`

Data source: unified Supabase tables, filtered by authenticated user's `consumer_profile`.

### 3.5 Energy Mix & CSR Reporting

Combine Road.io meter values with local energy mix data:

| Territory | Renewable % | Source |
|---|---|---|
| Reunion (974) | ~35% | Solar, hydro |
| Martinique (972) | ~25% | Wind, solar |
| Guadeloupe (971) | ~30% | Geothermal, solar |
| Guyane (973) | ~65% | Hydro |

**Features:**
- CO2 avoided per session (vs thermal vehicle)
- "Green charge" badge when mix > 50% renewable
- Exportable CSR report for B2B clients (RUBIS)
- EnergyMixPage with real consumption data

### 3.6 Monitoring & Observability

**Operational dashboard:**
- Uptime per station: % Available over 30 days (SLA)
- Mean time to resolution: average fault duration
- Usage heatmap: which stations, which hours, which days
- Escalated alerts: Faulted > 4h → notify Frantz. > 24h → notify Jean-Luc.
- CPO comparison: Reunion vs VCity side-by-side metrics

**Sync health:**
- Admin page showing each cron's status (last run, result, errors)
- Alert if sync fails 3 consecutive times
- Watermark dashboard (offset, last date, remaining sessions)

---

## Constraints & Decisions

1. **Road.io = EZDrive Reunion + VCity AG only.** Other CPOs stay on GreenFlux.
2. **Hermetic CPO isolation** maintained at every level (DB, edge functions, frontend filters).
3. **GFX coexistence** — both APIs active. No GFX deprecation. Unified via `source` field.
4. **Progressive OCPP migration** — stations move from Road → OCPP natif over time, not big-bang.
5. **VCity CPO sessions** — 0 available currently. Plan accounts for this data gap; facturation features degrade gracefully.
6. **Mobile app** — consumes unified Supabase layer, never calls Road/GFX directly.
7. **All new edge functions** follow the multi-account pattern from `road-client.ts` with `getRoadAccounts()`.

## Success Criteria

- **Phase 1**: 95 stations with real statuses, alerts firing on disconnections, dashboard shows source badges
- **Phase 2**: 1400+ tokens synced, 950+ drivers imported, tariffs visible, B2B portal shows per-station metrics
- **Phase 3**: First station migrated to OCPP natif, mobile API serving driver history, SLA dashboard operational
