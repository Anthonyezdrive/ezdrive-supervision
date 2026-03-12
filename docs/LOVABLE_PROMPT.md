# PROMPT LOVABLE — EZDrive Supervision Dashboard

Copie-colle ce message tel quel dans le chat Lovable.
Il est divisé en 3 parties : fais-les dans l'ordre.

---

## PARTIE 1 — Copie-colle ceci dans Lovable :

```
Exécute les 3 migrations SQL suivantes dans cet ordre exact. Ce sont les tables pour le dashboard de supervision EZDrive (bornes de recharge EV).

MIGRATION 1 — Profils utilisateurs :

CREATE TABLE IF NOT EXISTS ezdrive_profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  full_name   text,
  role        text NOT NULL DEFAULT 'operator'
                CHECK (role IN ('admin', 'operator', 'tech')),
  territory   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION handle_new_ezdrive_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO ezdrive_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_ezdrive
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_ezdrive_user();

ALTER TABLE ezdrive_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON ezdrive_profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON ezdrive_profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON ezdrive_profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin')
  );

MIGRATION 2 — Stations, CPO, Territoires, Status Log :

CREATE TABLE IF NOT EXISTS cpo_operators (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text UNIQUE NOT NULL,
  code        text UNIQUE NOT NULL,
  color       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO cpo_operators (name, code, color) VALUES
  ('EZDrive', 'ezdrive', '#00D4AA'),
  ('TotalEnergies', 'totalenergies', '#FF6B6B')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS territories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  code        text UNIQUE NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO territories (name, code) VALUES
  ('Guadeloupe', '971'),
  ('Martinique', '972'),
  ('Guyane', '973'),
  ('Réunion', '974')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS stations (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  gfx_id              text UNIQUE NOT NULL,
  gfx_location_id     text,
  name                text NOT NULL,
  address             text,
  city                text,
  postal_code         text,
  latitude            double precision,
  longitude           double precision,
  cpo_id              uuid REFERENCES cpo_operators(id),
  territory_id        uuid REFERENCES territories(id),
  ocpp_status         text NOT NULL DEFAULT 'Unknown'
                        CHECK (ocpp_status IN (
                          'Available', 'Preparing', 'Charging',
                          'SuspendedEVSE', 'SuspendedEV', 'Finishing',
                          'Unavailable', 'Faulted', 'Unknown'
                        )),
  status_since        timestamptz NOT NULL DEFAULT now(),
  is_online           boolean NOT NULL DEFAULT true,
  connectors          jsonb DEFAULT '[]'::jsonb,
  max_power_kw        numeric(8,2),
  gfx_raw             jsonb DEFAULT '{}'::jsonb,
  last_synced_at      timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stations_gfx_id      ON stations (gfx_id);
CREATE INDEX idx_stations_ocpp_status ON stations (ocpp_status);
CREATE INDEX idx_stations_cpo         ON stations (cpo_id);
CREATE INDEX idx_stations_territory   ON stations (territory_id);
CREATE INDEX idx_stations_online      ON stations (is_online);

CREATE TABLE IF NOT EXISTS station_status_log (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id      uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  previous_status text,
  new_status      text NOT NULL,
  changed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ssl_station    ON station_status_log (station_id);
CREATE INDEX idx_ssl_changed_at ON station_status_log (changed_at DESC);
CREATE INDEX idx_ssl_new_status ON station_status_log (new_status);

CREATE TABLE IF NOT EXISTS station_cpo_overrides (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  gfx_id      text UNIQUE NOT NULL,
  cpo_id      uuid NOT NULL REFERENCES cpo_operators(id),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stations_updated_at
  BEFORE UPDATE ON stations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE stations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_status_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cpo_operators          ENABLE ROW LEVEL SECURITY;
ALTER TABLE territories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_cpo_overrides  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_stations"     ON stations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_status_log"   ON station_status_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_cpos"         ON cpo_operators FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_territories"  ON territories FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_overrides"    ON station_cpo_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_write_stations" ON stations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_write_log"      ON station_status_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admin_manage_overrides" ON station_cpo_overrides FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'));

MIGRATION 3 — Vues SQL :

CREATE OR REPLACE VIEW station_kpis AS
SELECT
  COUNT(*) AS total_stations,
  COUNT(*) FILTER (WHERE ocpp_status = 'Available') AS available,
  COUNT(*) FILTER (WHERE ocpp_status = 'Charging') AS charging,
  COUNT(*) FILTER (WHERE ocpp_status = 'Faulted') AS faulted,
  COUNT(*) FILTER (WHERE ocpp_status IN ('Unavailable', 'Unknown') OR NOT is_online) AS offline,
  COUNT(*) FILTER (WHERE ocpp_status IN ('Preparing', 'SuspendedEVSE', 'SuspendedEV', 'Finishing')) AS other
FROM stations;

CREATE OR REPLACE VIEW stations_enriched AS
SELECT
  s.id,
  s.gfx_id,
  s.gfx_location_id,
  s.name,
  s.address,
  s.city,
  s.postal_code,
  s.latitude,
  s.longitude,
  s.cpo_id,
  c.name AS cpo_name,
  c.code AS cpo_code,
  s.territory_id,
  t.name AS territory_name,
  t.code AS territory_code,
  s.ocpp_status,
  s.status_since,
  s.is_online,
  s.connectors,
  s.max_power_kw,
  EXTRACT(EPOCH FROM (now() - s.status_since)) / 3600 AS hours_in_status,
  s.last_synced_at,
  s.created_at
FROM stations s
LEFT JOIN cpo_operators c ON s.cpo_id = c.id
LEFT JOIN territories t ON s.territory_id = t.id;

CREATE OR REPLACE VIEW maintenance_stations AS
SELECT
  s.id,
  s.gfx_id,
  s.name,
  s.address,
  s.city,
  s.ocpp_status,
  s.status_since,
  s.is_online,
  s.connectors,
  s.max_power_kw,
  c.name AS cpo_name,
  c.code AS cpo_code,
  t.name AS territory_name,
  t.code AS territory_code,
  EXTRACT(EPOCH FROM (now() - s.status_since)) / 3600 AS hours_in_fault,
  s.last_synced_at
FROM stations s
LEFT JOIN cpo_operators c ON s.cpo_id = c.id
LEFT JOIN territories t ON s.territory_id = t.id
WHERE s.ocpp_status IN ('Faulted', 'Unavailable')
   OR NOT s.is_online
ORDER BY s.status_since ASC;

Confirme quand les 3 migrations sont exécutées.
```

