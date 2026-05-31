-- ============================================================
-- Phase 7 FIX: Profile, Trust & My Logs
-- Run this in Supabase SQL Editor (replaces the original phase7)
-- ============================================================

-- STEP 0: Rename user_id → logged_by if it hasn't been done yet
-- (Safe to run even if the rename already happened — it will skip)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'price_logs'
      AND column_name  = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'price_logs'
      AND column_name  = 'logged_by'
  ) THEN
    ALTER TABLE price_logs RENAME COLUMN user_id TO logged_by;
    RAISE NOTICE 'Renamed user_id → logged_by on price_logs';
  ELSE
    RAISE NOTICE 'Column logged_by already exists or user_id missing — skipping rename';
  END IF;
END $$;


-- STEP 1: Leaderboard view (rank by points)
CREATE OR REPLACE VIEW leaderboard AS
SELECT
  id,
  display_name,
  total_pts   AS points,
  tier,
  RANK() OVER (ORDER BY total_pts DESC) AS rank
FROM profiles
WHERE total_pts > 0;

GRANT SELECT ON leaderboard TO anon, authenticated;


-- STEP 2: Allow users to UPDATE their own price_logs
DROP POLICY IF EXISTS "Users can update own logs" ON price_logs;
CREATE POLICY "Users can update own logs"
  ON price_logs FOR UPDATE
  USING (logged_by = auth.uid());


-- STEP 3: Allow users to DELETE their own price_logs
DROP POLICY IF EXISTS "Users can delete own logs" ON price_logs;
CREATE POLICY "Users can delete own logs"
  ON price_logs FOR DELETE
  USING (logged_by = auth.uid());


-- STEP 4: Speed index on logged_by
CREATE INDEX IF NOT EXISTS idx_price_logs_logged_by
  ON price_logs(logged_by, logged_at DESC);


-- STEP 5: Verify — show the price_logs columns so you can confirm the rename worked
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'price_logs'
ORDER BY ordinal_position;
