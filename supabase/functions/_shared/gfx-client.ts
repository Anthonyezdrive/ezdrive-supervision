const GFX_API_KEY = Deno.env.get("GFX_API_KEY_PROD") ?? "";
const GFX_BASE_URL =
  Deno.env.get("GFX_BASE_URL") ?? "https://platform.greenflux.com/api/1.0";

export async function gfxFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  if (!GFX_API_KEY) {
    throw new Error("Missing GFX_API_KEY_PROD secret");
  }

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
