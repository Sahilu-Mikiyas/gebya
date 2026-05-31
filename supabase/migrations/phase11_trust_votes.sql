-- ============================================================
-- Phase 11: Trust Signals & Community Voting
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add flag_count to price_logs if not present
ALTER TABLE price_logs
  ADD COLUMN IF NOT EXISTS flag_count int DEFAULT 0;

-- 2. Create log_votes table
CREATE TABLE IF NOT EXISTS log_votes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id     uuid NOT NULL REFERENCES price_logs(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  vote_type  text NOT NULL CHECK (vote_type IN ('helpful', 'flag')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (log_id, user_id)   -- one vote per user per log
);

ALTER TABLE log_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads votes"
  ON log_votes FOR SELECT USING (true);

CREATE POLICY "Authenticated insert own votes"
  ON log_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own votes"
  ON log_votes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own votes"
  ON log_votes FOR DELETE
  USING (auth.uid() = user_id);


-- 3. RPC: vote_on_log
-- Atomically upserts a vote and updates price_logs counts.
-- Voting the same type again REMOVES the vote (toggle).
CREATE OR REPLACE FUNCTION vote_on_log(
  p_log_id    uuid,
  p_user_id   uuid,
  p_vote_type text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  old_vote text;
BEGIN
  -- Check for existing vote
  SELECT vote_type INTO old_vote
  FROM log_votes
  WHERE log_id = p_log_id AND user_id = p_user_id;

  -- Undo old vote count
  IF old_vote IS NOT NULL THEN
    IF old_vote = 'helpful' THEN
      UPDATE price_logs SET helpful_votes = GREATEST(0, helpful_votes - 1) WHERE id = p_log_id;
    ELSE
      UPDATE price_logs SET flag_count = GREATEST(0, flag_count - 1) WHERE id = p_log_id;
    END IF;

    -- Toggle off: same vote type → just delete and return
    IF old_vote = p_vote_type THEN
      DELETE FROM log_votes WHERE log_id = p_log_id AND user_id = p_user_id;
      RETURN;
    END IF;
  END IF;

  -- Upsert new vote
  INSERT INTO log_votes (log_id, user_id, vote_type)
  VALUES (p_log_id, p_user_id, p_vote_type)
  ON CONFLICT (log_id, user_id) DO UPDATE SET vote_type = EXCLUDED.vote_type;

  -- Apply new count
  IF p_vote_type = 'helpful' THEN
    UPDATE price_logs SET helpful_votes = helpful_votes + 1 WHERE id = p_log_id;
  ELSE
    UPDATE price_logs SET flag_count = flag_count + 1 WHERE id = p_log_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION vote_on_log(uuid, uuid, text) TO authenticated;


-- 4. Speed index on log_votes for per-user vote lookups
CREATE INDEX IF NOT EXISTS idx_log_votes_user
  ON log_votes(user_id, log_id);
