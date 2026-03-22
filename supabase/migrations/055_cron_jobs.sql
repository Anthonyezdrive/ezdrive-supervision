-- ============================================================
-- Migration 055: pg_cron Jobs for Automated Tasks
-- Schedules recurring jobs for analytics, maps, reservations
-- ============================================================

-- Ensure pg_cron extension is available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── 1. Analytics Materialized Views Refresh (every hour) ───

SELECT cron.schedule(
  'refresh-analytics-views',
  '0 * * * *',  -- Every hour at :00
  $$SELECT refresh_analytics_views()$$
);

-- ─── 2. Maps Feed Refresh (every 5 minutes) ────────────────

SELECT cron.schedule(
  'refresh-maps-feed',
  '*/5 * * * *',  -- Every 5 minutes
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public_stations_feed$$
);

-- ─── 3. Expire Stale Reservations (every minute) ───────────

SELECT cron.schedule(
  'expire-reservations',
  '* * * * *',  -- Every minute
  $$SELECT expire_reservations()$$
);

-- ─── 4. Settlement Engine (1st of each month at 03:00 UTC) ──

SELECT cron.schedule(
  'monthly-settlement',
  '0 3 1 * *',  -- 1st of month at 03:00
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/settlement-engine',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )
  $$
);

-- ─── 5. Reimbursement Engine (5th of each month at 04:00 UTC) ──

SELECT cron.schedule(
  'monthly-reimbursement',
  '0 4 5 * *',  -- 5th of month at 04:00
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/reimbursement-engine',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )
  $$
);

-- ─── 6. GreenFlux Webhook Log Cleanup (weekly, keep 90 days) ──

SELECT cron.schedule(
  'cleanup-gfx-webhook-logs',
  '0 2 * * 0',  -- Sundays at 02:00
  $$DELETE FROM gfx_webhook_log WHERE received_at < now() - interval '90 days'$$
);

-- ─── 7. Notification Log Cleanup (weekly, keep 60 days) ──

SELECT cron.schedule(
  'cleanup-notification-logs',
  '0 2 * * 1',  -- Mondays at 02:00
  $$DELETE FROM notification_log WHERE created_at < now() - interval '60 days'$$
);
