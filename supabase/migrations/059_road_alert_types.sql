-- Migration 059: Extend alert_rules for Road.io connectivity alerts

-- 1. Drop and recreate CHECK constraint with new alert types
ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_alert_type_check;

ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_alert_type_check
  CHECK (alert_type IN (
    'fault_threshold', 'offline_threshold', 'unavailable_threshold',
    'heartbeat_missing', 'session_stuck', 'connector_error',
    'energy_threshold', 'capacity_warning', 'capacity_critical',
    -- New Road.io alert types
    'disconnection', 'recovery', 'extended_outage'
  ));

-- 2. Seed default Road alert rules
INSERT INTO alert_rules (alert_type, title, description, threshold_hours, notification_interval_hours, email_recipients, is_active, global_config)
VALUES
  ('disconnection', 'Station déconnectée', 'Alerte quand une station Road.io perd la connectivité', 0, 6, '{}', true, true),
  ('recovery', 'Station reconnectée', 'Notification de retour en ligne d''une station', 0, 1, '{}', true, true),
  ('extended_outage', 'Panne prolongée (>24h)', 'Station en panne ou indisponible depuis plus de 24 heures', 24, 24, '{}', true, true)
ON CONFLICT DO NOTHING;

-- 3. Cron: road-alert-check every 5 minutes
SELECT cron.schedule(
  'road-alert-check',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/road-alert-check',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )$$
);
