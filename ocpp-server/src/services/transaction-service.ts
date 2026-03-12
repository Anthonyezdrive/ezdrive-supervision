// ============================================
// Service: Transaction Management
// Query helpers for OCPP transactions
// ============================================

import { query, queryOne } from '../db';

export interface OcppTransaction {
  id: string;
  chargepoint_id: string;
  connector_id: number;
  ocpp_transaction_id: number;
  id_tag: string;
  meter_start: number | null;
  meter_stop: number | null;
  energy_kwh: number | null;
  started_at: string;
  stopped_at: string | null;
  stop_reason: string | null;
  status: string;
}

/**
 * Get active transaction for a chargepoint/connector.
 */
export async function getActiveTransaction(
  chargepointId: string,
  connectorId?: number
): Promise<OcppTransaction | null> {
  if (connectorId != null) {
    return queryOne<OcppTransaction>(
      `SELECT * FROM ocpp_transactions
       WHERE chargepoint_id = $1 AND connector_id = $2 AND status = 'Active'
       ORDER BY started_at DESC LIMIT 1`,
      [chargepointId, connectorId]
    );
  }
  return queryOne<OcppTransaction>(
    `SELECT * FROM ocpp_transactions
     WHERE chargepoint_id = $1 AND status = 'Active'
     ORDER BY started_at DESC LIMIT 1`,
    [chargepointId]
  );
}

/**
 * Get transaction by OCPP transaction ID.
 */
export async function getTransactionByOcppId(
  chargepointId: string,
  ocppTransactionId: number
): Promise<OcppTransaction | null> {
  return queryOne<OcppTransaction>(
    `SELECT * FROM ocpp_transactions
     WHERE chargepoint_id = $1 AND ocpp_transaction_id = $2`,
    [chargepointId, ocppTransactionId]
  );
}

/**
 * Get recent transactions for a chargepoint.
 */
export async function getRecentTransactions(
  chargepointId: string,
  limit: number = 20
): Promise<OcppTransaction[]> {
  return query<OcppTransaction>(
    `SELECT * FROM ocpp_transactions
     WHERE chargepoint_id = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [chargepointId, limit]
  );
}
