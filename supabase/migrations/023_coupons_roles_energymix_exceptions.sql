-- ============================================================
-- EZDrive Migration 023 — Coupons, Roles/RBAC, Energy Mix, Exceptions
-- Makes 4 UI-only pages fully functional with real backend
-- ============================================================

-- ─── 1. COUPONS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coupons (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code            text NOT NULL UNIQUE,
  label           text NOT NULL,
  description     text,

  -- Type: credit = montant €, percentage = réduction %, freecharge = session gratuite
  type            text NOT NULL DEFAULT 'credit'
                  CHECK (type IN ('credit', 'percentage', 'freecharge')),

  -- Valeurs
  initial_value   numeric(10,2) NOT NULL DEFAULT 0,   -- Montant initial ou % réduction
  current_value   numeric(10,2) NOT NULL DEFAULT 0,   -- Restant (pour credit)
  currency        text NOT NULL DEFAULT 'EUR',

  -- Statut
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive', 'expired', 'exhausted')),

  -- Assignation
  driver_id       uuid REFERENCES consumer_profiles(id) ON DELETE SET NULL,
  driver_name     text,
  driver_email    text,

  -- Limites
  max_uses        int,                -- Null = illimité
  used_count      int NOT NULL DEFAULT 0,
  expires_at      timestamptz,

  -- Métadonnées
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code    ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_status  ON coupons(status);
CREATE INDEX IF NOT EXISTS idx_coupons_driver  ON coupons(driver_id) WHERE driver_id IS NOT NULL;

CREATE TRIGGER trg_coupons_updated
  BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_coupons" ON coupons
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ezdrive_profiles
    WHERE id = auth.uid() AND role IN ('admin', 'operator')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ezdrive_profiles
    WHERE id = auth.uid() AND role IN ('admin', 'operator')
  ));

CREATE POLICY "service_manage_coupons" ON coupons
  TO service_role USING (true) WITH CHECK (true);

-- Données seed
INSERT INTO coupons (code, label, type, initial_value, current_value, status, driver_name, driver_email, max_uses, used_count, expires_at) VALUES
  ('WELCOME50',  'Bienvenue 50€',       'credit',     50.00,  32.50,  'active',    'Jean Dupont',    'jean.dupont@email.gp',    1, 0, '2026-12-31T23:59:59Z'),
  ('SUMMER25',   'Été 2026 -25%',       'percentage', 25.00,  25.00,  'active',    NULL,             NULL,                      100, 23, '2026-09-30T23:59:59Z'),
  ('FREECHG01',  'Session gratuite VIP', 'freecharge', 1.00,   1.00,   'active',    'Marie Claire',   'marie.claire@ezdrive.fr', 1, 0, '2026-06-30T23:59:59Z'),
  ('PROMO10',    'Promo lancement 10€',  'credit',     10.00,  0.00,   'exhausted', 'Paul Martin',    'paul.m@gmail.com',        1, 1, '2026-03-01T23:59:59Z'),
  ('FLEET100',   'Flotte entreprise',    'credit',     100.00, 67.30,  'active',    NULL,             NULL,                      NULL, 12, NULL),
  ('EXPIRED01',  'Ancien coupon',        'percentage', 15.00,  15.00,  'expired',   'Luc Bernard',    'luc.b@email.mq',          5, 0, '2025-12-31T23:59:59Z')
ON CONFLICT (code) DO NOTHING;


-- ─── 2. ROLES & RBAC ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_roles (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text NOT NULL UNIQUE,
  description  text,
  color        text NOT NULL DEFAULT '#6B7280',
  permissions  text[] NOT NULL DEFAULT '{}',
  is_system    boolean NOT NULL DEFAULT false,
  user_count   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_admin_roles_updated
  BEFORE UPDATE ON admin_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_roles" ON admin_roles
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ezdrive_profiles
    WHERE id = auth.uid() AND role IN ('admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ezdrive_profiles
    WHERE id = auth.uid() AND role IN ('admin')
  ));

