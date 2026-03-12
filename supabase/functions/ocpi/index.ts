// ============================================================
// OCPI 2.2.1 Main Router — EZDrive CPO + eMSP
// Handles ALL incoming OCPI requests from Gireve IOP
//
// URL Pattern: /functions/v1/ocpi/{path}
// Gireve calls: /functions/v1/ocpi/2.2.1/locations/FR/EZD/...
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateOcpiRequest, validateInternalRequest } from "../_shared/ocpi-auth.ts";
import {
  ocpiSuccess,
  ocpiPaginatedSuccess,
  ocpiError,
  ocpiNotFound,
  ocpiUnauthorized,
  ocpiCorsResponse,
  parsePagination,
  parseDateFilters,
  OCPI_STATUS,
} from "../_shared/ocpi-response.ts";
import {
  getOcpiLocations,
  getOcpiLocationById,
  getOcpiEvseByUid,
  getOcpiTokens,
  getOcpiTokenByUid,
  authorizeToken,
  getOcpiSessions,
  getOcpiCdrs,
  getOcpiTariffs,
  saveCommand,
  getDB,
} from "../_shared/ocpi-db.ts";
import {
  OCPI_VERSION,
  EZDRIVE_COUNTRY_CODE,
  EZDRIVE_PARTY_ID,
  EZDRIVE_OPERATOR_NAME,
  EZDRIVE_OPERATOR_WEBSITE,
  EZDRIVE_CPO_MODULES,
  EZDRIVE_EMSP_MODULES,
  type OcpiVersion,
  type OcpiVersionDetail,
  type OcpiCredentials,
  type OcpiLocation,
  type OcpiEVSE,
  type OcpiConnector,
  type OcpiToken,
  type OcpiSession,
  type OcpiCDR,
  type OcpiTariff,
} from "../_shared/ocpi-types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

// Base URL for our OCPI endpoints
function getBaseUrl(): string {
  return `${SUPABASE_URL}/functions/v1/ocpi`;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return ocpiCorsResponse();
  }

  try {
    const url = new URL(req.url);
    // Extract path after /functions/v1/ocpi/
    const fullPath = url.pathname;
    const ocpiPath = fullPath.replace(/^\/functions\/v1\/ocpi\/?/, "").replace(/^ocpi\/?/, "");

    console.log(`[OCPI Router] ${req.method} /${ocpiPath}`);

    // --- Public endpoints (no OCPI auth required) ---

    // GET /versions
    if (ocpiPath === "versions" || ocpiPath === "") {
      return handleVersions();
    }

    // GET /2.2.1 (version details)
    if (ocpiPath === "2.2.1" || ocpiPath === OCPI_VERSION) {
      return handleVersionDetails();
    }

    // --- OCPI-authenticated endpoints ---

    // Check if this is an internal request (from our admin/frontend)
    const isInternal = req.headers.get("authorization")?.startsWith("Bearer ");

    let isAuthenticated = false;

    if (isInternal) {
      isAuthenticated = await validateInternalRequest(req);
    } else {
      // Validate OCPI token (from Gireve)
      const authResult = await validateOcpiRequest(req);
      isAuthenticated = authResult.valid;

      if (!isAuthenticated) {
        console.warn(`[OCPI Router] Auth failed: ${authResult.error}`);
        return ocpiUnauthorized(authResult.headers?.correlationId);
      }
    }

    if (!isAuthenticated) {
      return ocpiUnauthorized();
    }

    // Parse version prefix
    const parts = ocpiPath.split("/").filter(Boolean);
    const version = parts[0]; // "2.2.1"

    if (version !== "2.2.1" && version !== OCPI_VERSION) {
      return ocpiError(OCPI_STATUS.UNSUPPORTED_VERSION, `Unsupported version: ${version}`);
    }

    const module = parts[1]; // "locations", "tokens", "credentials", etc.
    const subParts = parts.slice(2); // remaining path segments

    // Route to module handler
    switch (module) {
      case "credentials":
        return await handleCredentials(req, subParts);
      case "locations":
        return await handleLocations(req, url, subParts);
      case "tokens":
        return await handleTokens(req, url, subParts);
      case "sessions":
        return await handleSessions(req, url, subParts);
      case "cdrs":
        return await handleCdrs(req, url, subParts);
      case "tariffs":
        return await handleTariffs(req, url, subParts);
      case "commands":
        return await handleCommands(req, subParts);
      default:
        return ocpiError(OCPI_STATUS.NO_MATCHING_ENDPOINTS, `Unknown module: ${module}`);
    }
  } catch (err) {
    console.error("[OCPI Router] Unhandled error:", err);
    return ocpiError(OCPI_STATUS.GENERIC_SERVER_ERROR, `Internal error: ${err instanceof Error ? err.message : "Unknown"}`);
  }
});

