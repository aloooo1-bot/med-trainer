# When credits / services are back — TODO checklist

Anthropic API credits, the Supabase project, and Upstash Redis were all **down**
during the work in this repo, so several steps are coded and verified (tsc /
lint / tests / build) but **not driven live**. This file is the pickup list.

> For a Claude Code session: work top-to-bottom. Section 1 is a prerequisite for
> almost everything else. Nothing here needs new design decisions unless noted.

> **UPDATE 2026-07-22 (credits restored, live verification done):** The full
> trainer flow was driven end-to-end against the file store — start → ask →
> exam → order → predict → present (chart-lock) → grade → resume all pass;
> model tiering confirmed from logs (chat/summaries=Haiku, grading=Sonnet).
> **Two bugs fixed live** (commit 8b67a6f): `classifyFinding` mis-marked benign
> ROS answers positive (acceptance #3), and the server generation timeout (120s)
> was under the client wait (180s) → "Request was aborted". The image tagger +
> chest generator loop was verified on a 3-film sample (commit 83895b3). So
> §2 below is now DONE except full-UI click-through; §3 items 1–3 are proven at
> sample scale and just need the full run. **Remaining truly-blocked item: run
> migrations 0001/0002 in the Supabase SQL editor** (only the user can) — until
> then the app uses the file store and can't save generated cases to the DB.
> Also note: live case generation is currently slow (~3 min/case) — watch this.

---

## 1. Restore infrastructure (prerequisite)

> **UPDATE 2026-07-22:** Supabase is BACK (free-tier un-pause again, same
> project, 375 cases intact) — verified via service-role query. Migrations
> 0001/0002 are still NOT run. Once they are run and `SESSION_STORE=file` is
> removed, the 375 cached cases start WITHOUT Anthropic credits (only live
> generation, patient chat, and grading need the LLM). Upstash still failing
> (rate limiting fails open). Credits still exhausted — "start case" currently
> fails with "credit balance is too low" whenever the cache misses.

- [ ] **New/restored Supabase project.** Run, in order, in the SQL editor:
  1. `supabase/schema.sql`
  2. `supabase/migrations/0001_tiered_case_data.sql` (tiered case columns + column GRANTs)
  3. `supabase/migrations/0002_session_events.sql` (trainer_sessions + session_events, incl. `case_complexity` / `scaffolding_level`)
- [ ] Update `.env.local` with the new `NEXT_PUBLIC_SUPABASE_URL`, anon key, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] **Remove the dev fallbacks from `.env.local`:** delete `SESSION_STORE=file` and `DEV_AUTH_BYPASS=1` (dev-only escape hatches added because the DB was gone — they must NOT be set in production).
- [ ] Restore Upstash Redis (rate limiting) and update `UPSTASH_REDIS_REST_URL` / `_TOKEN`. (Rate limiting fails open, so the app runs without it, but prod should have it.)
- [ ] Top up Anthropic API credits.
- [ ] Regenerate / reseed the case library. New generation writes the tiered columns automatically (`app/lib/server/caseSource.ts`, `saveGeneratedCase`); migration 0001 backfills any legacy `case_data` rows.

## 2. Deferred end-to-end verification (blocked on §1)

Everything below compiles and is unit-tested; it was never exercised live.

- [ ] **Full trainer flow, Clinical case:** start → ask → exam → order → begin write-up (timer stop + chart lock) → grade → refresh-resume produces the same result. (`/api/session/*`)
- [ ] **Model tiering via logs:** confirm patient chat / ROS classifier / derived summaries hit **Haiku**, grading + generation hit **Sonnet** (`app/lib/server/llm.ts`).
- [ ] **Ordering UX:** the Clinical Order screen shows syndrome order sets + common core + search (not the old 150-lab dump); "Add all N" works. (`OrderView`, `app/lib/orderSets.ts`)
- [ ] **Laterality fail-safe live:** a lateralized case (e.g. right effusion) shows report-only or a side-matched image, never a contradicting one.
- [ ] **Admin review page** `/admin/images`: loads, confirm/reject/edit writes the sidecars (dev FS only).
- [ ] **Bound chest film:** an image-first chest case serves its exact authored film.
- [ ] Run `/verify` skill or a manual click-through for the above.

## 3. Image pipeline execution (the image-first work)

Order matters — tag before generating so cases get authored to the correct side.

- [ ] **Tag laterality** (vision pass): `node scripts/review-images.mjs --dataset chest`
  (or `--all` for the 387 raster images across all datasets). Writes
  `public/imaging/attributes.json` etc. Dry-run to preview: `--dry-run`.
- [ ] **Human review** in `/admin/images`: confirm/correct/reject the auto tags; **commit the updated `attributes.json` / `blocklist.json` sidecars** (they're writable in local dev only).
- [ ] **Generate the 13 image-first chest cases:** `node scripts/local-chest-cases.mjs`
  (each binds to a specific reviewed film and is authored to its side). Preview first with `--dry-run`.
- [ ] (Optional) regenerate the 17 special-modality image-first cases: `node scripts/local-image-cases.mjs`.
- [ ] (Optional) run `node scripts/image-agents.mjs` to populate `verified_images` across the library.
- [ ] Re-run the planner if the combo map changed: `node scripts/plan-image-cases.mjs` (should stay 30 distinct diagnoses, 0 duplicates).

## 4. Audit scripts on the restored library

- [ ] `npm run audit:differentials` — fails a case if its expected workup doesn't rank the true dx #1, if a test confirms a non-target, or flags `expectedLabs` padding. Fix flagged cases.
- [ ] `npm run audit:synonyms` — gap report of test names that don't resolve via `searchTests`; seed obvious aliases into `MASTER_TEST_LIST`, leave the rest as a clinician-review TODO.

## 5. Spawned follow-up tasks (background chips from this session)

- [ ] **Consolidate the forked case-generation prompt.** `app/lib/casePrompt.ts` (~8.5KB, live gen, older schema *without* reasoning fields) vs `app/lib/generators/shared.ts` (~43KB, admin regen). Both carry `KNOWN FORK` headers. Merging is a **clinical-content decision** — unify into one source and make live generation emit `differentialPriors` / `testImpacts` / `mechanism` so new cases power the differential board. Needs credits to verify a generated case per difficulty.
- [ ] **Finish the trainer `useSession` hook extraction** (remediation 5.1). `app/trainer/page.tsx` (~1,800 lines) still holds generate/ask/grade/resume inline; extract into `app/trainer/_lib/useTrainerSession.ts` following `useOrders` / `useSessionImages`. **Precondition:** verify the trainer end-to-end FIRST (§2) — that's why it was deferred.

## 6. Known non-blocking notes

- Anonymous demo cases now **401 by design** (session routes require auth per the security remediation).
- The 13 chest finding→diagnosis mappings were clinician-reviewed this session and live in `scripts/lib/imageCaseCombos.mjs` — editable if you want to adjust.
- Turbopack emits an "overly broad patterns" **warning** for dynamic `fs` reads in `imageReviewStore.ts` / `imageLookup.ts` — non-fatal, build passes.
