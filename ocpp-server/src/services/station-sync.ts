// ============================================
// Service: Station Sync
// Utilities for syncing OCPP data to stations table
// ============================================

import { query, queryOne } from '../db';
import { logger } from '../index';

/**
 * Update the overall status of a station based on connector statuses.
 * Called when we receive multiple connector StatusNotifications.
 * Priority: Charging > Preparing > Finishing > Available > SuspendedEVSE > Reserved > Unavailable > Faulted
 */
const STATUS_PRIORITY: Record<string, number> = {
  'Charging': 7,
  'Preparing': 6,
  'Finishing': 5,
  'SuspendedEV': 4,
  'SuspendedEVSE': 3,
  'Available': 2,
  'Reserved': 1,
  'Unavailable': 0,
  'Faulted': -1,
};

export async function computeStationStatus(stationId: string): Promise<string> {
  // Get all connector statuses from the connectors JSONB
  const station = await queryOne<{ connectors: any[] }>(
    `SELECT connectors FROM stations WHERE id = $1`,
    [stationId]
  );

  if (!station || !station.connectors || !Array.isArray(station.connectors)) {
    return 'Unknown';
  }

  // Find the "best" status (highest priority)
  let bestStatus = 'Unknown';
  let bestPriority = -2;

  for (const conn of station.connectors) {
    const status = conn.status || 'Unknown';
    const priority = STATUS_PRIORITY[status] ?? -2;
    if (priority > bestPriority) {
      bestPriority = priority;
      bestStatus = status;
    }
  }

  return bestStatus;
}

/**
 * Get live stats for all OCPP-connected chargepoints.
 */
export async function getOcppStats(): Promise<{
  totalChargepoints: number;
  connectedCount: number;
  activeTransactions: number;
}> {
  const stats = await queryOne<{
    total: string;
    connected: string;
    active_tx: string;
  }>(
    `SELECT
       (SELECT count(*) FROM ocpp_chargepoints)::text as total,
       (SELECT count(*) FROM ocpp_chargepoints WHERE is_connected = true)::text as connected,
       (SELECT count(*) FROM ocpp_transactions WHERE status = 'Active')::text as active_tx`
  );

  return {
    totalChargepoints: parseInt(stats?.total || '0'),
    connectedCount: parseInt(stats?.connected || '0'),
    activeTransactions: parseInt(stats?.active_tx || '0'),
  };
}