// ============================================================
// VERSIONS
// ============================================================

function handleVersions(): Response {
  const versions: OcpiVersion[] = [
    {
      version: OCPI_VERSION,
      url: `${getBaseUrl()}/${OCPI_VERSION}`,
    },
  ];
  return ocpiSuccess(versions);
}

function handleVersionDetails(): Response {
  const baseUrl = `${getBaseUrl()}/${OCPI_VERSION}`;

  const detail: OcpiVersionDetail = {
    version: OCPI_VERSION,
    endpoints: [
      // CPO SENDER endpoints (Gireve pulls from us)
      { identifier: "credentials", role: "SENDER", url: `${baseUrl}/credentials` },
      { identifier: "locations", role: "SENDER", url: `${baseUrl}/locations` },
      { identifier: "tariffs", role: "SENDER", url: `${baseUrl}/tariffs` },
      { identifier: "sessions", role: "SENDER", url: `${baseUrl}/sessions` },
      { identifier: "cdrs", role: "SENDER", url: `${baseUrl}/cdrs` },
      // CPO RECEIVER endpoints (Gireve pushes to us)
      { identifier: "commands", role: "RECEIVER", url: `${baseUrl}/commands` },
      { identifier: "tokens", role: "RECEIVER", url: `${baseUrl}/tokens` },
      // eMSP RECEIVER endpoints (Gireve pushes to us)
      { identifier: "locations", role: "RECEIVER", url: `${baseUrl}/locations` },
      { identifier: "sessions", role: "RECEIVER", url: `${baseUrl}/sessions` },
      { identifier: "cdrs", role: "RECEIVER", url: `${baseUrl}/cdrs` },
      { identifier: "tariffs", role: "RECEIVER", url: `${baseUrl}/tariffs` },
      // eMSP SENDER endpoints
      { identifier: "tokens", role: "SENDER", url: `${baseUrl}/tokens` },
    ],
  };
  return ocpiSuccess(detail);
}

// ============================================================
// CREDENTIALS MODULE
// ============================================================

