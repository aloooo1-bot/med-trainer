/**
 * Student Audit — Orchestrator
 *
 * Simulates a 3rd-year medical student completing 36 cases across all
 * difficulties, then inspects every study tab (History, Progress, Review,
 * Focus, Help, Settings, Trainer). A separate Reviewer agent produces a
 * structured list of bugs, medical inaccuracies, inconsistencies, and
 * improvement opportunities.
 *
 * Usage:
 *   node scripts/student-audit/run.mjs                         # Full 36-case run
 *   node scripts/student-audit/run.mjs --smoke               # 2 cases + all tabs (quick test)
 *   node scripts/student-audit/run.mjs --targeted --skip-tabs # 12 cases, 1 Foundations per system, no tabs
 *   node scripts/student-audit/run.mjs --skip-solve           # Skip Phase A; use existing transcripts
 *   node scripts/student-audit/run.mjs --skip-tabs            # Skip Phase B; use existing tab artifacts
 *   node scripts/student-audit/run.mjs --report-only          # Only Phase C (reviewer); re-use all artifacts
 *   node scripts/student-audit/run.mjs --keep                 # Don't wipe artifacts at start
 *
 * Required env in .env.local:
 *   ANTHROPIC_API_KEY             (already present)
 *   NEXT_PUBLIC_SUPABASE_URL      (already present)
 *   SUPABASE_SERVICE_ROLE_KEY     (already present)
 *   STUDENT_AUDIT_USER_ID         Supabase auth.users.id of the dedicated test user
 *   STUDENT_AUDIT_TEST_EMAIL      Test user's login email (for Playwright)
 *   STUDENT_AUDIT_TEST_PASSWORD   Test user's password (for Playwright)
 *
 * Setup (one-time):
 *   1. Create a test user in Supabase dashboard (Authentication → Users → Add user).
 *      Enable email confirmation so the user can log in without clicking a link.
 *      Copy the UUID → STUDENT_AUDIT_USER_ID.
 *   2. npm install playwright && npx playwright install chromium
 *   3. Set NEXT_PUBLIC_DEV_TIER=pro (or remove it) in .env.local for this run —
 *      the "anonymous" override causes the gate UI to show 3-case limits even for
 *      a logged-in test user.
 *   4. npm run dev (in a separate terminal)
 *   5. node scripts/student-audit/run.mjs --smoke   ← verify the setup works
 *   6. node scripts/student-audit/run.mjs           ← full 36-case run (~60-90 min)
 *
 * Output:
 *   scripts/student-audit/artifacts/
 *     transcripts/case-01.json ... case-36.json
 *     tabs/dashboard.{json,html,png} ... trainer.{json,html,png}
 *     findings.json
 *     findings.md   ← the human-readable report
 */

import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '..', '..', '.env.local') })

import { ensureDirs, ARTIFACTS_DIR } from './lib/artifacts.mjs'

const args = process.argv.slice(2)
const SMOKE       = args.includes('--smoke')
const TARGETED    = args.includes('--targeted')
const SKIP_SOLVE  = args.includes('--skip-solve')
const SKIP_TABS   = args.includes('--skip-tabs')
const REPORT_ONLY = args.includes('--report-only')
const KEEP        = args.includes('--keep')

function checkEnv() {
  const base = ['ANTHROPIC_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  const solveNeeds = ['STUDENT_AUDIT_USER_ID']
  const tabNeeds   = ['STUDENT_AUDIT_TEST_EMAIL', 'STUDENT_AUDIT_TEST_PASSWORD']

  const required = [...base]
  if (!SKIP_SOLVE && !REPORT_ONLY) required.push(...solveNeeds)
  if (!SKIP_TABS && !REPORT_ONLY)  required.push(...tabNeeds)

  const missing = required.filter(k => !process.env[k])
  if (missing.length) {
    console.error(`\nMissing env vars:\n  ${missing.join('\n  ')}`)
    console.error('\nAdd them to .env.local. See run.mjs header for setup instructions.\n')
    process.exit(1)
  }
}

async function main() {
  checkEnv()

  if (!KEEP && !REPORT_ONLY && !SKIP_SOLVE && !SKIP_TABS) {
    if (fs.existsSync(ARTIFACTS_DIR)) {
      console.log('Wiping previous artifacts...')
      fs.rmSync(ARTIFACTS_DIR, { recursive: true })
    }
  }
  ensureDirs()

  const startTime = Date.now()
  const modeLabel = SMOKE ? ' (SMOKE)' : TARGETED ? ' (TARGETED)' : REPORT_ONLY ? ' (REPORT ONLY)' : ''
  console.log(`\nMedTrainer Student Audit${modeLabel}`)
  console.log(`Started: ${new Date().toISOString()}`)
  console.log('─'.repeat(60))

  // Phase A — Student solver
  if (!SKIP_SOLVE && !REPORT_ONLY) {
    console.log('\n── Phase A: Student Solver ──────────────────────────────────')
    const { runSolver } = await import('./solve.mjs')
    await runSolver({ smoke: SMOKE, targeted: TARGETED, keep: KEEP })
  }

  // Phase B — Playwright tab inspection
  if (!SKIP_TABS && !REPORT_ONLY) {
    console.log('\n── Phase B: Tab Inspection ──────────────────────────────────')
    const { runTabInspection } = await import('./inspect-tabs.mjs')
    await runTabInspection()
  }

  // Phase C — Reviewer agent
  console.log('\n── Phase C: Reviewer Agent ──────────────────────────────────')
  const { runReview } = await import('./review.mjs')
  await runReview()

  const elapsed = Math.round((Date.now() - startTime) / 1000)
  const min = Math.floor(elapsed / 60), sec = elapsed % 60
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`Audit complete in ${min}m ${sec}s`)
  console.log(`Report: scripts/student-audit/artifacts/findings.md`)
  console.log(`Data:   scripts/student-audit/artifacts/findings.json`)
}

main().catch(err => { console.error('\nFatal error:', err.message); process.exit(1) })
