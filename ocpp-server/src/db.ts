// ============================================
// EZDrive OCPP Server - PostgreSQL Database
// Direct connection for LISTEN/NOTIFY + queries
// ============================================

import { Pool, PoolClient } from 'pg';
import { config } from './config';
import { logger } from './index';

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: { rejectUnauthorized: false },
    });

    pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected PostgreSQL pool error');
    });
  }
  return pool;
}

// Helper for single queries
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

// Helper for single row
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

// Get a dedicated client (for LISTEN/NOTIFY)
export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    logger.info('PostgreSQL pool closed');
  }
}
