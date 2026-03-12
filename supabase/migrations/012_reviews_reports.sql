-- ============================================================
-- Migration 012: Station Reviews & Reports
-- Community features for mobile app
-- ============================================================

-- Station reviews
CREATE TABLE IF NOT EXISTS station_reviews (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id        uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Ratings (1-5 scale)
  overall_rating    integer NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  reliability       integer CHECK (reliability BETWEEN 1 AND 5),
  price_quality     integer CHECK (price_quality BETWEEN 1 AND 5),
  location_rating   integer CHECK (location_rating BETWEEN 1 AND 5),
  security          integer CHECK (security BETWEEN 1 AND 5),

  -- Content
  comment           text,
  photos            text[] DEFAULT '{}',

  -- Meta
  helpful_count     integer NOT NULL DEFAULT 0,
  is_verified_charge boolean NOT NULL DEFAULT false,  -- true if user has a session at this station

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- One review per user per station
  UNIQUE(station_id, user_id)
);

CREATE INDEX idx_reviews_station   ON station_reviews (station_id);
CREATE INDEX idx_reviews_user      ON station_reviews (user_id);
CREATE INDEX idx_reviews_rating    ON station_reviews (overall_rating);
CREATE INDEX idx_reviews_created   ON station_reviews (created_at DESC);

CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON station_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Prevent double-voting on helpful
CREATE TABLE IF NOT EXISTS review_helpful_votes (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id   uuid NOT NULL REFERENCES station_reviews(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE(review_id, user_id)
);

-- Auto-update station avg_rating and review_count
CREATE OR REPLACE FUNCTION update_station_rating()
RETURNS trigger AS $$
DECLARE
  v_station_id uuid;
BEGIN
  v_station_id := COALESCE(NEW.station_id, OLD.station_id);

  UPDATE stations SET
    avg_rating = COALESCE((
      SELECT ROUND(AVG(overall_rating)::numeric, 2)
      FROM station_reviews WHERE station_id = v_station_id
    ), 0),
    review_count = (
      SELECT COUNT(*) FROM station_reviews WHERE station_id = v_station_id
    )
  WHERE id = v_station_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_station_rating
  AFTER INSERT OR UPDATE OR DELETE ON station_reviews
  FOR EACH ROW EXECUTE FUNCTION update_station_rating();

-- Station reports (out of order, damaged, etc.)
CREATE TABLE IF NOT EXISTS station_reports (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id      uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  report_type     text NOT NULL CHECK (report_type IN (
    'OUT_OF_ORDER', 'DAMAGED_CONNECTOR', 'ACCESS_BLOCKED',
    'WRONG_INFO', 'SAFETY_HAZARD', 'VANDALISM', 'OTHER'
  )),
  description     text,
  photos          text[] DEFAULT '{}',

  -- Workflow
  status          text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN (
    'SUBMITTED', 'IN_REVIEW', 'CONFIRMED', 'RESOLVED', 'REJECTED'
  )),
  admin_response  text,
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES auth.users(id),

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_station  ON station_reports (station_id);
CREATE INDEX idx_reports_user     ON station_reports (user_id);
CREATE INDEX idx_reports_status   ON station_reports (status);
CREATE INDEX idx_reports_type     ON station_reports (report_type);
CREATE INDEX idx_reports_created  ON station_reports (created_at DESC);

CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON station_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create alert when critical report is submitted
CREATE OR REPLACE FUNCTION report_to_alert()
RETURNS trigger AS $$
BEGIN
  IF NEW.report_type IN ('OUT_OF_ORDER', 'SAFETY_HAZARD', 'VANDALISM') THEN
    INSERT INTO alert_history (station_id, alert_type, severity, message)
    VALUES (
      NEW.station_id,
      'user_report',
      CASE NEW.report_type
        WHEN 'SAFETY_HAZARD' THEN 'critical'
        WHEN 'VANDALISM' THEN 'critical'
        ELSE 'warning'
      END,
      'User report: ' || NEW.report_type || COALESCE(' - ' || LEFT(NEW.description, 100), '')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_report_to_alert
  AFTER INSERT ON station_reports
  FOR EACH ROW EXECUTE FUNCTION report_to_alert();

-- RLS
ALTER TABLE station_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_helpful_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_reports ENABLE ROW LEVEL SECURITY;

-- Reviews: anyone authenticated can read, users manage own
CREATE POLICY "anyone_read_reviews"
  ON station_reviews FOR SELECT TO authenticated USING (true);

CREATE POLICY "users_create_reviews"
  ON station_reviews FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_reviews"
  ON station_reviews FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_delete_own_reviews"
  ON station_reviews FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "service_manage_reviews"
  ON station_reviews FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Helpful votes
CREATE POLICY "users_manage_own_votes"
  ON review_helpful_votes FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "anyone_read_votes"
  ON review_helpful_votes FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_manage_votes"
  ON review_helpful_votes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Reports: users can read own + create, admins can read/manage all
CREATE POLICY "users_read_own_reports"
  ON station_reports FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users_create_reports"
  ON station_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admins_manage_reports"
  ON station_reports FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "service_manage_reports"
  ON station_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
