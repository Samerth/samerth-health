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

CREATE POLICY "Allow anon update progress photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'progress-photos');
