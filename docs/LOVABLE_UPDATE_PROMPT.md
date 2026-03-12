# MISE A JOUR EDGE FUNCTIONS — EZDrive (copie-colle dans Lovable)

---

## ÉTAPE 1 — Copie-colle ceci dans Lovable :

```
URGENT : Mets à jour le secret GFX_BASE_URL de l'Edge Function. L'ancienne valeur était https://platform.greenflux.com/api — la bonne valeur est :

GFX_BASE_URL = https://platform.greenflux.com/api/1.0

Change aussi le fichier _shared/gfx-client.ts pour que la valeur par défaut soit la bonne :

const GFX_BASE_URL = Deno.env.get("GFX_BASE_URL") ?? "https://platform.greenflux.com/api/1.0";

(le reste du fichier ne change pas)

Confirme quand c'est fait.
```

---

## ÉTAPE 2 — Copie-colle ceci dans Lovable (remplacement complet de gfx-sync) :

```
Remplace ENTIÈREMENT la Edge Function gfx-sync/index.ts par le code ci-dessous. C'est une réécriture majeure car l'API GreenFlux utilise le format OCPI (pas OCPP) et les données sont structurées différemment de ce qu'on avait anticipé. Changements clés :
- Fetch /chargestations ET /locations en parallèle (les adresses sont dans locations)
- Mapping OCPI → OCPP (AVAILABLE→Available, CHARGING→Charging, OUTOFORDER→Faulted)
- Statut station dérivé des EVSEs (plus fiable que le statut station-level)
- CPO détecté via le champ operator.name des locations (EZdrive vs TotalEnergies Drive)
- Filtrage : seules les stations deploy_state=Production sont synchronisées
- Puissance en Watts dans l'API (max_electric_power) → convertie en kW

Voici le code complet :

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { corsHeaders } from "../_shared/cors.ts";
import { gfxFetch } from "../_shared/gfx-client.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SyncResult {
  total_synced: number;
  new_stations: number;
  status_changes: number;
  skipped: number;
  errors: string[];
}

const OCPI_TO_OCPP: Record<string, string> = {
  AVAILABLE: "Available",
  CHARGING: "Charging",
  OUTOFORDER: "Faulted",
  BLOCKED: "Unavailable",
  INOPERATIVE: "Unavailable",
  PLANNED: "Unknown",
  REMOVED: "Unknown",
  UNKNOWN: "Unknown",
};

function normalizeStatus(raw: string | undefined | null): string {
  if (!raw) return "Unknown";
  const upper = raw.toUpperCase();
  return OCPI_TO_OCPP[upper] ?? "Unknown";
}

function deriveStationStatus(evses: Array<{ status?: string }>): string {
  if (!evses || evses.length === 0) return "Unknown";
  const statuses = evses.map((e) => (e.status ?? "UNKNOWN").toUpperCase());
  if (statuses.some((s) => s === "CHARGING")) return "Charging";
  if (statuses.every((s) => s === "AVAILABLE")) return "Available";
  if (statuses.some((s) => s === "OUTOFORDER" || s === "INOPERATIVE")) return "Faulted";
  if (statuses.some((s) => s === "AVAILABLE")) return "Available";
  return "Unknown";
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const result: SyncResult = { total_synced: 0, new_stations: 0, status_changes: 0, skipped: 0, errors: [] };

  try {
    console.log("[gfx-sync] Fetching chargestations and locations...");
    const [csRes, locRes] = await Promise.all([
      gfxFetch("/chargestations"),
      gfxFetch("/locations"),
    ]);

    if (!csRes.ok) throw new Error(`GFX chargestations API error ${csRes.status}: ${await csRes.text()}`);

    const csData = await csRes.json();
    const chargestations: Array<Record<string, unknown>> = csData?.data ?? [];

    const locationMap = new Map<string, Record<string, unknown>>();
    if (locRes.ok) {
      const locData = await locRes.json();
      const locations: Array<Record<string, unknown>> = locData?.data ?? [];
      for (const loc of locations) { if (loc.id) locationMap.set(loc.id as string, loc); }
      console.log(`[gfx-sync] Loaded ${locationMap.size} locations`);
    }

    console.log(`[gfx-sync] Received ${chargestations.length} chargestations`);

    const [{ data: existingStations }, { data: territories }, { data: overrides }, { data: cpos }] = await Promise.all([
      supabase.from("stations").select("id, gfx_id, ocpp_status"),
      supabase.from("territories").select("id, code"),
      supabase.from("station_cpo_overrides").select("gfx_id, cpo_id"),
      supabase.from("cpo_operators").select("id, code, name"),
    ]);

    const stationMap = new Map((existingStations ?? []).map((s: any) => [s.gfx_id, s]));
    const territoryMap = new Map((territories ?? []).map((t: any) => [t.code, t.id]));
    const overrideMap = new Map((overrides ?? []).map((o: any) => [o.gfx_id, o.cpo_id]));
    const ezdriveCpoId = cpos?.find((c: any) => c.code === "ezdrive")?.id;
    const totalEnergiesCpoId = cpos?.find((c: any) => c.code === "totalenergies")?.id;

    const seenGfxIds = new Set<string>();

    for (const cs of chargestations) {
      try {
        const gfxId = (cs.charge_station_id as string)?.toString();
        if (!gfxId) { result.errors.push("Station missing charge_station_id"); continue; }

        const deployState = cs.deploy_state as string;
        if (deployState && deployState !== "Production") { result.skipped++; continue; }

        seenGfxIds.add(gfxId);

        const locationId = cs.location_id as string | null;
        const location = locationId ? locationMap.get(locationId) : undefined;

        const name = (cs.name as string) ?? (location?.name as string) ?? `Station ${gfxId}`;
        const address = (location?.address as string) ?? null;
        const city = (location?.city as string) ?? null;
        const postalCode = (location?.postal_code as string) ?? null;
        const coords = location?.coordinates as { latitude: string; longitude: string } | undefined;
        let lat = coords ? parseFloat(coords.latitude) : null;
        let lng = coords ? parseFloat(coords.longitude) : null;

        const evses = (cs.evses as Array<Record<string, unknown>>) ?? [];
        if ((!lat || !lng) && evses.length > 0) {
          const evseCoords = evses[0].coordinates as { latitude: string; longitude: string } | undefined;
          if (evseCoords) { lat = parseFloat(evseCoords.latitude); lng = parseFloat(evseCoords.longitude); }
        }

        const ocppStatus = evses.length > 0
          ? deriveStationStatus(evses as Array<{ status?: string }>)
          : normalizeStatus(cs.status as string);

        const connectors = evses.flatMap((evse: Record<string, unknown>, evseIdx: number) => {
          const evseConnectors = (evse.connectors as Array<Record<string, unknown>>) ?? [];
          return evseConnectors.map((c: Record<string, unknown>, cIdx: number) => ({
            id: (c.id as string) ?? `${evseIdx + 1}-${cIdx + 1}`,
            evse_uid: (evse.uid as string) ?? `EVSE-${evseIdx + 1}`,
            type: (c.standard as string) ?? "Unknown",
            format: (c.format as string) ?? "Unknown",
            status: normalizeStatus(evse.status as string),
            max_power_kw: ((c.max_electric_power as number) ?? 0) / 1000,
          }));
        });

        const maxPower = connectors.length > 0 ? Math.max(...connectors.map((c: any) => c.max_power_kw)) : null;

        const territoryCode = detectTerritory(postalCode);
        const territoryId = territoryCode ? territoryMap.get(territoryCode) ?? null : null;

        let cpoId: string | null = overrideMap.get(gfxId) ?? null;
        if (!cpoId && location) {
          const operator = location.operator as { name?: string } | undefined;
          const operatorName = operator?.name ?? "";
          if (operatorName.toLowerCase().includes("total") || operatorName.toLowerCase().includes("te ")) cpoId = totalEnergiesCpoId ?? null;
          else if (operatorName.toLowerCase().includes("ezdrive") || operatorName.toLowerCase().includes("suraya")) cpoId = ezdriveCpoId ?? null;
        }
        if (!cpoId) {
          const stationName = name.toLowerCase();
          if (stationName.includes("total")) cpoId = totalEnergiesCpoId ?? null;
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
          if (insertErr) result.errors.push(`Insert error ${gfxId}: ${insertErr.message}`);
          else {
            result.new_stations++;
            const { data: newStation } = await supabase.from("stations").select("id").eq("gfx_id", gfxId).single();
            if (newStation) await supabase.from("station_status_log").insert({ station_id: newStation.id, previous_status: null, new_status: ocppStatus });
          }
        } else {
          const statusChanged = existing.ocpp_status !== ocppStatus;
          const updateData: any = {
            last_synced_at: new Date().toISOString(), is_online: true, gfx_raw: cs,
            connectors: JSON.stringify(connectors), name, address, city,
            postal_code: postalCode, latitude: lat, longitude: lng,
          };
          if (statusChanged) { updateData.ocpp_status = ocppStatus; updateData.status_since = new Date().toISOString(); }
          if (cpoId) updateData.cpo_id = cpoId;
          if (territoryId) updateData.territory_id = territoryId;
          if (maxPower !== null) updateData.max_power_kw = maxPower;

          const { error: updateErr } = await supabase.from("stations").update(updateData).eq("gfx_id", gfxId);
          if (updateErr) result.errors.push(`Update error ${gfxId}: ${updateErr.message}`);

          if (statusChanged) {
            await supabase.from("station_status_log").insert({ station_id: existing.id, previous_status: existing.ocpp_status, new_status: ocppStatus });
            result.status_changes++;
          }
        }
        result.total_synced++;
      } catch (stationError) { result.errors.push(`Station error: ${(stationError as Error).message}`); }
    }

    if (seenGfxIds.size > 0 && existingStations) {
      for (const unseen of existingStations.filter((s: any) => !seenGfxIds.has(s.gfx_id))) {
        await supabase.from("stations").update({ is_online: false, last_synced_at: new Date().toISOString() }).eq("id", unseen.id);
      }
    }

    console.log("[gfx-sync] Result:", JSON.stringify(result));
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[gfx-sync] Fatal error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message, result }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

Redéploie cette Edge Function et confirme quand c'est fait.
```

---

## Après confirmation de Lovable, reviens ici. On lancera la première synchro ensemble.