CREATE POLICY "authenticated_read_roles" ON admin_roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_manage_roles" ON admin_roles
  TO service_role USING (true) WITH CHECK (true);

-- Seed les 4 rôles système
INSERT INTO admin_roles (name, description, color, permissions, is_system, user_count) VALUES
  ('Administrateur', 'Accès complet à toutes les fonctionnalités. Peut gérer les utilisateurs, rôles et paramètres système.',
   '#EF4444',
   ARRAY['stations.view','stations.edit','stations.ocpp','stations.maintenance',
         'customers.view','customers.edit','customers.delete','customers.coupons',
         'billing.invoices','billing.generate','billing.export','billing.tariffs',
         'integrations.ocpi','integrations.roaming','integrations.sync',
         'admin.users','admin.roles','admin.settings','admin.logs'],
   true, 1),
  ('Opérateur CPO', 'Gestion des bornes, monitoring et maintenance. Pas d''accès à la facturation ni aux paramètres.',
   '#3B82F6',
   ARRAY['stations.view','stations.edit','stations.ocpp','stations.maintenance',
         'customers.view','integrations.ocpi','integrations.sync'],
   true, 0),
  ('Comptabilité', 'Accès à la facturation, tarifs et exports. Vision clients en lecture seule.',
   '#F59E0B',
   ARRAY['customers.view','billing.invoices','billing.generate','billing.export','billing.tariffs'],
   true, 0),
  ('Lecteur', 'Accès en lecture seule au tableau de bord, bornes et monitoring. Aucune modification possible.',
   '#6B7280',
   ARRAY['stations.view','customers.view','billing.invoices','admin.logs'],
   true, 0)
ON CONFLICT (name) DO NOTHING;


-- Groupes d'utilisateurs
CREATE TABLE IF NOT EXISTS user_groups (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text NOT NULL UNIQUE,
  description  text,
  role_id      uuid REFERENCES admin_roles(id) ON DELETE SET NULL,
  member_count int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_user_groups_updated
  BEFORE UPDATE ON user_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_groups" ON user_groups
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ezdrive_profiles
    WHERE id = auth.uid() AND role IN ('admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ezdrive_profiles
    WHERE id = auth.uid() AND role IN ('admin')
  ));

CREATE POLICY "authenticated_read_groups" ON user_groups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_manage_groups" ON user_groups
  TO service_role USING (true) WITH CHECK (true);

-- Seed groupes
INSERT INTO user_groups (name, description, role_id, member_count)
SELECT 'Équipe Antilles', 'Opérateurs en charge des bornes Guadeloupe et Martinique', r.id, 3
FROM admin_roles r WHERE r.name = 'Opérateur CPO'
ON CONFLICT (name) DO NOTHING;

INSERT INTO user_groups (name, description, role_id, member_count)
SELECT 'Équipe Guyane', 'Opérateurs dédiés au réseau Guyane', r.id, 2
FROM admin_roles r WHERE r.name = 'Opérateur CPO'
ON CONFLICT (name) DO NOTHING;


-- ─── 3. ENERGY MIX PROFILES ─────────────────────────────────

CREATE TABLE IF NOT EXISTS energy_mix_profiles (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name                  text NOT NULL,
  supplier              text NOT NULL,
  product               text,
  description           text,
  renewable_percentage  numeric(5,2) NOT NULL DEFAULT 0,
  is_green              boolean NOT NULL DEFAULT false,
  sites_count           int NOT NULL DEFAULT 0,

  -- Sources: [{type, percentage}] where type in solar,wind,hydro,nuclear,gas,coal,biomass,geothermal
  sources               jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_energy_mix_updated
  BEFORE UPDATE ON energy_mix_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE energy_mix_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_energy_mix" ON energy_mix_profiles
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ezdrive_profiles
    WHERE id = auth.uid() AND role IN ('admin', 'operator')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ezdrive_profiles
    WHERE id = auth.uid() AND role IN ('admin', 'operator')
  ));

