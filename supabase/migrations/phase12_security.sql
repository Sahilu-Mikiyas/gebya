-- ============================================================
-- Phase 12: Security & Production Hardening
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Rate limiting function: checks if a user has logged the same item at the same market >= 5 times in the last 24 hours
CREATE OR REPLACE FUNCTION check_log_rate_limit(
  p_user_id UUID,
  p_item_id UUID,
  p_market_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM price_logs
  WHERE logged_by = p_user_id
    AND item_id = p_item_id
    AND market_id = p_market_id
    AND logged_at > NOW() - INTERVAL '24 hours';
    
  RETURN v_count < 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION check_log_rate_limit(UUID, UUID, UUID) TO anon, authenticated;

-- 2. Server-side price validation trigger: raises an exception if a price is <= 0
CREATE OR REPLACE FUNCTION validate_price_log()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.price_etb <= 0 THEN
    RAISE EXCEPTION 'Price must be greater than zero. Received: %', NEW.price_etb;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_price_on_insert ON price_logs;
CREATE TRIGGER validate_price_on_insert
  BEFORE INSERT OR UPDATE ON price_logs
  FOR EACH ROW
  EXECUTE FUNCTION validate_price_log();
