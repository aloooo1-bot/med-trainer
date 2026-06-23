/**
 * Knowledge-spine authoring: generate one verified DiagnosisProfile per UNIQUE
 * diagnosis in the manifest (~144), reused across every case variant. This is the
 * Tier-0 accuracy lever — review these ~144 profiles once instead of every case.
 *
 * Profiles are AI-drafted (review.status = 'unverified') and written as JSON to
 * scripts/knowledge/profiles/<slug>.json for version-controlled review. A human
 * (or spot-check against UpToDate) flips status to 'human-verified'.
 *
 * Usage:
 *   node scripts/generate-profiles.mjs                 # all missing profiles
 *   node scripts/generate-profiles.mjs --system Renal  # one system
 *   node scripts/generate-profiles.mjs --force         # regenerate existing
 *   node scripts/generate-profiles.mjs --limit 5       # cap (cost control)
 *   node scripts/generate-profiles.mjs --dry-run       # list what would run
 *
 * Requires ANTHROPIC_API_KEY in .env.local.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { config } from 'dotenv'
import { MANIFEST } from '../app/lib/caseManifest.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

const args = process.argv.slice(2)
const getArg = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null }
const filterSystem = getArg('--system')
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')
const limit = parseInt(getArg('--limit') ?? '0', 10)
const SCHEMA_VERSION = 1

const OUT_DIR = path.join(ROOT, 'scripts', 'knowledge', 'profiles')
fs.mkdirSync(OUT_DIR, { recursive: true })

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

// ── Collect unique diagnoses (first system they appear in) ──────────────────
const seen = new Map() // diagnosis -> system
for (const [system, byDiff] of Object.entries(MANIFEST)) {
  for (const arr of Object.values(byDiff)) {
    for (const dx of arr) if (!seen.has(dx)) seen.set(dx, system)
  }
}
let work = [...seen.entries()].map(([diagnosis, system]) => ({ diagnosis, system }))
if (filterSystem) work = work.filter(w => w.system === filterSystem)
if (!force) work = work.filter(w => !fs.existsSync(path.join(OUT_DIR, `${slug(w.diagnosis)}.json`)))
if (limit > 0) work = work.slice(0, limit)

const PROMPT = (system, diagnosis) => `You are a clinical-medicine faculty member authoring a verified teaching profile for the diagnosis "${diagnosis}" (${system}). This profile is the single source of truth used to generate and grade many case variants, so it must be accurate and guideline-concordant.

Return ONLY valid JSON, no markdown, with exactly this shape:
{
  "discriminators": ["<feature that pins THIS diagnosis vs its mimics>", ...3-6],
  "expectedWorkup": [{ "test": "<test name>", "typicalResult": "<expected result in this disease>", "cutoff": "<numeric threshold if applicable, else omit>", "rationale": "<why it's ordered>" }, ...3-7 in priority order],
  "differentials": [{ "name": "<competing diagnosis>", "category": "<leading|alternative|cant-miss>", "howToDistinguish": "<the single finding/test that separates it from ${diagnosis}>" }, ...3-5, include the most dangerous can't-miss mimic],
  "firstLineManagement": [{ "step": "<action>", "drug": "<agent if applicable>", "dose": "<dose if applicable>", "threshold": "<when indicated, if applicable>" }, ...2-5],
  "mechanism": "<2-3 sentences of pathophysiology>",
  "sources": ["<guideline or reference name>", ...1-3]
}`

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function generateOne({ system, diagnosis }) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: 'You are a clinical-medicine faculty member. Return ONLY valid JSON.',
    messages: [{ role: 'user', content: PROMPT(system, diagnosis) }],
  })
  const text = msg.content.find(c => c.type === 'text')?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('no JSON in response')
  const parsed = JSON.parse(match[0])
  const profile = {
    diagnosis, system,
    discriminators: parsed.discriminators ?? [],
    expectedWorkup: parsed.expectedWorkup ?? [],
    differentials: parsed.differentials ?? [],
    firstLineManagement: parsed.firstLineManagement ?? [],
    mechanism: parsed.mechanism ?? '',
    sources: parsed.sources ?? [],
    schemaVersion: SCHEMA_VERSION,
    review: { status: 'unverified' },
  }
  fs.writeFileSync(path.join(OUT_DIR, `${slug(diagnosis)}.json`), JSON.stringify(profile, null, 2))
  return profile
}

async function main() {
  console.log(`${work.length} profiles to ${force ? 'regenerate' : 'generate'}${filterSystem ? ` (system: ${filterSystem})` : ''}.`)
  if (dryRun) { work.forEach(w => console.log(`  - ${w.system}: ${w.diagnosis}`)); return }
  if (!process.env.ANTHROPIC_API_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1) }

  let ok = 0, fail = 0
  for (const w of work) {
    try {
      await generateOne(w)
      ok++
      process.stdout.write(`\r  ${ok + fail}/${work.length} done (${fail} failed)…`)
    } catch (e) {
      fail++
      console.error(`\n  ✗ ${w.diagnosis}: ${e.message}`)
    }
    await sleep(1500) // stay under the output-token/min rate limit
  }
  console.log(`\nDone. ${ok} written to scripts/knowledge/profiles/, ${fail} failed.`)
  console.log('Next: spot-check each profile and set review.status to "human-verified".')
}

main().catch(e => { console.error(e); process.exit(1) })