CREATE POLICY "authenticated_read_energy_mix" ON energy_mix_profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_manage_energy_mix" ON energy_mix_profiles
  TO service_role USING (true) WITH CHECK (true);

-- Seed energy mix profiles DOM-TOM
INSERT INTO energy_mix_profiles (name, supplier, product, description, renewable_percentage, is_green, sites_count, sources) VALUES
  ('Mix Antilles EDF',
   'EDF DOM-TOM', 'Offre Standard',
   'Mix énergétique standard pour les Antilles françaises. Objectif 50% renouvelable d''ici 2030.',
   35.00, false, 294,
   '[{"type":"solar","percentage":18},{"type":"wind","percentage":7},{"type":"hydro","percentage":5},{"type":"biomass","percentage":5},{"type":"gas","percentage":40},{"type":"coal","percentage":25}]'::jsonb),
  ('100% Vert Guyane',
   'EDF Guyane', 'Offre Verte+',
   'Mix 100% renouvelable grâce au barrage de Petit-Saut et aux fermes solaires de Guyane.',
   100.00, true, 45,
   '[{"type":"hydro","percentage":55},{"type":"solar","percentage":30},{"type":"biomass","percentage":15}]'::jsonb),
  ('Mix Réunion Albioma',
   'Albioma', 'Bagasse + Solaire',
   'Mix enrichi en biomasse (bagasse de canne à sucre) + solaire photovoltaïque.',
   62.00, false, 38,
   '[{"type":"biomass","percentage":42},{"type":"solar","percentage":20},{"type":"gas","percentage":23},{"type":"coal","percentage":15}]'::jsonb)
ON CONFLICT DO NOTHING;


-- ─── 4. EXCEPTION GROUPS & RULES ─────────────────────────────

CREATE TABLE IF NOT EXISTS exception_groups (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name           text NOT NULL,
  description    text,
  organization   text,

  -- Scope: drivers, tokens, stations
  category       text NOT NULL DEFAULT 'drivers'
                 CHECK (category IN ('drivers', 'tokens', 'stations')),

  is_active      boolean NOT NULL DEFAULT true,
  rules_count    int NOT NULL DEFAULT 0,
  items_count    int NOT NULL DEFAULT 0,

  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_exception_groups_updated
  BEFORE UPDATE ON exception_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE exception_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_exception_groups" ON exception_groups
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ezdrive_profiles
    WHERE id = auth.uid() AND role IN ('admin', 'operator')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ezdrive_profiles
    WHERE id = auth.uid() AND role IN ('admin', 'operator')
  ));

CREATE POLICY "authenticated_read_exception_groups" ON exception_groups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_manage_exception_groups" ON exception_groups
  TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS exception_rules (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id       uuid REFERENCES exception_groups(id) ON DELETE CASCADE,
  name           text NOT NULL,
  description    text,

  -- Type: whitelist, blacklist, override
  type           text NOT NULL DEFAULT 'whitelist'
                 CHECK (type IN ('whitelist', 'blacklist', 'override')),

  -- Scope: drivers, tokens, stations
  scope          text NOT NULL DEFAULT 'drivers'
                 CHECK (scope IN ('drivers', 'tokens', 'stations')),

  priority       int NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT true,
  items_count    int NOT NULL DEFAULT 0,

  -- Conditions: [{field, operator, value}]
  conditions     jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exception_rules_group ON exception_rules(group_id);
CREATE INDEX IF NOT EXISTS idx_exception_rules_type  ON exception_rules(type);

CREATE TRIGGER trg_exception_rules_updated
  BEFORE UPDATE ON exception_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE exception_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_exception_rules" ON exception_rules
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ezdrive_profiles
    WHERE id = auth.uid() AND role IN ('admin', 'operator')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ezdrive_profiles
    WHERE id = auth.uid() AND role IN ('admin', 'operator')
  ));

