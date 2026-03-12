import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Vérifie que l'utilisateur est authentifié
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Non autorisé" }, 401);
  }

  const body = await req.json().catch(() => null);
  if (!body?.station_id || !body?.gfx_id) {
    return json({ error: "station_id et gfx_id requis" }, 400);
  }

  const { station_id, gfx_id, cpo_id } = body as {
    station_id: string;
    gfx_id: string;
    cpo_id: string | null;
  };

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Met à jour la station directement (service_role bypass RLS)
  const { error: stationErr } = await supabase
    .from("stations")
    .update({ cpo_id: cpo_id ?? null })
    .eq("id", station_id);

  if (stationErr) {
    console.error("[update-station-cpo] Station update error:", stationErr);
    return json({ error: stationErr.message }, 500);
  }

  // 2. Gère la table station_cpo_overrides (pour que le sync respecte le tagging manuel)
  if (cpo_id) {
    const { error: overrideErr } = await supabase
      .from("station_cpo_overrides")
      .upsert({ gfx_id, cpo_id }, { onConflict: "gfx_id" });

    if (overrideErr) {
      console.error("[update-station-cpo] Override upsert error:", overrideErr);
      // Non bloquant : la station est déjà mise à jour
    }
  } else {
    // Supprime l'override si on remet à "auto-détection"
    await supabase
      .from("station_cpo_overrides")
      .delete()
      .eq("gfx_id", gfx_id);
  }

  console.log(`[update-station-cpo] Station ${gfx_id} → CPO ${cpo_id ?? "auto"}`);

  return json({ success: true, station_id, gfx_id, cpo_id });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
