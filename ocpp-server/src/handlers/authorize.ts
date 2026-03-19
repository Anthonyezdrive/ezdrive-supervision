// ============================================
// OCPP Handler: Authorize (Enhanced)
// Validates an RFID token with full checks:
//   0. Exception rules (blacklist/whitelist/maintenance)
//   1. Token existence (ocpi_tokens)
//   2. Token validity
//   3. Whitelist policy
//   4. RFID card status (rfid_cards)
//   5. Card expiry (expires_at)
//   6. Concurrent transaction limit
// ============================================

import { query, queryOne } from '../db';
import { logger } from '../index';

interface AuthorizeParams {
  idTag: string;
}

interface IdTagInfo {
  status: 'Accepted' | 'Blocked' | 'Expired' | 'Invalid' | 'ConcurrentTx';
  expiryDate?: string;
  parentIdTag?: string;
}

interface AuthorizeResponse {
  idTagInfo: IdTagInfo;
}

// Token + card data from the enriched query
interface TokenRecord {
  id: string;
  uid: string;
  valid: boolean;
  whitelist: string;
  type: string;
  contract_id: string | null;
  max_concurrent_tx: number;
  card_expires_at: string | null;
  card_status: string | null;
}

// Exception check result from RPC
interface ExceptionResult {
  allowed: boolean;
  free_charging: boolean;
  reason: string;
  group_name: string | null;
  rule_type: string | null;
  rule_name: string | null;
}

export async function handleAuthorize(params: AuthorizeParams): Promise<AuthorizeResponse> {
  const { idTag } = params;

  try {
    // ── Check 0: Exception rules (blacklist/whitelist/maintenance) ──
    // Runs BEFORE token lookup — a blacklisted token is blocked even if valid
    const exceptionRow = await queryOne<{ check_token_exceptions: ExceptionResult }>(
      `SELECT check_token_exceptions($1)`,
      [idTag]
    );
    const exception = exceptionRow?.check_token_exceptions;

    if (exception && exception.rule_type) {
      // A rule matched this token
      if (!exception.allowed) {
        // BLACKLIST → block immediately
        logger.info(
          { idTag, rule: exception.rule_name, group: exception.group_name, reason: exception.reason },
          'Authorize: blocked by exception rule'
        );
        return { idTagInfo: { status: 'Blocked' } };
      }

      if (exception.rule_type === 'whitelist') {
        // WHITELIST / MAINTENANCE → accept immediately (skip other checks)
        logger.info(
          { idTag, rule: exception.rule_name, group: exception.group_name, freeCharging: exception.free_charging },
          'Authorize: accepted by exception whitelist'
        );
        return { idTagInfo: { status: 'Accepted' } };
      }

      // OVERRIDE rules → log but continue normal checks
      logger.info(
        { idTag, rule: exception.rule_name, group: exception.group_name },
        'Authorize: override rule applied, continuing checks'
      );
    }

    // ── Enriched query: token + RFID card data ──
    const token = await queryOne<TokenRecord>(
      `SELECT t.id, t.uid, t.valid, t.whitelist, t.type, t.contract_id,
        COALESCE(t.max_concurrent_tx, 1) as max_concurrent_tx,
        rc.expires_at::text as card_expires_at,
        rc.status as card_status
       FROM ocpi_tokens t
       LEFT JOIN rfid_cards rc ON rc.ocpi_token_id = t.id
       WHERE t.uid = $1
       LIMIT 1`,
      [idTag]
    );

    // ── Check 1: Token not found ──
    if (!token) {
      logger.info({ idTag }, 'Authorize: token not found');
      return { idTagInfo: { status: 'Invalid' } };
    }

    // ── Check 2: Token validity ──
    if (!token.valid) {
      logger.info({ idTag }, 'Authorize: token marked invalid');
      return { idTagInfo: { status: 'Blocked' } };
    }

    // ── Check 3: Whitelist policy ──
    if (token.whitelist === 'NEVER') {
      logger.info({ idTag }, 'Authorize: token whitelist=NEVER');
      return { idTagInfo: { status: 'Blocked' } };
    }

    // ── Check 4: RFID card status ──
    if (token.card_status && token.card_status !== 'ACTIVE') {
      logger.info({ idTag, cardStatus: token.card_status }, 'Authorize: RFID card not active');
      return { idTagInfo: { status: 'Blocked' } };
    }

    // ── Check 5: Card expiry ──
    if (token.card_expires_at) {
      const expiresAt = new Date(token.card_expires_at);
      if (expiresAt < new Date()) {
        logger.info({ idTag, expiresAt: token.card_expires_at }, 'Authorize: RFID card expired');
        return { idTagInfo: { status: 'Expired' } };
      }
    }

    // ── Check 6: Concurrent transaction limit ──
    const maxConcurrent = token.max_concurrent_tx ?? 1;
    const activeTx = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM ocpp_transactions
       WHERE id_tag = $1 AND status = 'Active'`,
      [idTag]
    );

    if (activeTx && activeTx.count >= maxConcurrent) {
      logger.info({ idTag, activeTx: activeTx.count, maxConcurrent }, 'Authorize: concurrent tx limit reached');
      return { idTagInfo: { status: 'ConcurrentTx' } };
    }

    // ── All checks passed ──
    logger.info({ idTag, tokenType: token.type }, 'Authorize: accepted');

    const idTagInfo: IdTagInfo = { status: 'Accepted' };

    // Include expiry date if the card has one (future date)
    if (token.card_expires_at) {
      idTagInfo.expiryDate = new Date(token.card_expires_at).toISOString();
    }

    // Include parent/group ID if available
    if (token.contract_id) {
      idTagInfo.parentIdTag = token.contract_id;
    }

    return { idTagInfo };

  } catch (err) {
    logger.error({ err, idTag }, 'Authorize handler error');
    // Fail-closed: reject on error for security
    return { idTagInfo: { status: 'Invalid' } };
  }
}

// Shared function for use in StartTransaction and StopTransaction
export async function authorizeIdTag(idTag: string): Promise<IdTagInfo> {
  const result = await handleAuthorize({ idTag });
  return result.idTagInfo;
}
