// ============================================
// EZDrive OCPP Server - Command Listener
// Listens on PostgreSQL LISTEN/NOTIFY channel for commands
// from Edge Functions (via ocpp_command_queue table)
// ============================================

import { PoolClient } from 'pg';
import { getClient, query, queryOne } from './db';
import { getActiveConnection } from './server';
import { getChargepointById } from './services/chargepoint-service';
import { config } from './config';
import { logger } from './index';

let listenerClient: PoolClient | null = null;
let isListening = false;

/**
 * Start listening for OCPP commands via PostgreSQL NOTIFY.
 * When an Edge Function inserts into ocpp_command_queue,
 * the trigger fires pg_notify('ocpp_commands', ...).
 */
export async function startCommandListener(): Promise<void> {
  if (isListening) return;

  try {
    listenerClient = await getClient();

    // Listen on the channel
    await listenerClient.query('LISTEN ocpp_commands');
    isListening = true;
    logger.info('Command listener started (LISTEN ocpp_commands)');

    // Handle incoming notifications
    listenerClient.on('notification', async (msg) => {
      if (msg.channel !== 'ocpp_commands' || !msg.payload) return;

      try {
        const payload = JSON.parse(msg.payload);
        logger.info({ payload }, 'Command notification received');
        await processCommand(payload.id);
      } catch (err) {
        logger.error({ err, payload: msg.payload }, 'Error processing command notification');
      }
    });

    // Handle listener errors (reconnect)
    listenerClient.on('error', async (err) => {
      logger.error({ err }, 'Command listener connection error, reconnecting...');
      isListening = false;
      // Release the pool client to avoid connection leak
      try {
        listenerClient?.release(true); // true = destroy the underlying connection
      } catch (_) { /* ignore release errors */ }
      listenerClient = null;
      // Reconnect after a short delay
      setTimeout(() => startCommandListener(), 3000);
    });

    // Also process any pending commands that were queued before we started
    await processPendingCommands();

  } catch (err) {
    logger.error({ err }, 'Failed to start command listener');
    isListening = false;
    // Retry
    setTimeout(() => startCommandListener(), 5000);
  }
}

/**
 * Stop the command listener.
 */
export async function stopCommandListener(): Promise<void> {
  if (listenerClient) {
    try {
      await listenerClient.query('UNLISTEN ocpp_commands');
      listenerClient.release();
    } catch (err) {
      // Ignore errors during shutdown
    }
    listenerClient = null;
    isListening = false;
    logger.info('Command listener stopped');
  }
}

/**
 * Process a specific command by ID.
 */
async function processCommand(commandId: string): Promise<void> {
  // Fetch the command
  const cmd = await queryOne<{
    id: string;
    chargepoint_id: string;
    command: string;
    payload: any;
    status: string;
    expires_at: string;
  }>(
    `SELECT id, chargepoint_id, command, payload, status, expires_at
     FROM ocpp_command_queue WHERE id = $1`,
    [commandId]
  );

  if (!cmd) {
    logger.warn({ commandId }, 'Command not found');
    return;
  }

  // Skip if not pending
  if (cmd.status !== 'pending') {
    logger.debug({ commandId, status: cmd.status }, 'Command already processed');
    return;
  }

  // Check expiry
  if (new Date(cmd.expires_at) < new Date()) {
    await query(
      `UPDATE ocpp_command_queue SET status = 'timeout', processed_at = now() WHERE id = $1`,
      [commandId]
    );
    logger.warn({ commandId }, 'Command expired');
    return;
  }

  // Find the chargepoint
  const cp = await getChargepointById(cmd.chargepoint_id);
  if (!cp) {
    await query(
      `UPDATE ocpp_command_queue SET status = 'error', result = $1, processed_at = now() WHERE id = $2`,
      [JSON.stringify({ error: 'Chargepoint not found' }), commandId]
    );
    return;
  }

  // Find the active WebSocket connection
  const client = getActiveConnection(cp.identity);
  if (!client) {
    await query(
      `UPDATE ocpp_command_queue SET status = 'error', result = $1, processed_at = now() WHERE id = $2`,
      [JSON.stringify({ error: 'Chargepoint not connected' }), commandId]
    );
    logger.warn({ identity: cp.identity, command: cmd.command }, 'Chargepoint not connected');
    return;
  }

  // Mark as sent
  await query(
    `UPDATE ocpp_command_queue SET status = 'sent', processed_at = now() WHERE id = $1`,
    [commandId]
  );

  try {
    // Send command to chargepoint via OCPP RPC
    logger.info({ identity: cp.identity, command: cmd.command, payload: cmd.payload }, 'Sending command');

    const result = await Promise.race([
      client.call(cmd.command, cmd.payload || {}),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Command timeout')), config.commandTimeout)
      ),
    ]);

    // Parse result status
    const resultStatus = parseCommandResult(cmd.command, result);

    // Update command with result
    await query(
      `UPDATE ocpp_command_queue
       SET status = $1, result = $2, processed_at = now()
       WHERE id = $3`,
      [resultStatus, JSON.stringify(result), commandId]
    );

    logger.info({
      identity: cp.identity,
      command: cmd.command,
      resultStatus,
      result,
    }, 'Command completed');

  } catch (err: any) {
    const errorMessage = err.message || 'Unknown error';
    const status = errorMessage.includes('timeout') ? 'timeout' : 'error';

    await query(
      `UPDATE ocpp_command_queue
       SET status = $1, result = $2, processed_at = now()
       WHERE id = $3`,
      [status, JSON.stringify({ error: errorMessage }), commandId]
    );

    logger.error({ err: errorMessage, identity: cp.identity, command: cmd.command }, 'Command failed');
  }
}

/**
 * Parse the OCPP response to determine command status.
 */
function parseCommandResult(command: string, result: any): string {
  if (!result) return 'error';

  switch (command) {
    case 'RemoteStartTransaction':
    case 'RemoteStopTransaction':
      return result.status === 'Accepted' ? 'accepted' : 'rejected';

    case 'Reset':
    case 'UnlockConnector':
    case 'ChangeAvailability':
      return result.status === 'Accepted' ? 'accepted' : 'rejected';

    case 'ChangeConfiguration':
      return result.status === 'Accepted' || result.status === 'RebootRequired'
        ? 'accepted' : 'rejected';

    case 'GetConfiguration':
    case 'GetDiagnostics':
    case 'TriggerMessage':
      return 'accepted'; // These always succeed if response is received

    // Smart Charging
    case 'SetChargingProfile':
    case 'ClearChargingProfile':
      return result.status === 'Accepted' ? 'accepted' : 'rejected';

    case 'GetCompositeSchedule':
      // Returns status + optional chargingSchedule
      return result.status === 'Accepted' ? 'accepted' : 'rejected';

    default:
      return result.status === 'Accepted' ? 'accepted' : 'rejected';
  }
}

/**
 * Process any pending commands that were queued before the server started.
 */
async function processPendingCommands(): Promise<void> {
  const pending = await query<{ id: string }>(
    `SELECT id FROM ocpp_command_queue
     WHERE status = 'pending' AND expires_at > now()
     ORDER BY created_at ASC
     LIMIT 50`
  );

  if (pending.length > 0) {
    logger.info({ count: pending.length }, 'Processing pending commands');
    for (const cmd of pending) {
      await processCommand(cmd.id);
    }
  }
}
