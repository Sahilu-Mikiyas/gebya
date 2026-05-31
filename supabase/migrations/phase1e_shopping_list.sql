-- ============================================================
-- Gebya — Phase 1-E: Shopping List Persistence
-- Run in Supabase SQL Editor if lists/list_items tables don't exist yet.
-- ============================================================

-- Lists table
CREATE TABLE IF NOT EXISTS lists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       text NOT NULL DEFAULT 'My List',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- List items table
CREATE TABLE IF NOT EXISTS list_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id    uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  qty        int  NOT NULL DEFAULT 1,
  checked    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lists_user_id     ON lists(user_id);
CREATE INDEX IF NOT EXISTS idx_list_items_list   ON list_items(list_id);

-- RLS
ALTER TABLE lists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_items ENABLE ROW LEVEL SECURITY;

-- Lists: users can only see and edit their own
DROP POLICY IF EXISTS "Users manage own lists" ON lists;
CREATE POLICY "Users manage own lists"
  ON lists FOR ALL USING (user_id = auth.uid());

-- List items: users can manage items in their own lists
DROP POLICY IF EXISTS "Users manage own list items" ON list_items;
CREATE POLICY "Users manage own list items"
  ON list_items FOR ALL
  USING (
    list_id IN (SELECT id FROM lists WHERE user_id = auth.uid())
  );
