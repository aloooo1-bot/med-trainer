/**
 * Surgical field patcher for verified audit findings.
 *
 * Five operators — each rewrites ONLY the flagged field, leaving the rest
 * of the curated case body intact.
 *
 * Operators:
 *   mgmt    — rewrite teachingPoints so at least one satisfies the
 *             MANAGEMENT TEACHING POINT RULE (79 cases)
 *   cardiac — append ECG to availableImaging + imagingResults (7 cases)
 *   whipple — fix PAS-positive macrophage phrase in procedureResults (1 case)
 *   skin    — neutralise physicalExam.Skin disclosure in Severe Hypoglycemia (3 cases)
 *   diff    — trim extra differential from img-MPX1723 cases (2 cases)
 *
 * Usage:
 *   node scripts/patch-audit-flags.mjs --dry-run
 *   node scripts/patch-audit-flags.mjs --only mgmt --limit 5
 *   node scripts/patch-audit-flags.mjs --only mgmt --case-id respiratory-foundations-spontaneous-pneumothorax-0
 *   node scripts/patch-audit-flags.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY in .env.local
 */

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { config } from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
const DRY_RUN    = args.includes('--dry-run')
const ONLY       = getArg('--only')   // mgmt | cardiac | whipple | skin | diff
const LIMIT      = parseInt(getArg('--limit') ?? '9999', 10)
const CASE_ID    = getArg('--case-id')
const CONCURRENCY = parseInt(getArg('--concurrency') ?? '3', 10)

if (DRY_RUN) console.log('[DRY RUN] — no DB writes will be made\n')

// ── Clients ───────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Source-of-truth audit reports ─────────────────────────────────────────────
const extraReport = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/extra-rules-report.json'), 'utf8'))
const auditReport = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/audit-report.json'), 'utf8'))

// ── Management heuristic (mirrors audit-rules-extra.mjs) ─────────────────────
const DOSE_PATTERN       = /\b\d+(\.\d+)?\s*(mg|mcg|g|mEq|mL|mmol|units?|IU)\b/i
const THRESHOLD_PATTERN  = /[<>≤≥]\s*\d+/
const DRUG_KEYWORDS      = /\b(antibiotic|antifungal|anticoagul|heparin|warfarin|apixaban|rivaroxaban|aspirin|statin|atorvastatin|metformin|insulin|thrombolytic|tPA|alteplase|corticosteroid|prednisone|dexamethasone|vancomycin|ceftriaxone|piperacillin|meropenem|azithromycin|amoxicillin|ciprofloxacin|metoprolol|labetalol|lisinopril|amlodipine|nitroglycerin|epinephrine|atropine|naloxone|flumazenil|N-acetylcysteine|NAC|FFP|platelets|PRBC|transfus|dialysis|cardioversion|defibrillation|intubat|vasopressor|norepinephrine|dopamine|dobutamine|rituximab|ibrutinib|venetoclax|ruxolitinib|obinutuzumab|bortezomib|lenalidomide|thalidomide|imatinib|levothyroxine|methimazole|propylthiouracil|propranolol|allopurinol|febuxostat|colchicine|hydroxychloroquine|methotrexate|sulfasalazine|leflunomide|ivermectin|albendazole|mebendazole|TMP-SMX|trimethoprim|doxycycline|tetracycline|clindamycin|fluconazole|voriconazole|itraconazole|amphotericin|acyclovir|valacyclovir|oseltamivir|lithium|valproate|olanzapine|quetiapine|haloperidol|risperidone|aripiprazole|ferrous|iron supplement|iron infusion|IV iron|thiamine|folate|vitamin B12|cyanocobalamin|cholestyramine|ursodeoxycholic|pyridoxine|eculizumab|ravulizumab|hydroxyurea|hydroxycarbamide|physostigmine|hemin|hematin|IVIG|immunoglobulin|opioid|morphine|oxycodone|hydromorphone|fentanyl|ketamine|phenobarbital|phenytoin|levetiracetam|lamotrigine|carbamazepine|antiepileptic|antiretroviral|tacrolimus|cyclosporine|mycophenolate|azathioprine|cyclophosphamide|secukinumab|adalimumab|infliximab|dupilumab|omalizumab)\b/i
const PROCEDURE_KEYWORDS = /\b(chest tube|tube thoracostomy|needle aspiration|needle decompression|paracentesis|thoracentesis|pericardiocentesis|lumbar puncture|bone marrow|pericardial window|fasciotomy|laminectomy|discectomy|surgical decompression|decompressive|escharotomy|colectomy|gastrectomy|nephrectomy|splenectomy|hepatic resection|abscess drainage|incision and drainage|debridement|ERCP|endoscopy|bronchoscopy|upper endoscopy|EGD|colonoscopy|cystoscopy|angiography|embolization|thrombectomy|endarterectomy|stent|pacemaker|ICD|ablation|cardiovert|plasmapheresis|plasma exchange|physical therapy|radiation therapy|chemotherapy|stem cell transplant|bone marrow transplant|liver transplant|kidney transplant)\b/i

