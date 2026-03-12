-- ============================================================
-- Migration 017: Cron Jobs — Operational Maintenance
-- Schedules: gfx-sync, road-sync, ocpi-push, OCPP cleanup
-- Project: phnqtqvwofzrhpuydoom
-- ============================================================

-- Ensure pg_net is available
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- ─── Helper: Supabase Edge Function URL & Auth ──────────────
-- Anon key for the current project (phnqtqvwofzrhpuydoom)
DO $setup$
DECLARE
  base_url text := 'https://phnqtqvwofzrhpuydoom.supabase.co/functions/v1';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBobnF0cXZ3b2Z6cmhwdXlkb29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODMyMzEsImV4cCI6MjA4ODc1OTIzMX0.LWdalrtQSXr_RUykHzve0pCM_E1vSm3YKtNHqwTgzzg';
  auth_header text;
BEGIN
  auth_header := '{"Content-Type":"application/json","Authorization":"Bearer ' || anon_key || '"}';

  -- ════════════════════════════════════════════════
  -- 1) GFX Sync — every 5 minutes
  -- ════════════════════════════════════════════════
  BEGIN PERFORM cron.unschedule('gfx-sync-auto'); EXCEPTION WHEN OTHERS THEN NULL; END;

  PERFORM cron.schedule(
    'gfx-sync-auto',
    '*/5 * * * *',
    format(
      $cron$
        SELECT net.http_post(
          url     := %L,
          headers := %L::jsonb,
          body    := '{"source":"cron"}'::jsonb,
          timeout_milliseconds := 30000
        ) AS request_id;
      $cron$,
      base_url || '/gfx-sync',
      auth_header
    )
  );

  -- ════════════════════════════════════════════════
  -- 2) ROAD Sync — every 5 minutes
  -- ════════════════════════════════════════════════
  BEGIN PERFORM cron.unschedule('road-sync-auto'); EXCEPTION WHEN OTHERS THEN NULL; END;

  PERFORM cron.schedule(
    'road-sync-auto',
    '*/5 * * * *',
    format(
      $cron$
        SELECT net.http_post(
          url     := %L,
          headers := %L::jsonb,
          body    := '{"source":"cron"}'::jsonb,
          timeout_milliseconds := 30000
        ) AS request_id;
      $cron$,
      base_url || '/road-sync',
      auth_header
    )
  );

  -- ════════════════════════════════════════════════
  -- 3) OCPI Push Processor — every minute
  -- ════════════════════════════════════════════════
  BEGIN PERFORM cron.unschedule('ocpi-push-auto'); EXCEPTION WHEN OTHERS THEN NULL; END;

  PERFORM cron.schedule(
    'ocpi-push-auto',
    '* * * * *',
    format(
      $cron$
        SELECT net.http_post(
          url     := %L,
          headers := %L::jsonb,
          body    := '{"source":"cron"}'::jsonb,
          timeout_milliseconds := 30000
        ) AS request_id;
      $cron$,
      base_url || '/ocpi-push',
      auth_header
    )
  );

END $setup$;

-- ════════════════════════════════════════════════
-- 4) OCPP Command Cleanup — every minute (pure SQL, no Edge Function)
--    Expire commands that have been pending/sent for > 5 minutes
-- ════════════════════════════════════════════════
DO $$ BEGIN PERFORM cron.unschedule('ocpp-command-cleanup'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'ocpp-command-cleanup',
  '* * * * *',
  $cron$
    UPDATE ocpp_command_queue
    SET status = 'timeout',
        processed_at = now(),
        result = '{"error":"Command timed out"}'::jsonb
    WHERE status IN ('pending', 'sent')
      AND created_at < now() - interval '5 minutes';
  $cron$
);

-- ════════════════════════════════════════════════
-- 5) OCPP Heartbeat Stale Detection — every 2 minutes (pure SQL)
--    Mark chargepoints as disconnected if no heartbeat for 3+ minutes
-- ════════════════════════════════════════════════
DO $$ BEGIN PERFORM cron.unschedule('ocpp-heartbeat-stale'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'ocpp-heartbeat-stale',
  '*/2 * * * *',
  $cron$
    UPDATE ocpp_chargepoints
    SET is_connected = false,
        updated_at = now()
    WHERE is_connected = true
      AND last_heartbeat < now() - interval '3 minutes';

    -- Also update linked stations to reflect offline status
    UPDATE stations
    SET is_online = false,
        ocpp_status = 'Unavailable',
        status_since = now(),
        last_synced_at = now()
    WHERE id IN (
      SELECT station_id FROM ocpp_chargepoints
      WHERE is_connected = false
        AND station_id IS NOT NULL
        AND updated_at > now() - interval '3 minutes'
    )
    AND is_online = true
    AND source = 'ocpp';
  $cron$
);

-- ════════════════════════════════════════════════
-- 6) OCPI Push Queue Cleanup — daily at 3 AM
--    Remove old SENT items (> 30 days) and FAILED items (> 7 days)
-- ════════════════════════════════════════════════
DO $$ BEGIN PERFORM cron.unschedule('ocpi-push-cleanup'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'ocpi-push-cleanup',
  '0 3 * * *',
  $cron$
    DELETE FROM ocpi_push_queue WHERE status = 'SENT' AND processed_at < now() - interval '30 days';
    DELETE FROM ocpi_push_queue WHERE status = 'FAILED' AND created_at < now() - interval '7 days';
    DELETE FROM ocpi_push_log WHERE created_at < now() - interval '90 days';
  $cron$
);

-- ════════════════════════════════════════════════
-- Verification: list all scheduled jobs
-- SELECT jobid, jobname, schedule, active FROM cron.job;
-- ════════════════════════════════════════════════
