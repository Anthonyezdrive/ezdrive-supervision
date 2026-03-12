-- ============================================================
-- Migration 014: Fixes & Functions for Consumer API
-- Adds missing columns, PostGIS search function, storage bucket
-- ============================================================

-- ─── 1. Add missing columns to alert_history ────────────────
-- Used by report_to_alert trigger in migration 012
ALTER TABLE alert_history ADD COLUMN IF NOT EXISTS severity text DEFAULT 'warning'
  CHECK (severity IN ('info', 'warning', 'critical'));
ALTER TABLE alert_history ADD COLUMN IF NOT EXISTS message text;

-- ─── 2. Fix report_to_alert trigger to match ocpi_push_queue schema ──
-- The trigger from 012 inserts into alert_history with severity/message
-- which now exists thanks to the ALTER above.

-- ─── 3. PostGIS search function for mobile app ──────────────
-- Used by api/_modules/stations.ts

CREATE OR REPLACE FUNCTION search_stations_geo(
  p_lat double precision,
  p_lng double precision,
  p_radius_meters double precision DEFAULT 50000,
  p_connector_type text DEFAULT NULL,
  p_min_power numeric DEFAULT NULL,
  p_network_code text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  city text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  ocpp_status text,
  is_online boolean,
  connectors jsonb,
  max_power_kw numeric,
  avg_rating numeric,
  review_count integer,
  network_id uuid,
  distance_meters double precision
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.address,
    s.city,
    s.postal_code,
    s.latitude,
    s.longitude,
    s.ocpp_status,
    s.is_online,
    s.connectors,
    s.max_power_kw,
    s.avg_rating,
    s.review_count,
    s.network_id,
    ST_Distance(
      s.geog,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) AS distance_meters
  FROM stations s
  LEFT JOIN charging_networks cn ON cn.id = s.network_id
  WHERE
    -- Geo filter
    s.geog IS NOT NULL
    AND ST_DWithin(
      s.geog,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_meters
    )
    -- Optional filters
    AND (p_status IS NULL OR s.ocpp_status = p_status)
    AND (p_min_power IS NULL OR s.max_power_kw >= p_min_power)
    AND (p_network_code IS NULL OR cn.code = p_network_code)
    AND (
      p_connector_type IS NULL
      OR s.connectors::text ILIKE '%' || p_connector_type || '%'
    )
  ORDER BY distance_meters ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── 4. Create storage bucket for media uploads ─────────────
-- Note: In Supabase, storage buckets are created via the dashboard or API,
-- not via SQL migrations. This INSERT works if the storage schema exists.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ezdrive-media',
  'ezdrive-media',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: authenticated users can upload to their own folder
CREATE POLICY "users_upload_own_media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ezdrive-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read access to media
CREATE POLICY "public_read_media"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'ezdrive-media');

-- Users can delete their own uploads
CREATE POLICY "users_delete_own_media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'ezdrive-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── 5. Fix RFID → OCPI push queue insert ──────────────────
-- The rfid.ts module inserts into ocpi_push_queue but the schema
-- requires object_type and ocpi_path which are NOT NULL.
-- Create a helper function that auto-fills these fields for token pushes.

CREATE OR REPLACE FUNCTION queue_ocpi_token_push()
RETURNS trigger AS $$
BEGIN
  -- Auto-queue PUT to Gireve when token is created or updated
  INSERT INTO ocpi_push_queue (
    module, action, object_type, object_id, ocpi_path, payload, priority
  ) VALUES (
    'tokens',
    CASE WHEN TG_OP = 'INSERT' THEN 'PUT' ELSE 'PATCH' END,
    'token',
    NEW.id::text,
    format('/tokens/%s/%s/%s', NEW.country_code, NEW.party_id, NEW.uid),
    row_to_json(NEW)::jsonb,
    5
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: auto-push token changes to Gireve
-- (This replaces the manual push_queue inserts in rfid.ts
--  but we keep both for redundancy — the module checks if already queued)
-- Disabled by default to avoid double-push; enable if you remove manual inserts
-- CREATE TRIGGER trg_auto_push_ocpi_token
--   AFTER INSERT OR UPDATE ON ocpi_tokens
--   FOR EACH ROW EXECUTE FUNCTION queue_ocpi_token_push();
