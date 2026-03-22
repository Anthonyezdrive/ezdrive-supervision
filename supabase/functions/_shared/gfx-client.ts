const GFX_API_KEY = Deno.env.get("GFX_API_KEY_PROD") ?? "";
const GFX_BASE_URL =
  Deno.env.get("GFX_BASE_URL") ?? "https://platform.greenflux.com/api/1.0";

/** Safety timeout for all GFX API calls (30 seconds) */
const GFX_TIMEOUT_MS = 30_000;

export async function gfxFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  if (!GFX_API_KEY) {
    throw new Error("Missing GFX_API_KEY_PROD secret");
  }

  const url = `${GFX_BASE_URL}${path}`;
  console.log(`[GFX] Fetching: ${url}`);

  // AbortController with safety timeout to prevent infinite hangs
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GFX_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Token ${GFX_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options?.headers ?? {}),
      },
    });
    return res;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`[GFX] Timeout after ${GFX_TIMEOUT_MS / 1000}s: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export { GFX_BASE_URL };
