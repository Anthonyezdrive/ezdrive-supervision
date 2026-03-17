-- ============================================================
-- Station Reports — signalements de problèmes par les utilisateurs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.station_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL CHECK (issue_type IN ('BROKEN', 'DAMAGED_CONNECTOR', 'ACCESS_BLOCKED', 'OTHER')),
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_station_reports_station ON public.station_reports(station_id);
CREATE INDEX IF NOT EXISTS idx_station_reports_unresolved ON public.station_reports(station_id) WHERE resolved = false;

-- RLS
ALTER TABLE public.station_reports ENABLE ROW LEVEL SECURITY;

-- Users can insert their own reports
CREATE POLICY "Users can create reports"
  ON public.station_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can see their own reports
CREATE POLICY "Users can view own reports"
  ON public.station_reports FOR SELECT
  USING (auth.uid() = user_id);

-- Admins/operators can see all reports
CREATE POLICY "Admins can view all reports"
  ON public.station_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ezdrive_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'operator')
    )
  );

-- Admins can resolve reports
CREATE POLICY "Admins can update reports"
  ON public.station_reports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.ezdrive_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'operator')
    )
  );
