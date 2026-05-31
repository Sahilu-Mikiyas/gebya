-- ============================================================
-- Phase 3-A: Onboarding column + neighbourhood on profiles
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarded    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS neighbourhood text    DEFAULT NULL;

-- Index for neighbourhood-filtered queries on home feed
CREATE INDEX IF NOT EXISTS idx_profiles_neighbourhood
  ON profiles(neighbourhood);