CREATE POLICY "authenticated_read_exception_rules" ON exception_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_manage_exception_rules" ON exception_rules
  TO service_role USING (true) WITH CHECK (true);

-- Seed exception groups
INSERT INTO exception_groups (name, description, organization, category, is_active, rules_count, items_count) VALUES
  ('VIP Entreprises',    'Conducteurs des entreprises partenaires avec accès prioritaire à toutes les bornes', 'EZDrive Partenaires', 'drivers',  true,  2, 45),
  ('Tokens Bloqués',     'Tokens RFID signalés comme perdus, volés ou frauduleux. Accès refusé sur toutes les bornes.',  NULL,                  'tokens',   true,  1, 12),
  ('Bornes Restreintes', 'Bornes en accès privé (parkings entreprise) nécessitant un token autorisé',                     'Parking Jarry',       'stations', true,  3, 8),
  ('Test Roaming',       'Groupe temporaire pour tester les autorisations roaming avec Gireve',                            'Gireve IOP',          'drivers',  false, 1, 3)
ON CONFLICT DO NOTHING;

-- Seed exception rules (link to groups)
INSERT INTO exception_rules (group_id, name, description, type, scope, priority, is_active, items_count, conditions)
SELECT g.id, 'Accès prioritaire VIP', 'Autorise les conducteurs VIP à charger sur toutes les bornes, même en maintenance',
       'whitelist', 'drivers', 1, true, 45,
       '[{"field":"group","operator":"in","value":"VIP Entreprises"},{"field":"station_status","operator":"!=","value":"offline"}]'::jsonb
FROM exception_groups g WHERE g.name = 'VIP Entreprises'
ON CONFLICT DO NOTHING;

INSERT INTO exception_rules (group_id, name, description, type, scope, priority, is_active, items_count, conditions)
SELECT g.id, 'Bloquer tokens frauduleux', 'Refuse l''autorisation pour tous les tokens signalés comme perdus/volés',
       'blacklist', 'tokens', 0, true, 12,
       '[{"field":"token_status","operator":"in","value":"lost,stolen,fraudulent"},{"field":"action","operator":"=","value":"deny_all"}]'::jsonb
FROM exception_groups g WHERE g.name = 'Tokens Bloqués'
ON CONFLICT DO NOTHING;

INSERT INTO exception_rules (group_id, name, description, type, scope, priority, is_active, items_count, conditions)
SELECT g.id, 'Accès parking privé Jarry', 'Seuls les tokens autorisés peuvent utiliser les bornes du parking Jarry Business',
       'whitelist', 'stations', 2, true, 8,
       '[{"field":"station_location","operator":"=","value":"Parking Jarry Business"},{"field":"token_group","operator":"in","value":"Jarry Tenants"}]'::jsonb
FROM exception_groups g WHERE g.name = 'Bornes Restreintes'
ON CONFLICT DO NOTHING;

INSERT INTO exception_rules (group_id, name, description, type, scope, priority, is_active, items_count, conditions)
SELECT g.id, 'Tarif réduit employés', 'Applique un tarif réduit de 50% pour les employés EZDrive',
       'override', 'drivers', 3, true, 3,
       '[{"field":"driver_email","operator":"ends_with","value":"@ezdrive.fr"},{"field":"tariff_discount","operator":"=","value":"50%"}]'::jsonb
FROM exception_groups g WHERE g.name = 'VIP Entreprises'
ON CONFLICT DO NOTHING;


-- ─── 5. Add role_id to ezdrive_profiles for RBAC link ────────

ALTER TABLE ezdrive_profiles
  ADD COLUMN IF NOT EXISTS admin_role_id uuid REFERENCES admin_roles(id) ON DELETE SET NULL;

-- Link existing admin to Administrateur role
UPDATE ezdrive_profiles
SET admin_role_id = (SELECT id FROM admin_roles WHERE name = 'Administrateur' LIMIT 1)
WHERE role = 'admin' AND admin_role_id IS NULL;