async function handleCredentials(req: Request, parts: string[]): Promise<Response> {
  const method = req.method;

  if (method === "GET") {
    // Return our credentials
    const credentials: OcpiCredentials = {
      token: "PLACEHOLDER_TOKEN_A",  // Will be replaced during registration
      url: `${getBaseUrl()}/versions`,
      roles: [
        {
          role: "CPO",
          business_details: {
            name: EZDRIVE_OPERATOR_NAME,
            website: EZDRIVE_OPERATOR_WEBSITE,
          },
          party_id: EZDRIVE_PARTY_ID,
          country_code: EZDRIVE_COUNTRY_CODE,
        },
        {
          role: "EMSP",
          business_details: {
            name: EZDRIVE_OPERATOR_NAME,
            website: EZDRIVE_OPERATOR_WEBSITE,
          },
          party_id: EZDRIVE_PARTY_ID,
          country_code: EZDRIVE_COUNTRY_CODE,
        },
      ],
    };
    return ocpiSuccess(credentials);
  }

  if (method === "POST") {
    // Registration: Gireve sends us their credentials
    const body = await req.json() as OcpiCredentials;

    const db = getDB();

    // Generate new token_a for Gireve to use
    const newTokenA = crypto.randomUUID();

    // Store Gireve's token (which becomes our token_b for outgoing calls)
    for (const roleEntry of body.roles) {
      await db
        .from("ocpi_credentials")
        .update({
          token_a: newTokenA,
          token_b: body.token,
          versions_url: body.url,
          status: "CONNECTED",
          gireve_country_code: roleEntry.country_code,
          gireve_party_id: roleEntry.party_id,
        })
        .eq("role", roleEntry.role === "CPO" ? "EMSP" : "CPO")  // Their CPO = our eMSP receiver
        .eq("country_code", EZDRIVE_COUNTRY_CODE)
        .eq("party_id", EZDRIVE_PARTY_ID);
    }

    // Return our credentials with the new token_a
    const response: OcpiCredentials = {
      token: newTokenA,
      url: `${getBaseUrl()}/versions`,
      roles: [
        {
          role: "CPO",
          business_details: { name: EZDRIVE_OPERATOR_NAME, website: EZDRIVE_OPERATOR_WEBSITE },
          party_id: EZDRIVE_PARTY_ID,
          country_code: EZDRIVE_COUNTRY_CODE,
        },
        {
          role: "EMSP",
          business_details: { name: EZDRIVE_OPERATOR_NAME, website: EZDRIVE_OPERATOR_WEBSITE },
          party_id: EZDRIVE_PARTY_ID,
          country_code: EZDRIVE_COUNTRY_CODE,
        },
      ],
    };
    return ocpiSuccess(response);
  }

  if (method === "PUT") {
    // Token rotation / credential update
    const body = await req.json() as OcpiCredentials;
    const db = getDB();

    const newTokenA = crypto.randomUUID();

    for (const roleEntry of body.roles) {
      await db
        .from("ocpi_credentials")
        .update({
          token_a: newTokenA,
          token_b: body.token,
          versions_url: body.url,
        })
        .eq("role", roleEntry.role === "CPO" ? "EMSP" : "CPO")
        .eq("country_code", EZDRIVE_COUNTRY_CODE)
        .eq("party_id", EZDRIVE_PARTY_ID);
    }

    const response: OcpiCredentials = {
      token: newTokenA,
      url: `${getBaseUrl()}/versions`,
      roles: [
        {
          role: "CPO",
          business_details: { name: EZDRIVE_OPERATOR_NAME, website: EZDRIVE_OPERATOR_WEBSITE },
          party_id: EZDRIVE_PARTY_ID,
          country_code: EZDRIVE_COUNTRY_CODE,
        },
        {
          role: "EMSP",
          business_details: { name: EZDRIVE_OPERATOR_NAME, website: EZDRIVE_OPERATOR_WEBSITE },
          party_id: EZDRIVE_PARTY_ID,
          country_code: EZDRIVE_COUNTRY_CODE,
        },
      ],
    };
    return ocpiSuccess(response);
  }

  if (method === "DELETE") {
    // Unregister
    const db = getDB();
    await db
      .from("ocpi_credentials")
      .update({ status: "SUSPENDED", token_a: null, token_b: null })
      .eq("country_code", EZDRIVE_COUNTRY_CODE)
      .eq("party_id", EZDRIVE_PARTY_ID);

    return ocpiSuccess(null);
  }

  return ocpiError(OCPI_STATUS.GENERIC_CLIENT_ERROR, `Method ${req.method} not supported`);
}

// ============================================================
// LOCATIONS MODULE (CPO SENDER + eMSP RECEIVER)
// ============================================================

