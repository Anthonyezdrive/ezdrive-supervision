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

    // --- Idle Fee Detection ---
    let parkingDurationMinutes: number | null = null;
    let idleFeeCents: number | null = null;

    try {
      // Query idle fee configuration for this station
      const idleFeeConfig = cp.station_id
        ? await queryOne<{
            grace_period_minutes: number;
            fee_per_minute_cents: number;
            max_fee_cents: number;
          }>(
            `SELECT grace_period_minutes, fee_per_minute_cents, max_fee_cents
             FROM idle_fee_config
             WHERE station_id = $1 AND enabled = true`,
            [cp.station_id]
          )
        : null;

      if (idleFeeConfig) {
        // Find the last MeterValue with power > 0 (i.e. when charging actually stopped)
        const lastActiveMeter = await queryOne<{ sampled_at: string }>(
          `SELECT sampled_at
           FROM ocpp_meter_values
           WHERE transaction_id = $1
             AND power_active_import_w > 0
           ORDER BY sampled_at DESC
           LIMIT 1`,
          [tx.id]
        );

        if (lastActiveMeter) {
          const chargingEndTime = new Date(lastActiveMeter.sampled_at);
          const stopTime = new Date(timestamp || Date.now());
          const parkingMs = stopTime.getTime() - chargingEndTime.getTime();
          parkingDurationMinutes = Math.max(0, Math.round(parkingMs / 60000));

          const excessMinutes = parkingDurationMinutes - idleFeeConfig.grace_period_minutes;

          if (excessMinutes > 0) {
            const rawFee = excessMinutes * idleFeeConfig.fee_per_minute_cents;
            idleFeeCents = Math.min(rawFee, idleFeeConfig.max_fee_cents);
            logger.info(
              {
                transactionId: tx.id,
                parkingDurationMinutes,
                gracePeriod: idleFeeConfig.grace_period_minutes,
                excessMinutes,
                idleFeeCents,
              },
              'Idle fee applied'
            );
          }
        }
      }
    } catch (err) {
      logger.warn({ err, transactionId: tx.id }, 'Failed to compute idle fee, skipping');
    }

    // Update transaction
    await query(
      `UPDATE ocpp_transactions
       SET meter_stop = $1,
           energy_kwh = $2,
           stopped_at = $3,
           stop_reason = $4,
           status = 'Completed',
           parking_duration_minutes = $6,
           idle_fee_cents = $7
       WHERE id = $5`,
      [
        meterStop,
        energyKwh,
        timestamp || new Date().toISOString(),
        reason || 'Local',
        tx.id,
        parkingDurationMinutes,
        idleFeeCents,
      ]
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
