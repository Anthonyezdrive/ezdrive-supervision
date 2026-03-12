// ============================================
// EZDrive OCPP 1.6-J Central System Server
// Main entry point
// ============================================

import http from 'http';
import pino from 'pino';
import { config, validateConfig } from './config';
import { closePool } from './db';
import { createOcppServer } from './server';
import { startCommandListener, stopCommandListener } from './command-listener';

// Logger (exported for use everywhere)
export const logger = pino({
  level: config.logLevel,
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

async function main() {
  // Validate configuration
  validateConfig();
  logger.info({ port: config.port }, 'Starting EZDrive OCPP Central System');

  // Create HTTP server
  const httpServer = http.createServer((req, res) => {
    // Health check endpoint
    if (req.url === config.healthPath && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        service: 'ezdrive-ocpp',
        timestamp: new Date().toISOString(),
        connections: getConnectionCount(),
      }));
      return;
    }

    // API: List connected chargepoints
    if (req.url === '/api/chargepoints' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        connections: getConnectedChargepoints(),
      }));
      return;
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  // Create OCPP WebSocket server (attaches to HTTP server)
  const { getConnectionCount, getConnectedChargepoints } = createOcppServer(httpServer);

  // Start PostgreSQL LISTEN for command queue
  await startCommandListener();

  // Start listening
  httpServer.listen(config.port, '0.0.0.0', () => {
    logger.info({ port: config.port, wsPath: config.wsPath }, 'OCPP Central System listening');
    logger.info(`WebSocket URL: ws://0.0.0.0:${config.port}${config.wsPath}/{ChargeBoxIdentity}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    await stopCommandListener();
    httpServer.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start OCPP server');
  process.exit(1);
});