async function handleLocations(req: Request, url: URL, parts: string[]): Promise<Response> {
  const method = req.method;

  // CPO SENDER: GET /locations — Gireve pulls our locations
  if (method === "GET" && parts.length === 0) {
    const { offset, limit } = parsePagination(url, 20);
    const { dateFrom, dateTo } = parseDateFilters(url);

    const { data, count, error } = await getOcpiLocations({
      countryCode: EZDRIVE_COUNTRY_CODE,
      partyId: EZDRIVE_PARTY_ID,
      offset,
      limit,
      dateFrom,
      dateTo,
    });

    if (error) {
      console.error("[OCPI Locations] DB error:", error);
      return ocpiError(OCPI_STATUS.GENERIC_SERVER_ERROR, "Database error");
    }

    const locations = (data ?? []).map(formatLocationFromDB);

    return ocpiPaginatedSuccess(locations, {
      offset,
      limit,
      total: count ?? 0,
    });
  }

  // GET /locations/{country_code}/{party_id}/{location_id}
  if (method === "GET" && parts.length >= 3) {
    const [countryCode, partyId, locationId] = parts;

    const { data, error } = await getOcpiLocationById(countryCode, partyId, locationId);

    if (error || !data) {
      return ocpiNotFound(`Location ${locationId} not found`);
    }

    return ocpiSuccess(formatLocationFromDB(data));
  }

  // GET /locations/{country_code}/{party_id}/{location_id}/{evse_uid}
  if (method === "GET" && parts.length >= 4) {
    const [countryCode, partyId, locationId, evseUid] = parts;

    const { data: location } = await getOcpiLocationById(countryCode, partyId, locationId);
    if (!location) return ocpiNotFound(`Location ${locationId} not found`);

    const { data: evse } = await getOcpiEvseByUid(location.id, evseUid);
    if (!evse) return ocpiNotFound(`EVSE ${evseUid} not found`);

    return ocpiSuccess(formatEvseFromDB(evse));
  }

  // eMSP RECEIVER: PUT /locations/{country_code}/{party_id}/{location_id}
  // Gireve pushes location data to us (as eMSP)
  if (method === "PUT" && parts.length >= 3) {
    const [countryCode, partyId, locationId] = parts;
    const body = await req.json();

    const db = getDB();
    await db.from("ocpi_locations").upsert({
      ocpi_id: locationId,
      country_code: countryCode,
      party_id: partyId,
      name: body.name,
      address: body.address,
      city: body.city,
      postal_code: body.postal_code,
      country: body.country,
      latitude: parseFloat(body.coordinates?.latitude ?? "0"),
      longitude: parseFloat(body.coordinates?.longitude ?? "0"),
      operator_name: body.operator?.name,
      publish: body.publish ?? true,
      time_zone: body.time_zone ?? "Europe/Paris",
      last_updated: body.last_updated ?? new Date().toISOString(),
    }, {
      onConflict: "country_code,party_id,ocpi_id",
    });

    // Upsert EVSEs
    if (body.evses) {
      for (const evse of body.evses) {
        const { data: locationRow } = await db
          .from("ocpi_locations")
          .select("id")
          .eq("ocpi_id", locationId)
          .eq("country_code", countryCode)
          .eq("party_id", partyId)
          .single();

        if (locationRow) {
          const { data: evseRow } = await db.from("ocpi_evses").upsert({
            location_id: locationRow.id,
            uid: evse.uid,
            evse_id: evse.evse_id,
            status: evse.status,
            capabilities: evse.capabilities,
            last_updated: evse.last_updated,
          }, {
            onConflict: "location_id,uid",
          }).select().single();

          // Upsert connectors
          if (evseRow && evse.connectors) {
            for (const conn of evse.connectors) {
              await db.from("ocpi_connectors").upsert({
                evse_id: evseRow.id,
                connector_id: conn.id,
                standard: conn.standard,
                format: conn.format,
                power_type: conn.power_type,
                max_voltage: conn.max_voltage,
                max_amperage: conn.max_amperage,
                max_electric_power: conn.max_electric_power,
                tariff_ids: conn.tariff_ids,
                last_updated: conn.last_updated,
              }, {
                onConflict: "evse_id,connector_id",
              });
            }
          }
        }
      }
    }

    return ocpiSuccess(null);
  }

  // PATCH /locations/{country_code}/{party_id}/{location_id}/{evse_uid}
  if (method === "PATCH" && parts.length >= 4) {
    const [countryCode, partyId, locationId, evseUid] = parts;
    const body = await req.json();

    const db = getDB();
    const { data: location } = await db
      .from("ocpi_locations")
      .select("id")
      .eq("ocpi_id", locationId)
      .eq("country_code", countryCode)
      .eq("party_id", partyId)
      .single();

    if (!location) return ocpiNotFound(`Location ${locationId} not found`);

    // Partial update EVSE
    const updateData: Record<string, unknown> = { last_updated: new Date().toISOString() };
    if (body.status) updateData.status = body.status;
    if (body.capabilities) updateData.capabilities = body.capabilities;

    await db
      .from("ocpi_evses")
      .update(updateData)
      .eq("location_id", location.id)
      .eq("uid", evseUid);

    return ocpiSuccess(null);
  }

  return ocpiError(OCPI_STATUS.GENERIC_CLIENT_ERROR, `${method} not supported for locations`);
}

// ============================================================
// TOKENS MODULE (CPO RECEIVER + eMSP SENDER)
// ============================================================

