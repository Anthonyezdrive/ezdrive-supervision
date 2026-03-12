-- ============================================
-- EZDrive Supervision – Vues SLA & Analytics
-- ============================================

-- Taux de disponibilité par territoire
CREATE OR REPLACE VIEW sla_by_territory AS
SELECT
  t.code                    AS territory_code,
  t.name                    AS territory_name,
  COUNT(*)                  AS total_stations,
  COUNT(*) FILTER (WHERE s.ocpp_status = 'Available')                                                    AS available,
  COUNT(*) FILTER (WHERE s.ocpp_status = 'Charging')                                                     AS charging,
  COUNT(*) FILTER (WHERE s.ocpp_status = 'Faulted' OR NOT s.is_online)                                   AS faulted,
  COUNT(*) FILTER (WHERE s.ocpp_status IN ('Unavailable','Unknown') AND s.is_online)                     AS unavailable,
  COUNT(*) FILTER (WHERE s.ocpp_status IN ('Preparing','SuspendedEVSE','SuspendedEV','Finishing'))        AS other,
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE s.ocpp_status IN ('Available','Charging','Preparing','SuspendedEVSE','SuspendedEV','Finishing')
    ) / NULLIF(COUNT(*), 0),
  1) AS availability_pct,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (now() - s.status_since)) / 3600)
    FILTER (WHERE s.ocpp_status = 'Faulted' OR NOT s.is_online),
  1) AS avg_fault_hours
FROM stations s
LEFT JOIN territories t ON s.territory_id = t.id
GROUP BY t.code, t.name
ORDER BY t.code;

-- Taux de disponibilité par CPO
CREATE OR REPLACE VIEW sla_by_cpo AS
SELECT
  c.code                    AS cpo_code,
  c.name                    AS cpo_name,
  c.color                   AS cpo_color,
  COUNT(*)                  AS total_stations,
  COUNT(*) FILTER (WHERE s.ocpp_status = 'Available')                                                    AS available,
  COUNT(*) FILTER (WHERE s.ocpp_status = 'Charging')                                                     AS charging,
  COUNT(*) FILTER (WHERE s.ocpp_status = 'Faulted' OR NOT s.is_online)                                   AS faulted,
  COUNT(*) FILTER (WHERE s.ocpp_status IN ('Unavailable','Unknown') AND s.is_online)                     AS unavailable,
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE s.ocpp_status IN ('Available','Charging','Preparing','SuspendedEVSE','SuspendedEV','Finishing')
    ) / NULLIF(COUNT(*), 0),
  1) AS availability_pct
FROM stations s
LEFT JOIN cpo_operators c ON s.cpo_id = c.id
GROUP BY c.code, c.name, c.color
ORDER BY c.code;
