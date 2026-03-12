-- ============================================
-- EZDrive Supervision – User Profiles & Auth
-- ============================================

CREATE TABLE IF NOT EXISTS ezdrive_profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  full_name   text,
  role        text NOT NULL DEFAULT 'operator'
                CHECK (role IN ('admin', 'operator', 'tech')),
  territory   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION handle_new_ezdrive_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO ezdrive_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_ezdrive
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_ezdrive_user();

ALTER TABLE ezdrive_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON ezdrive_profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON ezdrive_profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON ezdrive_profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ezdrive_profiles WHERE id = auth.uid() AND role = 'admin')
  );
