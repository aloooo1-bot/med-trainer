/**
 * Backfill the differential-reasoning fields (differentialPriors, testImpacts,
 * mechanism) onto EXISTING cases so the differential board, predict-then-compare,
 * and Why layer light up without regenerating (and losing) the curated cases.
 *
 * One focused AI call per case, derived from the case's existing diagnosis,
 * differentials, expected workup, and actual results. Resumable (skips cases that
 * already have testImpacts).
 *
 * Usage:
 *   node scripts/backfill-reasoning.mjs --limit 1 --dry-run   # preview one
 *   node scripts/backfill-reasoning.mjs --limit 1             # write one (validate)
 *   node scripts/backfill-reasoning.mjs --system Renal
 *   node scripts/backfill-reasoning.mjs                       # all remaining
 *
 * Requires ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import path from 'path'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { repairJson } from '../app/lib/generators/shared.ts'

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
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
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

function buildPrompt(c) {
  const expected = [...(c.expectedLabs ?? []), ...(c.expectedImaging ?? [])]
  return `You are a clinical educator adding reasoning-engine metadata to an EXISTING case. Return ONLY valid JSON, no markdown.

Correct diagnosis: ${c.diagnosis}
Differentials: ${(c.differentials ?? []).join(' | ')}
Expected workup tests: ${expected.join(' | ') || '(none listed)'}
Actual results in this case:
${resultSummary(c) || '(none)'}

Produce:
{
  "differentialPriors": [{ "name": "<the correct diagnosis OR a differential, copied verbatim>", "prior": <pre-test weight 0.05-0.9 before any tests>, "category": "<leading|alternative|cant-miss>" }, "...one entry for the correct diagnosis AND one for EVERY differential"],
  "testImpacts": { "<test name from the expected workup>": { "<name from differentialPriors>": { "effect": "<confirms|supports|neutral|argues-against|excludes>", "why": "<short reason tied to THIS case's actual result>" } } },
  "mechanism": "<2-3 sentences of pathophysiology>"
}

Rules: differentialPriors names = the correct diagnosis + every differential, verbatim. testImpacts MUST include each expected workup test, and within each an effect for EVERY differentialPriors name. The confirmatory test MUST be "confirms" for the correct diagnosis; the test ruling out a can't-miss differential MUST be "excludes" for it. After the expected workup the correct diagnosis must end up most likely.`
}

async function fetchTargets() {
  const rows = []
  let offset = 0
  while (true) {
    let q = supabase.from('cases').select('id, system, difficulty, diagnosis, case_data').eq('is_generated', true).range(offset, offset + 99)
    if (filterSystem) q = q.eq('system', filterSystem)
    if (filterDifficulty) q = q.eq('difficulty', filterDifficulty)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 100) break
    offset += 100
  }
  return rows.filter(r => r.case_data && !r.case_data.testImpacts)
}

async function backfillOne(row) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: 'You are a clinical educator. Return ONLY valid JSON.',
    messages: [{ role: 'user', content: buildPrompt(row.case_data) }],
  })
  const text = msg.content.find(c => c.type === 'text')?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('no JSON in response')
  let parsed
  try { parsed = JSON.parse(match[0]) } catch { parsed = JSON.parse(repairJson(text)) }
  if (!Array.isArray(parsed.differentialPriors) || !parsed.testImpacts) throw new Error('missing required fields')
  const next = {
    ...row.case_data,
    differentialPriors: parsed.differentialPriors,
    testImpacts: parsed.testImpacts,
    mechanism: parsed.mechanism ?? row.case_data.mechanism ?? '',
  }
  if (dryRun) return { dryRun: true, priors: parsed.differentialPriors.length, tests: Object.keys(parsed.testImpacts).length }
  const { error } = await supabase.from('cases').update({ case_data: next }).eq('id', row.id)
  if (error) throw new Error('update failed: ' + error.message)
  return { priors: parsed.differentialPriors.length, tests: Object.keys(parsed.testImpacts).length }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1) }
  let targets = await fetchTargets()
  if (limit > 0) targets = targets.slice(0, limit)
  console.log(`${targets.length} case(s) to backfill${filterSystem ? ` (system: ${filterSystem})` : ''}${dryRun ? ' [DRY RUN]' : ''}.`)
  let ok = 0, fail = 0
  for (const row of targets) {
    try {
      const r = await backfillOne(row)
      ok++
      console.log(`  ✓ ${row.id} — ${r.priors} priors, ${r.tests} tests${r.dryRun ? ' (dry)' : ''}`)
    } catch (e) {
      fail++
      console.error(`  ✗ ${row.id}: ${e.message}`)
    }
    await sleep(1500)
  }
  console.log(`\nDone. ${ok} ok, ${fail} failed.`)
}

main().catch(e => { console.error(e); process.exit(1) })
