// ============================================
// Road.io API Client — Multi-account support
// Each CPO (EZDrive Réunion, VCity AG) has its own token + provider
// ============================================

const ROAD_BASE_URL =
  Deno.env.get("ROAD_BASE_URL") ?? "https://api.road.io";

// EZDrive Réunion credentials
const ROAD_API_TOKEN = Deno.env.get("ROAD_API_TOKEN") ?? "";
const ROAD_PROVIDER_ID =
  Deno.env.get("ROAD_PROVIDER_ID") ?? "668be406335353001c35f1d8";

// VCity AG credentials
const ROAD_VCITY_API_TOKEN = Deno.env.get("ROAD_VCITY_API_TOKEN") ?? "";
const ROAD_VCITY_PROVIDER_ID =
  Deno.env.get("ROAD_VCITY_PROVIDER_ID") ?? "";

// -------------------------------------------------------
// Default functions (backward-compatible, use Réunion creds)
// -------------------------------------------------------
export async function roadFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  return roadFetchWithAuth(path, ROAD_API_TOKEN, ROAD_PROVIDER_ID, options);
}

export async function roadPost(
  path: string,
  body: unknown
): Promise<Response> {
  return roadPostWithAuth(path, body, ROAD_API_TOKEN, ROAD_PROVIDER_ID);
}

// -------------------------------------------------------
// Multi-account functions — pass explicit token + provider
// -------------------------------------------------------
export async function roadFetchWithAuth(
  path: string,
  token: string,
  providerId: string,
  options?: RequestInit
): Promise<Response> {
  if (!token) {
    throw new Error("Missing Road API token");
  }

  const url = `${ROAD_BASE_URL}${path}`;
  console.log(`[ROAD] ${options?.method ?? "GET"} ${url} (provider: ${providerId.slice(0, 8)}…)`);

  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      provider: providerId,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

export async function roadPostWithAuth(
  path: string,
  body: unknown,
  token: string,
  providerId: string
): Promise<Response> {
  return roadFetchWithAuth(path, token, providerId, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// -------------------------------------------------------
// Account registry — returns all configured Road accounts
// -------------------------------------------------------
export interface RoadAccountConfig {
  providerId: string;
  apiToken: string;
  cpoCode: string;
  label: string;
  watermarkId: string;
}

export function getRoadAccounts(): RoadAccountConfig[] {
  const accounts: RoadAccountConfig[] = [];

  if (ROAD_PROVIDER_ID && ROAD_API_TOKEN) {
    accounts.push({
      providerId: ROAD_PROVIDER_ID,
      apiToken: ROAD_API_TOKEN,
      cpoCode: "ezdrive-reunion",
      label: "EZDrive Réunion",
      watermarkId: "road-cdr-sync-reunion",
    });
  }

  if (ROAD_VCITY_PROVIDER_ID && ROAD_VCITY_API_TOKEN) {
    accounts.push({
      providerId: ROAD_VCITY_PROVIDER_ID,
      apiToken: ROAD_VCITY_API_TOKEN,
      cpoCode: "vcity-ag",
      label: "VCity AG",
      watermarkId: "road-cdr-sync-vcity",
    });
  }

  return accounts;
}

export { ROAD_BASE_URL, ROAD_PROVIDER_ID, ROAD_VCITY_PROVIDER_ID };
