-- 0006: per-dimension personal averages for the post-case scorecard.
--
-- The scorecard shows "Test Ordering 15/20" with no sense of whether that is
-- normal for this student. Their own mean is the comparison that makes a single
-- grade legible, and there was no per-dimension aggregation anywhere: the
-- Progress and Focus pages both pull every row and reduce the grading_result
-- JSONB in the browser, which is per-device only if you mirror it locally, and
-- megabytes of transfer if you do it properly.
--
-- Rubric maxima differ by difficulty — Foundations is 24/24/36/16 and
-- Clinical/Advanced is 20/20/30/15/15 — so averaging raw scores across
-- difficulties is simply wrong. This averages the FRACTION score/max and lets
-- the client rescale to whatever the current case's max is, the same
-- normalisation ComponentScoreTrends and the Focus page already do.
--
-- SECURITY INVOKER (the default) so the caller's RLS applies; the explicit
-- user_id = auth.uid() predicate makes the scope obvious at the call site too.

CREATE OR REPLACE FUNCTION dimension_averages(exclude_session_id text DEFAULT NULL)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH graded AS (
    SELECT difficulty, grading_result->'dimensions' AS dims
    FROM case_sessions
    WHERE user_id = auth.uid()
      AND grading_result IS NOT NULL
      AND jsonb_typeof((grading_result->'dimensions')::jsonb) = 'object'
      -- The case just finished is written before the scorecard renders, and a
      -- student comparing a score against a mean that includes it is comparing
      -- it partly against itself.
      AND (exclude_session_id IS NULL OR id <> exclude_session_id)
  ),
  -- One row per (dimension, case), carrying the max that applied at the time.
  scored AS (
    SELECT
      d.key AS dim_key,
      (d.value->>'score')::numeric AS score,
      CASE
        WHEN g.difficulty = 'Foundations' THEN
          CASE d.key
            WHEN 'historyInterview'      THEN 24
            WHEN 'testOrdering'          THEN 24
            WHEN 'diagnosisAccuracy'     THEN 36
            WHEN 'diagnosisCompleteness' THEN 16
          END
        ELSE
          CASE d.key
            WHEN 'historyInterview'      THEN 20
            WHEN 'testOrdering'          THEN 20
            WHEN 'diagnosisAccuracy'     THEN 30
            WHEN 'diagnosisCompleteness' THEN 15
            WHEN 'clinicalReasoning'     THEN 15
          END
      END AS dim_max
    FROM graded g
    CROSS JOIN LATERAL jsonb_each(g.dims::jsonb) AS d(key, value)
    WHERE jsonb_typeof(d.value) = 'object'
      AND (d.value->>'score') ~ '^-?[0-9]+(\.[0-9]+)?$'
  ),
  -- Grouped first, then aggregated over the grouped rows: AVG() inside
  -- json_agg() is a nested aggregate and Postgres rejects it.
  per_dim AS (
    SELECT
      dim_key AS "key",
      ROUND(AVG(score / dim_max)::numeric, 4) AS "avgFraction",
      COUNT(*) AS n
    FROM scored
    -- dim_max is NULL for a key belonging to no rubric at this difficulty
    -- (examinationFocus, or a Foundations case carrying clinicalReasoning);
    -- those cannot be normalised and are dropped rather than guessed at.
    WHERE dim_max IS NOT NULL
      AND score IS NOT NULL
    GROUP BY dim_key
  )
  SELECT COALESCE(json_agg(row_to_json(per_dim)), '[]'::json) FROM per_dim;
$$;

COMMENT ON FUNCTION dimension_averages(text) IS
  'Per-dimension mean of score/max for the calling user, normalised across difficulties. Pass the current session id to exclude it from its own baseline.';
