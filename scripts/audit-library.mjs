/**
 * Case library auditor — structural checks + Claude medical accuracy review.
 *
 * Usage:
 *   node scripts/audit-library.mjs                    # full audit (structural + AI)
 *   node scripts/audit-library.mjs --no-ai            # structural checks only (free)
 *   node scripts/audit-library.mjs --system Cardiovascular
 *   node scripts/audit-library.mjs --difficulty Advanced
 *   node scripts/audit-library.mjs --concurrency 3
 *   node scripts/audit-library.mjs --output audit-report.json
 *
 * Requires ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 * Writes a JSON report to scripts/audit-report.json (or --output path).
 */

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(flag) { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
const filterSystem     = getArg('--system')
const filterDifficulty = getArg('--difficulty')
const skipAI           = args.includes('--no-ai')
const concurrency      = parseInt(getArg('--concurrency') ?? '3', 10)
const outputPath       = path.resolve(ROOT, getArg('--output') ?? 'scripts/audit-report.json')

// ── Clients ───────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const anthropic = skipAI ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Fetch cases ───────────────────────────────────────────────────────────────
async function fetchCases() {
  const rows = []
  let offset = 0
  const pageSize = 100
  while (true) {
    let query = supabase
      .from('cases')
      .select('id, system, difficulty, diagnosis, case_data')
      .eq('is_generated', true)
      .range(offset, offset + pageSize - 1)
    if (filterSystem)     query = query.eq('system', filterSystem)
    if (filterDifficulty) query = query.eq('difficulty', filterDifficulty)
    const { data, error } = await query
    if (error) throw new Error(`Supabase fetch failed: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }
  return rows
}

// ── Structural checks (no AI cost) ───────────────────────────────────────────
function wordCount(str) {
  return str ? str.trim().split(/\s+/).filter(Boolean).length : 0
}

function structuralCheck(row) {
  const c = row.case_data
  const flags = []

  if (!c) { flags.push('CRITICAL: case_data is null'); return flags }

  // Required new fields
  if (!c.nativeDifficulty)         flags.push('Missing nativeDifficulty field')
  if (!c.differentialExplanations?.length) flags.push('Missing differentialExplanations')
  if (!c.expectedLabs?.length)     flags.push('Missing expectedLabs')
  if (!Array.isArray(c.expectedImaging)) flags.push('Missing expectedImaging')
  if (!c.clinicalHpi)              flags.push('Missing clinicalHpi')
  if (!c.advancedHpi)              flags.push('Missing advancedHpi')

  // HPI word counts
  const clinicalWords = wordCount(c.clinicalHpi)
  const advancedWords = wordCount(c.advancedHpi)
  if (c.clinicalHpi  && clinicalWords > 40)  flags.push(`clinicalHpi too long: ${clinicalWords} words (max 40)`)
  if (c.advancedHpi  && advancedWords > 20)  flags.push(`advancedHpi too long: ${advancedWords} words (max 20)`)

  // Differentials count by difficulty
  const diffs = c.differentials?.length ?? 0
  const d = c.nativeDifficulty ?? row.difficulty
  if (d === 'Foundations' && (diffs < 2 || diffs > 3)) flags.push(`Foundations should have 2-3 differentials, got ${diffs}`)
  if (d === 'Clinical'    && (diffs < 3 || diffs > 4)) flags.push(`Clinical should have 3-4 differentials, got ${diffs}`)
  if (d === 'Advanced'    && (diffs < 4 || diffs > 5)) flags.push(`Advanced should have 4-5 differentials, got ${diffs}`)

  // expectedLabs must all be in availableLabs
  if (c.expectedLabs && c.availableLabs) {
    for (const lab of c.expectedLabs) {
      if (!c.availableLabs.includes(lab)) {
        flags.push(`expectedLabs item not in availableLabs: "${lab}"`)
      }
    }
  }

  // expectedImaging must all be in availableImaging
  if (c.expectedImaging && c.availableImaging) {
    for (const img of c.expectedImaging) {
      if (!c.availableImaging.includes(img)) {
        flags.push(`expectedImaging item not in availableImaging: "${img}"`)
      }
    }
  }

  // Every availableLab must have a labResult
  if (c.availableLabs && c.labResults) {
    for (const lab of c.availableLabs) {
      if (!c.labResults[lab]) {
        flags.push(`availableLab has no result: "${lab}"`)
      }
    }
  }

  // Every availableImaging must have a result
  if (c.availableImaging) {
    for (const img of c.availableImaging) {
      const hasResult = c.imagingResults?.[img] || c.procedureResults?.[img]
      if (!hasResult) {
        flags.push(`availableImaging has no result: "${img}"`)
      }
    }
  }

  // STEMI ECG rule (word-boundary prevents false match on "NSTEMI")
  if (/\bSTEMI\b/i.test(row.diagnosis)) {
    const ecg = c.ecgFindings ?? ''
    if (!/st.{0,10}elevation|st-elevation|\bmm\b/i.test(ecg)) {
      flags.push('STEMI case missing explicit ST elevation in ecgFindings')
    }
  }

  // AIN medication rule
  if (/interstitial nephritis|\bAIN\b/.test(row.diagnosis)) {
    const meds = `${c.currentMedications?.medications ?? ''} ${c.currentMedications?.otc ?? ''}`
    if (!/nsaid|ibuprofen|naproxen|aspirin|ppi|omeprazole|antibiotic|amoxicillin|cipro|vancomycin/i.test(meds)) {
      flags.push('AIN case missing causative agent in currentMedications')
    }
  }

  // Physical exam objectivity — flag diagnostic interpretations in exam findings
  const EXAM_DIAGNOSTIC = [
    /\bconsistent with\b/i, /\bsuggesting\b/i, /\bindicating\b/i,
    /\bfindings? of\b/i, /\bpattern of\b/i, /\bin keeping with\b/i,
    /\bsigns? of\b.{0,40}(disease|syndrome|failure|disorder|injury|cirrhosis|inflammation|infection|deficiency|toxicity|malignancy|anemia)/i, /\bsecondary to\b/i,
    /\bdue to\b.{0,30}(disease|syndrome|failure|disorder|injury|nephritis|hepatitis)/i,
  ]
  for (const [region, finding] of Object.entries(c.physicalExam ?? {})) {
    if (!finding || finding.length < 5) continue
    for (const pattern of EXAM_DIAGNOSTIC) {
      if (pattern.test(finding)) {
        flags.push(`physicalExam.${region}: diagnostic interpretation — "${finding.substring(0, 100)}"`)
        break
      }
    }
  }

  // History consistency — visible pastMedicalHistory must not contradict hiddenHistory
  const pmhSurg = c.pastMedicalHistory?.surgeries        ?? ''
  const pmhHosp = c.pastMedicalHistory?.hospitalizations ?? ''
  const hidFull = c.hiddenHistory?.fullHistory            ?? ''
  const SURG_DENIAL      = /\b(none|no prior|no past|no surgical|no history of surgery|denies.{0,10}surgery|has not had any)\b/i
  const SURG_MENTION     = /\b(surgery|surgeries|surgical|appendectomy|cholecystectomy|bypass|repair|resection|hysterectomy|mastectomy|colectomy|gastrectomy|transplant|excision|\w+ectomy|\w+otomy|\w+ostomy|\w+plasty)\b/i
  const HOSP_DENIAL      = /\b(none|no prior|no past|never been hospitalized|no hospitalizations|denies.{0,10}hospitalization)\b/i
  const HOSP_MENTION     = /\b(hospitali[sz]|admitted to.{0,20}hospital|inpatient stay|ICU admission|intensive care unit admission)\b/i
  const NAMED_PROCEDURE  = /\b(appendectomy|cholecystectomy|colectomy|gastrectomy|hysterectomy|mastectomy|arthroscopy|c-section|cesarean|bypass|transplant|nephrectomy|splenectomy|thyroidectomy|laminectomy|craniotomy|laparotomy|laparoscopy|ORIF|tonsillectomy|herniorrhaphy|hernia repair|thrombectomy|endarterectomy|angioplasty|pacemaker|amputation)\b/i
  const CURRENT_OP       = /\b(this admission|current (admission|hospitalization|presentation|episode|injury|surgery|procedure)|on arrival|emergent(ly)?|urgent(ly)?|was brought to|following the (trauma|injury|accident|presentation)|for the current|perioperative|pre-?operatively|intraoperative|post-?operatively|post-?surgery|taken to (the )?OR|taken to surgery|status post.*this)\b/i
  const FUTURE_OP        = /\b(may require|might need|could require|planned|will undergo|recommendation for|referral for|considering surgery|surgical candidate|potential surgery|surgical option)\b/i
  const SURG_SENT_DENIAL = /\b(no|not|never|denies?|without)\b.{0,100}\b(surgery|surgeries|surgical|procedure|procedures|operation|operations|fasciotomy|splenectomy|appendectomy|cholecystectomy)\b/i
  const HOSP_SENT_DENIAL = /\b(no|not|never|denies?|without)\b.{0,100}\b(hospitalization|hospitalizations|hospitalized|inpatient|admitted)\b/i
  const AUTO_PROCEDURE   = /\bautosplenectomy\b/i

  if (pmhSurg && SURG_DENIAL.test(pmhSurg) && !NAMED_PROCEDURE.test(pmhSurg) && SURG_MENTION.test(hidFull)) {
    const surgSentences = hidFull.split(/(?<=[.!?])\s+/).filter(s => SURG_MENTION.test(s))
    const hasHistorical = surgSentences.some(s =>
      !CURRENT_OP.test(s) && !FUTURE_OP.test(s) && !SURG_SENT_DENIAL.test(s) && !AUTO_PROCEDURE.test(s)
    )
    if (hasHistorical) {
      flags.push(`History contradiction: pastMedicalHistory.surgeries = "${pmhSurg.substring(0, 60)}" but hiddenHistory.fullHistory mentions prior surgery`)
    }
  }
  if (pmhHosp && HOSP_DENIAL.test(pmhHosp) && !HOSP_MENTION.test(pmhHosp) && HOSP_MENTION.test(hidFull)) {
    const hospSentences = hidFull.split(/(?<=[.!?])\s+/).filter(s => HOSP_MENTION.test(s))
    const hasHistorical = hospSentences.some(s =>
      !CURRENT_OP.test(s) && !FUTURE_OP.test(s) && !HOSP_SENT_DENIAL.test(s)
    )
    if (hasHistorical) {
      flags.push(`History contradiction: pastMedicalHistory.hospitalizations = "${pmhHosp.substring(0, 60)}" but hiddenHistory.fullHistory mentions prior hospitalization`)
    }
  }

  return flags
}

// ── Claude medical review ─────────────────────────────────────────────────────
function buildReviewPrompt(row) {
  const c = row.case_data
  const d = c.nativeDifficulty ?? row.difficulty

  // Summarise labs — just key abnormal values to keep tokens down
  const labSummary = Object.entries(c.labResults ?? {}).slice(0, 6).map(([name, result]) => {
    const abnormal = result.components?.filter(x => x.status !== 'normal').map(x => `${x.name} ${x.value} ${x.unit}`)
    return abnormal?.length ? `${name}: ${abnormal.join(', ')}` : null
  }).filter(Boolean).join(' | ') || '(none highlighted)'

  const imagingSummary = Object.entries(c.imagingResults ?? {}).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join('\n') || '(none)'

  const examHighlights = Object.entries(c.physicalExam ?? {}).filter(([, v]) => v && v.length > 5).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join('\n')

  const clinicalWords = wordCount(c.clinicalHpi)
  const advancedWords = wordCount(c.advancedHpi)

  return `You are a clinical medicine faculty member reviewing a medical education case.
Return ONLY valid JSON — no markdown, no explanation.

CASE METADATA
Diagnosis: ${row.diagnosis}
Difficulty: ${d}
Patient: ${c.patientInfo?.age}yo ${c.patientInfo?.gender}

VITALS
BP ${c.vitals?.bp} | HR ${c.vitals?.hr} | RR ${c.vitals?.rr} | Temp ${c.vitals?.temp}°F | SpO2 ${c.vitals?.spo2}% | Weight ${c.vitals?.weight}

HPI (Foundations): ${c.hpi}
HPI (Clinical, ${clinicalWords} words): ${c.clinicalHpi}
HPI (Advanced, ${advancedWords} words): ${c.advancedHpi}

KEY ABNORMAL LABS: ${labSummary}
IMAGING: ${imagingSummary}
EXAM HIGHLIGHTS: ${examHighlights}

DIFFERENTIALS: ${c.differentials?.join(' | ')}
DIFFERENTIAL EXPLANATIONS: ${c.differentialExplanations?.join(' | ')}
EXPECTED LABS: ${c.expectedLabs?.join(', ')}
TEACHING POINTS: ${c.teachingPoints?.join(' | ')}

Review on these axes:
1. CLINICAL ACCURACY — Are vitals, labs, exam, and imaging internally consistent with the diagnosis "${row.diagnosis}"? Flag any value that is implausible or contradicts the diagnosis.
2. HPI QUALITY — Foundations HPI should be detailed (4-5 sentences). Clinical HPI ≤40 words (current: ${clinicalWords}). Advanced HPI ≤20 words with ONE misleading detail (current: ${advancedWords}).
3. DIFFERENTIALS — Are listed differentials clinically appropriate for this presentation? Are any clearly wrong or missing an obvious alternative?
4. TEACHING POINTS — Are all teaching points factually accurate? Flag any that contain a clinical error.
5. DIFFICULTY COMPLIANCE — Does this case appropriately follow ${d} rules?${d === 'Advanced' ? ' Is there exactly ONE objective red herring in the data? Is there a pathognomonic finding in availableLabs/availableImaging?' : d === 'Clinical' ? ' Is there ONE specific misleading finding? Does ONE comorbidity do clinical work?' : ' Is the presentation unambiguous? Do labs directly confirm without misleading values?'}

Return:
{
  "pass": <true if no significant clinical accuracy issues>,
  "severity": "ok" | "minor" | "major",
  "flags": ["<specific, actionable issue>", ...],
  "summary": "<1 sentence overall assessment>"
}`
}

async function claudeReview(row) {
  const prompt = buildReviewPrompt(row)
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: 'You are a clinical medicine faculty member reviewing medical education cases for accuracy. Return ONLY valid JSON.',
    messages: [{ role: 'user', content: prompt }],
  })
  const text = message.content[0]?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in review response')
  return JSON.parse(match[0])
}

// ── Semaphore ─────────────────────────────────────────────────────────────────
function makeSemaphore(limit) {
  let running = 0; const queue = []
  function next() {
    if (running >= limit || !queue.length) return
    running++
    const { fn, resolve, reject } = queue.shift()
    fn().then(v => { running--; resolve(v); next() }).catch(e => { running--; reject(e); next() })
  }
  return fn => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next() })
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Fetching cases from Supabase…')
  const rows = await fetchCases()
  console.log(`${rows.length} cases loaded. Running ${skipAI ? 'structural checks only' : 'structural + AI review'}…\n`)

  const report = []
  const sem = makeSemaphore(concurrency)
  let done = 0

  await Promise.all(rows.map(row => sem(async () => {
    const entry = {
      id: row.id,
      system: row.system,
      difficulty: row.difficulty,
      diagnosis: row.diagnosis,
      structuralFlags: structuralCheck(row),
      aiReview: null,
      aiError: null,
    }

    if (!skipAI) {
      try {
        entry.aiReview = await claudeReview(row)
      } catch (e) {
        entry.aiError = e.message
      }
    }

    report.push(entry)
    done++
    process.stdout.write(`\r  ${done}/${rows.length} reviewed…`)
  })))

  console.log('\n')

  // Sort report by severity: major first, then minor, then ok
  const severityOrder = { major: 0, minor: 1, ok: 2 }
  report.sort((a, b) => {
    const sa = severityOrder[a.aiReview?.severity ?? 'ok']
    const sb = severityOrder[b.aiReview?.severity ?? 'ok']
    if (sa !== sb) return sa - sb
    return (b.structuralFlags.length) - (a.structuralFlags.length)
  })

  // Summary stats
  const structuralIssues = report.filter(r => r.structuralFlags.length > 0)
  const aiMajor  = report.filter(r => r.aiReview?.severity === 'major')
  const aiMinor  = report.filter(r => r.aiReview?.severity === 'minor')
  const aiOk     = report.filter(r => r.aiReview?.severity === 'ok')
  const aiErrors = report.filter(r => r.aiError)

  console.log('══════════════════════════════════════════')
  console.log('  AUDIT SUMMARY')
  console.log('══════════════════════════════════════════')
  console.log(`  Total cases reviewed:   ${rows.length}`)
  console.log(`  Structural issues:      ${structuralIssues.length}`)
  if (!skipAI) {
    console.log(`  AI review — major:      ${aiMajor.length}`)
    console.log(`  AI review — minor:      ${aiMinor.length}`)
    console.log(`  AI review — ok:         ${aiOk.length}`)
    if (aiErrors.length) console.log(`  AI review errors:       ${aiErrors.length}`)
  }
  console.log('══════════════════════════════════════════\n')

  // Print issues
  if (structuralIssues.length) {
    console.log('── STRUCTURAL ISSUES ──────────────────────')
    for (const r of structuralIssues) {
      console.log(`\n  ${r.id}`)
      for (const f of r.structuralFlags) console.log(`    ⚠ ${f}`)
    }
    console.log()
  }

  if (!skipAI && (aiMajor.length + aiMinor.length) > 0) {
    console.log('── AI REVIEW FLAGS ────────────────────────')
    for (const r of [...aiMajor, ...aiMinor]) {
      if (!r.aiReview?.flags?.length) continue
      const badge = r.aiReview.severity === 'major' ? '🔴' : '🟡'
      console.log(`\n  ${badge} ${r.id}`)
      console.log(`     ${r.aiReview.summary}`)
      for (const f of r.aiReview.flags) console.log(`     • ${f}`)
    }
    console.log()
  }

  // Write full report
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
  console.log(`Full report written to: ${path.relative(ROOT, outputPath)}`)

  if (!skipAI) {
    const estimatedCost = rows.length * ((2000 * 3 + 600 * 15) / 1_000_000)
    console.log(`Estimated AI review cost: ~$${estimatedCost.toFixed(2)}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
