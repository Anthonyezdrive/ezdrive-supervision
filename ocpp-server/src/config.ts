// ============================================
// EZDrive OCPP Server - Configuration
// ============================================

export const config = {
  // Server
  port: parseInt(process.env.PORT || '9000', 10),
  wsPath: process.env.WS_PATH || '/ocpp',
  logLevel: process.env.LOG_LEVEL || 'info',

  // PostgreSQL (direct connection for LISTEN/NOTIFY + queries)
  databaseUrl: process.env.DATABASE_URL || '',

  // Supabase (for auth, storage, RPC if needed)
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // OCPP defaults
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '60', 10), // seconds
  commandTimeout: parseInt(process.env.COMMAND_TIMEOUT || '30000', 10), // ms
  commandExpiry: parseInt(process.env.COMMAND_EXPIRY || '300', 10), // seconds

  // Health check
  healthPath: '/health',
} as const;

export function validateConfig(): void {
  const required = ['databaseUrl', 'supabaseUrl', 'supabaseServiceRoleKey'] as const;
  const missing = required.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.map((k) => k.toUpperCase().replace(/([A-Z])/g, '_$1')).join(', ')}`);
  }
}
