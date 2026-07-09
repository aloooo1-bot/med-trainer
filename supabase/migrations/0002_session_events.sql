-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0002 — Server-authoritative trainer sessions + event log (1.3)
--
-- The event log — not client React state — is the authoritative record of
-- what a student asked / examined / ordered / predicted. Grading reads
-- exclusively from it, and page refresh resumes from it.
-- Written by the service role only (app/lib/server/sessionStore.ts).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trainer_sessions (
  id            UUID        PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  case_id       TEXT,
  system        TEXT        NOT NULL,
  difficulty    TEXT        NOT NULL,
  -- 5.3: case complexity vs interface scaffolding, stored independently even
  -- though the UX currently always sets them to the same value as difficulty.
  case_complexity   TEXT,
  scaffolding_level TEXT,
  phase         TEXT        NOT NULL DEFAULT 'active'
                            CHECK (phase IN ('active','presentation','graded')),
  -- Full jittered case snapshot { caseData, imagingCache } — SERVER-ONLY.
  case_snapshot JSONB       NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trainer_sessions_user ON trainer_sessions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS session_events (
  id          BIGSERIAL   PRIMARY KEY,
  session_id  UUID        NOT NULL REFERENCES trainer_sessions (id) ON DELETE CASCADE,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type        TEXT        NOT NULL
              CHECK (type IN ('start','ask','exam','order','prediction','enter_presentation','submit')),
  payload     JSONB       NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS session_events_session ON session_events (session_id, ts);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Users may read their own session METADATA (not the case snapshot — that
-- contains the answer) and their own events. Only the service role writes.

ALTER TABLE trainer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_events   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer_sessions_own_read"
  ON trainer_sessions FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies: service role only.

CREATE POLICY "session_events_own_read"
  ON session_events FOR SELECT USING (
    EXISTS (SELECT 1 FROM trainer_sessions s
            WHERE s.id = session_events.session_id AND s.user_id = auth.uid())
  );
-- No INSERT/UPDATE/DELETE policies: service role only.

-- Column-level guard: the snapshot column is the answer sheet — never
-- readable by client roles even on their own rows.
REVOKE SELECT ON trainer_sessions FROM anon, authenticated;
GRANT SELECT (id, user_id, case_id, system, difficulty, case_complexity, scaffolding_level, phase, created_at)
  ON trainer_sessions TO anon, authenticated;
