// ============================================================
// EZDrive Admin API — Stations Management Module
// Admin CRUD for stations, chargepoint linking, status history
//
// Endpoints:
//   GET    /api/admin-stations                    — List stations (search, filter, paginate)
//   GET    /api/admin-stations/stats              — Dashboard KPIs
//   GET    /api/admin-stations/:id                — Station detail (+ chargepoints + status log + tariffs)
//   POST   /api/admin-stations                    — Create station
//   PUT    /api/admin-stations/:id                — Update station
//   DELETE /api/admin-stations/:id                — Soft-delete station
//   POST   /api/admin-stations/:id/link-chargepoint — Link chargepoint to station
//   GET    /api/admin-stations/:id/status-log     — Status change history (paginated)
// ============================================================

import {
  apiSuccess,
  apiCreated,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiServerError,
  apiPaginated,
  parsePagination,
} from "../../_shared/api-response.ts";
import { getServiceClient } from "../../_shared/auth-middleware.ts";
import type { RouteContext } from "../index.ts";

// ─── Main router ────────────────────────────────────────────

export async function handleAdminStations(ctx: RouteContext): Promise<Response> {
  const { method, segments, auth } = ctx;

  if (!auth) return apiForbidden("Authentication required");

  // ── Verify admin/operator role ──
  const db = getServiceClient();
  const { data: profile } = await db
    .from("ezdrive_profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  if (!profile || !["admin", "operator"].includes(profile.role)) {
    return apiForbidden("Only admin and operator roles can manage stations");
  }

  const action = segments[0] ?? "";
  const subAction = segments[1] ?? "";

  // Stats
  if (action === "stats" && method === "GET") {
    return await getStationStats(ctx);
  }

  // Root-level actions
  if (!action) {
    if (method === "GET") return await listStations(ctx);
    if (method === "POST") return await createStation(ctx);
    return apiBadRequest("GET or POST /admin-stations");
  }

  // Station-specific routes
  const stationId = action;

  if (!subAction) {
    if (method === "GET") return await getStationDetail(ctx, stationId);
    if (method === "PUT") return await updateStation(ctx, stationId);
    if (method === "DELETE") return await softDeleteStation(ctx, stationId);
    return apiBadRequest("GET, PUT or DELETE /admin-stations/:id");
  }

  switch (subAction) {
    case "link-chargepoint":
      if (method === "POST") return await linkChargepoint(ctx, stationId);
      return apiBadRequest("POST /admin-stations/:id/link-chargepoint");

    case "status-log":
      if (method === "GET") return await getStatusLog(ctx, stationId);
      return apiBadRequest("GET /admin-stations/:id/status-log");

    default:
      return apiNotFound(`Unknown station endpoint: ${subAction}`);
  }
}

// ═══════════════════════════════════════════════════════════
// LIST STATIONS
// GET /api/admin-stations?search=&status=&source=&cpo_id=&territory_id=&is_online=&offset=&limit=
// ═══════════════════════════════════════════════════════════

async function listStations(ctx: RouteContext): Promise<Response> {
  try {
    const db = getServiceClient();
    const { offset, limit } = parsePagination(ctx.url);
    const search = ctx.url.searchParams.get("search") ?? "";
    const status = ctx.url.searchParams.get("status");
    const source = ctx.url.searchParams.get("source");
    const cpoId = ctx.url.searchParams.get("cpo_id");
    const territoryId = ctx.url.searchParams.get("territory_id");
    const isOnline = ctx.url.searchParams.get("is_online");

    // Count query
    let countQuery = db
      .from("stations")
      .select("id", { count: "exact", head: true });

    // Data query
    let dataQuery = db
      .from("stations")
      .select(`
        id, name, address, city, postal_code,
        latitude, longitude, ocpp_status, is_online,
        connectors, max_power_kw, source, ocpp_identity,
        network_id, created_at, updated_at,
        cpo_operators ( id, name, code, color ),
        territories ( id, name, code )
      `)
      .order("name")
      .range(offset, offset + limit - 1);

    // Apply filters
    if (search) {
      const filter = `name.ilike.%${search}%,address.ilike.%${search}%,city.ilike.%${search}%`;
      countQuery = countQuery.or(filter);
      dataQuery = dataQuery.or(filter);
    }

    if (status) {
      countQuery = countQuery.eq("ocpp_status", status);
      dataQuery = dataQuery.eq("ocpp_status", status);
    }

    if (source) {
      countQuery = countQuery.eq("source", source);
      dataQuery = dataQuery.eq("source", source);
    }

    if (cpoId) {
      countQuery = countQuery.eq("cpo_id", cpoId);
      dataQuery = dataQuery.eq("cpo_id", cpoId);
    }

    if (territoryId) {
      countQuery = countQuery.eq("territory_id", territoryId);
      dataQuery = dataQuery.eq("territory_id", territoryId);
    }

    if (isOnline !== null && isOnline !== undefined && isOnline !== "") {
      const online = isOnline === "true";
      countQuery = countQuery.eq("is_online", online);
      dataQuery = dataQuery.eq("is_online", online);
    }

    const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);

    if (dataResult.error) throw dataResult.error;

    return apiPaginated(dataResult.data ?? [], {
      total: countResult.count ?? 0,
      offset,
      limit,
    });
  } catch (err) {
    console.error("[AdminStations] listStations error:", err);
    return apiServerError("Failed to fetch stations");
  }
}

