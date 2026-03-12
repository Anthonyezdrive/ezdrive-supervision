// ============================================
// OCPP Handler: MeterValues
// Periodic energy metering from chargepoints
// ============================================

import { query, queryOne } from '../db';
import { logger } from '../index';

interface MeterValue {
  timestamp: string;
  sampledValue: SampledValue[];
}

interface SampledValue {
  value: string;
  measurand?: string;
  unit?: string;
  context?: string;
  format?: string;
  phase?: string;
  location?: string;
}

interface MeterValuesParams {
  connectorId: number;
  transactionId?: number;
  meterValue: MeterValue[];
}

// Extract specific values from sampled values array
function extractValue(sampledValues: SampledValue[], measurand: string): number | null {
  const sv = sampledValues.find(v =>
    (v.measurand || 'Energy.Active.Import.Register') === measurand
  );
  return sv ? parseFloat(sv.value) : null;
}

export async function handleMeterValues(
  identity: string,
  params: MeterValuesParams
): Promise<Record<string, never>> {
  const { connectorId, transactionId } = params;
  // meterValue can come as params.meterValue or different casing
  const rawMV = (params as any).meterValue || (params as any).metervalue || (params as any).MeterValue;
  const meterValue: MeterValue[] = Array.isArray(rawMV) ? rawMV : [];

  if (meterValue.length === 0) {
    logger.warn({ identity, connectorId }, 'MeterValues: no meter values in payload');
    return {};
  }

  try {
    // Get chargepoint
    const cp = await queryOne<{ id: string }>(
      `SELECT id FROM ocpp_chargepoints WHERE identity = $1`,
      [identity]
    );

    if (!cp) {
      logger.warn({ identity }, 'MeterValues: chargepoint not found');
      return {};
    }

    // Find transaction if transactionId provided
    let txId: string | null = null;
    if (transactionId) {
      const tx = await queryOne<{ id: string }>(
        `SELECT id FROM ocpp_transactions
         WHERE chargepoint_id = $1 AND ocpp_transaction_id = $2`,
        [cp.id, transactionId]
      );
      txId = tx?.id || null;
    }

    // If no transaction found by ID, try to find active transaction on this connector
    if (!txId) {
      const activeTx = await queryOne<{ id: string }>(
        `SELECT id FROM ocpp_transactions
         WHERE chargepoint_id = $1 AND connector_id = $2 AND status = 'Active'
         ORDER BY started_at DESC LIMIT 1`,
        [cp.id, connectorId]
      );
      txId = activeTx?.id || null;
    }

    if (!txId) {
      // No transaction context - still save meter values but log warning
      logger.debug({ identity, connectorId }, 'MeterValues without transaction context');
    }

    // Process each meter value entry
    for (const mv of meterValue) {
      const sampledValues = mv.sampledValue || [];

      // Extract key values
      const energyWh = extractValue(sampledValues, 'Energy.Active.Import.Register');
      const powerW = extractValue(sampledValues, 'Power.Active.Import');
      const currentA = extractValue(sampledValues, 'Current.Import');
      const voltageV = extractValue(sampledValues, 'Voltage');
      const socPercent = extractValue(sampledValues, 'SoC');

      // Insert meter value record
      if (txId) {
        await query(
          `INSERT INTO ocpp_meter_values
             (transaction_id, chargepoint_id, connector_id, timestamp, sampled_values,
              energy_wh, power_w, current_a, voltage_v, soc_percent)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            txId, cp.id, connectorId,
            mv.timestamp || new Date().toISOString(),
            JSON.stringify(sampledValues),
            energyWh, powerW, currentA, voltageV, socPercent,
          ]
        );

        // Update live energy on transaction
        if (energyWh != null) {
          await query(
            `UPDATE ocpp_transactions
             SET energy_kwh = $1 / 1000.0
             WHERE id = $2 AND status = 'Active'`,
            [energyWh, txId]
          );
        }
      }
    }

  } catch (err) {
    logger.error({ err, identity }, 'MeterValues handler error');
  }

  // OCPP 1.6 spec: MeterValues.conf is empty
  return {};
}
