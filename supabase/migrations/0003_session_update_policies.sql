-- 0003: RLS UPDATE policy for case_sessions (+ WITH CHECK hardening on profiles).
--
-- The bookmark and notes API routes (/api/sessions/bookmark, /api/sessions/notes)
-- issue UPDATEs through the RLS-enforced user-scoped client. case_sessions had
-- only SELECT and INSERT policies, so those UPDATEs matched zero visible rows
-- and the routes returned 404 for every signed-in user.
--
-- DROP + CREATE (rather than CREATE alone) so re-running replaces any stale
-- definition instead of skipping it.

DROP POLICY IF EXISTS "sessions_own_update" ON case_sessions;
CREATE POLICY "sessions_own_update"
  ON case_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- profiles_own_update previously had USING but no WITH CHECK; recreate with
-- both so an UPDATE can never re-point a row outside the user's own scope.
DROP POLICY IF EXISTS "profiles_own_update" ON profiles;
CREATE POLICY "profiles_own_update"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
