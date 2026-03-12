-- ============================================================
-- Migration 006 : Cron automatique gfx-sync (pg_cron + pg_net)
-- Prérequis : extensions pg_cron et pg_net activées (Supabase les
--             active par défaut sur tous les projets).
-- ============================================================

-- Supprimer l'éventuel job existant pour éviter les doublons
DO $$
BEGIN
  PERFORM cron.unschedule('gfx-sync-auto');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Planifier le sync GreenFlux toutes les 5 minutes via pg_net
SELECT cron.schedule(
  'gfx-sync-auto',
  '*/5 * * * *',
  $cron$
    SELECT net.http_post(
      url     := 'https://pbaxmhskoylbvybkzvyz.supabase.co/functions/v1/gfx-sync',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiYXhtaHNrb3lsYnZ5Ymt6dnl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MjA4OTYsImV4cCI6MjA3OTI5Njg5Nn0.5FHRsSm32JBMEJ9s_OZYHIMwYFV1FszEx1nw2dv_8eI"}'::jsonb,
      body    := '{"source":"cron"}'::jsonb,
      timeout_milliseconds := 30000
    ) AS request_id;
  $cron$
);

-- Confirmer : SELECT jobid, jobname, schedule, active FROM cron.job;