// ═══════════════════════════════════════════════════════════
// STATION STATS
// GET /api/admin-stations/stats
// ═══════════════════════════════════════════════════════════

async function getStationStats(ctx: RouteContext): Promise<Response> {
  try {
    const db = getServiceClient();

    const [
      totalResult,
      onlineResult,
      statusProfiles,
      sourceProfiles,
      cpoProfiles,
      connectedCps,
    ] = await Promise.all([
      // Total stations
      db.from("stations").select("id", { count: "exact", head: true }),

      // Online stations
      db.from("stations").select("id", { count: "exact", head: true }).eq("is_online", true),

      // By status
      db.from("stations").select("ocpp_status"),

      // By source
      db.from("stations").select("source"),

      // By CPO
      db.from("stations").select("cpo_id, cpo_operators ( name, code )"),

      // Connected chargepoints
      db.from("ocpp_chargepoints").select("id", { count: "exact", head: true }).eq("is_connected", true),
    ]);

    // Process status breakdown
    const byStatus: Record<string, number> = {};
    if (statusProfiles.data) {
      for (const s of statusProfiles.data) {
        const st = s.ocpp_status ?? "Unknown";
        byStatus[st] = (byStatus[st] || 0) + 1;
      }
    }

    // Process source breakdown
    const bySource: Record<string, number> = {};
    if (sourceProfiles.data) {
      for (const s of sourceProfiles.data) {
        const src = s.source ?? "unknown";
        bySource[src] = (bySource[src] || 0) + 1;
      }
    }

    // Process CPO breakdown
    const byCpo: Record<string, number> = {};
    if (cpoProfiles.data) {
      for (const s of cpoProfiles.data as Record<string, unknown>[]) {
        const cpo = s.cpo_operators as Record<string, unknown> | null;
        const cpoName = (cpo?.name as string) ?? "Sans CPO";
        byCpo[cpoName] = (byCpo[cpoName] || 0) + 1;
      }
    }

    return apiSuccess({
      stations: {
        total: totalResult.count ?? 0,
        online: onlineResult.count ?? 0,
        offline: (totalResult.count ?? 0) - (onlineResult.count ?? 0),
        by_status: byStatus,
        by_source: bySource,
        by_cpo: byCpo,
      },
      ocpp: {
        chargepoints_connected: connectedCps.count ?? 0,
      },
    });
  } catch (err) {
    console.error("[AdminStations] getStationStats error:", err);
    return apiServerError("Failed to fetch station stats");
  }
}

// ═══════════════════════════════════════════════════════════
// STATION DETAIL
// GET /api/admin-stations/:id
// ═══════════════════════════════════════════════════════════

async function getStationDetail(ctx: RouteContext, stationId: string): Promise<Response> {
  try {
    const db = getServiceClient();

    const [stationResult, chargepointsResult, statusLogResult, tariffsResult] = await Promise.all([
      // Station with joins
      db.from("stations")
        .select(`
          *,
          cpo_operators ( id, name, code, color ),
          territories ( id, name, code ),
          charging_networks ( id, name, code, logo_url, color )
        `)
        .eq("id", stationId)
        .maybeSingle(),

      // OCPP chargepoints linked to this station
      db.from("ocpp_chargepoints")
        .select(`
          id, identity, is_connected, last_heartbeat,
          vendor, model, serial_number, firmware_version,
          ocpp_protocol, registration_status,
          number_of_connectors, connected_at, disconnected_at
        `)
        .eq("station_id", stationId)
        .order("is_connected", { ascending: false }),

      // Recent status changes (last 20)
      db.from("station_status_log")
        .select("id, previous_status, new_status, changed_at")
        .eq("station_id", stationId)
        .order("changed_at", { ascending: false })
        .limit(20),

      // Station tariffs
      db.from("station_tariffs")
        .select(`
          id, tariff_id, priority, connector_type,
          valid_from, valid_to, source, created_at,
          ocpi_tariffs ( tariff_id, elements, currency )
        `)
        .eq("station_id", stationId)
        .order("priority"),
    ]);

    if (stationResult.error || !stationResult.data) {
      return apiNotFound("Station not found");
    }

    return apiSuccess({
      station: stationResult.data,
      chargepoints: chargepointsResult.data ?? [],
      recent_status_log: statusLogResult.data ?? [],
      tariffs: tariffsResult.data ?? [],
    });
  } catch (err) {
    console.error("[AdminStations] getStationDetail error:", err);
    return apiServerError("Failed to fetch station detail");
  }
}

