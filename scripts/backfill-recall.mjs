/**
 * Backfill recall-deck data onto existing cases:
 *   1. recallCards — concise, case-agnostic answers for the three
 *      spaced-repetition prompts (mechanism / management / discriminator).
 *   2. The reasoning fields (differentialPriors, testImpacts, mechanism) for
 *      cases that never got them — same rules as backfill-reasoning.mjs —
 *      so those cases stop yielding zero cards and no differential board.
 *
 * One AI call per case (a smaller cards-only call when the reasoning fields
 * already exist). Resumable: skips cases that already have recallCards.
 *
 * Unlike backfill-reasoning.mjs, this also refreshes the ground_truth tier
 * column on rows that have been split (migration 0001) — the app serves
 * tiered rows from ground_truth and ignores case_data, so updating only
 * case_data would never reach the reveal.
 *
 * Usage:
 *   node scripts/backfill-recall.mjs --limit 1 --dry-run   # preview one
 *   node scripts/backfill-recall.mjs --limit 3             # write a few (validate)
 *   node scripts/backfill-recall.mjs --system Renal
 *   node scripts/backfill-recall.mjs                       # all remaining
 *
 * Requires ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import path from 'path'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { repairJson } from '../app/lib/generators/shared.ts'
import { splitCase } from '../app/lib/server/caseTiers.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

const args = process.argv.slice(2)
const getArg = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null }
const filterSystem = getArg('--system')
const filterDifficulty = getArg('--difficulty')
const dryRun = args.includes('--dry-run')
const limit = parseInt(getArg('--limit') ?? '0', 10)

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
// maxRetries lets the SDK back off on 429s (rate limit) and resume automatically.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 8 })
const sleep = ms => new Promise(r => setTimeout(r, ms))

function resultSummary(c) {
  const labs = Object.entries(c.labResults ?? {}).map(([name, r]) => {
    const comps = (r.components ?? []).map(x => `${x.name} ${x.value}${x.unit ? x.unit : ''}${x.status && x.status !== 'normal' ? ` [${x.status}]` : ''}`)
    return `${name}: ${comps.join(', ')}`
  }).join('\n')
  const imaging = Object.entries(c.imagingResults ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n')
  const proc = Object.entries(c.procedureResults ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n')
  return [labs, imaging, proc].filter(Boolean).join('\n')
}

const CARDS_SPEC = `"recallCards": {
  "mechanism": "<1-2 sentences, MAXIMUM 35 WORDS: the core pathophysiology of the diagnosis IN GENERAL. MUST be case-agnostic — no patient details, no 'in this case/patient', no case-specific measurements>",
  "management": "<1 sentence, MAXIMUM 30 WORDS: the first-line treatment of the diagnosis with a concrete agent/dose/threshold or guideline rule. Case-agnostic — treatment of the disease, not of one patient>",
  "discriminator": "<1 sentence, MAXIMUM 25 WORDS, format '<confirmatory test> — <the general finding that confirms this diagnosis>'. Case-agnostic — the classic confirmatory finding, not one case's exact numbers>"
}`

/** Cards-only prompt for cases that already carry the reasoning fields. */
function buildCardsPrompt(c) {
  const confirms = []
  for (const [test, impacts] of Object.entries(c.testImpacts ?? {})) {
    if (impacts?.[c.diagnosis]?.effect === 'confirms') confirms.push(`${test}: ${impacts[c.diagnosis].why}`)
  }
  return `You are a clinical educator writing spaced-repetition flashcard answers. Return ONLY valid JSON, no markdown.

Diagnosis: ${c.diagnosis}
Why-layer mechanism text (case-specific, for reference): ${c.mechanism ?? '(none)'}
Teaching points: ${(c.teachingPoints ?? []).join(' | ') || '(none)'}
Confirmatory test evidence: ${confirms.join(' | ') || '(none)'}

Produce:
{
  ${CARDS_SPEC}
}

Rules: every answer must stand alone as a general-knowledge flashcard for the diagnosis — strip ALL case-specific details (patient demographics, exact lab values, lesion sizes, laterality). Medication doses and guideline thresholds are encouraged; they are disease knowledge, not case detail. If the reference text names the confirmatory test, use that test in "discriminator".`
}

/** Full prompt for cases missing the reasoning fields (mirrors backfill-reasoning.mjs). */
function buildFullPrompt(c) {
  const expected = [...(c.expectedLabs ?? []), ...(c.expectedImaging ?? [])]
  return `You are a clinical educator adding reasoning-engine metadata to an EXISTING case. Return ONLY valid JSON, no markdown.

Correct diagnosis: ${c.diagnosis}
Differentials: ${(c.differentials ?? []).join(' | ')}
Expected workup tests: ${expected.join(' | ') || '(none listed)'}
Actual results in this case:
${resultSummary(c) || '(none)'}
Teaching points: ${(c.teachingPoints ?? []).join(' | ') || '(none)'}

Produce:
{
  "differentialPriors": [{ "name": "<the correct diagnosis OR a differential, copied verbatim>", "prior": <pre-test weight 0.05-0.9 before any tests>, "category": "<leading|alternative|cant-miss>" }, "...one entry for the correct diagnosis AND one for EVERY differential"],
  "testImpacts": { "<test name from the expected workup>": { "<name from differentialPriors>": { "effect": "<confirms|supports|neutral|argues-against|excludes>", "why": "<short reason tied to THIS case's actual result>" } } },
  "mechanism": "<2-3 sentences of pathophysiology>",
  ${CARDS_SPEC}
}

Rules: differentialPriors names = the correct diagnosis + every differential, verbatim. testImpacts MUST include each expected workup test, and within each an effect for EVERY differentialPriors name. The confirmatory test MUST be "confirms" for the correct diagnosis; the test ruling out a can't-miss differential MUST be "excludes" for it. After the expected workup the correct diagnosis must end up most likely. recallCards answers must be case-agnostic general knowledge (no patient details or case-specific measurements; doses/thresholds are fine).`
}

