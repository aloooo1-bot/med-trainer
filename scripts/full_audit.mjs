/**
 * MedTrainer Full Audit Script
 * Generates and solves cases for all 12 systems × 3 difficulties = 36 cases.
 * Acts as a 4th-year medical student: asks history, orders tests, submits diagnosis.
 *
 * Usage:
 *   node scripts/full_audit.mjs                  # run all 36 cases
 *   node scripts/full_audit.mjs --from 1 --to 12 # run cases 1-12 (Foundations)
 *   node scripts/full_audit.mjs --from 13 --to 24 # Clinical
 *   node scripts/full_audit.mjs --from 25 --to 36 # Advanced
 *   node scripts/full_audit.mjs --report          # print report from saved JSON
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RESULTS_FILE = path.join(__dirname, 'audit_results.json')

const BASE = 'http://localhost:3000'
const SYSTEMS = [
  'Cardiovascular','Respiratory','Neurologic','Gastrointestinal','Renal',
  'Endocrine / Metabolic','Infectious','Hematologic / Oncologic',
  'Musculoskeletal','Psychiatric','Toxicologic','Trauma',
]
const DIFFICULTIES = ['Foundations', 'Clinical', 'Advanced']

// All 36 cases in order
const ALL_CASES = []
for (const difficulty of DIFFICULTIES) {
  for (const system of SYSTEMS) {
    ALL_CASES.push({ difficulty, system })
  }
}

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const reportMode = args.includes('--report')
const fromArg = args.indexOf('--from')
const toArg = args.indexOf('--to')
const FROM = fromArg !== -1 ? parseInt(args[fromArg + 1]) : 1
const TO = toArg !== -1 ? parseInt(args[toArg + 1]) : 36

// ── helpers ───────────────────────────────────────────────────────────────────

// /api/claude (the open browser proxy) was removed in the security remediation;
// scripts call the Anthropic API directly with the key from .env.local.
const { config: _dotenvConfig } = await import('dotenv')
_dotenvConfig({ path: '.env.local' })

async function callClaude(system, messages, maxTokens = 800) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', system, messages, max_tokens: maxTokens }),
  })
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.content[0].text
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function findKey(name, obj) {
  if (!obj) return null
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(n) ||
        n.includes(k.toLowerCase().replace(/[^a-z0-9]/g, ''))) return k
  }
  return null
}

function repairJSON(text) {
  const start = text.indexOf('{')
  if (start === -1) return null

  // Extract raw content starting at first {
  let raw = text.slice(start)

  // Fix unquoted values after known string-valued keys.
  // Matches values that: start with a letter/digit/%, contain letters or special chars (/, -, .)
  // and are NOT valid JSON primitives (numbers, booleans, null).
  raw = raw.replace(/"(unit|status|referenceRange|name|source|label)":\s*([^",}\]\n{[\s][^",}\]\n{[]*?)(\s*[,}\]])/g,
    (m, key, val, tail) => {
      const v = val.trim()
      if (!v) return m
      if (v.startsWith('"')) return m
      if (v === 'true' || v === 'false' || v === 'null') return m
      if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) return m // pure number
      return `"${key}": "${v}"${tail}`
    })

  // Fix trailing commas before } or ]
  raw = raw.replace(/,(\s*[}\]])/g, '$1')

  // Scan for balanced braces (ignore chars inside strings)
  let inString = false
  let escape = false
  const stack = []
  let lastCompleteEnd = -1

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (escape) { escape = false; continue }
    if (c === '\\' && inString) { escape = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === '{' || c === '[') { stack.push(c === '{' ? '}' : ']') }
    else if (c === '}' || c === ']') {
      if (stack.length > 0) {
        stack.pop()
        if (stack.length === 0) lastCompleteEnd = i
      }
    }
  }

  let json
  if (stack.length === 0 && lastCompleteEnd !== -1) {
    // Fully balanced JSON found
    json = raw.slice(0, lastCompleteEnd + 1)
  } else {
    // Truncated — close open structures
    // Remove any trailing partial line (may be mid-string or mid-value)
    let truncated = inString ? raw.replace(/"[^"]*$/, '') : raw
    // Remove trailing incomplete key-value pair (with or without colon/value)
    truncated = truncated.replace(/,?\s*"[^"]*"?\s*(?::\s*[^,}\]\n]*)?$/, '')
    // Fix trailing commas again
    truncated = truncated.replace(/,(\s*[}\]])/g, '$1').replace(/,\s*$/, '')
    // Close open brackets in reverse stack order
    json = truncated + stack.reverse().join('')
  }

  return json
}

function saveResult(result) {
  let all = []
  try { all = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')) } catch {}
  const idx = all.findIndex(r => r.caseNum === result.caseNum)
  if (idx !== -1) all[idx] = result
  else all.push(result)
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(all, null, 2))
}

function loadResults() {
  try { return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')) } catch { return [] }
}

// ── validation ────────────────────────────────────────────────────────────────

function validateCase(c, system, diff) {
  const issues = []
  if (!c.patientInfo?.name) issues.push('Missing patientInfo.name')
  if (!c.hpi) issues.push('Missing hpi')
  if (!c.vitals?.bp) issues.push('Missing vitals.bp')
  if (!c.vitals?.hr) issues.push('Missing vitals.hr')
  if (!c.availableLabs?.length) issues.push('No availableLabs')
  if (!c.availableImaging?.length) issues.push('No availableImaging')
  if (!c.labResults || Object.keys(c.labResults).length === 0) issues.push('Empty labResults')
  if (!c.imagingResults || Object.keys(c.imagingResults).length === 0) issues.push('Empty imagingResults')
  if (!c.diagnosis) issues.push('Missing diagnosis')
  if (!c.differentials?.length) issues.push('Missing differentials')
  if (!c.keyQuestions?.length) issues.push('Missing keyQuestions')
  if (!c.teachingPoints?.length) issues.push('Missing teachingPoints')
  if (!c.hiddenHistory) issues.push('Missing hiddenHistory')
  if (!c.ecgFindings && system === 'Cardiovascular') issues.push('Cardiac case missing ecgFindings')

  for (const [panel, result] of Object.entries(c.labResults ?? {})) {
    if (!result?.components?.length) {
      issues.push(`Lab panel "${panel}" missing components array`)
    }
  }

  const hr = parseInt(c.vitals?.hr)
  const rr = parseInt(c.vitals?.rr)
  const temp = parseFloat(c.vitals?.temp)
  const spo2 = parseInt(c.vitals?.spo2)
  if (hr < 20 || hr > 250) issues.push(`Implausible HR: ${hr}`)
  if (rr < 4 || rr > 60) issues.push(`Implausible RR: ${rr}`)
  if (temp < 95 || temp > 108) issues.push(`Implausible Temp: ${temp}°F`)
  if (spo2 < 50 || spo2 > 100) issues.push(`Implausible SpO2: ${spo2}%`)

  if (diff === 'Clinical') {
    const dx = (c.diagnosis ?? '').toLowerCase()
    const rareTerms = ['antisynthetase','erdheim','castleman','thrombotic thrombocytopenic purp',
      'goodpasture','wegener','churg-strauss','takayasu','buerger','scimitar']
    for (const t of rareTerms) {
      if (dx.includes(t)) issues.push(`Clinical diff has rare/subspecialty diagnosis: "${c.diagnosis}"`)
    }
  }
  return issues
}

// ── case generation ───────────────────────────────────────────────────────────
// Simplified template (no ROS, physicalExam, or duplicate social sections)
// to stay within 2500 tokens and avoid truncation

async function generateCase(system, difficulty) {
  const difficultyRules = {
    Foundations: `DIFFICULTY — FOUNDATIONS:
- Common, high-prevalence diagnosis. Classic textbook presentation. No major comorbidities.
- Lab values clearly abnormal and point toward diagnosis. 1-2 obvious differentials.`,
    Clinical: `DIFFICULTY — CLINICAL:
- Moderate prevalence diagnosis a general internist sees regularly.
- DO NOT generate rare diseases or subspecialty diagnoses (e.g., antisynthetase syndrome, HLH, Castleman disease).
- 1-2 atypical features, one comorbidity, some ambiguous labs. 3-4 differentials.
- The lab/imaging results MUST include at least one finding that definitively confirms the correct diagnosis over the top differential.`,
    Advanced: `DIFFICULTY — ADVANCED:
- ONE uncommon/rare diagnosis. Atypical presentation with red herrings.
- Comorbidities must be common conditions (hypertension, diabetes, COPD, CKD, etc.) — never stack multiple rare diagnoses.
- Lab/imaging requires synthesis. Must justify top 3 differentials.
- The case MUST contain at least one pathognomonic or definitively discriminating result that rules in the correct diagnosis.`,
  }

  const hpiSpec = difficulty === 'Foundations'
    ? '4-6 sentences: onset, duration, character, radiation, associated symptoms, timing, exacerbating/relieving factors.'
    : difficulty === 'Clinical'
    ? '2-3 sentences ONLY. MAXIMUM 40 WORDS TOTAL. State age, sex, primary symptom, and duration. No associated symptoms — those go in hiddenHistory.fullHistory.'
    : '1-2 sentences ONLY: age and sex + ONE vague symptom + ONE misleading detail. MAXIMUM 20 WORDS TOTAL. No more.'

  const claudeSystem = `You are a medical education case generator. Generate realistic, detailed clinical cases.
Return ONLY valid JSON. No markdown, no code fences, no explanation. Start with { and end with }.
Invent a completely unique patient name for this case — draw from a different ethnicity or country each time (rotate through Eastern European, West African, East Asian, Latin American, Scandinavian, South Asian, Middle Eastern, etc.). Each case in a session must have a name that has not appeared before. Do not reuse first names or last names.`

  const prompt = `Generate a ${system} clinical case at ${difficulty} difficulty.

${difficultyRules[difficulty]}

RULES (apply silently — do not add as JSON fields):
- Cardiovascular/chest pain/dyspnea/syncope cases: add "ECG" to availableImaging and write ECG report in imagingResults.
- Diagnostic procedures in availableImaging (endoscopy, bronchoscopy, LP, paracentesis, thoracentesis): add report to procedureResults with the EXACT same key.
- Every lab panel in labResults must have a "components" array with individual analyte objects.
- Imaging studies (X-Ray, CT, MRI, Ultrasound, ECG) must ONLY appear in availableImaging and imagingResults — NEVER in availableLabs or labResults.

CRITICAL: Every item in availableLabs MUST have a matching panel in labResults. Every item in availableImaging MUST have a result in imagingResults (or procedureResults). Do not list a lab or imaging study without also providing its results. Use 4-6 labs with 2-5 components each, 2-3 imaging studies.
CRITICAL: The results MUST include at least one finding that definitively confirms the correct diagnosis over its closest differential (e.g. for gout: monosodium urate crystals on synovial fluid; for PE: filling defect on CT-PA; for MI: ST elevation + troponin). Do not generate ambiguous results where the correct diagnosis cannot be confirmed from the data provided.

Output the JSON fields IN THIS EXACT ORDER — diagnosis and differentials come first so they are never truncated:

{
  "patientInfo": { "name": "First Last", "age": 45, "gender": "Male", "chiefComplaint": "one phrase" },
  "hpi": "${hpiSpec}",
  "vitals": { "bp": "130/80", "hr": 88, "rr": 18, "temp": 98.6, "spo2": 96, "weight": "185 lbs" },
  "diagnosis": "Specific primary diagnosis",
  "differentials": ["dx 1", "dx 2", "dx 3", "dx 4"],
  "keyQuestions": ["question 1", "question 2", "question 3", "question 4"],
  "teachingPoints": ["pearl 1", "pearl 2", "pearl 3"],
  "availableLabs": ["CBC", "BMP", "Lipase", "LFTs", "Urinalysis", "Troponin"],
  "availableImaging": ["Chest X-Ray", "CT Abdomen/Pelvis"],
  "labGroups": [
    { "name": "CBC", "tests": ["CBC"] },
    { "name": "BMP", "tests": ["BMP"] }
  ],
  "labResults": {
    "CBC": {
      "components": [
        { "name": "WBC", "value": "8.2", "unit": "x10³/µL", "referenceRange": "4.5-11.0", "status": "normal" },
        { "name": "Hgb", "value": "13.1", "unit": "g/dL", "referenceRange": "13.5-17.5", "status": "low" }
      ]
    }
  },
  "imagingResults": {
    "Chest X-Ray": "Narrative report 2-3 sentences."
  },
  "procedureResults": {},
  "hiddenHistory": {
    "fullHistory": "${difficulty === 'Foundations' ? 'N/A' : 'Complete history: all associated symptoms, onset characterization, radiation, aggravating/relieving factors, pertinent positives and negatives.'}",
    "socialHistory": "smoking, alcohol, occupation, travel",
    "familyHistory": "relevant family history",
    "medications": "medications with doses",
    "hiddenSymptoms": "1-2 symptoms patient confirms only if asked",
    "allergies": "NKDA"
  },
  "imagingCategory": "radiological descriptor",
  "ecgFindings": "ECG description if cardiac, else empty string",
  "hematologyFindings": "peripheral smear findings if relevant, else empty string",
  "urineFindings": "urine microscopy findings if relevant, else empty string",
  "skinFindings": "dermoscopy findings if relevant, else empty string",
  "fundusFindings": "fundus findings if relevant, else empty string",
  "biopsyFindings": "histopathology findings if relevant, else empty string"
}

STEMI RULE: When the diagnosis is any STEMI variant, ecgFindings MUST state specific leads with millimeter elevation (e.g. "2mm ST elevation in II, III, aVF with reciprocal ST depression in I and aVL"). Never write borderline ST elevation for a STEMI diagnosis.
AIN/DRUG-INDUCED NEPHRITIS RULE: When the diagnosis is AIN or drug-induced nephropathy, the causative medication MUST appear prominently in hiddenHistory.medications with duration (e.g. "Ibuprofen 600mg TID × 3 weeks").
FIBRILLARY GN EXCLUSION: Do NOT generate Fibrillary Glomerulonephritis. For Advanced Renal, use IgA Nephropathy, FSGS, Membranous Nephropathy, ANCA-vasculitis, or Thrombotic Microangiopathy instead.
WHIPPLE'S BIOPSY RULE: When the diagnosis is Whipple's Disease, include "Upper Endoscopy (EGD) with Small Bowel Biopsy" in availableImaging and its procedureResults MUST describe PAS-positive macrophages in the lamina propria — the pathognomonic finding.
CLL DISCRIMINATOR RULE: When the diagnosis is CLL or CLL with AIHA, "Flow Cytometry (Peripheral Blood)" MUST be in availableLabs with labResults showing CD5+/CD19+/CD23+ lymphocyte population.
WALDENSTRÖM DISCRIMINATOR RULE: When the diagnosis is Waldenström Macroglobulinemia, "Serum Protein Electrophoresis (SPEP) with Immunofixation" MUST be in availableLabs with an IgM monoclonal spike in labResults, and at least one hyperviscosity symptom must appear in hiddenHistory.
IMPORTANT: vitals.temp must be in Fahrenheit (normal is 98.6°F — never output Celsius values like 36-38).`

  let text
  try {
    text = await callClaude(claudeSystem, [{ role: 'user', content: prompt }], 4000)
  } catch (err) {
    throw new Error(`API call failed: ${err.message}`)
  }

  const tryParse = (src) => {
    const m = src.match(/\{[\s\S]*\}/)
    if (!m) return null
    try { return JSON.parse(m[0]) } catch { return null }
  }

  // 1. Direct parse
  let result = tryParse(text)
  if (result) return result

  // 2. Repair and parse
  const repaired = repairJSON(text)
  if (repaired) {
    result = tryParse(repaired)
    if (result) return result
  }

  // 3. Retry with explicit prompt asking for valid JSON
  process.stdout.write('  ↻ JSON invalid, retrying...\n')
  await sleep(2000)
  let text2
  try {
    text2 = await callClaude(claudeSystem, [
      { role: 'user', content: prompt },
      { role: 'assistant', content: text.slice(0, 500) + '...[truncated]' },
      { role: 'user', content: 'Your previous response had invalid JSON. Please output the complete, valid JSON object from the beginning. Start immediately with { and end with }. No markdown.' },
    ], 4000)
  } catch (err) {
    throw new Error(`Retry API call failed: ${err.message}`)
  }

  result = tryParse(text2)
  if (result) return result

  const repaired2 = repairJSON(text2)
  if (repaired2) {
    result = tryParse(repaired2)
    if (result) return result
  }

  throw new Error(`JSON parse failed after repair and retry`)
}

// ── student simulation ────────────────────────────────────────────────────────

async function studentAnalysis(caseData, difficulty) {
  const sysPrompt = `You are a thoughtful 4th-year medical student. Given a clinical case, produce a structured solve plan. Return ONLY valid JSON.`

  const userMsg = `Case (${difficulty} difficulty):
Patient: ${caseData.patientInfo.age}yo ${caseData.patientInfo.gender}
CC: ${caseData.patientInfo.chiefComplaint}
HPI: ${caseData.hpi}
Vitals: BP ${caseData.vitals.bp}, HR ${caseData.vitals.hr}, RR ${caseData.vitals.rr}, Temp ${caseData.vitals.temp}°F, SpO2 ${caseData.vitals.spo2}%
Available labs: ${caseData.availableLabs?.join(', ')}
Available imaging: ${caseData.availableImaging?.join(', ')}

Return:
{
  "workingDiagnosis": "<top suspected diagnosis based on what you know>",
  "patientQuestions": ["<question 1>", "<question 2>", "<question 3>"],
  "testsToOrder": ["<exact lab or imaging name from available lists above>"],
  "finalDiagnosis": "<your final diagnosis>",
  "clinicalReasoning": "<3-5 sentences linking specific findings to diagnosis>"
}`

  const text = await callClaude(sysPrompt, [{ role: 'user', content: userMsg }], 700)
  const tryParse = (src) => { const m = src.match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]) } catch { return null } }
  const result = tryParse(text) ?? tryParse(repairJSON(text) ?? '')
  if (!result) throw new Error('No JSON in student analysis')
  return result
}

async function chatWithPatient(caseData, difficulty, conversation, question) {
  const fullHistorySection = (difficulty !== 'Foundations') && caseData.hiddenHistory?.fullHistory !== 'N/A'
    ? `\nYour complete history (reveal specific details only when directly asked):\n${caseData.hiddenHistory.fullHistory}`
    : ''

  const system = `You are roleplaying as a patient named ${caseData.patientInfo.name}, a ${caseData.patientInfo.age}-year-old ${caseData.patientInfo.gender} with "${caseData.patientInfo.chiefComplaint}".
What you told them: ${caseData.hpi}${fullHistorySection}
Only reveal other info if asked directly: social=${caseData.hiddenHistory?.socialHistory}, family=${caseData.hiddenHistory?.familyHistory}, meds=${caseData.hiddenHistory?.medications}, hidden=${caseData.hiddenHistory?.hiddenSymptoms}
Respond naturally as a patient. Use lay terms. 2-3 sentences. Stay in character.`

  const messages = [...conversation, { role: 'user', content: question }]
  return await callClaude(system, messages, 200)
}

async function gradeSubmission(caseData, difficulty, orderedTests, chatTranscript, diagnosis, reasoning) {
  let labLines = [], imagingLines = []
  for (const t of orderedTests) {
    const labKey = findKey(t, caseData.labResults)
    if (labKey) {
      const r = caseData.labResults[labKey]
      if (r?.components?.length > 0) {
        labLines.push(`${t}:\n` + r.components.map(c => `  ${c.name}: ${c.value} ${c.unit} [${c.status}]`).join('\n'))
      }
      continue
    }
    const imgKey = findKey(t, caseData.imagingResults)
    if (imgKey) { imagingLines.push(`${t}: ${caseData.imagingResults[imgKey]}`); continue }
    const procKey = findKey(t, caseData.procedureResults)
    if (procKey) { imagingLines.push(`${t}: ${caseData.procedureResults[procKey]}`); continue }
  }

  const gradingSystem = `You are a medical education evaluator. Grade this trainee's diagnostic performance fairly for their level. Return ONLY valid JSON.`

  const prompt = `Patient: ${caseData.patientInfo.age}yo ${caseData.patientInfo.gender}, CC: "${caseData.patientInfo.chiefComplaint}"
HPI: ${caseData.hpi}
Difficulty: ${difficulty}

Tests ordered:
${labLines.join('\n') || '(no labs)'}
${imagingLines.join('\n') || '(no imaging)'}

Chat transcript:
${chatTranscript || '(no interview)'}

${reasoning ? `Reasoning: ${reasoning}` : ''}
Submitted diagnosis: "${diagnosis}"
Correct diagnosis: "${caseData.diagnosis}"
Key questions: ${caseData.keyQuestions?.join(' | ')}

GRADING NOTE: Mark "correct": true if the trainee identifies the core syndrome/disease entity, even if they miss a qualifier (e.g., "STEMI" is correct even if the case says "Inferior STEMI"; "pneumonia" is correct even if the case says "right lower lobe CAP"). Only mark incorrect if the trainee names a fundamentally different diagnosis.
STEMI/NSTEMI: STEMI and NSTEMI are NOT clinically equivalent — they differ in ECG findings, management (cath lab activation vs. medical), and outcomes. A student who submits NSTEMI when the correct diagnosis is any form of STEMI (or vice versa) has made a fundamental error: set correct: false AND cap diagnosisAccuracy at 12/27. This overrides the general leniency rule.
PYELONEPHRITIS EQUIVALENTS: "Obstructive pyelonephritis," "complicated pyelonephritis with bacteremia," "urosepsis secondary to pyelonephritis," and "acute pyelonephritis with bacteremia" all describe the same core entity — mark any of them correct: true when the correct diagnosis is any variant of pyelonephritis.

Score (weights sum to 90):
- historyInterview: 0-18
- testOrdering: 0-18
- diagnosisAccuracy: 0-27
- diagnosisCompleteness: 0-13
- clinicalReasoning: 0-14

Return:
{
  "score": <MUST equal the exact arithmetic sum of the five dimension scores — do NOT calculate independently>,
  "correct": <true/false>,
  "feedback": "<2-3 sentences>",
  "dimensions": {
    "historyInterview": { "score": <0-18>, "feedback": "<1 sentence>" },
    "testOrdering": { "score": <0-18>, "feedback": "<1 sentence>" },
    "diagnosisAccuracy": { "score": <0-27>, "feedback": "<1 sentence>" },
    "diagnosisCompleteness": { "score": <0-13>, "feedback": "<1 sentence>" },
    "clinicalReasoning": { "score": <0-14>, "feedback": "<1 sentence>" }
  },
  "missedQuestions": ["<missed question>"],
  "teachingPoints": ${JSON.stringify(caseData.teachingPoints ?? [])},
  "differentials": ["<dx>: <1 sentence>"]
}`

  const text = await callClaude(gradingSystem, [{ role: 'user', content: prompt }], 2500)
  const tryParse = (src) => {
    const m = src.match(/\{[\s\S]*\}/)
    if (!m) return null
    try { return JSON.parse(m[0]) } catch { return null }
  }
  let result = tryParse(text)
  if (!result) result = tryParse(repairJSON(text) ?? '')
  if (!result) throw new Error('Could not parse grading JSON')
  // Always derive total from dimension sum — never trust Claude's independent calculation
  if (result.dimensions) {
    result.score = Object.values(result.dimensions).reduce((sum, d) => sum + (d?.score ?? 0), 0)
  }
  return result
}

// ── report generator ──────────────────────────────────────────────────────────

function printReport(results) {
  const total = ALL_CASES.length
  console.log('\n\n' + '═'.repeat(70))
  console.log('MEDTRAINER FULL AUDIT REPORT')
  console.log('═'.repeat(70))

  console.log('\n── SCORE SUMMARY ──────────────────────────────────────────────────────')
  console.log('System                    Foundations    Clinical       Advanced')
  console.log('─'.repeat(70))

  for (const system of SYSTEMS) {
    const row = [system.padEnd(25)]
    for (const diff of DIFFICULTIES) {
      const r = results.find(x => x.system === system && x.difficulty === diff)
      if (!r) { row.push('─'.padEnd(15)); continue }
      if (r.bugs?.some(b => b.includes('generation failed'))) { row.push('FAIL'.padEnd(15)); continue }
      const score = r.score !== undefined ? `${r.score}/90` : 'ERR'
      const correct = r.correct === true ? '✓' : r.correct === false ? '✗' : '?'
      row.push(`${correct} ${score}`.padEnd(15))
    }
    console.log(row.join(''))
  }

  console.log('\n── PER-DIFFICULTY STATISTICS ───────────────────────────────────────────')
  for (const diff of DIFFICULTIES) {
    const diffResults = results.filter(r => r.difficulty === diff && r.score !== undefined)
    if (!diffResults.length) { console.log(`${diff}: no data`); continue }
    const scores = diffResults.map(r => r.score)
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    const correct = diffResults.filter(r => r.correct).length
    console.log(`${diff}: avg ${avg}/90, min ${Math.min(...scores)}, max ${Math.max(...scores)}, accuracy ${correct}/${diffResults.length} (${Math.round(correct/diffResults.length*100)}%)`)
  }

  console.log('\n── ALL ISSUES FOUND ────────────────────────────────────────────────────')
  const issuesBySystem = {}
  let totalIssues = 0
  for (const r of results) {
    const key = r.system
    if (!issuesBySystem[key]) issuesBySystem[key] = []
    for (const issue of (r.issues ?? [])) { issuesBySystem[key].push(`[${r.difficulty}] ${issue}`); totalIssues++ }
    for (const bug of (r.bugs ?? [])) { issuesBySystem[key].push(`[${r.difficulty}] BUG: ${bug}`); totalIssues++ }
  }

  if (totalIssues === 0) {
    console.log('No issues found.')
  } else {
    for (const [system, issues] of Object.entries(issuesBySystem)) {
      if (!issues.length) continue
      console.log(`\n${system}:`)
      for (const issue of issues) console.log(`  · ${issue}`)
    }
  }

  console.log('\n── RECURRING PATTERNS ──────────────────────────────────────────────────')
  const allTexts = results.flatMap(r => [...(r.issues ?? []), ...(r.bugs ?? [])])
  const patterns = {}
  for (const t of allTexts) {
    const key = t.includes('HPI too long') || t.includes('HPI too short') ? 'HPI length violations'
      : t.includes('no matching result') || t.includes('orphaned') ? 'Test result matching gaps'
      : t.includes('score mismatch') ? 'Grading score mismatches'
      : t.includes('rare') || t.includes('subspecialty') ? 'Difficulty scope violations'
      : t.includes('generation failed') ? 'Case generation failures'
      : t.includes('Structure') || t.includes('Missing') ? 'JSON structure issues'
      : 'Other'
    patterns[key] = (patterns[key] ?? 0) + 1
  }
  for (const [k, v] of Object.entries(patterns).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v}× ${k}`)
  }

  console.log('\n── INCORRECT DIAGNOSES ─────────────────────────────────────────────────')
  const wrong = results.filter(r => r.correct === false)
  if (!wrong.length) {
    console.log('All diagnoses correct!')
  } else {
    for (const r of wrong) {
      console.log(`  [${r.difficulty}] ${r.system}: student="${r.studentDiagnosis}" | correct="${r.correctDiagnosis}"`)
    }
  }

  console.log('\n── NOTABLE HIGH/LOW SCORES ─────────────────────────────────────────────')
  const scored = results.filter(r => r.score !== undefined).sort((a, b) => b.score - a.score)
  if (scored.length > 0) {
    console.log('Top 5:')
    scored.slice(0, 5).forEach(r => console.log(`  ${r.score}/90 — [${r.difficulty}] ${r.system}: ${r.correctDiagnosis}`))
    console.log('Bottom 5:')
    scored.slice(-5).forEach(r => console.log(`  ${r.score}/90 — [${r.difficulty}] ${r.system}: ${r.correctDiagnosis}`))
  }

  console.log('\n── MISSED QUESTIONS (across all cases) ─────────────────────────────────')
  const allMissed = results.flatMap(r => r.grading?.missedQuestions ?? [])
  if (!allMissed.length) {
    console.log('No missed questions flagged.')
  } else {
    for (const q of allMissed.slice(0, 20)) console.log(`  · ${q}`)
  }

  console.log('\n── SUMMARY ──────────────────────────────────────────────────────────────')
  const completed = results.filter(r => r.generated)
  const failed = results.filter(r => !r.generated)
  console.log(`Cases run: ${results.length}/${total}`)
  console.log(`Cases generated successfully: ${completed.length}`)
  console.log(`Cases failed to generate: ${failed.length}`)
  console.log(`Cases with issues: ${results.filter(r => r.issues?.length || r.bugs?.length).length}`)
  console.log(`Total issues: ${totalIssues}`)
  console.log(`Overall accuracy: ${results.filter(r => r.correct).length}/${results.filter(r => r.correct !== undefined).length}`)
}

// ── main ──────────────────────────────────────────────────────────────────────

if (reportMode) {
  const results = loadResults()
  if (!results.length) {
    console.log('No results found. Run the audit first.')
  } else {
    printReport(results)
  }
  process.exit(0)
}

const savedResults = loadResults()
const casesToRun = ALL_CASES
  .map((c, i) => ({ ...c, caseNum: i + 1 }))
  .filter(c => c.caseNum >= FROM && c.caseNum <= TO)
  .filter(c => !savedResults.find(r => r.caseNum === c.caseNum && r.generated))

process.stdout.write(`Running cases ${FROM}-${TO} (${casesToRun.length} to do, ${savedResults.length} already saved)\n`)

for (const { difficulty, system, caseNum } of casesToRun) {
  const tag = `[${caseNum}/${ALL_CASES.length}] ${difficulty} · ${system}`
  process.stdout.write(`\n${'─'.repeat(70)}\n${tag}\n`)

  const caseResult = { caseNum, system, difficulty, generated: false, issues: [], bugs: [] }
  let caseData = null

  // Step 1: Generate
  try {
    caseData = await generateCase(system, difficulty)
    const structIssues = validateCase(caseData, system, difficulty)
    for (const i of structIssues) {
      process.stdout.write(`  ⚠ ${i}\n`)
      caseResult.issues.push(`[Structure] ${i}`)
    }
    caseResult.generated = true
    caseResult.correctDiagnosis = caseData.diagnosis
    caseResult.caseData = {
      diagnosis: caseData.diagnosis,
      hpiWords: caseData.hpi.trim().split(/\s+/).length,
      vitals: caseData.vitals,
      availableLabs: caseData.availableLabs,
      availableImaging: caseData.availableImaging,
    }
    process.stdout.write(`  ✓ Generated: ${caseData.patientInfo.name}, ${caseData.patientInfo.age}yo ${caseData.patientInfo.gender}\n`)
    process.stdout.write(`  Dx: ${caseData.diagnosis}\n`)
    process.stdout.write(`  HPI (${caseResult.caseData.hpiWords}w): ${caseData.hpi.slice(0, 100)}...\n`)
  } catch (err) {
    process.stdout.write(`  ✗ Generation failed: ${err.message}\n`)
    caseResult.bugs.push(`Case generation failed: ${err.message}`)
    saveResult(caseResult)
    await sleep(3000)
    continue
  }

  // Step 2: Student analysis
  let plan = null
  try {
    plan = await studentAnalysis(caseData, difficulty)
    process.stdout.write(`  Student Dx: ${plan.finalDiagnosis}\n`)
  } catch (err) {
    process.stdout.write(`  ⚠ Student analysis failed: ${err.message}\n`)
    plan = {
      workingDiagnosis: caseData.differentials?.[0] ?? 'Unknown',
      patientQuestions: ['How long have you had this?', 'Any associated symptoms?'],
      testsToOrder: (caseData.availableLabs ?? []).slice(0, 4).concat((caseData.availableImaging ?? []).slice(0, 2)),
      finalDiagnosis: caseData.differentials?.[0] ?? 'Unknown',
      clinicalReasoning: 'Based on presenting symptoms.',
    }
  }

  // Step 3: Patient interview (3/4/5 questions by difficulty)
  const numQuestions = difficulty === 'Foundations' ? 3 : difficulty === 'Clinical' ? 4 : 5
  const conversation = []
  const chatLines = []
  for (const question of (plan.patientQuestions ?? []).slice(0, numQuestions)) {
    try {
      const reply = await chatWithPatient(caseData, difficulty, conversation, question)
      conversation.push({ role: 'user', content: question })
      conversation.push({ role: 'assistant', content: reply })
      chatLines.push(`Physician: ${question}`)
      chatLines.push(`Patient: ${reply}`)
    } catch (err) {
      caseResult.issues.push(`Chat failed: ${err.message}`)
    }
  }
  process.stdout.write(`  ✓ Interviewed patient (${conversation.filter(m => m.role === 'user').length} questions)\n`)

  // Check test matching
  const requestedTests = plan.testsToOrder ?? []
  const unmatchedTests = requestedTests.filter(t => {
    const inLabs = caseData.availableLabs?.some(l => l.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(l.toLowerCase()))
    const inImaging = caseData.availableImaging?.some(i => i.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(i.toLowerCase()))
    const inResults = findKey(t, caseData.labResults) || findKey(t, caseData.imagingResults)
    return !inLabs && !inImaging && !inResults
  })
  if (unmatchedTests.length > 0) {
    caseResult.issues.push(`Student ordered tests not in available lists: ${unmatchedTests.join(', ')}`)
  }

  // Check orphaned labs (in availableLabs but missing from labResults)
  for (const lab of (caseData.availableLabs ?? [])) {
    if (!findKey(lab, caseData.labResults)) {
      caseResult.issues.push(`Lab "${lab}" in availableLabs has no result in labResults`)
    }
  }
  for (const img of (caseData.availableImaging ?? [])) {
    if (!findKey(img, caseData.imagingResults) && !findKey(img, caseData.procedureResults)) {
      caseResult.issues.push(`Imaging "${img}" in availableImaging has no result in imagingResults/procedureResults`)
    }
  }

  // HPI length check
  const wordCount = caseResult.caseData.hpiWords
  if (difficulty === 'Foundations' && wordCount < 30) {
    caseResult.issues.push(`Foundations HPI too short: ${wordCount} words (should be 40+)`)
  }
  if (difficulty === 'Clinical' && wordCount > 60) {
    caseResult.issues.push(`Clinical HPI too long: ${wordCount} words (should be ≤40)`)
  }
  if (difficulty === 'Advanced' && wordCount > 35) {
    caseResult.issues.push(`Advanced HPI too long: ${wordCount} words (should be ≤20)`)
  }

  // Differential count check
  if ((caseData.differentials?.length ?? 0) < 3) {
    caseResult.issues.push(`Only ${caseData.differentials?.length ?? 0} differentials (should be 3-5)`)
  }

  // Step 4: Use matched tests or fall back to all available
  const matchedTests = requestedTests.filter(t => !unmatchedTests.includes(t))
  const testsToGrade = matchedTests.length >= 2 ? matchedTests :
    (caseData.availableLabs ?? []).slice(0, 4).concat((caseData.availableImaging ?? []).slice(0, 2))

  // Step 5: Grade
  try {
    const grading = await gradeSubmission(
      caseData, difficulty, testsToGrade,
      chatLines.join('\n'),
      plan.finalDiagnosis,
      difficulty !== 'Foundations' ? plan.clinicalReasoning : ''
    )

    const dimSum = Object.values(grading.dimensions ?? {}).reduce((s, d) => s + (d.score ?? 0), 0)
    if (Math.abs(dimSum - (grading.score ?? 0)) > 5) {
      caseResult.issues.push(`Grading score mismatch: dimensions sum ${dimSum} vs reported ${grading.score}`)
    }
    if (grading.correct && grading.score < 40) {
      caseResult.issues.push(`Correct Dx but very low score (${grading.score}/90) — grader may be mis-calibrated`)
    }
    if (!grading.correct && grading.score > 80) {
      caseResult.issues.push(`Wrong Dx but high score (${grading.score}/90) — grader may be too generous`)
    }

    caseResult.grading = grading
    caseResult.studentDiagnosis = plan.finalDiagnosis
    caseResult.score = grading.score
    caseResult.correct = grading.correct

    const flag = grading.correct ? '✓ CORRECT' : '✗ INCORRECT'
    process.stdout.write(`  ${flag} — Score: ${grading.score}/90\n`)
    process.stdout.write(`  ${grading.feedback?.slice(0, 120)}\n`)
  } catch (err) {
    process.stdout.write(`  ✗ Grading failed: ${err.message}\n`)
    caseResult.bugs.push(`Grading failed: ${err.message}`)
  }

  saveResult(caseResult)
  await sleep(3000) // rate limit: 8000 output tokens/min; give the bucket time to refill
}

// Print report for cases we ran
const allResults = loadResults()
const rangeResults = allResults.filter(r => r.caseNum >= FROM && r.caseNum <= TO)
printReport(rangeResults)

if (FROM === 1 && TO === ALL_CASES.length) {
  process.stdout.write('\nAll 36 cases complete. Full results saved to scripts/audit_results.json\n')
} else {
  process.stdout.write(`\nBatch ${FROM}-${TO} complete. Run next batch or --report for full summary.\n`)
}
