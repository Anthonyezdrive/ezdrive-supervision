// ============================================
// Service: OCPI Bridge
// Creates OCPI sessions and CDRs from OCPP transactions
// Links OCPP charging sessions to the OCPI layer for Gireve
// ============================================

import { query, queryOne } from '../db';
import { logger } from '../index';
import { calculateTariff, resolveTariff, type TariffCalculationResult } from './tariff-engine';

/**
 * Create an OCPI session when an OCPP transaction starts.
 * This creates a record in ocpi_sessions + queues a push to Gireve.
 */
export async function createOcpiSession(
  transactionId: string,
  stationId: string,
  idTag: string,
  connectorId: number,
  meterStart: number
): Promise<void> {
  try {
    // Find OCPI location for this station
    const location = await queryOne<{
      id: string;
      ocpi_id: string;
      country_code: string;
      party_id: string;
    }>(
      `SELECT id, ocpi_id, country_code, party_id
       FROM ocpi_locations WHERE station_id = $1 LIMIT 1`,
      [stationId]
    );

    if (!location) {
      logger.debug({ stationId }, 'No OCPI location for station, skipping OCPI session');
      return;
    }

    // Find OCPI EVSE
    const evse = await queryOne<{ id: string; evse_id: string; uid: string }>(
      `SELECT id, evse_id, uid FROM ocpi_evses WHERE location_id = $1 LIMIT 1`,
      [location.id]
    );

    if (!evse) {
      logger.debug({ locationId: location.id }, 'No OCPI EVSE found, skipping OCPI session');
      return;
    }

    // Find OCPI connector
    const connector = await queryOne<{ id: string; connector_id: string }>(
      `SELECT id, connector_id FROM ocpi_connectors WHERE evse_id = $1 LIMIT 1`,
      [evse.id]
    );

    // Find the token
    const token = await queryOne<{ id: string; auth_id: string }>(
      `SELECT id, auth_id FROM ocpi_tokens WHERE uid = $1 LIMIT 1`,
      [idTag]
    );

    // Generate session ID
    const sessionId = `OCPP-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    // Build cdr_token jsonb (matches the OCPI 2.2.1 Token schema)
    const cdrToken = {
      country_code: location.country_code,
      party_id: location.party_id,
      uid: token?.auth_id || idTag,
      type: 'RFID',
      contract_id: token?.auth_id || idTag,
    };

    const connectorIdStr = connector?.connector_id || connectorId.toString();

    // Create OCPI session (using correct column names)
    const session = await queryOne<{ id: string }>(
      `INSERT INTO ocpi_sessions
         (country_code, party_id, session_id, start_date_time, kwh,
          cdr_token, location_id, evse_uid, connector_id,
          currency, status, last_updated)
       VALUES ($1, $2, $3, now(), 0,
               $4, $5, $6, $7,
               'EUR', 'ACTIVE', now())
       RETURNING id`,
      [
        location.country_code,
        location.party_id,
        sessionId,
        JSON.stringify(cdrToken),
        location.ocpi_id,
        evse.uid,
        connectorIdStr,
      ]
    );

    if (session) {
      // Link OCPI session to OCPP transaction
      await query(
        `UPDATE ocpp_transactions SET ocpi_session_id = $1 WHERE id = $2`,
        [session.id, transactionId]
      );

      // Queue push to Gireve
      await query(
        `INSERT INTO ocpi_push_queue (module, action, object_type, object_id, ocpi_path, payload, priority)
         VALUES ('sessions', 'PUT', 'session', $1, $2, $3, 5)`,
        [
          sessionId,
          `/sessions/${location.country_code}/${location.party_id}/${sessionId}`,
          JSON.stringify({
            country_code: location.country_code,
            party_id: location.party_id,
            id: sessionId,
            start_date_time: new Date().toISOString(),
            kwh: 0,
            cdr_token: cdrToken,
            auth_method: 'AUTH_REQUEST',
            location: { id: location.ocpi_id },
            evse_uid: evse.uid,
            connector_id: connectorIdStr,
            currency: 'EUR',
            status: 'ACTIVE',
            last_updated: new Date().toISOString(),
          }),
        ]
      );

      logger.info({ transactionId, ocpiSessionId: sessionId }, 'OCPI session created');
    }
  } catch (err) {
    logger.error({ err, transactionId }, 'Failed to create OCPI session');
  }
}

/**
 * Finalize an OCPI session and create a CDR when an OCPP transaction stops.
 * Now includes tariff calculation for accurate pricing.
 */
export async function finalizeOcpiSession(
  transactionId: string,
  meterStop: number,
  energyKwh: number | null,
  stopTimestamp: string
): Promise<void> {
  try {
    // Get transaction with OCPI session link
    const tx = await queryOne<{
      id: string;
      ocpi_session_id: string | null;
      id_tag: string;
      meter_start: number;
      started_at: string;
      chargepoint_id: string;
    }>(
      `SELECT id, ocpi_session_id, id_tag, meter_start, started_at, chargepoint_id
       FROM ocpp_transactions WHERE id = $1`,
      [transactionId]
    );

    if (!tx || !tx.ocpi_session_id) {
      logger.debug({ transactionId }, 'No OCPI session to finalize');
      return;
    }

    // Get the OCPI session
    const session = await queryOne<{
      id: string;
      session_id: string;
      country_code: string;
      party_id: string;
      location_id: string;
      evse_uid: string;
      connector_id: string;
    }>(
      `SELECT id, session_id, country_code, party_id, location_id, evse_uid, connector_id
       FROM ocpi_sessions WHERE id = $1`,
      [tx.ocpi_session_id]
    );

    if (!session) return;

    // Calculate duration in hours
    const durationHours = (new Date(stopTimestamp).getTime() - new Date(tx.started_at).getTime()) / 3600000;
    const finalEnergyKwh = energyKwh || 0;

    // --- Tariff Calculation ---
    // Get connector type to determine AC/DC pricing
    const connectorInfo = await queryOne<{ standard: string }>(
      `SELECT c.standard FROM ocpi_connectors c
       JOIN ocpi_evses e ON c.evse_id = e.id
       JOIN ocpi_locations l ON e.location_id = l.id
       WHERE l.ocpi_id = $1 LIMIT 1`,
      [session.location_id]
    );

    const tariffElements = await resolveTariff(
      tx.chargepoint_id,
      connectorInfo?.standard
    );

    const cost: TariffCalculationResult = calculateTariff(
      {
        energyKwh: finalEnergyKwh,
        durationHours,
        parkingHours: 0,
      },
      tariffElements,
      8.5 // DOM-TOM VAT rate
    );

    logger.info(
      { transactionId, energyKwh: finalEnergyKwh, durationHours, cost },
      'Tariff calculated for CDR'
    );

    // Build cdr_token jsonb
    const cdrToken = {
      uid: tx.id_tag,
      type: 'RFID',
      contract_id: tx.id_tag,
    };

    // Build cdr_location jsonb (snapshot)
    const cdrLocation = {
      id: session.location_id,
      evse_uid: session.evse_uid,
      connector_id: session.connector_id,
    };

    // Build charging_periods jsonb
    const chargingPeriods = [
      {
        start_date_time: tx.started_at,
        dimensions: [
          { type: 'ENERGY', volume: finalEnergyKwh },
          { type: 'TIME', volume: durationHours },
        ],
      },
    ];

    // Update OCPI session to COMPLETED with cost
    await query(
      `UPDATE ocpi_sessions
       SET end_date_time = $1, kwh = $2, status = 'COMPLETED',
           total_cost = $3, last_updated = now()
       WHERE id = $4`,
      [
        stopTimestamp,
        finalEnergyKwh,
        JSON.stringify({ excl_vat: cost.totalCost, incl_vat: cost.totalCostInclVat }),
        session.id,
      ]
    );

    // Create CDR with correct column names and tariff-calculated costs
    const cdrId = `CDR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const cdr = await queryOne<{ id: string }>(
      `INSERT INTO ocpi_cdrs
         (country_code, party_id, cdr_id, start_date_time, end_date_time,
          cdr_token, cdr_location,
          currency, total_cost, total_cost_incl_vat, total_vat, vat_rate,
          total_energy, total_time, total_parking_time,
          total_energy_cost, total_time_cost, total_parking_cost, total_fixed_cost,
          charging_periods, source, last_updated)
       VALUES ($1, $2, $3, $4, $5,
               $6, $7,
               'EUR', $8, $9, $10, $11,
               $12, $13, 0,
               $14, $15, $16, $17,
               $18, 'ocpp', now())
       RETURNING id`,
      [
        session.country_code, session.party_id, cdrId,
        tx.started_at, stopTimestamp,
        JSON.stringify(cdrToken), JSON.stringify(cdrLocation),
        cost.totalCost, cost.totalCostInclVat, cost.totalVat, cost.vatRate,
        finalEnergyKwh, durationHours,
        cost.energyCost, cost.timeCost, cost.parkingCost, cost.flatCost,
        JSON.stringify(chargingPeriods),
      ]
    );

    if (cdr) {
      // Link CDR to transaction
      await query(
        `UPDATE ocpp_transactions SET ocpi_cdr_id = $1 WHERE id = $2`,
        [cdr.id, transactionId]
      );

      // Queue CDR push to Gireve
      await query(
        `INSERT INTO ocpi_push_queue (module, action, object_type, object_id, ocpi_path, payload, priority)
         VALUES ('cdrs', 'POST', 'cdr', $1, '/cdrs', $2, 5)`,
        [
          cdrId,
          JSON.stringify({
            country_code: session.country_code,
            party_id: session.party_id,
            id: cdrId,
            start_date_time: tx.started_at,
            end_date_time: stopTimestamp,
            cdr_token: cdrToken,
            auth_method: 'AUTH_REQUEST',
            cdr_location: cdrLocation,
            currency: 'EUR',
            total_cost: { excl_vat: cost.totalCost, incl_vat: cost.totalCostInclVat },
            total_energy: finalEnergyKwh,
            total_energy_cost: { excl_vat: cost.energyCost },
            total_time: durationHours,
            total_time_cost: { excl_vat: cost.timeCost },
            total_parking_time: 0,
            total_parking_cost: { excl_vat: cost.parkingCost },
            total_fixed_cost: { excl_vat: cost.flatCost },
            charging_periods: chargingPeriods,
            last_updated: new Date().toISOString(),
          }),
        ]
      );

      logger.info(
        { transactionId, cdrId, totalCost: cost.totalCost, totalCostInclVat: cost.totalCostInclVat },
        'OCPI CDR created with tariff'
      );
    }

    // Queue session COMPLETED push
    await query(
      `INSERT INTO ocpi_push_queue (module, action, object_type, object_id, ocpi_path, payload, priority)
       VALUES ('sessions', 'PATCH', 'session', $1, $2, $3, 5)`,
      [
        session.session_id,
        `/sessions/${session.country_code}/${session.party_id}/${session.session_id}`,
        JSON.stringify({
          status: 'COMPLETED',
          end_date_time: stopTimestamp,
          kwh: finalEnergyKwh,
          total_cost: { excl_vat: cost.totalCost, incl_vat: cost.totalCostInclVat },
          last_updated: new Date().toISOString(),
        }),
      ]
    );

  } catch (err) {
    logger.error({ err, transactionId }, 'Failed to finalize OCPI session');
  }
}
