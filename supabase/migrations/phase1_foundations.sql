-- ============================================================
-- Gebya Database Migrations — Phase 1
-- Run these in the Supabase SQL editor in the order shown.
-- ============================================================


-- 1-A  award_points() — atomic points + trust_score increment
--      Called from mobile after every successful price log.
-- ============================================================
CREATE OR REPLACE FUNCTION award_points(p_user_id uuid, p_points int)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET
    total_pts   = COALESCE(total_pts, 0) + p_points,
    trust_score = LEAST(COALESCE(trust_score, 0) + (p_points::float / 10), 100)
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users (mobile calls via .rpc())
GRANT EXECUTE ON FUNCTION award_points(uuid, int) TO authenticated;


-- 1-B  Ensure price_logs uses logged_by (not user_id) for the author column.
--      (If your table already uses logged_by, skip this block.)
-- ============================================================
DO $$
BEGIN
  -- Only rename if user_id exists AND logged_by does NOT exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_logs' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_logs' AND column_name = 'logged_by'
  ) THEN
    ALTER TABLE price_logs RENAME COLUMN user_id TO logged_by;
  END IF;
END $$;


-- 1-C  Add unit + notes columns to price_logs if missing
-- ============================================================
ALTER TABLE price_logs
  ADD COLUMN IF NOT EXISTS unit  text DEFAULT 'kg',
  ADD COLUMN IF NOT EXISTS notes text;


-- 1-D  Add onboarded flag to profiles (used in Phase 3)
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarded boolean DEFAULT false;


-- 1-E  Verify: grant SELECT on latest_prices to anon + authenticated
-- ============================================================
GRANT SELECT ON latest_prices TO anon, authenticated;
