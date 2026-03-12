-- ============================================================
-- Migration 013: Subscriptions, RFID Cards & Business Contacts
-- Port from Resonovia billing-service + Android app contract
-- ============================================================

-- Subscription offers
CREATE TABLE IF NOT EXISTS subscription_offers (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type            text NOT NULL UNIQUE CHECK (type IN (
    'PAY_AS_YOU_GO', 'RFID_FIDELITY', 'PREMIUM_MONTHLY', 'PREMIUM_YEARLY', 'BUSINESS'
  )),
  name            text NOT NULL,
  description     text,
  price_cents     integer NOT NULL DEFAULT 0,
  currency        text NOT NULL DEFAULT 'EUR',
  billing_period  text CHECK (billing_period IN ('MONTHLY', 'YEARLY', 'ONE_TIME', NULL)),
  stripe_price_id text,
  benefits        text[] DEFAULT '{}',
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed subscription offers
INSERT INTO subscription_offers (type, name, description, price_cents, billing_period, benefits, sort_order) VALUES
  ('PAY_AS_YOU_GO', 'Pay As You Go', 'Paiement a la session, sans engagement', 0, NULL,
   ARRAY['Acces a toutes les bornes EZDrive', 'Paiement par CB', 'Historique des sessions'], 1),

  ('RFID_FIDELITY', 'Carte RFID Fidelite', 'Carte RFID avec avantages fidelite', 1500, 'ONE_TIME',
   ARRAY['Carte RFID personnalisee', 'Badge sans contact', '-5% sur toutes les recharges', 'Points fidelite'], 2),

  ('PREMIUM_MONTHLY', 'Premium Mensuel', 'Abonnement premium mensuel', 999, 'MONTHLY',
   ARRAY['Tous les avantages RFID', '-15% sur toutes les recharges', 'Support prioritaire', 'Reservations avancees'], 3),

  ('PREMIUM_YEARLY', 'Premium Annuel', 'Abonnement premium annuel (-20%)', 9590, 'YEARLY',
   ARRAY['Tous les avantages Premium', '-20% sur toutes les recharges', '2 mois offerts', 'Acces beta features'], 4),

  ('BUSINESS', 'Business / Flotte', 'Solution entreprise sur mesure', 0, 'MONTHLY',
   ARRAY['Tarifs flotte negocies', 'Dashboard multi-vehicules', 'Facturation centralisee', 'API dedicee', 'Account manager'], 5)
ON CONFLICT (type) DO NOTHING;

-- User subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_id                uuid NOT NULL REFERENCES subscription_offers(id),
  stripe_subscription_id  text,
  stripe_checkout_id      text,

  status                  text NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'
  )),

  started_at              timestamptz,
  expires_at              timestamptz,
  cancelled_at            timestamptz,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subs_user    ON user_subscriptions (user_id);
CREATE INDEX idx_subs_status  ON user_subscriptions (status);
CREATE INDEX idx_subs_stripe  ON user_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE TRIGGER trg_subs_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_subs"
  ON user_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "service_manage_subs"
  ON user_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admins_read_all_subs"
  ON user_subscriptions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'));

-- RFID Cards
CREATE TABLE IF NOT EXISTS rfid_cards (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_number     text NOT NULL UNIQUE,
  visual_number   text,           -- Printed on card (shorter)

  status          text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
    'REQUESTED', 'PRODUCTION', 'SHIPPED', 'ACTIVE', 'SUSPENDED', 'LOST', 'CANCELLED'
  )),

  -- Link to OCPI token (for Gireve interop)
  ocpi_token_id   uuid REFERENCES ocpi_tokens(id) ON DELETE SET NULL,

  -- Shipping
  shipping_address jsonb,
  tracking_number text,

  activated_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rfid_user       ON rfid_cards (user_id);
CREATE INDEX idx_rfid_status     ON rfid_cards (status);
CREATE INDEX idx_rfid_card_num   ON rfid_cards (card_number);
CREATE INDEX idx_rfid_ocpi_token ON rfid_cards (ocpi_token_id) WHERE ocpi_token_id IS NOT NULL;

CREATE TRIGGER trg_rfid_updated_at
  BEFORE UPDATE ON rfid_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE rfid_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_rfid"
  ON rfid_cards FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "service_manage_rfid"
  ON rfid_cards FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admins_manage_rfid"
  ON rfid_cards FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Business contact requests
CREATE TABLE IF NOT EXISTS business_contacts (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name  text NOT NULL,
  contact_name  text NOT NULL,
  email         text NOT NULL,
  phone         text,
  fleet_size    integer,
  message       text,

  status        text NOT NULL DEFAULT 'NEW' CHECK (status IN (
    'NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'CLOSED_WON', 'CLOSED_LOST'
  )),
  assigned_to   uuid REFERENCES auth.users(id),
  notes         text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_biz_status   ON business_contacts (status);
CREATE INDEX idx_biz_created  ON business_contacts (created_at DESC);

CREATE TRIGGER trg_biz_updated_at
  BEFORE UPDATE ON business_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE business_contacts ENABLE ROW LEVEL SECURITY;

-- Public can create (no auth required via service role)
CREATE POLICY "service_manage_biz"
  ON business_contacts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admins_manage_biz"
  ON business_contacts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Subscription offers are public read
ALTER TABLE subscription_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_offers"
  ON subscription_offers FOR SELECT TO authenticated USING (true);

CREATE POLICY "anon_read_offers"
  ON subscription_offers FOR SELECT TO anon USING (true);

CREATE POLICY "service_manage_offers"
  ON subscription_offers FOR ALL TO service_role USING (true) WITH CHECK (true);
