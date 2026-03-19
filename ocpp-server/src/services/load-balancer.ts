// ============================================================
// EZDrive OCPP — Dynamic Load Balancer
// Redistributes power across EVSEs in a smart charging group
// when site capacity is exceeded
//
// Algorithms:
//   - equal_distribution: equal power split
//   - priority_based: highest priority gets most power
//   - fifo: first connected gets priority
//   - soc_based: lowest SoC gets most power
// ============================================================

import { query, queryOne } from '../db';
import { logger } from '../index';

interface ActiveSession {
  transaction_id: string;
  chargepoint_identity: string;
  connector_id: number;
  power_w: number;
  energy_kwh: number;
  soc_percent: number | null;
  started_at: string;
}

interface ChargingGroup {
  id: string;
  name: string;
  site_max_power_kw: number;
  algorithm: string;
  priority_mode: string;
}

interface PowerAllocation {
  chargepoint_identity: string;
  connector_id: number;
  max_power_w: number;
}

/**
 * Check if load balancing is needed for a chargepoint's group.
 * Called after each MeterValues to dynamically redistribute power.
 */
export async function checkAndRebalance(chargepointIdentity: string): Promise<PowerAllocation[] | null> {
  try {
    // 1. Find the smart charging group for this chargepoint
    const group = await queryOne<ChargingGroup>(`
      SELECT g.id, g.name, g.site_max_power_kw, g.algorithm, g.priority_mode
      FROM smart_charging_groups g
      JOIN smart_charging_group_evses ge ON ge.group_id = g.id
      JOIN ocpp_chargepoints cp ON cp.id = ge.chargepoint_id
      WHERE cp.identity = $1 AND g.is_active = true
      LIMIT 1
    `, [chargepointIdentity]);

    if (!group) return null; // Not in a group — no balancing needed

    // 2. Get all active sessions in this group
    const sessions = await query<ActiveSession>(`
      SELECT
        t.id as transaction_id,
        cp.identity as chargepoint_identity,
        t.connector_id,
        COALESCE(mv.power_w, 0) as power_w,
        COALESCE(t.energy_kwh, 0) as energy_kwh,
        mv.soc_percent,
        t.started_at
      FROM ocpp_transactions t
      JOIN ocpp_chargepoints cp ON cp.id = t.chargepoint_id
      JOIN smart_charging_group_evses ge ON ge.chargepoint_id = cp.id
      LEFT JOIN LATERAL (
        SELECT power_w, soc_percent
        FROM ocpp_meter_values
        WHERE transaction_id = t.id
        ORDER BY timestamp DESC LIMIT 1
      ) mv ON true
      WHERE ge.group_id = $1 AND t.status = 'Active'
      ORDER BY t.started_at ASC
    `, [group.id]);

    if (sessions.length === 0) return null;

    // 3. Calculate total current power
    const totalCurrentPower = sessions.reduce((sum, s) => sum + s.power_w, 0);
    const siteMaxPowerW = group.site_max_power_kw * 1000;

    // 4. If within limits, no rebalancing needed
    if (totalCurrentPower <= siteMaxPowerW * 0.95) {
      return null; // 5% margin
    }

    logger.info({
      group: group.name,
      sessions: sessions.length,
      totalPower: totalCurrentPower,
      siteMax: siteMaxPowerW,
    }, 'Load balancing triggered — redistributing power');

    // 5. Calculate new power allocation based on algorithm
    const allocations = calculateAllocations(sessions, siteMaxPowerW, group.algorithm, group.priority_mode);

    // 6. Save new profiles to DB
    for (const alloc of allocations) {
      await query(`
        INSERT INTO charging_profiles (chargepoint_identity, connector_id, max_charging_rate, charging_rate_unit, profile_purpose, group_id, is_active)
        VALUES ($1, $2, $3, 'W', 'TxDefaultProfile', $4, true)
        ON CONFLICT (chargepoint_identity, connector_id, profile_purpose)
        DO UPDATE SET max_charging_rate = $3, updated_at = now()
      `, [alloc.chargepoint_identity, alloc.connector_id, alloc.max_power_w, group.id]);
    }

    return allocations;
  } catch (err) {
    logger.error({ err, chargepointIdentity }, 'Load balancer error');
    return null;
  }
}

/**
 * Calculate power allocations based on algorithm
 */
function calculateAllocations(
  sessions: ActiveSession[],
  siteMaxPowerW: number,
  algorithm: string,
  priorityMode: string,
): PowerAllocation[] {
  switch (algorithm) {
    case 'equal_distribution':
      return equalDistribution(sessions, siteMaxPowerW);
    case 'priority_based':
      return priorityBased(sessions, siteMaxPowerW, priorityMode);
    default:
      return equalDistribution(sessions, siteMaxPowerW);
  }
}

/**
 * Equal distribution: split power evenly
 */
function equalDistribution(sessions: ActiveSession[], siteMaxPowerW: number): PowerAllocation[] {
  const perSession = Math.floor(siteMaxPowerW / sessions.length);
  return sessions.map(s => ({
    chargepoint_identity: s.chargepoint_identity,
    connector_id: s.connector_id,
    max_power_w: perSession,
  }));
}

/**
 * Priority based: first sessions or lowest SoC get more power
 */
function priorityBased(sessions: ActiveSession[], siteMaxPowerW: number, mode: string): PowerAllocation[] {
  // Sort by priority
  const sorted = [...sessions];
  if (mode === 'soc') {
    // Lowest SoC first (needs most charge)
    sorted.sort((a, b) => (a.soc_percent ?? 0) - (b.soc_percent ?? 0));
  } else {
    // FIFO: earliest started first
    sorted.sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
  }

  // Weighted distribution: first gets 40%, rest split 60%
  const allocations: PowerAllocation[] = [];
  const firstShare = Math.floor(siteMaxPowerW * 0.4);
  const restShare = Math.floor((siteMaxPowerW * 0.6) / Math.max(1, sorted.length - 1));

  sorted.forEach((s, i) => {
    allocations.push({
      chargepoint_identity: s.chargepoint_identity,
      connector_id: s.connector_id,
      max_power_w: i === 0 ? firstShare : restShare,
    });
  });

  return allocations;
}
