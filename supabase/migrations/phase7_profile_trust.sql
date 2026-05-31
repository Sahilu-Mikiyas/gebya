-- ============================================================
-- Phase 7: Profile, Trust & My Logs
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Leaderboard view (rank by points)
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

-- 2. Allow users to UPDATE their own price_logs (to edit price)
DROP POLICY IF EXISTS "Users can update own logs" ON price_logs;
CREATE POLICY "Users can update own logs"
  ON price_logs FOR UPDATE
  USING (logged_by = auth.uid());

-- 3. Allow users to DELETE their own price_logs
DROP POLICY IF EXISTS "Users can delete own logs" ON price_logs;
CREATE POLICY "Users can delete own logs"
  ON price_logs FOR DELETE
  USING (logged_by = auth.uid());

-- 4. Helpful votes count (votes cast confirming the user's own logs)
-- Used inline in profile query, no separate view needed.

-- 5. Index to speed up "my logs" query
CREATE INDEX IF NOT EXISTS idx_price_logs_logged_by
  ON price_logs(logged_by, logged_at DESC);
