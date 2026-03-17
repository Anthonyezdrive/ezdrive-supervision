-- ============================================================
-- Migration 028: Operational Cron Jobs
-- Adds missing scheduled tasks for production operations
-- ============================================================

-- ─── 1. Subscription expiry (daily at 2 AM) ─────────────────
-- Transitions ACTIVE subscriptions past their end_date to EXPIRED

SELECT cron.schedule(
  'subscription-expiry',
  '0 2 * * *',
  $$
    UPDATE user_subscriptions
    SET status = 'EXPIRED', updated_at = NOW()
    WHERE status = 'ACTIVE'
      AND end_date IS NOT NULL
      AND end_date < NOW();
  $$
);

-- ─── 2. Stale OCPI session cleanup (hourly) ─────────────────
-- Finalizes OCPI sessions stuck in ACTIVE for > 24 hours

SELECT cron.schedule(
  'stale-ocpi-session-cleanup',
  '30 * * * *',
  $$
    UPDATE ocpi_sessions
    SET status = 'COMPLETED',
        end_date_time = NOW(),
        last_updated = NOW()
    WHERE status = 'ACTIVE'
      AND start_date_time < NOW() - INTERVAL '24 hours';
  $$
);

-- ─── 3. RFID card expiry (daily at 3 AM) ────────────────────
-- Expires RFID cards past their valid_until date

SELECT cron.schedule(
  'rfid-card-expiry',
  '0 3 * * *',
  $$
    UPDATE rfid_cards
    SET status = 'EXPIRED', updated_at = NOW()
    WHERE status IN ('ACTIVE', 'SHIPPED')
      AND valid_until IS NOT NULL
      AND valid_until < NOW();
  $$
);

-- ─── 4. Device registration cleanup (weekly, Sunday 4 AM) ───
-- Removes stale push tokens (inactive > 90 days)

SELECT cron.schedule(
  'device-registration-cleanup',
  '0 4 * * 0',
  $$
    DELETE FROM device_registrations
    WHERE last_active_at < NOW() - INTERVAL '90 days';
  $$
);

-- ─── 5. Push notification on charge complete ─────────────────
-- Checks for recently completed transactions and notifies consumers
-- Runs every 2 minutes

SELECT cron.schedule(
  'charge-complete-notify',
  '*/2 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/push-notify',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'user_id', t.consumer_id,
        'title', 'Charge terminee',
        'body', format('%.1f kWh - %s', t.energy_kwh, s.name),
        'data', jsonb_build_object('transaction_id', t.id, 'station_id', s.id)
      )
    )
    FROM ocpp_transactions t
    JOIN ocpp_chargepoints cp ON cp.id = t.chargepoint_id
    JOIN stations s ON s.id = cp.station_id
    WHERE t.status = 'Completed'
      AND t.consumer_id IS NOT NULL
      AND t.stopped_at > NOW() - INTERVAL '3 minutes'
      AND t.stopped_at <= NOW() - INTERVAL '10 seconds'
      AND NOT EXISTS (
        SELECT 1 FROM ocpp_command_queue q
        WHERE q.chargepoint_id = t.chargepoint_id
          AND q.command = 'PushNotifySent'
          AND q.payload->>'transaction_id' = t.id::text
      );
  $$
);
