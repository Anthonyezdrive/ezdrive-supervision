import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { gfxFetch } from "../_shared/gfx-client.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const stationId =
      url.searchParams.get("station_id") ?? url.searchParams.get("id");

    if (!stationId) {
      return new Response(
        JSON.stringify({ error: "Missing station_id parameter" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const gfxRes = await gfxFetch(`/chargestations/${stationId}`);

    if (!gfxRes.ok) {
      const errText = await gfxRes.text();
      return new Response(
        JSON.stringify({
          error: `GreenFlux API error: ${gfxRes.status}`,
          detail: errText,
        }),
        {
          status: gfxRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await gfxRes.json();

    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[gfx-station-detail] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
