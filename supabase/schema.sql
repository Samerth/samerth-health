-- Samerth Health — minimal extra storage
-- Run once in Supabase SQL editor.
-- Existing tables (habits, daily_logs, daily_ratings, gym_logs, weekly_logs) stay as-is.

-- One flexible table for settings, water logs, and photo paths (no joins).
CREATE TABLE IF NOT EXISTS app_storage (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_storage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read app_storage"
  ON app_storage FOR SELECT
  USING (true);

CREATE POLICY "Allow anon insert app_storage"
  ON app_storage FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow anon update app_storage"
  ON app_storage FOR UPDATE
  USING (true);

-- Storage bucket for progress photos (create in Dashboard → Storage if SQL below fails)
-- Name: progress-photos, Public: true
INSERT INTO storage.buckets (id, name, public)
VALUES ('progress-photos', 'progress-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow anon read progress photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'progress-photos');

CREATE POLICY "Allow anon upload progress photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'progress-photos');

-- Allow anon delete app_storage
CREATE POLICY "Allow anon delete app_storage"
  ON app_storage FOR DELETE
  USING (true);

-- Habits CRUD (single-user app — anon key)
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read habits" ON habits;
DROP POLICY IF EXISTS "Allow anon insert habits" ON habits;
DROP POLICY IF EXISTS "Allow anon update habits" ON habits;
DROP POLICY IF EXISTS "Allow anon delete habits" ON habits;
CREATE POLICY "Allow anon read habits" ON habits FOR SELECT USING (true);
CREATE POLICY "Allow anon insert habits" ON habits FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update habits" ON habits FOR UPDATE USING (true);
CREATE POLICY "Allow anon delete habits" ON habits FOR DELETE USING (true);

-- Daily logs CRUD (needed to clear logs before habit delete)
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read daily_logs" ON daily_logs;
DROP POLICY IF EXISTS "Allow anon insert daily_logs" ON daily_logs;
DROP POLICY IF EXISTS "Allow anon update daily_logs" ON daily_logs;
DROP POLICY IF EXISTS "Allow anon delete daily_logs" ON daily_logs;
CREATE POLICY "Allow anon read daily_logs" ON daily_logs FOR SELECT USING (true);
CREATE POLICY "Allow anon insert daily_logs" ON daily_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update daily_logs" ON daily_logs FOR UPDATE USING (true);
CREATE POLICY "Allow anon delete daily_logs" ON daily_logs FOR DELETE USING (true);

-- Optional: auto-delete check-off logs when a habit is removed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'daily_logs_habit_id_fkey'
  ) THEN
    ALTER TABLE daily_logs DROP CONSTRAINT daily_logs_habit_id_fkey;
    ALTER TABLE daily_logs
      ADD CONSTRAINT daily_logs_habit_id_fkey
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE POLICY "Allow anon delete progress photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'progress-photos');