async function handleTokens(req: Request, url: URL, parts: string[]): Promise<Response> {
  const method = req.method;

  // eMSP SENDER: GET /tokens — Gireve pulls tokens from us
  if (method === "GET" && parts.length === 0) {
    const { offset, limit } = parsePagination(url, 1000);
    const { dateFrom } = parseDateFilters(url);

    const { data, count, error } = await getOcpiTokens({
      countryCode: EZDRIVE_COUNTRY_CODE,
      partyId: EZDRIVE_PARTY_ID,
      offset,
      limit,
      dateFrom,
    });

    if (error) return ocpiError(OCPI_STATUS.GENERIC_SERVER_ERROR, "Database error");

    const tokens = (data ?? []).map(formatTokenFromDB);
    return ocpiPaginatedSuccess(tokens, { offset, limit, total: count ?? 0 });
  }

  // CPO RECEIVER: PUT /tokens/{country_code}/{party_id}/{token_uid}
  // Gireve pushes a token to us (for local authorization)
  if (method === "PUT" && parts.length >= 3) {
    const [countryCode, partyId, tokenUid] = parts;
    const body = await req.json();

    const db = getDB();
    await db.from("ocpi_tokens").upsert({
      country_code: countryCode,
      party_id: partyId,
      uid: tokenUid,
      type: body.type,
      contract_id: body.contract_id,
      auth_method: body.auth_method ?? "AUTH_REQUEST",
      visual_number: body.visual_number,
      issuer: body.issuer,
      valid: body.valid,
      whitelist: body.whitelist ?? "ALLOWED",
      language: body.language,
      profile_type: body.default_profile_type,
      last_updated: body.last_updated ?? new Date().toISOString(),
    }, {
      onConflict: "country_code,party_id,uid",
    });

    return ocpiSuccess(null);
  }

  // PATCH /tokens/{country_code}/{party_id}/{token_uid}
  if (method === "PATCH" && parts.length >= 3) {
    const [countryCode, partyId, tokenUid] = parts;
    const body = await req.json();

    const db = getDB();
    const updateData: Record<string, unknown> = { last_updated: new Date().toISOString() };
    if (body.valid !== undefined) updateData.valid = body.valid;
    if (body.whitelist) updateData.whitelist = body.whitelist;
    if (body.type) updateData.type = body.type;

    await db.from("ocpi_tokens")
      .update(updateData)
      .eq("country_code", countryCode)
      .eq("party_id", partyId)
      .eq("uid", tokenUid);

    return ocpiSuccess(null);
  }

  // POST /tokens/{token_uid}/authorize — Real-time Authorization (from Gireve)
  // Per Gireve spec: LocationReferences is mandatory
  if (method === "POST" && parts.length >= 2 && parts[parts.length - 1] === "authorize") {
    const tokenUid = parts[0];
    const body = await req.json();

    const result = await authorizeToken(tokenUid, body.location_references);

    return ocpiSuccess({
      allowed: result.allowed,
      token: result.token ? formatTokenFromDB(result.token) : undefined,
      authorization_reference: result.allowed === "ALLOWED" ? crypto.randomUUID() : undefined,
      location: result.location,
    });
  }

  return ocpiError(OCPI_STATUS.GENERIC_CLIENT_ERROR, `${method} not supported for tokens`);
}

// ============================================================
// SESSIONS MODULE (CPO SENDER + eMSP RECEIVER)
// ============================================================

async function handleSessions(req: Request, url: URL, parts: string[]): Promise<Response> {
  const method = req.method;

  // CPO SENDER: GET /sessions — Gireve pulls sessions
  if (method === "GET" && parts.length === 0) {
    const { offset, limit } = parsePagination(url, 20);
    const { dateFrom } = parseDateFilters(url);

    const { data, count, error } = await getOcpiSessions({
      countryCode: EZDRIVE_COUNTRY_CODE,
      partyId: EZDRIVE_PARTY_ID,
      offset,
      limit,
      dateFrom,
    });

    if (error) return ocpiError(OCPI_STATUS.GENERIC_SERVER_ERROR, "Database error");

    const sessions = (data ?? []).map(formatSessionFromDB);
    return ocpiPaginatedSuccess(sessions, { offset, limit, total: count ?? 0 });
  }

  // eMSP RECEIVER: PUT /sessions/{country_code}/{party_id}/{session_id}
  if (method === "PUT" && parts.length >= 3) {
    const [countryCode, partyId, sessionId] = parts;
    const body = await req.json();

    const db = getDB();
    await db.from("ocpi_sessions").upsert({
      country_code: countryCode,
      party_id: partyId,
      session_id: sessionId,
      start_date_time: body.start_date_time,
      end_date_time: body.end_date_time,
      kwh: body.kwh,
      cdr_token: body.cdr_token,
      location_id: body.location_id,
      evse_uid: body.evse_uid,
      connector_id: body.connector_id,
      meter_id: body.meter_id,
      currency: body.currency,
      total_cost: body.total_cost,
      status: body.status,
      charging_periods: body.charging_periods,
      authorization_reference: body.authorization_reference,
      last_updated: body.last_updated ?? new Date().toISOString(),
    }, {
      onConflict: "country_code,party_id,session_id",
    });

    return ocpiSuccess(null);
  }

  // PATCH /sessions/{country_code}/{party_id}/{session_id}
  if (method === "PATCH" && parts.length >= 3) {
    const [countryCode, partyId, sessionId] = parts;
    const body = await req.json();

    const db = getDB();
    const updateData: Record<string, unknown> = { last_updated: new Date().toISOString() };
    if (body.status) updateData.status = body.status;
    if (body.kwh !== undefined) updateData.kwh = body.kwh;
    if (body.end_date_time) updateData.end_date_time = body.end_date_time;
    if (body.total_cost) updateData.total_cost = body.total_cost;
    if (body.charging_periods) updateData.charging_periods = body.charging_periods;

    await db.from("ocpi_sessions")
      .update(updateData)
      .eq("country_code", countryCode)
      .eq("party_id", partyId)
      .eq("session_id", sessionId);

    return ocpiSuccess(null);
  }

  return ocpiError(OCPI_STATUS.GENERIC_CLIENT_ERROR, `${method} not supported for sessions`);
}