// ═══════════════════════════════════════════════════════════
// CREATE STATION
// POST /api/admin-stations
// Body: { name, address, city, postal_code, latitude, longitude, max_power_kw, connectors, cpo_id?, territory_id?, network_id?, ocpp_identity? }
// ═══════════════════════════════════════════════════════════

async function createStation(ctx: RouteContext): Promise<Response> {
  try {
    const db = getServiceClient();
    const body = await ctx.req.json();

    if (!body.name) return apiBadRequest("name is required");
    if (!body.city) return apiBadRequest("city is required");

    // Auto-detect territory from postal_code
    let territoryId = body.territory_id ?? null;
    if (!territoryId && body.postal_code) {
      const prefix = body.postal_code.substring(0, 3);
      if (["971", "972", "973", "974"].includes(prefix)) {
        const { data: territory } = await db
          .from("territories")
          .select("id")
          .eq("code", prefix)
          .maybeSingle();
        if (territory) territoryId = territory.id;
      }
    }

    // Auto-detect EZDrive CPO if not specified
    let cpoId = body.cpo_id ?? null;
    if (!cpoId) {
      const { data: ezdriveCpo } = await db
        .from("cpo_operators")
        .select("id")
        .eq("code", "ezdrive")
        .maybeSingle();
      if (ezdriveCpo) cpoId = ezdriveCpo.id;
    }

    const { data: station, error } = await db
      .from("stations")
      .insert({
        name: body.name,
        address: body.address ?? null,
        city: body.city,
        postal_code: body.postal_code ?? null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        max_power_kw: body.max_power_kw ?? null,
        connectors: body.connectors ?? [],
        source: "manual",
        cpo_id: cpoId,
        territory_id: territoryId,
        network_id: body.network_id ?? null,
        ocpp_identity: body.ocpp_identity ?? null,
        ocpp_status: "Unknown",
        is_online: false,
      })
      .select(`
        *,
        cpo_operators ( id, name, code ),
        territories ( id, name, code )
      `)
      .single();

    if (error) {
      console.error("[AdminStations] Create error:", error);
      if (error.code === "23505") {
        return apiBadRequest("A station with this identity already exists");
      }
      return apiServerError("Failed to create station");
    }

    console.log(`[AdminStations] Station created: ${body.name} (${station.id})`);
    return apiCreated(station);
  } catch (err) {
    console.error("[AdminStations] createStation error:", err);
    return apiServerError("Failed to create station");
  }
}

// ═══════════════════════════════════════════════════════════
// UPDATE STATION
// PUT /api/admin-stations/:id
// ═══════════════════════════════════════════════════════════

async function updateStation(ctx: RouteContext, stationId: string): Promise<Response> {
  try {
    const db = getServiceClient();
    const body = await ctx.req.json();

    // Whitelist updatable fields
    const allowed: Record<string, unknown> = {};
    const fields = [
      "name", "address", "city", "postal_code",
      "latitude", "longitude", "max_power_kw",
      "connectors", "cpo_id", "territory_id", "network_id",
      "ocpp_identity", "ocpp_status", "is_online",
    ];

    for (const f of fields) {
      if (body[f] !== undefined) allowed[f] = body[f];
    }

    if (Object.keys(allowed).length === 0) {
      return apiBadRequest("No valid fields to update");
    }

    // If status is changing, log it
    if (allowed.ocpp_status) {
      const { data: currentStation } = await db
        .from("stations")
        .select("ocpp_status")
        .eq("id", stationId)
        .maybeSingle();

      if (currentStation && currentStation.ocpp_status !== allowed.ocpp_status) {
        await db.from("station_status_log").insert({
          station_id: stationId,
          previous_status: currentStation.ocpp_status,
          new_status: allowed.ocpp_status as string,
        });
        allowed.status_since = new Date().toISOString();
      }
    }

    const { data, error } = await db
      .from("stations")
      .update(allowed)
      .eq("id", stationId)
      .select(`
        *,
        cpo_operators ( id, name, code ),
        territories ( id, name, code )
      `)
      .single();

    if (error) {
      if (error.code === "PGRST116") return apiNotFound("Station not found");
      throw error;
    }

    console.log(`[AdminStations] Station updated: ${stationId}`);
    return apiSuccess(data);
  } catch (err) {
    console.error("[AdminStations] updateStation error:", err);
    return apiServerError("Failed to update station");
  }
}

