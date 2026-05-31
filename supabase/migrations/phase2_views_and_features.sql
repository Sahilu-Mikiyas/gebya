-- ============================================================
-- Gebya Database Migrations — Phase 2 & 4
-- Run after phase1_foundations.sql
-- ============================================================


-- 4-A  daily_log_count view (used on Home screen header)
-- ============================================================
CREATE OR REPLACE VIEW daily_log_count AS
SELECT COUNT(*)::int AS count
FROM price_logs
WHERE logged_at >= CURRENT_DATE;

GRANT SELECT ON daily_log_count TO anon, authenticated;


-- 4-B  weekly_price_trend (used for 4-week trend charts in Phase 6)
-- ============================================================
CREATE OR REPLACE VIEW weekly_price_trend AS
SELECT
  item_id,
  DATE_TRUNC('week', logged_at)::date AS week_start,
  ROUND(AVG(price_etb)::numeric, 2)  AS avg_price,
  COUNT(*)::int                       AS log_count
FROM price_logs
WHERE
  logged_at   >= NOW() - INTERVAL '5 weeks'
  AND is_flagged = false
GROUP BY item_id, DATE_TRUNC('week', logged_at)
ORDER BY item_id, week_start;

GRANT SELECT ON weekly_price_trend TO anon, authenticated;


-- 5-A  market_value_rank view (used on Market Detail screen)
-- ============================================================
CREATE OR REPLACE VIEW market_value_rank AS
SELECT
  lp.market_id,
  m.name AS market_name,
  ROUND(AVG(lp.price_etb / NULLIF(item_avg.avg_price, 0))::numeric, 3) AS value_ratio,
  RANK() OVER (ORDER BY AVG(lp.price_etb / NULLIF(item_avg.avg_price, 0))) AS rank
FROM latest_prices lp
JOIN markets m ON m.id = lp.market_id
JOIN (
  SELECT item_id, AVG(price_etb) AS avg_price
  FROM latest_prices
  GROUP BY item_id
) item_avg ON item_avg.item_id = lp.item_id
GROUP BY lp.market_id, m.name;

GRANT SELECT ON market_value_rank TO anon, authenticated;


-- 7-A  leaderboard view (used on Profile screen for rank)
-- ============================================================
CREATE OR REPLACE VIEW leaderboard AS
SELECT
  id,
  display_name,
  COALESCE(total_pts, 0) AS points,
  tier,
  RANK() OVER (ORDER BY COALESCE(total_pts, 0) DESC) AS rank
FROM profiles
WHERE COALESCE(total_pts, 0) > 0;

GRANT SELECT ON leaderboard TO anon, authenticated;


-- 7-B  Add missing profile columns
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS show_username boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS price_unit    text    DEFAULT 'per_kg',
  ADD COLUMN IF NOT EXISTS lang          text    DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS push_token    text;


-- 9-A  Pioneer flow — new item approval system
-- ============================================================
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS is_approved    boolean DEFAULT true,   -- existing items default approved
  ADD COLUMN IF NOT EXISTS added_by       uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS confirm_count  int DEFAULT 0;

-- Trigger: auto-approve item when 3+ unique loggers
CREATE OR REPLACE FUNCTION check_item_approval()
RETURNS trigger AS $$
BEGIN
  UPDATE items
  SET
    confirm_count = (
      SELECT COUNT(DISTINCT logged_by)
      FROM price_logs
      WHERE item_id = NEW.item_id
    ),
    is_approved = (
      SELECT COUNT(DISTINCT logged_by) >= 3
      FROM price_logs
      WHERE item_id = NEW.item_id
    )
  WHERE id = NEW.item_id AND is_approved = false;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_item_approval ON price_logs;
CREATE TRIGGER trg_item_approval
AFTER INSERT ON price_logs
FOR EACH ROW EXECUTE FUNCTION check_item_approval();

-- RLS: unapproved items visible only to the submitter
-- (Only add if RLS is enabled on items table)
-- CREATE POLICY "Approved or own items" ON items
--   FOR SELECT USING (is_approved = true OR added_by = auth.uid());