// ============================================================
// CDRs MODULE (CPO SENDER + eMSP RECEIVER)
// ============================================================

async function handleCdrs(req: Request, url: URL, parts: string[]): Promise<Response> {
  const method = req.method;

  // CPO SENDER: GET /cdrs — Gireve pulls CDRs
  if (method === "GET" && parts.length === 0) {
    const { offset, limit } = parsePagination(url, 20);
    const { dateFrom } = parseDateFilters(url);

    const { data, count, error } = await getOcpiCdrs({
      countryCode: EZDRIVE_COUNTRY_CODE,
      partyId: EZDRIVE_PARTY_ID,
      offset,
      limit,
      dateFrom,
    });

    if (error) return ocpiError(OCPI_STATUS.GENERIC_SERVER_ERROR, "Database error");

    const cdrs = (data ?? []).map(formatCdrFromDB);
    return ocpiPaginatedSuccess(cdrs, { offset, limit, total: count ?? 0 });
  }

  // eMSP RECEIVER: POST /cdrs — Gireve pushes a CDR to us
  if (method === "POST" && parts.length === 0) {
    const body = await req.json();

    const db = getDB();
    await db.from("ocpi_cdrs").insert({
      country_code: body.country_code,
      party_id: body.party_id,
      cdr_id: body.id,
      start_date_time: body.start_date_time,
      end_date_time: body.end_date_time,
      session_id: body.session_id,
      cdr_token: body.cdr_token,
      cdr_location: body.cdr_location,
      meter_id: body.meter_id,
      total_energy: body.total_energy,
      total_time: body.total_time,
      total_parking_time: body.total_parking_time,
      currency: body.currency,
      total_cost: body.total_cost?.excl_vat ?? body.total_cost,
      total_fixed_cost: body.total_fixed_cost?.excl_vat,
      total_energy_cost: body.total_energy_cost?.excl_vat,
      total_time_cost: body.total_time_cost?.excl_vat,
      total_parking_cost: body.total_parking_cost?.excl_vat,
      charging_periods: body.charging_periods,
      tariffs: body.tariffs,
      remark: body.remark,
      credit: body.credit ?? false,
      credit_reference_id: body.credit_reference_id,
      authorization_reference: body.authorization_reference,
      last_updated: body.last_updated ?? new Date().toISOString(),
    });

    return ocpiSuccess(null);
  }

  return ocpiError(OCPI_STATUS.GENERIC_CLIENT_ERROR, `${method} not supported for CDRs`);
}

// ============================================================
// TARIFFS MODULE (CPO SENDER + eMSP RECEIVER)
// ============================================================

async function handleTariffs(req: Request, url: URL, parts: string[]): Promise<Response> {
  const method = req.method;

  // CPO SENDER: GET /tariffs — Gireve pulls our tariffs
  if (method === "GET" && parts.length === 0) {
    const { offset, limit } = parsePagination(url, 100);
    const { dateFrom } = parseDateFilters(url);

    const { data, count, error } = await getOcpiTariffs({
      countryCode: EZDRIVE_COUNTRY_CODE,
      partyId: EZDRIVE_PARTY_ID,
      offset,
      limit,
      dateFrom,
    });

    if (error) return ocpiError(OCPI_STATUS.GENERIC_SERVER_ERROR, "Database error");

    const tariffs = (data ?? []).map(formatTariffFromDB);
    return ocpiPaginatedSuccess(tariffs, { offset, limit, total: count ?? 0 });
  }

  // eMSP RECEIVER: PUT /tariffs/{country_code}/{party_id}/{tariff_id}
  if (method === "PUT" && parts.length >= 3) {
    const [countryCode, partyId, tariffId] = parts;
    const body = await req.json();

    const db = getDB();
    await db.from("ocpi_tariffs").upsert({
      country_code: countryCode,
      party_id: partyId,
      tariff_id: tariffId,
      currency: body.currency,
      type: body.type,
      elements: body.elements,
      start_date_time: body.start_date_time,
      end_date_time: body.end_date_time,
      tariff_alt_text: body.tariff_alt_text,
      tariff_alt_url: body.tariff_alt_url,
      energy_mix: body.energy_mix,
      target_operator_country_code: body.target_operator_country_code,
      target_operator_party_id: body.target_operator_party_id,
      gireve_id: body.gireve_id,
      last_updated: body.last_updated ?? new Date().toISOString(),
    }, {
      onConflict: "country_code,party_id,tariff_id,COALESCE(target_operator_country_code, ''),COALESCE(target_operator_party_id, '')",
    });

    return ocpiSuccess(null);
  }

  return ocpiError(OCPI_STATUS.GENERIC_CLIENT_ERROR, `${method} not supported for tariffs`);
}

