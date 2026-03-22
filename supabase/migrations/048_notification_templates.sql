-- Notification Templates & Enriched Push System
-- 8 notification types with templates and logging

CREATE TYPE notification_type AS ENUM (
  'charge_started',
  'charge_completed',
  'charge_failed',
  'idle_fee_warning',
  'payment_confirmed',
  'reservation_confirmed',
  'reservation_expired',
  'maintenance_alert',
  'invoice_ready',
  'token_expiring',
  'settlement_ready',
  'reimbursement_ready'
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type notification_type NOT NULL UNIQUE,
  title_template text NOT NULL,
  body_template text NOT NULL,
  data_schema jsonb DEFAULT '{}', -- Expected variables
  channel text NOT NULL DEFAULT 'charging',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type notification_type NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'read')),
  expo_receipt_id text,
  sent_at timestamptz DEFAULT now()
);

CREATE INDEX idx_notification_log_user ON notification_log(user_id, sent_at DESC);
CREATE INDEX idx_notification_log_type ON notification_log(type);

-- Seed templates
INSERT INTO notification_templates (type, title_template, body_template, data_schema) VALUES
('charge_started', 'Charge démarrée ⚡', 'Votre session a démarré sur {station_name}. Connecteur {connector_id}.', '{"station_name": "string", "connector_id": "number"}'::jsonb),
('charge_completed', 'Charge terminée ✅', '{energy_kwh} kWh chargés en {duration_min} min sur {station_name}. Coût: {cost}€', '{"energy_kwh": "number", "duration_min": "number", "station_name": "string", "cost": "number"}'::jsonb),
('charge_failed', 'Erreur de charge ❌', 'La session sur {station_name} a échoué. Raison: {reason}', '{"station_name": "string", "reason": "string"}'::jsonb),
('idle_fee_warning', 'Attention stationnement 🅿️', 'Votre véhicule est toujours branché sur {station_name}. Des frais de stationnement de {fee_per_min}€/min s''appliqueront dans {minutes_left} min.', '{"station_name": "string", "fee_per_min": "number", "minutes_left": "number"}'::jsonb),
('payment_confirmed', 'Paiement confirmé 💳', 'Paiement de {amount}€ confirmé pour votre session sur {station_name}.', '{"amount": "number", "station_name": "string"}'::jsonb),
('reservation_confirmed', 'Réservation confirmée 📅', 'Borne {station_name} réservée jusqu''à {expiry_time}. Connecteur {connector_id}.', '{"station_name": "string", "expiry_time": "string", "connector_id": "number"}'::jsonb),
('reservation_expired', 'Réservation expirée ⏰', 'Votre réservation sur {station_name} a expiré. Des frais de no-show de {fee}€ peuvent s''appliquer.', '{"station_name": "string", "fee": "number"}'::jsonb),
('maintenance_alert', 'Alerte maintenance 🔧', 'La borne {station_name} est en panne depuis {hours_in_fault}h. Statut: {status}.', '{"station_name": "string", "hours_in_fault": "number", "status": "string"}'::jsonb),
('invoice_ready', 'Facture disponible 📄', 'Votre facture {invoice_number} de {amount}€ est prête.', '{"invoice_number": "string", "amount": "number"}'::jsonb),
('token_expiring', 'Token RFID bientôt expiré 🏷️', 'Votre token {token_uid} expire le {expiry_date}. Pensez à le renouveler.', '{"token_uid": "string", "expiry_date": "string"}'::jsonb),
('settlement_ready', 'Règlement mensuel prêt 💰', 'Le règlement de {period} est prêt: {amount}€ pour {session_count} sessions.', '{"period": "string", "amount": "number", "session_count": "number"}'::jsonb),
('reimbursement_ready', 'Remboursement calculé 💸', 'Remboursement de {amount}€ pour {kwh} kWh de charge ({period}).', '{"amount": "number", "kwh": "number", "period": "string"}'::jsonb)
ON CONFLICT (type) DO NOTHING;

-- RLS
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read templates" ON notification_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service full templates" ON notification_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users read own notifications" ON notification_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service full log" ON notification_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- GreenFlux webhook log
CREATE TABLE IF NOT EXISTS gfx_webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  signature text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed', 'ignored')),
  error_message text,
  processing_time_ms int,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_gfx_webhook_log_type ON gfx_webhook_log(event_type, created_at DESC);
CREATE INDEX idx_gfx_webhook_log_status ON gfx_webhook_log(status) WHERE status IN ('received', 'failed');

ALTER TABLE gfx_webhook_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service full gfx_webhook" ON gfx_webhook_log FOR ALL TO service_role USING (true) WITH CHECK (true);
