// ============================================
// Service: Chargepoint Management
// CRUD operations on ocpp_chargepoints table
// ============================================

import { query, queryOne } from '../db';
import { logger } from '../index';

interface ChargepointHardware {
  vendor: string;
  model: string;
  serialNumber?: string;
  firmwareVersion?: string;
  iccid?: string;
  imsi?: string;
}

interface Chargepoint {
  id: string;
  station_id: string | null;
  identity: string;
  vendor: string;
  model: string;
  registration_status: string;
  is_connected: boolean;
}

/**
 * Upsert a chargepoint on BootNotification.
 * - If identity exists, update hardware info and mark as connected.
 * - If identity is new, create a new record and auto-link to station by ocpp_identity match.
 */
export async function upsertChargepoint(
  identity: string,
  hardware: ChargepointHardware
): Promise<Chargepoint> {
  // Try to find existing chargepoint
  const existing = await queryOne<Chargepoint>(
    `SELECT id, station_id, identity, vendor, model, registration_status, is_connected
     FROM ocpp_chargepoints WHERE identity = $1`,
    [identity]
  );

  if (existing) {
    // Update existing chargepoint
    await query(
      `UPDATE ocpp_chargepoints
       SET vendor = $1, model = $2, serial_number = $3, firmware_version = $4,
           iccid = $5, imsi = $6, is_connected = true, connected_at = now(),
           last_heartbeat = now()
       WHERE identity = $7`,
      [
        hardware.vendor, hardware.model, hardware.serialNumber,
        hardware.firmwareVersion, hardware.iccid, hardware.imsi,
        identity,
      ]
    );

    // If not yet linked to a station, try to auto-link
    if (!existing.station_id) {
      await autoLinkStation(identity, existing.id);
    }

    // Mark linked station as online
    if (existing.station_id) {
      await query(
        `UPDATE stations SET is_online = true, last_synced_at = now() WHERE id = $1`,
        [existing.station_id]
      );
    }

    return { ...existing, is_connected: true };
  }

  // Create new chargepoint
  const newCp = await queryOne<Chargepoint>(
    `INSERT INTO ocpp_chargepoints
       (identity, vendor, model, serial_number, firmware_version, iccid, imsi,
        is_connected, connected_at, last_heartbeat, registration_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true, now(), now(), 'Accepted')
     RETURNING id, station_id, identity, vendor, model, registration_status, is_connected`,
    [
      identity, hardware.vendor, hardware.model, hardware.serialNumber,
      hardware.firmwareVersion, hardware.iccid, hardware.imsi,
    ]
  );

  if (!newCp) {
    throw new Error(`Failed to create chargepoint for identity: ${identity}`);
  }

  // Auto-link to station
  await autoLinkStation(identity, newCp.id);

  logger.info({ identity, id: newCp.id }, 'New chargepoint registered');
  return newCp;
}

/**
 * Try to link a chargepoint to a station by matching identity.
 */
async function autoLinkStation(identity: string, chargepointId: string): Promise<void> {
  const station = await queryOne<{ id: string }>(
    `SELECT id FROM stations WHERE ocpp_identity = $1`,
    [identity]
  );

  if (station) {
    await query(
      `UPDATE ocpp_chargepoints SET station_id = $1 WHERE id = $2`,
      [station.id, chargepointId]
    );
    logger.info({ identity, stationId: station.id }, 'Chargepoint auto-linked to station');
  } else {
    logger.info({ identity }, 'No station found for auto-linking (create station with ocpp_identity to link)');
  }
}

/**
 * Mark a chargepoint as disconnected (called on WebSocket close).
 */
export async function markChargepointDisconnected(identity: string): Promise<void> {
  const cp = await queryOne<{ id: string; station_id: string | null }>(
    `SELECT id, station_id FROM ocpp_chargepoints WHERE identity = $1`,
    [identity]
  );

  if (!cp) return;

  await query(
    `UPDATE ocpp_chargepoints
     SET is_connected = false, disconnected_at = now()
     WHERE identity = $1`,
    [identity]
  );

  // Mark station as offline if it was linked
  if (cp.station_id) {
    await query(
      `UPDATE stations
       SET is_online = false, last_synced_at = now()
       WHERE id = $1`,
      [cp.station_id]
    );
  }

  logger.info({ identity }, 'Chargepoint marked as disconnected');
}

/**
 * Get chargepoint by identity.
 */
export async function getChargepointByIdentity(identity: string): Promise<Chargepoint | null> {
  return queryOne<Chargepoint>(
    `SELECT id, station_id, identity, vendor, model, registration_status, is_connected
     FROM ocpp_chargepoints WHERE identity = $1`,
    [identity]
  );
}

/**
 * Get chargepoint by UUID.
 */
export async function getChargepointById(id: string): Promise<Chargepoint | null> {
  return queryOne<Chargepoint>(
    `SELECT id, station_id, identity, vendor, model, registration_status, is_connected
     FROM ocpp_chargepoints WHERE id = $1`,
    [id]
  );
}