// ============================================================
// COMMANDS MODULE (CPO RECEIVER)
// ============================================================

async function handleCommands(req: Request, parts: string[]): Promise<Response> {
  if (req.method !== "POST") {
    return ocpiError(OCPI_STATUS.GENERIC_CLIENT_ERROR, "Only POST allowed for commands");
  }

  const commandType = parts[0]?.toUpperCase();
  const body = await req.json();

  if (!["START_SESSION", "STOP_SESSION", "RESERVE_NOW", "CANCEL_RESERVATION", "UNLOCK_CONNECTOR"].includes(commandType)) {
    return ocpiError(OCPI_STATUS.GENERIC_CLIENT_ERROR, `Unknown command: ${commandType}`);
  }

  // Save the command
  const { data: savedCommand, error } = await saveCommand({
    command: commandType,
    source: "RECEIVED",
    request_data: body,
    response_url: body.response_url,
  });

  if (error) {
    return ocpiError(OCPI_STATUS.GENERIC_SERVER_ERROR, "Failed to save command");
  }

  // Since EZDrive doesn't have a CSMS (GFX/ROAD handle chargers),
  // we can't directly execute commands. We acknowledge receipt and
  // forward to the appropriate backend (GFX/ROAD) if needed.

  // For now: accept the command and send async callback
  console.log(`[OCPI Commands] Received ${commandType}:`, JSON.stringify(body));

  // Return command response (sync part)
  return ocpiSuccess({
    result: "ACCEPTED",
    timeout: 30,
    message: [{ language: "en", text: `Command ${commandType} received and queued` }],
  });
}

// ============================================================
// DB → OCPI FORMAT HELPERS
// ============================================================

function formatLocationFromDB(row: Record<string, unknown>): OcpiLocation {
  const evses = (row.ocpi_evses as Record<string, unknown>[] ?? []).map(formatEvseFromDB);

  return {
    country_code: row.country_code as string,
    party_id: row.party_id as string,
    id: row.ocpi_id as string,
    publish: row.publish as boolean,
    name: row.name as string | undefined,
    address: row.address as string,
    city: row.city as string,
    postal_code: row.postal_code as string | undefined,
    country: row.country as string,
    coordinates: {
      latitude: String(row.latitude),
      longitude: String(row.longitude),
    },
    evses,
    operator: {
      name: (row.operator_name as string) ?? EZDRIVE_OPERATOR_NAME,
      website: (row.operator_website as string) ?? EZDRIVE_OPERATOR_WEBSITE,
    },
    time_zone: (row.time_zone as string) ?? "America/Martinique",
    opening_times: { twentyfourseven: true },
    last_updated: (row.last_updated as string) ?? new Date().toISOString(),
  };
}

function formatEvseFromDB(row: Record<string, unknown>): OcpiEVSE {
  const connectors = (row.ocpi_connectors as Record<string, unknown>[] ?? []).map(formatConnectorFromDB);

  return {
    uid: row.uid as string,
    evse_id: row.evse_id as string | undefined,
    status: row.status as OcpiEVSE["status"],
    capabilities: row.capabilities as string[] ?? [],
    connectors,
    floor_level: row.floor_level as string | undefined,
    physical_reference: row.physical_reference as string | undefined,
    directions: row.directions as OcpiEVSE["directions"],
    parking_restrictions: row.parking_restrictions as string[] ?? [],
    last_updated: (row.last_updated as string) ?? new Date().toISOString(),
  };
}