const CASE_RE = /\b(this (case|patient)|in this)\b/i
function validCards(rc) {
  if (!rc || typeof rc !== 'object') return 'recallCards missing'
  for (const k of ['mechanism', 'management', 'discriminator']) {
    const v = rc[k]
    if (typeof v !== 'string' || !v.trim()) return `recallCards.${k} missing`
    if (v.split(/\s+/).length > 60) return `recallCards.${k} too long`
    if (CASE_RE.test(v)) return `recallCards.${k} is case-specific ("${v.slice(0, 60)}...")`
  }
  return null
}

async function callModel(prompt) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    // 6000: full-prompt responses with a wide testImpacts matrix (many tests ×
    // many differentials) truncated at 4000 and failed JSON parsing.
    max_tokens: 6000,
    system: 'You are a clinical educator. Return ONLY valid JSON.',
    messages: [{ role: 'user', content: prompt }],
  })
  const text = msg.content.find(c => c.type === 'text')?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('no JSON in response')
  try { return JSON.parse(match[0]) } catch { return JSON.parse(repairJson(text)) }
}

async function fetchTargets() {
  const rows = []
  let offset = 0
  while (true) {
    let q = supabase.from('cases').select('id, system, difficulty, diagnosis, case_data, ground_truth').range(offset, offset + 99)
    if (filterSystem) q = q.eq('system', filterSystem)
    if (filterDifficulty) q = q.eq('difficulty', filterDifficulty)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 100) break
    offset += 100
  }
  return rows.filter(r => r.case_data?.diagnosis && !r.case_data.recallCards)
}

async function backfillOne(row) {
  const c = row.case_data
  const needsReasoning = !c.testImpacts || !c.mechanism
  const prompt = needsReasoning ? buildFullPrompt(c) : buildCardsPrompt(c)

  let parsed, cardErr
  for (let attempt = 0; attempt < 2; attempt++) {
    parsed = await callModel(prompt)
    if (needsReasoning && (!Array.isArray(parsed.differentialPriors) || !parsed.testImpacts)) throw new Error('missing reasoning fields')
    cardErr = validCards(parsed.recallCards)
    if (!cardErr) break
  }
  if (cardErr) throw new Error(cardErr)

  const next = { ...c, recallCards: parsed.recallCards }
  if (needsReasoning) {
    next.differentialPriors = parsed.differentialPriors
    next.testImpacts = parsed.testImpacts
    next.mechanism = parsed.mechanism ?? c.mechanism ?? ''
  }

  if (dryRun) return { dryRun: true, full: needsReasoning, cards: parsed.recallCards }

  // Tiered rows are served from ground_truth, not case_data — keep both in step.
  const update = { case_data: next }
  if (row.ground_truth) update.ground_truth = splitCase(next).groundTruth
  const { error } = await supabase.from('cases').update(update).eq('id', row.id)
  if (error) throw new Error('update failed: ' + error.message)
  return { full: needsReasoning, tiered: !!row.ground_truth }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1) }
  let targets = await fetchTargets()
  const fullCount = targets.filter(r => !r.case_data.testImpacts || !r.case_data.mechanism).length
  if (limit > 0) targets = targets.slice(0, limit)
  console.log(`${targets.length} case(s) to backfill (${fullCount} of all remaining also need reasoning fields)${filterSystem ? ` (system: ${filterSystem})` : ''}${dryRun ? ' [DRY RUN]' : ''}.`)
  let ok = 0, fail = 0, next = 0
  // Small worker pool: the SDK's maxRetries backs off if we hit rate limits.
  const CONCURRENCY = 4
  async function worker() {
    while (next < targets.length) {
      const row = targets[next++]
      try {
        const r = await backfillOne(row)
        ok++
        console.log(`  ✓ [${ok + fail}/${targets.length}] ${row.id} — ${r.full ? 'reasoning+cards' : 'cards'}${r.tiered ? ' (tiered)' : ''}${r.dryRun ? ' (dry)' : ''}`)
        if (r.dryRun) console.log(JSON.stringify(r.cards, null, 2))
      } catch (e) {
        fail++
        console.error(`  ✗ [${ok + fail}/${targets.length}] ${row.id} (${row.diagnosis}): ${e.message}`)
      }
      await sleep(500)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log(`\nDone. ${ok} ok, ${fail} failed.`)
}

main().catch(e => { console.error(e); process.exit(1) })