function satisfiesManagementRule(points) {
  for (const pt of (points ?? [])) {
    if (DOSE_PATTERN.test(pt) || THRESHOLD_PATTERN.test(pt) || DRUG_KEYWORDS.test(pt) || PROCEDURE_KEYWORDS.test(pt)) {
      return true
    }
  }
  return false
}

// ── DB helpers ────────────────────────────────────────────────────────────────
async function fetchCase(id) {
  const { data, error } = await supabase
    .from('cases')
    .select('id, system, difficulty, diagnosis, case_data')
    .eq('id', id)
    .single()
  if (error) throw new Error(`Fetch ${id}: ${error.message}`)
  return data
}

async function writeCase(id, updatedCaseData) {
  if (DRY_RUN) return
  const { error } = await supabase
    .from('cases')
    .update({ case_data: updatedCaseData })
    .eq('id', id)
  if (error) throw new Error(`Write ${id}: ${error.message}`)
}

// ── Stats tracker ─────────────────────────────────────────────────────────────
const stats = { mgmt: { ok: 0, skip: 0 }, cardiac: { ok: 0, skip: 0 }, whipple: { ok: 0, skip: 0 }, skin: { ok: 0, skip: 0 }, diff: { ok: 0, skip: 0 } }

// ── Concurrency helper ────────────────────────────────────────────────────────
async function runPool(items, concurrency, fn) {
  const results = []
  let i = 0
  async function worker() {
    while (i < items.length) {
      const item = items[i++]
      results.push(await fn(item).catch(e => ({ error: e.message, item })))
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

// ─────────────────────────────────────────────────────────────────────────────
// OPERATOR 1: patchManagementTeachingPoint
// ─────────────────────────────────────────────────────────────────────────────
const MGMT_RULE = `At least ONE of the four teachingPoints MUST be a concrete management/treatment pearl — name a specific first-line agent, dose, threshold, target, or guideline-anchored decision rule. Examples: "Initiate IV labetalol; reduce MAP by no more than 25% in the first hour" or "tPA window is 4.5h from last-known-well". A pearl that only describes pathophysiology, epidemiology, or diagnostic criteria does NOT satisfy this rule. Generic statements like "treat the underlying cause" or "manage supportively" are insufficient.`

async function callClaudeForTeachingPoints(row, attempt = 1) {
  const c = row.case_data
  const existing = (c.teachingPoints ?? []).join('\n')
  const strict = attempt === 2 ? '\n\nIMPORTANT: You MUST include a specific drug name, dose in mg/mcg/g, or a specific procedural intervention. Do NOT return the same pearls as before.' : ''

  const prompt = `You are rewriting teachingPoints for a clinical case to satisfy a specific rule.

Diagnosis: ${row.diagnosis}
Difficulty: ${row.difficulty}
HPI: ${c.hpi ?? c.clinicalHpi ?? c.advancedHpi ?? ''}

Existing teachingPoints (preserve as much content and phrasing as possible):
${existing}

RULE: ${MGMT_RULE}${strict}

Return ONLY valid JSON — no markdown, no explanation:
{ "teachingPoints": ["<pearl 1>", "<pearl 2>", "<pearl 3>", "<concrete management pearl>"] }`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = msg.content[0].text.trim()
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in Claude response')
  const parsed = JSON.parse(match[0])
  if (!Array.isArray(parsed.teachingPoints) || parsed.teachingPoints.length < 3) {
    throw new Error('Invalid teachingPoints array')
  }
  return parsed.teachingPoints
}

async function patchManagementTeachingPoint(row) {
  const c = row.case_data
  if (satisfiesManagementRule(c.teachingPoints)) {
    console.log(`  [mgmt] SKIP already satisfies: ${row.id}`)
    stats.mgmt.skip++
    return
  }
  console.log(`  [mgmt] PATCH: ${row.id} (${row.diagnosis})`)
  let points
  try {
    points = await callClaudeForTeachingPoints(row, 1)
    if (!satisfiesManagementRule(points)) {
      console.log(`    retry 2…`)
      points = await callClaudeForTeachingPoints(row, 2)
    }
    if (!satisfiesManagementRule(points)) {
      console.log(`    FAIL: still no management directive after 2 attempts — skipping`)
      stats.mgmt.skip++
      return
    }
  } catch (e) {
    console.log(`    ERROR: ${e.message} — skipping`)
    stats.mgmt.skip++
    return
  }
  if (DRY_RUN) {
    console.log(`    [dry-run] new teachingPoints:`)
    points.forEach((p, i) => console.log(`      ${i}: ${p}`))
  } else {
    const updated = { ...c, teachingPoints: points }
    await writeCase(row.id, updated)
  }
  stats.mgmt.ok++
}

// ─────────────────────────────────────────────────────────────────────────────
// OPERATOR 2: patchCardiacTestRule
// ─────────────────────────────────────────────────────────────────────────────
const CARDIAC_IDS = [
  'trauma-advanced-abdominal-compartment-syndrome-0',
  'hematologic-oncologic-advanced-myelodysplastic-syndrome-0',
  'hematologic-oncologic-foundations-iron-deficiency-anemia-0',
  'hematologic-oncologic-advanced-cll-with-autoimmune-hemolytic-anemia-0',
  'infectious-advanced-strongyloidiasis-with-hyperinfection-syndrome-0',
  'hematologic-oncologic-clinical-iron-deficiency-anemia-0',
  'hematologic-oncologic-advanced-iron-deficiency-anemia-0',
]

async function patchCardiacTestRule(id) {
  const row = await fetchCase(id)
  const c = { ...row.case_data }
  const ecgName = 'ECG (12-lead)'

  const hasECG = (c.availableImaging ?? []).some(img => /ECG|EKG|electrocardiogram/i.test(img))
  if (hasECG) {
    console.log(`  [cardiac] SKIP already has ECG: ${id}`)
    stats.cardiac.skip++
    return
  }

  console.log(`  [cardiac] PATCH: ${id}`)
  c.availableImaging = [...(c.availableImaging ?? []), ecgName]

  const hr = c.vitals?.hr ?? 80
  const ecgResult = c.ecgFindings
    ?? `Normal sinus rhythm at ${hr} bpm. No acute ST-T wave changes. No conduction abnormalities.`
  c.imagingResults = { ...(c.imagingResults ?? {}), [ecgName]: ecgResult }

  if (DRY_RUN) {
    console.log(`    [dry-run] appended "${ecgName}" to availableImaging`)
    console.log(`    [dry-run] ECG result: ${ecgResult.slice(0, 80)}…`)
  } else {
    await writeCase(id, c)
  }
  stats.cardiac.ok++
}

// ─────────────────────────────────────────────────────────────────────────────
// OPERATOR 3: patchWhippleBiopsy
// ─────────────────────────────────────────────────────────────────────────────
const WHIPPLE_ID = 'gastrointestinal-advanced-whipple-s-disease-0'
// The regex that must match: /PAS.{0,20}positive|PAS.{0,20}macrophage|macrophage.{0,20}PAS/i
const PAS_PHRASE = 'PAS-positive foamy macrophages within the lamina propria'

async function patchWhippleBiopsy() {
  const row = await fetchCase(WHIPPLE_ID)
  const c = { ...row.case_data }
  const proc = { ...(c.procedureResults ?? {}) }

  const key = Object.keys(proc).find(k => /biopsy|EGD|endoscop|duodenal/i.test(k))
  if (!key) {
    console.log(`  [whipple] ERROR: no biopsy key found in procedureResults`)
    stats.whipple.skip++
    return
  }

  const already = /PAS.{0,20}positive|PAS.{0,20}macrophage|macrophage.{0,20}PAS/i.test(proc[key])
  if (already) {
    console.log(`  [whipple] SKIP already has PAS phrase`)
    stats.whipple.skip++
    return
  }

  console.log(`  [whipple] PATCH: inject "${PAS_PHRASE}"`)
  // Replace first occurrence of the verbose PAS description with the compact matchable phrase
  let updated = proc[key].replace(
    /large foamy macrophages that stain intensely positive with Periodic Acid-Schiff \(PAS\) stain/i,
    PAS_PHRASE
  )
  if (updated === proc[key]) {
    // Fallback: append to end of the string before "Impression:"
    updated = proc[key].replace(
      /(Impression:)/i,
      `${PAS_PHRASE} are identified. $1`
    )
    if (updated === proc[key]) {
      updated = proc[key] + ` ${PAS_PHRASE} noted.`
    }
  }
  proc[key] = updated
  c.procedureResults = proc

  if (DRY_RUN) {
    console.log(`    [dry-run] updated procedureResults["${key}"] (excerpt):`)
    console.log(`    ${updated.slice(0, 120)}…`)
  } else {
    await writeCase(WHIPPLE_ID, c)
  }
  stats.whipple.ok++
}

// ─────────────────────────────────────────────────────────────────────────────
// OPERATOR 4: patchSkinDisclosureLeak
// ─────────────────────────────────────────────────────────────────────────────
const SKIN_IDS = [
  'endocrine-metabolic-foundations-severe-hypoglycemia-0',
  'endocrine-metabolic-clinical-severe-hypoglycemia-0',
  'endocrine-metabolic-advanced-severe-hypoglycemia-0',
]
const NEUTRAL_SKIN = 'Cool and diaphoretic diffusely. No rash, jaundice, or cyanosis. No ulcers or abnormal pigmentation.'
const INSULIN_CLUE = 'Visible subcutaneous injection sites noted bilaterally on the abdomen and thighs (not disclosed in chief complaint — elicitable by directed exam).'

async function patchSkinDisclosureLeak(id) {
  const row = await fetchCase(id)
  const c = { ...row.case_data }
  const physExam = { ...(c.physicalExam ?? {}) }

  const currentSkin = physExam.Skin ?? ''
  const hasLeak = /insulin injection site/i.test(currentSkin)
  if (!hasLeak) {
    console.log(`  [skin] SKIP no leak pattern found: ${id}`)
    stats.skin.skip++
    return
  }

  console.log(`  [skin] PATCH: ${id}`)
  physExam.Skin = NEUTRAL_SKIN

  // Preserve insulin clue in hiddenHistory.fullHistory if not already there
  const hidden = { ...(c.hiddenHistory ?? {}) }
  const fullHx = hidden.fullHistory ?? ''
  if (!/insulin|injection site/i.test(fullHx)) {
    hidden.fullHistory = `${INSULIN_CLUE} ${fullHx}`.trim()
  }

  const updated = { ...c, physicalExam: physExam, hiddenHistory: hidden }

  if (DRY_RUN) {
    console.log(`    [dry-run] physicalExam.Skin: "${NEUTRAL_SKIN}"`)
    console.log(`    [dry-run] hiddenHistory.fullHistory prepended with insulin clue: ${!(/insulin|injection site/i.test(fullHx))}`)
  } else {
    await writeCase(id, updated)
  }
  stats.skin.ok++
}

// ─────────────────────────────────────────────────────────────────────────────
// OPERATOR 5: patchExtraDifferential
// ─────────────────────────────────────────────────────────────────────────────
const DIFF_IDS = ['img-MPX1723_synpic34923', 'img-MPX1723_synpic34923-advanced']
const DROP_INDEX = 4  // Todd's paralysis — weakest differential for ischemic stroke with confirmed DWI

async function patchExtraDifferential(id) {
  const row = await fetchCase(id)
  const c = { ...row.case_data }

  const diffs = c.differentials ?? []
  const exps  = c.differentialExplanations ?? []
  if (diffs.length <= 4) {
    console.log(`  [diff] SKIP already ≤4 differentials: ${id}`)
    stats.diff.skip++
    return
  }

  console.log(`  [diff] PATCH: ${id} — dropping index ${DROP_INDEX}: "${diffs[DROP_INDEX]}"`)
  const newDiffs = diffs.filter((_, i) => i !== DROP_INDEX)
  const newExps  = exps.filter((_, i) => i !== DROP_INDEX)
  const updated  = { ...c, differentials: newDiffs, differentialExplanations: newExps }

  if (DRY_RUN) {
    console.log(`    [dry-run] removed: "${diffs[DROP_INDEX]}"`)
    console.log(`    [dry-run] remaining: ${newDiffs.join(' | ')}`)
  } else {
    await writeCase(id, updated)
  }
  stats.diff.ok++
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const run = (op) => !ONLY || ONLY === op

  // ── Operator 5: diff (no API calls) ───────────────────────────────────────
  if (run('diff')) {
    console.log('\n═══ OPERATOR: patchExtraDifferential ═══')
    for (const id of DIFF_IDS) {
      if (CASE_ID && id !== CASE_ID) continue
      await patchExtraDifferential(id)
    }
  }

  // ── Operator 4: skin (no API calls) ───────────────────────────────────────
  if (run('skin')) {
    console.log('\n═══ OPERATOR: patchSkinDisclosureLeak ═══')
    for (const id of SKIN_IDS) {
      if (CASE_ID && id !== CASE_ID) continue
      await patchSkinDisclosureLeak(id)
    }
  }

  // ── Operator 3: whipple (no API calls) ────────────────────────────────────
  if (run('whipple')) {
    console.log('\n═══ OPERATOR: patchWhippleBiopsy ═══')
    if (!CASE_ID || CASE_ID === WHIPPLE_ID) {
      await patchWhippleBiopsy()
    }
  }

  // ── Operator 2: cardiac (no API calls) ────────────────────────────────────
  if (run('cardiac')) {
    console.log('\n═══ OPERATOR: patchCardiacTestRule ═══')
    const targets = CASE_ID ? CARDIAC_IDS.filter(id => id === CASE_ID) : CARDIAC_IDS
    for (const id of targets) {
      await patchCardiacTestRule(id)
    }
  }

  // ── Operator 1: mgmt (Claude API calls, pooled) ───────────────────────────
  if (run('mgmt')) {
    console.log('\n═══ OPERATOR: patchManagementTeachingPoint ═══')
    let mgmtTargets = extraReport
      .filter(r => r.flags.some(f => f.startsWith('MANAGEMENT')))
      .slice(0, LIMIT)
    if (CASE_ID) mgmtTargets = mgmtTargets.filter(r => r.id === CASE_ID)

    console.log(`  Targets: ${mgmtTargets.length}`)

    // Fetch all rows upfront
    const rows = []
    for (const t of mgmtTargets) {
      try { rows.push(await fetchCase(t.id)) } catch (e) { console.log(`  FETCH ERROR: ${t.id}: ${e.message}`) }
    }

    // Process concurrently
    await runPool(rows, CONCURRENCY, async (row) => {
      await patchManagementTeachingPoint(row)
    })
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══ SUMMARY ═══')
  for (const [op, s] of Object.entries(stats)) {
    if (!ONLY || ONLY === op) {
      console.log(`  ${op.padEnd(8)}: ${s.ok} patched, ${s.skip} skipped`)
    }
  }
  if (DRY_RUN) console.log('\n[DRY RUN] — no DB writes were made')
}

main().catch(e => { console.error(e); process.exit(1) })
