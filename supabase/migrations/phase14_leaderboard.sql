-- ============================================================
-- Phase 14: Market Leaderboard & Home Upgrades
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add is_admin column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- 2. Item Price Stats function (Min/Avg/Max over last 30 days)
CREATE OR REPLACE FUNCTION item_price_stats(p_item_id UUID)
RETURNS TABLE (
  min_price NUMERIC,
  avg_price NUMERIC,
  max_price NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(MIN(price_etb)::NUMERIC, 0::NUMERIC),
    COALESCE(ROUND(AVG(price_etb)::NUMERIC, 2), 0::NUMERIC),
    COALESCE(MAX(price_etb)::NUMERIC, 0::NUMERIC)
  FROM price_logs
  WHERE item_id = p_item_id
    AND logged_at > NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION item_price_stats(UUID) TO anon, authenticated;

-- 3. Policy to allow admins to view all item submissions
DROP POLICY IF EXISTS "Admins manage all item submissions" ON item_submissions;
CREATE POLICY "Admins manage all item submissions"
  ON item_submissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );
