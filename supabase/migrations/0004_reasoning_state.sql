-- 0004: account-level storage for the reasoning/retention data that was
-- previously localStorage-only (review deck, mastery, calibration, recall
-- streak). One JSONB blob per (user, kind); the client union-merges its local
-- copy with this blob and writes the merge back, so two devices converge.

CREATE TABLE IF NOT EXISTS reasoning_state (
  user_id    UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind       TEXT        NOT NULL CHECK (kind IN ('review_items', 'mastery', 'calibration', 'streak')),
  data       JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, kind)
);

ALTER TABLE reasoning_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reasoning_own_select" ON reasoning_state;
CREATE POLICY "reasoning_own_select"
  ON reasoning_state FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reasoning_own_insert" ON reasoning_state;
CREATE POLICY "reasoning_own_insert"
  ON reasoning_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reasoning_own_update" ON reasoning_state;
CREATE POLICY "reasoning_own_update"
  ON reasoning_state FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
