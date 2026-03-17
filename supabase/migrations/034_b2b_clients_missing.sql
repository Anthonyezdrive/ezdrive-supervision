-- ============================================
-- 034 — B2B Clients manquants
-- Ajoute les clients dont les customer_external_id
-- existent dans ocpi_cdrs mais pas dans b2b_clients
-- ============================================

-- Regroupements logiques basés sur les customer_external_id en production

INSERT INTO b2b_clients (name, slug, customer_external_ids, redevance_rate, is_active)
VALUES
  -- Gros volumes
  ('Blue Automobile', 'blue-automobile', ARRAY['Blue automobile'], 0.33, true),
  ('SOCOTEC', 'socotec', ARRAY['Judes - SOCOTEC Carole'], 0.33, true),
  ('MEDIALARM', 'medialarm', ARRAY['Mobilité MEDIALARM'], 0.33, true),
  ('CACL', 'cacl', ARRAY['Mobilité CACL'], 0.33, true),
  ('PPG', 'ppg', ARRAY['PPG', 'PPG Martinique', 'PPG Réunion'], 0.33, true),
  ('ASSAG', 'assag', ARRAY['ASSAG', 'ASSAG Pro'], 0.33, true),
  ('DRAJES', 'drajes', ARRAY['D.R.A.J.E.S'], 0.33, true),
  ('SOCIPAR', 'socipar', ARRAY['Mobilité SOCIPAR', 'Socipar'], 0.33, true),
  ('Auto GM', 'auto-gm', ARRAY['Auto GM'], 0.33, true),
  ('ARCAVS', 'arcavs', ARRAY['ARCAVS', 'ARCAVS Pro'], 0.33, true),
  ('Mairie du Vauclin', 'mairie-vauclin', ARRAY['Mobilité Mairie du Vauclin'], 0.33, true),

  -- Volumes moyens
  ('TOTAL Energies', 'total-energies', ARRAY['Mobilité TOTAL', 'TotalEnergie'], 0.33, true),
  ('Norauto', 'norauto', ARRAY['Mobilité Norauto'], 0.33, true),
  ('Albioma', 'albioma', ARRAY['albioma'], 0.33, true),
  ('Bureau Veritas Martinique', 'bureau-veritas-martinique', ARRAY['Bureau Veritas'], 0.33, true),
  ('DHL', 'dhl', ARRAY['Mobilité DHL'], 0.33, true),
  ('IDEX Energie', 'idex-energie', ARRAY['IDEX ENERGIE Antilles-Guyane'], 0.33, true),
  ('SGC', 'sgc', ARRAY['Mobilité SGC', 'SGC Martinique'], 0.33, true),
  ('Mairie des Anses d''Arlet', 'mairie-anses-arlet', ARRAY['Mobilité Mairie des Anses d''Arlet'], 0.33, true),
  ('Résidence Koaline', 'residence-koaline', ARRAY['Mobilité Residence Koaline'], 0.33, true),
  ('SHM', 'shm', ARRAY['Mobilité SHM'], 0.33, true),
  ('Ville de Bouillante', 'ville-bouillante', ARRAY['Mobilité employé - ville de Bouillante'], 0.33, true),
  ('GARDEL', 'gardel', ARRAY['Mobilité GARDEL'], 0.33, true),
  ('Cour d''Appel', 'cour-appel', ARRAY['Mobilité Cour d''Appel'], 0.33, true),
  ('SANTE Plus', 'sante-plus', ARRAY['SANTE plus'], 0.33, true),
  ('Kiwidom', 'kiwidom', ARRAY['kiwidom'], 0.33, true),
  ('ABADIE', 'abadie', ARRAY['ABADIE'], 0.33, true),
  ('Le Petibonum', 'le-petibonum', ARRAY['Mobilité Le Petibonum'], 0.33, true),
  ('Le Chill', 'le-chill', ARRAY['Mobilité Le Chill'], 0.33, true),
  ('Casual Restaurant', 'casual-restaurant', ARRAY['Casual restaurant'], 0.33, true),
  ('Gwada Football Club', 'gwada-football', ARRAY['Gwada football club'], 0.33, true),
  ('Rama', 'rama', ARRAY['Mobilité Rama'], 0.33, true),
  ('BNP Paribas', 'bnp-paribas', ARRAY['Mobilité BNP PARIBAS'], 0.33, true),
  ('Mairie de Ducos', 'mairie-ducos', ARRAY['MAIRIE DE DUCOS'], 0.33, true),
  ('DEAL', 'deal', ARRAY['DEAL'], 0.33, true),
  ('Caraib Moter', 'caraib-moter', ARRAY['Caraib Moter', 'CaraibMoter'], 0.33, true)
ON CONFLICT (slug) DO NOTHING;
