// ============================================
// EZDrive OCPP Server - WebSocket RPC Server
// Handles OCPP 1.6-J chargepoint connections
// ============================================

import http from 'http';
// @ts-ignore - ocpp-rpc doesn't have types
import { RPCServer, createRPCError } from 'ocpp-rpc';
import { config } from './config';
import { logger } from './index';
import { handleBootNotification } from './handlers/boot-notification';
import { handleHeartbeat } from './handlers/heartbeat';
import { handleStatusNotification } from './handlers/status-notification';
import { handleAuthorize } from './handlers/authorize';
import { handleStartTransaction } from './handlers/start-transaction';
import { handleStopTransaction } from './handlers/stop-transaction';
import { handleMeterValues } from './handlers/meter-values';
import { handleDataTransfer } from './handlers/data-transfer';
import { markChargepointDisconnected } from './services/chargepoint-service';

// Map of identity -> RPCServerClient for sending commands
const activeConnections = new Map<string, any>();

export function getActiveConnection(identity: string): any | undefined {
  return activeConnections.get(identity);
}

export function createOcppServer(httpServer: http.Server) {
  const rpcServer = new RPCServer({
    protocols: ['ocpp1.6'],
    strictMode: false, // Allow non-standard messages gracefully
  });

  // Attach WebSocket upgrade to HTTP server
  httpServer.on('upgrade', (request: http.IncomingMessage, socket: any, head: Buffer) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Expected URL: /ocpp/{ChargeBoxIdentity}
    if (pathParts.length >= 2 && pathParts[0] === 'ocpp') {
      const identity = decodeURIComponent(pathParts.slice(1).join('/'));
      logger.info({ identity, ip: request.socket.remoteAddress }, 'Chargepoint connection attempt');

      rpcServer.handleUpgrade(request, socket, head);
    } else {
      logger.warn({ url: request.url }, 'Rejected WebSocket connection: invalid path');
      socket.destroy();
    }
  });

  // Handle new client connections
  rpcServer.on('client', async (client: any) => {
    const identity = client.identity;
    const clientLogger = logger.child({ identity });

    clientLogger.info('Chargepoint connected');
    activeConnections.set(identity, client);

    // ---- Register OCPP 1.6 message handlers ----
    // NOTE: ocpp-rpc passes a wrapper object {messageId, method, params, signal}
    // to handlers. The actual OCPP payload is in msg.params, not msg itself.
    const unwrap = (msg: any) => msg?.params || msg;

    client.handle('BootNotification', async (msg: any) => {
      const params = unwrap(msg);
      clientLogger.info({ params }, 'BootNotification received');
      return handleBootNotification(identity, params);
    });

    client.handle('Heartbeat', async () => {
      return handleHeartbeat(identity);
    });

    client.handle('StatusNotification', async (msg: any) => {
      const params = unwrap(msg);
      clientLogger.info({ params }, 'StatusNotification');
      return handleStatusNotification(identity, params);
    });

    client.handle('Authorize', async (msg: any) => {
      const params = unwrap(msg);
      clientLogger.info({ idTag: params.idTag }, 'Authorize request');
      return handleAuthorize(params);
    });

    client.handle('StartTransaction', async (msg: any) => {
      const params = unwrap(msg);
      clientLogger.info({ params }, 'StartTransaction');
      return handleStartTransaction(identity, params);
    });

    client.handle('StopTransaction', async (msg: any) => {
      const params = unwrap(msg);
      clientLogger.info({ params }, 'StopTransaction');
      return handleStopTransaction(identity, params);
    });

    client.handle('MeterValues', async (msg: any) => {
      const params = unwrap(msg);
      return handleMeterValues(identity, params);
    });

    client.handle('DataTransfer', async (msg: any) => {
      const params = unwrap(msg);
      clientLogger.info({ vendorId: params.vendorId }, 'DataTransfer');
      return handleDataTransfer(identity, params);
    });

    // Catch-all for unhandled messages
    client.handle(({ method, params }: any) => {
      clientLogger.warn({ method, params }, 'Unhandled OCPP message');
      throw createRPCError('NotImplemented', `Method ${method} not implemented`);
    });

    // Handle disconnection
    client.on('close', async () => {
      clientLogger.info('Chargepoint disconnected');
      activeConnections.delete(identity);
      try {
        await markChargepointDisconnected(identity);
      } catch (err) {
        clientLogger.error({ err }, 'Error marking chargepoint as disconnected');
      }
    });

    client.on('error', (err: Error) => {
      clientLogger.error({ err: err.message }, 'Client error');
    });
  });

  return {
    getConnectionCount: () => activeConnections.size,
    getConnectedChargepoints: () => Array.from(activeConnections.keys()),
  };
}
