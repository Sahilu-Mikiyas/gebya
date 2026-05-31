-- ============================================================
-- Phase 9: Settings, Compare & Pioneer
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Notification prefs on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notify_alerts  boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_weekly  boolean DEFAULT false;

-- 2. Item submissions table (pioneer contributions)
CREATE TABLE IF NOT EXISTS item_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name          text NOT NULL,
  emoji         text NOT NULL DEFAULT '🏷',
  category      text NOT NULL DEFAULT 'other',
  unit          text NOT NULL DEFAULT 'kg',
  typical_price numeric(10,2),
  notes         text,
  status        text NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  reviewed_by   uuid REFERENCES profiles(id),
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for admin review queue
CREATE INDEX IF NOT EXISTS idx_submissions_status
  ON item_submissions(status, created_at DESC);

-- RLS: users can submit and see their own
ALTER TABLE item_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own submissions" ON item_submissions;
CREATE POLICY "Users insert own submissions"
  ON item_submissions FOR INSERT
  WITH CHECK (submitted_by = auth.uid());

DROP POLICY IF EXISTS "Users view own submissions" ON item_submissions;
CREATE POLICY "Users view own submissions"
  ON item_submissions FOR SELECT
  USING (submitted_by = auth.uid());

-- 3. latest_prices view needs sub_city for compare screen
-- Add if the view doesn't already expose it:
-- (Run only if compare screen shows missing sub_city)
-- CREATE OR REPLACE VIEW latest_prices AS
-- SELECT
--   pl.item_id, pl.market_id,
--   m.name     AS market_name,
--   m.sub_city AS sub_city,
--   avg(pl.price_etb) AS price_etb,
--   count(*)          AS log_count,
--   max(pl.logged_at) AS logged_at
-- FROM price_logs pl
-- JOIN markets m ON m.id = pl.market_id
-- WHERE pl.is_flagged IS DISTINCT FROM true
--   AND pl.logged_at > now() - interval '30 days'
-- GROUP BY pl.item_id, pl.market_id, m.name, m.sub_city;
