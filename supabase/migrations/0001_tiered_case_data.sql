-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0001 — Tiered case data (security remediation 1.1)
--
-- Splits cases.case_data into four tiers so ground truth (diagnosis, hidden
-- history, test results, priors) can no longer be read from the browser:
--
--   presentation_data  — client-readable (chief complaint, HPI variants,
--                        demographics, vitals, orderable test menus)
--   patient_knowledge  — SERVER-ONLY (hidden history / disclosure material)
--   clinical_findings  — SERVER-ONLY (exam findings, lab/imaging results)
--   ground_truth       — SERVER-ONLY (diagnosis, teaching points,
--                        differentialPriors, testImpacts, mechanism)
--
-- NOTE: the original Supabase project was deleted (June 2026). Run this file
-- in the SQL editor of the replacement project AFTER supabase/schema.sql.
-- The tier split logic lives in app/lib/server/caseTiers.mjs — the backfill
-- below mirrors it in SQL.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cases ADD COLUMN IF NOT EXISTS presentation_data JSONB;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS patient_knowledge JSONB;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS clinical_findings JSONB;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS ground_truth      JSONB;

-- ── Backfill existing rows by splitting case_data ────────────────────────────
-- Keys must stay in sync with splitCase() in app/lib/server/caseTiers.mjs.

UPDATE cases SET
  presentation_data = (
    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
    FROM jsonb_each(case_data)
    WHERE key NOT IN (
      'hiddenHistory',
      'reviewOfSystems','physicalExam','relevantExamRegions',
      'labResults','imagingResults','procedureResults',
      'imagingCategory','ecgFindings','hematologyFindings','urineFindings',
      'skinFindings','fundusFindings','biopsyFindings',
      'diagnosis','differentials','differentialExplanations','teachingPoints',
      'keyQuestions','expectedLabs','expectedImaging','relevantTests',
      'differentialPriors','testImpacts','mechanism'
    )
  ),
  patient_knowledge = (
    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
    FROM jsonb_each(case_data)
    WHERE key IN ('hiddenHistory')
  ),
  clinical_findings = (
    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
    FROM jsonb_each(case_data)
    WHERE key IN (
      'reviewOfSystems','physicalExam','relevantExamRegions',
      'labResults','imagingResults','procedureResults',
      'imagingCategory','ecgFindings','hematologyFindings','urineFindings',
      'skinFindings','fundusFindings','biopsyFindings'
    )
  ),
  ground_truth = (
    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
    FROM jsonb_each(case_data)
    WHERE key IN (
      'diagnosis','differentials','differentialExplanations','teachingPoints',
      'keyQuestions','expectedLabs','expectedImaging','relevantTests',
      'differentialPriors','testImpacts','mechanism'
    )
  )
WHERE case_data IS NOT NULL AND presentation_data IS NULL;

-- ── Column-level access control ──────────────────────────────────────────────
-- RLS is row-level only; column privileges enforce the tier boundary.
-- anon/authenticated may read metadata + presentation_data ONLY. The three
-- server-only tiers (and full case_data, kept temporarily for rollback) are
-- readable exclusively by the service role, which bypasses RLS and GRANTs.

REVOKE SELECT ON cases FROM anon, authenticated;
GRANT SELECT (
  id, system, difficulty, variant_index, is_generated, generated_at,
  imaging_cache, imaging_cached_at, created_at, presentation_data
) ON cases TO anon, authenticated;
-- NOTE: cases.diagnosis (the top-level column) is intentionally NOT granted —
-- it is the answer. Same for case_data, patient_knowledge, clinical_findings,
-- ground_truth, verified_images (whose keys fingerprint the workup).

-- ── Deprecation plan for case_data ───────────────────────────────────────────
-- app/lib/server/caseSource.ts writes BOTH case_data and the tiers during the
-- transition. Once all rows have presentation_data and the app is verified:
--   ALTER TABLE cases DROP COLUMN case_data;
