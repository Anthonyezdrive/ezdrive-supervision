// ============================================
// OCPP Handler: StatusNotification
// Reports connector status changes
// Triggers: stations.ocpp_status update → OCPI push to Gireve (via DB trigger)
// ============================================

import { query, queryOne } from '../db';
import { logger } from '../index';
import { computeStationStatus } from '../services/station-sync';

interface StatusNotificationParams {
  connectorId: number;
  errorCode: string;
  status: string;
  timestamp?: string;
  info?: string;
  vendorId?: string;
  vendorErrorCode?: string;
}

// Valid OCPP 1.6 statuses
const VALID_STATUSES = [
  'Available', 'Preparing', 'Charging', 'SuspendedEVSE', 'SuspendedEV',
  'Finishing', 'Reserved', 'Unavailable', 'Faulted',
];

export async function handleStatusNotification(
  identity: string,
  params: StatusNotificationParams
): Promise<Record<string, never>> {
  const { connectorId, errorCode, status, timestamp, info } = params;

  try {
    // Get chargepoint and linked station
    const cp = await queryOne<{ id: string; station_id: string | null }>(
      `SELECT id, station_id FROM ocpp_chargepoints WHERE identity = $1`,
      [identity]
    );

    if (!cp) {
      logger.warn({ identity }, 'StatusNotification from unknown chargepoint');
      return {};
    }

    // ConnectorId 0 means the chargepoint itself (not a specific connector)
    // ConnectorId > 0 means a specific connector
    const normalizedStatus = VALID_STATUSES.includes(status) ? status : 'Unknown';

    // Update station status (if linked)
    if (cp.station_id) {
      // ── Capture old status BEFORE any update (for status log) ──
      const oldStation = await queryOne<{ ocpp_status: string }>(
        `SELECT ocpp_status FROM stations WHERE id = $1`,
        [cp.station_id]
      );
      const oldStatus = oldStation?.ocpp_status || 'Unknown';

      if (connectorId === 0) {
        // Chargepoint-level status: only update if it's a critical status
        if (['Unavailable', 'Faulted'].includes(normalizedStatus)) {
          const isOnline = normalizedStatus !== 'Faulted' && normalizedStatus !== 'Unavailable';
          await query(
            `UPDATE stations
             SET ocpp_status = $1::text,
                 status_since = COALESCE($2::timestamptz, now()),
                 is_online = $3::boolean,
                 last_synced_at = now()
             WHERE id = $4::uuid`,
            [
              normalizedStatus,
              timestamp || null,
              isOnline,
              cp.station_id,
            ]
          );
        }
      } else {
        // ── Update connectors JSONB FIRST to track per-connector status ──
        await query(
          `UPDATE stations
           SET connectors = (
             SELECT jsonb_agg(
               CASE
                 WHEN (c->>'id')::int = $2::int THEN c || jsonb_build_object('status', $3::text, 'errorCode', $4::text)
                 ELSE c
               END
             )
             FROM jsonb_array_elements(COALESCE(connectors, '[]'::jsonb)) c
           )
           WHERE id = $1::uuid AND connectors IS NOT NULL AND jsonb_array_length(connectors) > 0`,
          [cp.station_id, connectorId, normalizedStatus, errorCode]
        );

        // ── Compute aggregate station status from ALL connectors ──
        const bestStatus = await computeStationStatus(cp.station_id);
        const isOnline = !['Faulted', 'Unavailable'].includes(bestStatus);

        await query(
          `UPDATE stations
           SET ocpp_status = $1::text,
               status_since = COALESCE($2::timestamptz, now()),
               is_online = $3::boolean,
               last_synced_at = now()
           WHERE id = $4::uuid`,
          [bestStatus, timestamp || null, isOnline, cp.station_id]
        );
      }

      // ── Log status change (using old_status captured BEFORE the update) ──
      if (oldStatus !== normalizedStatus) {
        await query(
          `INSERT INTO station_status_log (station_id, old_status, new_status, source)
           VALUES ($1, $2, $3, 'ocpp')
           ON CONFLICT DO NOTHING`,
          [cp.station_id, oldStatus, normalizedStatus]
        ).catch(() => {
          // station_status_log might not exist, that's OK
        });
      }
    }

    // Log error codes
    if (errorCode && errorCode !== 'NoError') {
      logger.warn({
        identity,
        connectorId,
        errorCode,
        status: normalizedStatus,
        info,
      }, 'Chargepoint error reported');
    }

    logger.info({
      identity,
      connectorId,
      status: normalizedStatus,
      errorCode,
    }, 'Status updated');

  } catch (err) {
    logger.error({ err, identity }, 'StatusNotification handler error');
  }

  // OCPP 1.6 spec: StatusNotification.conf is empty
  return {};
}
