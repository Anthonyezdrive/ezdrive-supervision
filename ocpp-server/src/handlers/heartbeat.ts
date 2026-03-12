// ============================================
// OCPP Handler: Heartbeat
// Periodic keep-alive from chargepoint
// ============================================

import { query } from '../db';

export async function handleHeartbeat(identity: string): Promise<{ currentTime: string }> {
  // Update last_heartbeat timestamp
  await query(
    `UPDATE ocpp_chargepoints SET last_heartbeat = now() WHERE identity = $1`,
    [identity]
  );

  return {
    currentTime: new Date().toISOString(),
  };
}
