-- ============================================================
-- User Vehicles — véhicules enregistrés par les utilisateurs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  battery_capacity_kwh NUMERIC(6,1),
  connector_type TEXT,
  license_plate TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un véhicule par utilisateur pour le moment
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_vehicles_user ON public.user_vehicles(user_id);

-- RLS
ALTER TABLE public.user_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vehicle"
  ON public.user_vehicles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vehicle"
  ON public.user_vehicles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vehicle"
  ON public.user_vehicles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own vehicle"
  ON public.user_vehicles FOR DELETE
  USING (auth.uid() = user_id);
