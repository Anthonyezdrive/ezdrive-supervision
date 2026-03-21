const ROAD_API_TOKEN = Deno.env.get("ROAD_API_TOKEN") ?? "";
const ROAD_BASE_URL =
  Deno.env.get("ROAD_BASE_URL") ?? "https://api.road.io";
const ROAD_PROVIDER_ID =
  Deno.env.get("ROAD_PROVIDER_ID") ?? "668be406335353001c35f1d8";

export async function roadFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  if (!ROAD_API_TOKEN) {
    throw new Error("Missing ROAD_API_TOKEN secret");
  }

  const url = `${ROAD_BASE_URL}${path}`;
  console.log(`[ROAD] ${options?.method ?? "GET"} ${url}`);

  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${ROAD_API_TOKEN}`,
      provider: ROAD_PROVIDER_ID,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

export async function roadPost(
  path: string,
  body: unknown
): Promise<Response> {
  return roadFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export { ROAD_BASE_URL, ROAD_PROVIDER_ID };
