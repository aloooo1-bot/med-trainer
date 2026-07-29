-- 0005: server-side aggregates for the Progress page.
--
-- The page previously pulled every case_sessions row for the user — including
-- the full grading_result JSONB — and averaged them in the browser. Two
-- problems: PostgREST caps a collection response at its db-max-rows setting
-- (1000 by default), past which the totals silently become wrong with nothing
-- to indicate it; and megabytes of JSONB were transferred to compute a handful
-- of integers.
--
-- SECURITY INVOKER (the default for SQL functions) so the caller's RLS applies;
-- the explicit user_id = auth.uid() predicate makes the scope obvious at the
-- call site as well.

CREATE OR REPLACE FUNCTION progress_summary()
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH tracked AS (
    SELECT score, correct, elapsed_seconds, system, difficulty
    FROM case_sessions
    WHERE user_id = auth.uid()
      AND system IS NOT NULL
      AND system <> ''
  )
  SELECT json_build_object(
    'overall', (
      SELECT json_build_object(
        'total',         COUNT(*)::int,
        'avgScore',      COALESCE(ROUND(AVG(score))::int, 0),
        'medianScore',   COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score))::int, 0),
        'correctRate',   CASE WHEN COUNT(*) = 0 THEN 0
                              ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE correct) / COUNT(*))::int END,
        'avgSeconds',    COALESCE(ROUND(AVG(elapsed_seconds))::int, 0),
        'medianSeconds', COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY elapsed_seconds))::int, 0)
      )
      FROM tracked
    ),
    'bySystem', COALESCE((
      SELECT json_agg(row_to_json(s) ORDER BY s.system)
      FROM (
        SELECT
          system,
          COUNT(*)::int                                                      AS count,
          ROUND(AVG(score))::int                                             AS "avgScore",
          ROUND(AVG(score) FILTER (WHERE difficulty = 'Foundations'))::int   AS "fAvg",
          ROUND(AVG(score) FILTER (WHERE difficulty = 'Clinical'))::int      AS "cAvg",
          ROUND(AVG(score) FILTER (WHERE difficulty = 'Advanced'))::int      AS "aAvg"
        FROM tracked
        GROUP BY system
      ) s
    ), '[]'::json)
  );
$$;

-- Postgres grants EXECUTE to PUBLIC on new functions by default. The function
-- is harmless to an anonymous caller (auth.uid() is null, so it returns zeros)
-- but least-privilege is cheap here: only signed-in users need it.
REVOKE EXECUTE ON FUNCTION progress_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION progress_summary() TO authenticated;
