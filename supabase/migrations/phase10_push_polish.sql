-- ============================================================
-- Phase 10: Push Notifications & Polish
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add push_token column to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_token text;

-- Index for fast lookup when sending push notifications
CREATE INDEX IF NOT EXISTS idx_profiles_push_token
  ON profiles(push_token)
  WHERE push_token IS NOT NULL;

-- 2. Verified Trigger: when an alert is marked triggered,
--    Supabase can webhook to FastAPI /push/send
--    (wire via Database Webhooks in Supabase dashboard → table: alerts, event: UPDATE)

-- 3. RPC to mark alert triggered + return push token
--    Called by alert check flow so FastAPI can send the push
CREATE OR REPLACE FUNCTION trigger_alert(
  p_alert_id  uuid,
  p_log_id    uuid,
  p_price_etb numeric
)
RETURNS TABLE(push_token text, user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Mark alert as triggered
  UPDATE alerts
  SET triggered_at = now(),
      is_active    = false
  WHERE id = p_alert_id
    AND is_active = true
    AND triggered_at IS NULL;

  -- Return the user's push token
  RETURN QUERY
    SELECT p.push_token, a.user_id
    FROM alerts a
    JOIN profiles p ON p.id = a.user_id
    WHERE a.id = p_alert_id;
END;
$$;

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION trigger_alert(uuid, uuid, numeric) TO authenticated;

-- 4. Useful: view of alerts with push tokens for the alert check FastAPI endpoint
CREATE OR REPLACE VIEW active_alerts_with_tokens AS
SELECT
  a.id           AS alert_id,
  a.user_id,
  a.item_id,
  a.market_id,
  a.target_price,
  a.direction,
  p.push_token
FROM alerts a
JOIN profiles p ON p.id = a.user_id
WHERE a.is_active = true
  AND a.triggered_at IS NULL;

GRANT SELECT ON active_alerts_with_tokens TO authenticated;
