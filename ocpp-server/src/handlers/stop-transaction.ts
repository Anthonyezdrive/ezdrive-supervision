// ============================================
// OCPP Handler: StopTransaction
// Called when a charging session ends
// ============================================

import { query, queryOne } from '../db';
import { logger } from '../index';
import { authorizeIdTag } from './authorize';
import { finalizeOcpiSession } from '../services/ocpi-bridge';

interface StopTransactionParams {
  transactionId: number;
  meterStop: number;
  timestamp: string;
  idTag?: string;
  reason?: string;
  transactionData?: any[];
}

interface StopTransactionResponse {
  idTagInfo?: {
    status: 'Accepted' | 'Blocked' | 'Expired' | 'Invalid' | 'ConcurrentTx';
  };
}

export async function handleStopTransaction(
  identity: string,
  params: StopTransactionParams
): Promise<StopTransactionResponse> {
  const { transactionId, meterStop, timestamp, idTag, reason } = params;

  try {
    // Find the chargepoint
    const cp = await queryOne<{ id: string; station_id: string | null }>(
      `SELECT id, station_id FROM ocpp_chargepoints WHERE identity = $1`,
      [identity]
    );

    if (!cp) {
      logger.error({ identity }, 'StopTransaction: chargepoint not found');
      return {};
    }

    // Find the active transaction
    const tx = await queryOne<{
      id: string;
      meter_start: number;
      connector_id: number;
      id_tag: string;
      started_at: string;
    }>(
      `SELECT id, meter_start, connector_id, id_tag, started_at
       FROM ocpp_transactions
       WHERE chargepoint_id = $1 AND ocpp_transaction_id = $2 AND status = 'Active'`,
      [cp.id, transactionId]
    );

    if (!tx) {
      logger.warn({ identity, transactionId }, 'StopTransaction: active transaction not found');
      return {};
    }

    // Calculate energy consumed (Wh → kWh)
    const energyKwh = tx.meter_start != null && meterStop != null
      ? (meterStop - tx.meter_start) / 1000
      : null;

    // Update transaction
    await query(
      `UPDATE ocpp_transactions
       SET meter_stop = $1,
           energy_kwh = $2,
           stopped_at = $3,
           stop_reason = $4,
           status = 'Completed'
       WHERE id = $5`,
      [meterStop, energyKwh, timestamp || new Date().toISOString(), reason || 'Local', tx.id]
    );

    // Update station status back to Available
    if (cp.station_id) {
      await query(
        `UPDATE stations
         SET ocpp_status = 'Available', status_since = now(), last_synced_at = now()
         WHERE id = $1`,
        [cp.station_id]
      );
    }

    // Finalize OCPI session and create CDR (async, non-blocking)
    finalizeOcpiSession(tx.id, meterStop, energyKwh, timestamp || new Date().toISOString())
      .catch(err => logger.error({ err }, 'Failed to finalize OCPI session'));

    logger.info({
      identity,
      transactionId,
      energyKwh,
      reason: reason || 'Local',
      durationMinutes: tx.started_at
        ? Math.round((new Date(timestamp || Date.now()).getTime() - new Date(tx.started_at).getTime()) / 60000)
        : null,
    }, 'Transaction stopped');

    // Optionally authorize the stop tag
    if (idTag) {
      const idTagInfo = await authorizeIdTag(idTag);
      return { idTagInfo };
    }

    return {};

  } catch (err) {
    logger.error({ err, identity, transactionId }, 'StopTransaction handler error');
    return {};
  }
}
