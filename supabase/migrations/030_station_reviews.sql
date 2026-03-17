-- ============================================================
-- Station Reviews — avis et notes communautaires
-- ============================================================

CREATE TABLE IF NOT EXISTS public.station_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, station_id)
);

CREATE INDEX IF NOT EXISTS idx_station_reviews_station ON public.station_reviews(station_id);
CREATE INDEX IF NOT EXISTS idx_station_reviews_user ON public.station_reviews(user_id);

-- RLS
ALTER TABLE public.station_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read reviews
CREATE POLICY "Authenticated users can view reviews"
  ON public.station_reviews FOR SELECT
  USING (auth.role() = 'authenticated');

-- Users can insert their own review (one per station)
CREATE POLICY "Users can create reviews"
  ON public.station_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own review
CREATE POLICY "Users can update own reviews"
  ON public.station_reviews FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own review
CREATE POLICY "Users can delete own reviews"
  ON public.station_reviews FOR DELETE
  USING (auth.uid() = user_id);