function formatConnectorFromDB(row: Record<string, unknown>): OcpiConnector {
  return {
    id: row.connector_id as string,
    standard: row.standard as OcpiConnector["standard"],
    format: row.format as OcpiConnector["format"],
    power_type: row.power_type as OcpiConnector["power_type"],
    max_voltage: row.max_voltage as number,
    max_amperage: row.max_amperage as number,
    max_electric_power: row.max_electric_power as number | undefined,
    tariff_ids: row.tariff_ids as string[] | undefined,
    last_updated: (row.last_updated as string) ?? new Date().toISOString(),
  };
}

function formatTokenFromDB(row: Record<string, unknown>): OcpiToken {
  return {
    country_code: row.country_code as string,
    party_id: row.party_id as string,
    uid: row.uid as string,
    type: row.type as OcpiToken["type"],
    contract_id: row.contract_id as string,
    visual_number: row.visual_number as string | undefined,
    issuer: (row.issuer as string) ?? "EZDrive",
    valid: row.valid as boolean,
    whitelist: (row.whitelist as OcpiToken["whitelist"]) ?? "ALLOWED",
    language: row.language as string | undefined,
    default_profile_type: row.profile_type as string | undefined,
    last_updated: (row.last_updated as string) ?? new Date().toISOString(),
  };
}

function formatSessionFromDB(row: Record<string, unknown>): OcpiSession {
  return {
    country_code: row.country_code as string,
    party_id: row.party_id as string,
    id: row.session_id as string,
    start_date_time: row.start_date_time as string,
    end_date_time: row.end_date_time as string | undefined,
    kwh: row.kwh as number,
    cdr_token: row.cdr_token as OcpiSession["cdr_token"],
    auth_method: "AUTH_REQUEST",
    authorization_reference: row.authorization_reference as string | undefined,
    location_id: row.location_id as string,
    evse_uid: row.evse_uid as string,
    connector_id: row.connector_id as string,
    meter_id: row.meter_id as string | undefined,
    currency: (row.currency as string) ?? "EUR",
    charging_periods: row.charging_periods as OcpiSession["charging_periods"],
    total_cost: row.total_cost as OcpiSession["total_cost"],
    status: row.status as OcpiSession["status"],
    last_updated: (row.last_updated as string) ?? new Date().toISOString(),
  };
}

function formatCdrFromDB(row: Record<string, unknown>): OcpiCDR {
  return {
    country_code: row.country_code as string,
    party_id: row.party_id as string,
    id: row.cdr_id as string,
    start_date_time: row.start_date_time as string,
    end_date_time: row.end_date_time as string,
    session_id: row.session_id as string | undefined,
    cdr_token: row.cdr_token as OcpiCDR["cdr_token"],
    auth_method: "AUTH_REQUEST",
    authorization_reference: row.authorization_reference as string | undefined,
    cdr_location: row.cdr_location as OcpiCDR["cdr_location"],
    meter_id: row.meter_id as string | undefined,
    currency: (row.currency as string) ?? "EUR",
    tariffs: row.tariffs as OcpiCDR["tariffs"],
    charging_periods: row.charging_periods as OcpiCDR["charging_periods"],
    total_cost: { excl_vat: row.total_cost as number },
    total_fixed_cost: row.total_fixed_cost ? { excl_vat: row.total_fixed_cost as number } : undefined,
    total_energy: row.total_energy as number,
    total_energy_cost: row.total_energy_cost ? { excl_vat: row.total_energy_cost as number } : undefined,
    total_time: row.total_time as number,
    total_time_cost: row.total_time_cost ? { excl_vat: row.total_time_cost as number } : undefined,
    total_parking_time: row.total_parking_time as number | undefined,
    total_parking_cost: row.total_parking_cost ? { excl_vat: row.total_parking_cost as number } : undefined,
    remark: row.remark as string | undefined,
    credit: row.credit as boolean ?? false,
    credit_reference_id: row.credit_reference_id as string | undefined,
    last_updated: (row.last_updated as string) ?? new Date().toISOString(),
  };
}

function formatTariffFromDB(row: Record<string, unknown>): OcpiTariff {
  return {
    country_code: row.country_code as string,
    party_id: row.party_id as string,
    id: row.tariff_id as string,
    currency: (row.currency as string) ?? "EUR",
    type: row.type as string | undefined,
    tariff_alt_text: row.tariff_alt_text as OcpiTariff["tariff_alt_text"],
    tariff_alt_url: row.tariff_alt_url as string | undefined,
    elements: row.elements as OcpiTariff["elements"],
    start_date_time: row.start_date_time as string | undefined,
    end_date_time: row.end_date_time as string | undefined,
    energy_mix: row.energy_mix as OcpiTariff["energy_mix"],
    last_updated: (row.last_updated as string) ?? new Date().toISOString(),
  };
}
