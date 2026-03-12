// ============================================
// OCPP Handler: StartTransaction
// Called when a charging session begins
// ============================================

import { query, queryOne } from '../db';
import { logger } from '../index';
import { authorizeIdTag } from './authorize';
import { createOcpiSession } from '../services/ocpi-bridge';

interface StartTransactionParams {
  connectorId: number;
  idTag: string;
  meterStart: number;
  timestamp: string;
  reservationId?: number;
}

interface StartTransactionResponse {
  transactionId: number;
  idTagInfo: {
    status: 'Accepted' | 'Blocked' | 'Expired' | 'Invalid' | 'ConcurrentTx';
    expiryDate?: string;
  };
}

// Simple sequential transaction ID counter per chargepoint
let transactionCounter = 0;

async function getNextTransactionId(chargepointId: string): Promise<number> {
  // Get the max existing transaction ID for this chargepoint
  const result = await queryOne<{ max_id: number }>(
    `SELECT COALESCE(MAX(ocpp_transaction_id), 0) + 1 as max_id
     FROM ocpp_transactions
     WHERE chargepoint_id = $1`,
    [chargepointId]
  );
  return result?.max_id || (++transactionCounter);
}

export async function handleStartTransaction(
  identity: string,
  params: StartTransactionParams
): Promise<StartTransactionResponse> {
  const { connectorId, idTag, meterStart, timestamp } = params;

  try {
    // Authorize the token
    const idTagInfo = await authorizeIdTag(idTag);

    if (idTagInfo.status !== 'Accepted') {
      logger.warn({ identity, idTag, status: idTagInfo.status }, 'StartTransaction: auth rejected');
      return { transactionId: 0, idTagInfo };
    }

    // Get chargepoint
    const cp = await queryOne<{ id: string; station_id: string | null }>(
      `SELECT id, station_id FROM ocpp_chargepoints WHERE identity = $1`,
      [identity]
    );

    if (!cp) {
      logger.error({ identity }, 'StartTransaction: chargepoint not found');
      return { transactionId: 0, idTagInfo: { status: 'Invalid' } };
    }

    // Generate transaction ID
    const transactionId = await getNextTransactionId(cp.id);

    // Insert transaction record
    const tx = await queryOne<{ id: string }>(
      `INSERT INTO ocpp_transactions
         (chargepoint_id, connector_id, ocpp_transaction_id, id_tag, meter_start, started_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'Active')
       RETURNING id`,
      [cp.id, connectorId, transactionId, idTag, meterStart, timestamp || new Date().toISOString()]
    );

    // Update station status to Charging
    if (cp.station_id) {
      await query(
        `UPDATE stations
         SET ocpp_status = 'Charging', status_since = now(), is_online = true, last_synced_at = now()
         WHERE id = $1`,
        [cp.station_id]
      );
    }

    // Create OCPI session (async, non-blocking)
    if (tx && cp.station_id) {
      createOcpiSession(tx.id, cp.station_id, idTag, connectorId, meterStart)
        .catch(err => logger.error({ err }, 'Failed to create OCPI session'));
    }

    // Resolve consumer_id from idTag (RFID card or OCPI token)
    if (tx) {
      try {
        // 1) Try RFID card lookup
        const consumer = await queryOne<{ user_id: string }>(
          `SELECT rc.user_id FROM rfid_cards rc
           WHERE rc.card_number = $1 AND rc.status = 'ACTIVE'
           UNION ALL
           SELECT rc.user_id FROM ocpi_tokens ot
             JOIN rfid_cards rc ON rc.ocpi_token_id = ot.id
             WHERE ot.uid = $1 AND rc.status = 'ACTIVE'
           LIMIT 1`,
          [idTag]
        );

        let consumerId = consumer?.user_id;

        // 2) If not found via RFID, check if started via RemoteStart command (app user)
        if (!consumerId) {
          const cmd = await queryOne<{ requested_by: string }>(
            `SELECT requested_by FROM ocpp_command_queue
             WHERE command = 'RemoteStartTransaction'
               AND chargepoint_id = $1
               AND status = 'accepted'
               AND requested_by IS NOT NULL
             ORDER BY created_at DESC LIMIT 1`,
            [cp.id]
          );
          consumerId = cmd?.requested_by;
        }

        // 3) Write consumer_id to transaction
        if (consumerId) {
          await query(
            `UPDATE ocpp_transactions SET consumer_id = $1 WHERE id = $2`,
            [consumerId, tx.id]
          );
          logger.info({ consumerId, txId: tx.id }, 'Consumer linked to OCPP transaction');
        }
      } catch (err) {
        logger.warn({ err, idTag }, 'Could not resolve consumer for idTag');
      }
    }

    logger.info({
      identity,
      transactionId,
      connectorId,
      idTag,
      meterStart,
    }, 'Transaction started');

    return {
      transactionId,
      idTagInfo: { status: 'Accepted' },
    };

  } catch (err) {
    logger.error({ err, identity }, 'StartTransaction handler error');
    return { transactionId: 0, idTagInfo: { status: 'Invalid' } };
  }
}