// ═══════════════════════════════════════════════════════════
// SOFT-DELETE STATION
// DELETE /api/admin-stations/:id
// ═══════════════════════════════════════════════════════════

async function softDeleteStation(ctx: RouteContext, stationId: string): Promise<Response> {
  try {
    const db = getServiceClient();

    // Get current status for log
    const { data: currentStation } = await db
      .from("stations")
      .select("ocpp_status, name")
      .eq("id", stationId)
      .maybeSingle();

    if (!currentStation) return apiNotFound("Station not found");

    // Log the status change
    if (currentStation.ocpp_status !== "Unavailable") {
      await db.from("station_status_log").insert({
        station_id: stationId,
        previous_status: currentStation.ocpp_status,
        new_status: "Unavailable",
      });
    }

    // Soft-delete: mark as offline and unavailable
    const { data, error } = await db
      .from("stations")
      .update({
        is_online: false,
        ocpp_status: "Unavailable",
        status_since: new Date().toISOString(),
      })
      .eq("id", stationId)
      .select("id, name, ocpp_status, is_online")
      .single();

    if (error) throw error;

    console.log(`[AdminStations] Station soft-deleted: ${currentStation.name} (${stationId})`);
    return apiSuccess({
      ...data,
      message: `Station "${currentStation.name}" marked as unavailable and offline`,
    });
  } catch (err) {
    console.error("[AdminStations] softDeleteStation error:", err);
    return apiServerError("Failed to delete station");
  }
}

// ═══════════════════════════════════════════════════════════
// LINK CHARGEPOINT TO STATION
// POST /api/admin-stations/:id/link-chargepoint
// Body: { chargepoint_id }
// ═══════════════════════════════════════════════════════════

async function linkChargepoint(ctx: RouteContext, stationId: string): Promise<Response> {
  try {
    const db = getServiceClient();
    const body = await ctx.req.json();

    if (!body.chargepoint_id) return apiBadRequest("chargepoint_id is required");

    // Verify station exists
    const { data: station } = await db
      .from("stations")
      .select("id, name, ocpp_identity")
      .eq("id", stationId)
      .maybeSingle();

    if (!station) return apiNotFound("Station not found");

    // Verify chargepoint exists
    const { data: cp } = await db
      .from("ocpp_chargepoints")
      .select("id, identity, is_connected, station_id")
      .eq("id", body.chargepoint_id)
      .maybeSingle();

    if (!cp) return apiNotFound("Chargepoint not found");

    // Link chargepoint to station
    const { error: cpError } = await db
      .from("ocpp_chargepoints")
      .update({ station_id: stationId })
      .eq("id", body.chargepoint_id);

    if (cpError) throw cpError;

    // Update station's ocpp_identity if not set
    if (!station.ocpp_identity) {
      await db
        .from("stations")
        .update({
          ocpp_identity: cp.identity,
          is_online: cp.is_connected,
        })
        .eq("id", stationId);
    }

    // If chargepoint is connected, mark station as online
    if (cp.is_connected) {
      await db
        .from("stations")
        .update({ is_online: true })
        .eq("id", stationId);
    }

    console.log(`[AdminStations] Chargepoint ${cp.identity} linked to station ${station.name}`);

    return apiSuccess({
      station_id: stationId,
      chargepoint_id: body.chargepoint_id,
      chargepoint_identity: cp.identity,
      message: `Chargepoint ${cp.identity} linked to station "${station.name}"`,
    });
  } catch (err) {
    console.error("[AdminStations] linkChargepoint error:", err);
    return apiServerError("Failed to link chargepoint");
  }
}

// ═══════════════════════════════════════════════════════════
// STATUS LOG
// GET /api/admin-stations/:id/status-log?offset=&limit=
// ═══════════════════════════════════════════════════════════

async function getStatusLog(ctx: RouteContext, stationId: string): Promise<Response> {
  try {
    const db = getServiceClient();
    const { offset, limit } = parsePagination(ctx.url);

    // Count
    const { count } = await db
      .from("station_status_log")
      .select("id", { count: "exact", head: true })
      .eq("station_id", stationId);

    // Data
    const { data, error } = await db
      .from("station_status_log")
      .select("id, previous_status, new_status, changed_at")
      .eq("station_id", stationId)
      .order("changed_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return apiPaginated(data ?? [], {
      total: count ?? 0,
      offset,
      limit,
    });
  } catch (err) {
    console.error("[AdminStations] getStatusLog error:", err);
    return apiServerError("Failed to fetch status log");
  }
}