---

## PARTIE 2 — Copie-colle ceci dans Lovable (Edge Functions) :

```
Crée 3 Edge Functions Supabase pour l'intégration GreenFlux. Configure d'abord les secrets suivants :
- GFX_API_KEY_PROD = bVQchVh1l2x9gKyTuDIYE3laHtFmr1JZV9Dn44TOk
- GFX_BASE_URL = https://platform.greenflux.com/api

SHARED MODULE _shared/cors.ts :

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

SHARED MODULE _shared/gfx-client.ts :

const GFX_API_KEY = Deno.env.get("GFX_API_KEY_PROD") ?? "";
const GFX_BASE_URL = Deno.env.get("GFX_BASE_URL") ?? "https://platform.greenflux.com/api";

export async function gfxFetch(path: string, options?: RequestInit): Promise<Response> {
  if (!GFX_API_KEY) throw new Error("Missing GFX_API_KEY_PROD secret");
  const url = `${GFX_BASE_URL}${path}`;
  console.log(`[GFX] Fetching: ${url}`);
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Token ${GFX_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options?.headers ?? {}),
    },
  });
}
export { GFX_BASE_URL };

EDGE FUNCTION 1 — gfx-stations/index.ts (proxy liste des bornes) :

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { gfxFetch } from "../_shared/gfx-client.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const dateFrom = url.searchParams.get("date_from") ?? "";
    const queryStr = dateFrom ? `?date_from=${dateFrom}` : "";
    const gfxRes = await gfxFetch(`/chargestations${queryStr}`);
    if (!gfxRes.ok) {
      const errText = await gfxRes.text();
      return new Response(JSON.stringify({ error: `GreenFlux API error: ${gfxRes.status}`, detail: errText }),
        { status: gfxRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await gfxRes.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "max-age=15" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

EDGE FUNCTION 2 — gfx-station-detail/index.ts (détail d'une borne) :

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { gfxFetch } from "../_shared/gfx-client.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const stationId = url.searchParams.get("station_id") ?? url.searchParams.get("id");
    if (!stationId) return new Response(JSON.stringify({ error: "Missing station_id parameter" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const gfxRes = await gfxFetch(`/chargestations/${stationId}`);
    if (!gfxRes.ok) {
      const errText = await gfxRes.text();
      return new Response(JSON.stringify({ error: `GreenFlux API error: ${gfxRes.status}`, detail: errText }),
        { status: gfxRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await gfxRes.json();
    return new Response(JSON.stringify(data),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

EDGE FUNCTION 3 — gfx-sync/index.ts (synchronisation critique GreenFlux → Supabase) :

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { corsHeaders } from "../_shared/cors.ts";
import { gfxFetch } from "../_shared/gfx-client.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VALID_STATUSES = new Set(["Available","Preparing","Charging","SuspendedEVSE","SuspendedEV","Finishing","Unavailable","Faulted"]);

function normalizeStatus(raw: string | undefined | null): string {
  if (!raw) return "Unknown";
  const normalized = raw.charAt(0).toUpperCase() + raw.slice(1);
  return VALID_STATUSES.has(normalized) ? normalized : "Unknown";
}

function detectTerritory(postalCode: string | null | undefined): string | null {
  if (!postalCode) return null;
  const code = postalCode.trim();
  if (code.startsWith("971")) return "971";
  if (code.startsWith("972")) return "972";
  if (code.startsWith("973")) return "973";
  if (code.startsWith("974")) return "974";
  return null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const result = { total_synced: 0, new_stations: 0, status_changes: 0, errors: [] as string[] };

  try {
    const gfxRes = await gfxFetch("/chargestations");
    if (!gfxRes.ok) throw new Error(`GFX API error ${gfxRes.status}: ${await gfxRes.text()}`);
    const gfxData = await gfxRes.json();
    const chargestations = Array.isArray(gfxData) ? gfxData : gfxData?.data ?? gfxData?.chargestations ?? [];

    const { data: existingStations } = await supabase.from("stations").select("id, gfx_id, ocpp_status");
    const stationMap = new Map((existingStations ?? []).map((s: any) => [s.gfx_id, s]));

    const { data: territories } = await supabase.from("territories").select("id, code");
    const territoryMap = new Map((territories ?? []).map((t: any) => [t.code, t.id]));

    const { data: overrides } = await supabase.from("station_cpo_overrides").select("gfx_id, cpo_id");
    const overrideMap = new Map((overrides ?? []).map((o: any) => [o.gfx_id, o.cpo_id]));

    const { data: cpos } = await supabase.from("cpo_operators").select("id, code, name");
    const ezdriveCpoId = cpos?.find((c: any) => c.code === "ezdrive")?.id;
    const totalEnergiesCpoId = cpos?.find((c: any) => c.code === "totalenergies")?.id;

    const seenGfxIds = new Set<string>();

    for (const cs of chargestations) {
      try {
        const gfxId = cs.id?.toString() ?? cs.charge_station_id?.toString() ?? cs.chargeStationId?.toString();
        if (!gfxId) { result.errors.push(`Station missing ID`); continue; }
        seenGfxIds.add(gfxId);

        const ocppStatus = normalizeStatus(cs.status ?? cs.ocpp_status ?? cs.state ?? cs.evse_status);
        const name = cs.name ?? cs.charge_station_name ?? cs.location_name ?? `Station ${gfxId}`;
        const address = cs.address ?? cs.street ?? cs.location?.address ?? null;
        const city = cs.city ?? cs.location?.city ?? null;
        const postalCode = cs.postal_code ?? cs.zip ?? cs.location?.postal_code ?? null;
        const lat = cs.latitude ?? cs.coordinates?.latitude ?? null;
        const lng = cs.longitude ?? cs.coordinates?.longitude ?? null;
        const locationId = cs.location_id ?? cs.locationId ?? null;

        const rawConnectors = cs.connectors ?? cs.evses ?? cs.charging_points ?? [];
        const connectors = rawConnectors.map((c: any, idx: number) => ({
          id: c.id?.toString() ?? `${idx + 1}`,
          type: c.connector_type ?? c.type ?? c.standard ?? "Unknown",
          status: normalizeStatus(c.status ?? c.ocpp_status ?? "Unknown"),
          max_power_kw: c.max_power ?? c.power ?? c.max_kw ?? 0,
        }));

        const maxPower = cs.max_power ?? cs.power_kw ?? (connectors.length > 0 ? Math.max(...connectors.map((c: any) => c.max_power_kw)) : null);
        const territoryCode = detectTerritory(postalCode);
        const territoryId = territoryCode ? territoryMap.get(territoryCode) ?? null : null;

        let cpoId: string | null = overrideMap.get(gfxId) ?? null;
        if (!cpoId) {
          const opName = cs.operator?.name ?? cs.operator_name ?? cs.cpo_name ?? "";
          if (opName.toLowerCase().includes("total") || opName.toLowerCase().includes("te ")) cpoId = totalEnergiesCpoId ?? null;
          else if (opName.toLowerCase().includes("ezdrive") || opName.toLowerCase().includes("suraya")) cpoId = ezdriveCpoId ?? null;
        }
        if (!cpoId && ezdriveCpoId) cpoId = ezdriveCpoId;

        const existing = stationMap.get(gfxId);

        if (!existing) {
          const { error: insertErr } = await supabase.from("stations").insert({
            gfx_id: gfxId, gfx_location_id: locationId, name, address, city,
            postal_code: postalCode, latitude: lat, longitude: lng,
            cpo_id: cpoId, territory_id: territoryId, ocpp_status: ocppStatus,
            status_since: new Date().toISOString(), is_online: true,
            connectors: JSON.stringify(connectors), max_power_kw: maxPower,
            gfx_raw: cs, last_synced_at: new Date().toISOString(),
          });
          if (insertErr) result.errors.push(`Insert error: ${insertErr.message}`);
          else {
            result.new_stations++;
            const { data: newStation } = await supabase.from("stations").select("id").eq("gfx_id", gfxId).single();
            if (newStation) await supabase.from("station_status_log").insert({ station_id: newStation.id, previous_status: null, new_status: ocppStatus });
          }
        } else {
          const statusChanged = existing.ocpp_status !== ocppStatus;
          const updateData: any = { last_synced_at: new Date().toISOString(), is_online: true, gfx_raw: cs, connectors: JSON.stringify(connectors), name, address, city, postal_code: postalCode };
          if (statusChanged) { updateData.ocpp_status = ocppStatus; updateData.status_since = new Date().toISOString(); }
          if (cpoId) updateData.cpo_id = cpoId;
          if (territoryId) updateData.territory_id = territoryId;
          await supabase.from("stations").update(updateData).eq("gfx_id", gfxId);
          if (statusChanged) {
            await supabase.from("station_status_log").insert({ station_id: existing.id, previous_status: existing.ocpp_status, new_status: ocppStatus });
            result.status_changes++;
          }
        }
        result.total_synced++;
      } catch (e) { result.errors.push(`Error: ${(e as Error).message}`); }
    }

    if (seenGfxIds.size > 0 && existingStations) {
      for (const unseen of existingStations.filter((s: any) => !seenGfxIds.has(s.gfx_id))) {
        await supabase.from("stations").update({ is_online: false, last_synced_at: new Date().toISOString() }).eq("id", unseen.id);
      }
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message, result }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

Déploie ces 3 Edge Functions et confirme quand c'est fait.
```

---

## PARTIE 3 — Copie-colle ceci dans Lovable (récupérer les infos de connexion) :

```
Maintenant j'ai besoin que tu me donnes les informations suivantes pour connecter mon frontend React (projet séparé) à cette instance Supabase :
1. L'URL du projet Supabase (format https://xxxx.supabase.co)
2. La clé anon/public (pour le frontend)

Ces informations ne sont PAS des secrets sensibles — la clé anon est publique par design (c'est pour ça qu'on a du RLS). J'en ai besoin pour configurer mon fichier .env dans mon projet React externe qui consomme ces tables et Edge Functions.

Donne-moi aussi l'URL complète pour invoquer la Edge Function gfx-sync (format https://xxxx.supabase.co/functions/v1/gfx-sync).
```

---

## Après avoir reçu les infos de Lovable :

Reviens ici et donne-moi l'URL Supabase et la clé anon. Je configurerai le .env du projet React et on pourra lancer le dashboard.
