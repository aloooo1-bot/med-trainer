-- 0007: link a history row back to its server-side event log.
--
-- case_sessions is the analytics/history record; trainer_sessions + session_events
-- is the authoritative record of what actually happened in the encounter — every
-- question asked, exam performed and test ordered. The two have never been
-- linked: case_sessions.id is a client-generated analytics id (see
-- createActiveSession in app/lib/analytics.ts), not the trainer session UUID.
--
-- Without the link there is no way to show a student the interview transcript or
-- the test results of a case they finished, so "review a completed case" could
-- only ever show the scorecard. This column carries the join key so
-- /api/sessions/replay can rebuild the transcript and results from the event log
-- on demand — the encounter is NOT copied into this table, which would duplicate
-- the log and bloat every history list fetch.
--
-- Nullable by design: rows written before this migration have no link, and
-- ON DELETE SET NULL means pruning old trainer_sessions degrades review back to
-- the scorecard rather than breaking history.

ALTER TABLE case_sessions
  ADD COLUMN IF NOT EXISTS trainer_session_id UUID
  REFERENCES trainer_sessions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS case_sessions_trainer_session
  ON case_sessions (trainer_session_id);
