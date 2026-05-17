/**
 * Phase A — Student Solver
 * Generates and solves 36 cases (12 systems × 3 difficulties) as a 3rd-year
 * medical student. Captures full transcripts and seeds Supabase case_sessions.
 *
 * Forked from scripts/full_audit.mjs — do NOT modify the original.
 */

import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { buildRubricPrompt, GRADING_SYSTEM_PROMPT } from '../../app/grading/rubric.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '..', '..', '.env.local') })

import Anthropic from '@anthropic-ai/sdk'
import { transcriptPath, writeJSON, readJSON } from './lib/artifacts.mjs'
import { STUDENT_SYSTEM, buildStudentAnalysisPrompt } from './lib/student-prompt.mjs'
import { seedSession, seedRating, seedCaseReport } from './lib/seed-session.mjs'

const MODEL = 'claude-sonnet-4-6'
let _anthropic = null
function getClient() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

const SYSTEMS = [
  'Cardiovascular', 'Respiratory', 'Neurologic', 'Gastrointestinal', 'Renal',
  'Endocrine / Metabolic', 'Infectious', 'Hematologic / Oncologic',
  'Musculoskeletal', 'Psychiatric', 'Toxicologic', 'Trauma',
]
const DIFFICULTIES = ['Foundations', 'Clinical', 'Advanced']

const ALL_CASES = []
for (const difficulty of DIFFICULTIES) {
  for (const system of SYSTEMS) {
    ALL_CASES.push({ difficulty, system })
  }
}

// ── helpers (lifted from full_audit.mjs) ─────────────────────────────────────

async function callClaude(system, messages, maxTokens = 800) {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
  })
  return res.content[0].text
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
  let raw = text.slice(start)
  raw = raw.replace(/"(unit|status|referenceRange|name|source|label)":\s*([^",}\]\n{[\s][^",}\]\n{[]*?)(\s*[,}\]])/g,
    (m, key, val, tail) => {
      const v = val.trim()
      if (!v || v.startsWith('"') || v === 'true' || v === 'false' || v === 'null') return m
      if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) return m
      return `"${key}": "${v}"${tail}`
    })
  raw = raw.replace(/,(\s*[}\]])/g, '$1')
  let inString = false, escape = false
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
      if (stack.length > 0) { stack.pop(); if (stack.length === 0) lastCompleteEnd = i }
    }
  }
  let json
  if (stack.length === 0 && lastCompleteEnd !== -1) {
    json = raw.slice(0, lastCompleteEnd + 1)
  } else {
    let truncated = inString ? raw.replace(/"[^"]*$/, '') : raw
    truncated = truncated.replace(/,?\s*"[^"]*"?\s*(?::\s*[^,}\]\n]*)?$/, '')
    truncated = truncated.replace(/,(\s*[}\]])/g, '$1').replace(/,\s*$/, '')
    json = truncated + stack.reverse().join('')
  }
  return json
}

function tryParse(src) {
  if (!src) return null
  const m = src.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

// ── Name-uniqueness helpers (mirrors app/lib/generators/shared.ts) ───────────

function buildExcludedNamesBlock(usedNames) {
  if (!usedNames?.length) return ''
  const recent = usedNames.slice(-50)
  const lines = recent.map(n => `- ${n}`).join('\n')
  return `\nEXCLUDED NAMES — do NOT reuse any of these first OR last names; pick fresh ones from a different ethnic naming pool:\n${lines}\n`
}

function nameCollides(generated, usedNames) {
  const tokenize = s => s.toLowerCase().split(/\s+/).filter(t => t.length > 1)
  const usedTokens = new Set(usedNames.flatMap(tokenize))
  return tokenize(generated).some(t => usedTokens.has(t))
}

// ── Case generation (from full_audit.mjs, unchanged) ─────────────────────────

async function generateCase(system, difficulty, usedNames = []) {
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

  const buildPrompt = (excluded) => `Generate a ${system} clinical case at ${difficulty} difficulty.

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
RENAL STONE PASSAGE RULE: Teaching points about kidney/ureteral stones MUST state: ≤4mm stones pass spontaneously in ~80-90% of cases; 4-6mm stones pass in ~50-60%. NEVER attribute the ~90% passage rate to "<5mm" stones.
STI DUAL THERAPY RULE: When the case involves gonorrhea, teaching points MUST specify that ceftriaxone 500mg IM monotherapy is appropriate ONLY when chlamydia NAAT is negative. If chlamydia co-infection has NOT been ruled out by NAAT, add doxycycline 100mg BID × 7 days. NEVER call ceftriaxone monotherapy "dual therapy".
CRITERIA COUNT CONSISTENCY RULE: When a teaching point states "this patient meets N criteria" (DSM-5, Rome criteria, SIRS, etc.), the immediately following parenthetical enumeration MUST list exactly N items. Count the list before writing the number.
TIME-DEPENDENT REFERENCE RANGE RULE: When a lab result's interpretation depends on time post-event (acetaminophen/Rumack-Matthew nomogram, troponin kinetics, lactate clearance), the labResults referenceRange MUST include the time anchor or a note that the cutoff is time-dependent. A single fixed threshold is forbidden when the reference range varies with time since ingestion or onset.
IMAGING MODALITY CONSISTENCY RULE: Non-contrast CT imagingResults MUST NOT reference contrast extravasation, vascular blush, contrast enhancement, or perfusion defects. Match every finding in imagingResults to what the stated modality can physically detect.
STEMI MIMIC PROTOCOL RULE: When a case ECG shows ST elevation meeting STEMI criteria (≥2mm in ≥2 contiguous leads), teachingPoints MUST state: (1) STEMI protocol activation is the immediate required action, and (2) the final diagnosis (Prinzmetal's, pericarditis, takotsubo, etc.) is a diagnosis of exclusion AFTER urgent ACS workup.
ADVANCED CONFIRMATORY TEST RULE: Advanced difficulty cases MUST include the gold-standard confirmatory test for the primary diagnosis in availableImaging or availableLabs (e.g., coronary angiography for Prinzmetal's; EEG for status epilepticus; muscle biopsy for inflammatory myopathy).
${buildExcludedNamesBlock(excluded)}IMPORTANT: vitals.temp must be in Fahrenheit (normal is 98.6°F — never output Celsius values like 36-38).`

  let text
  try {
    text = await callClaude(claudeSystem, [{ role: 'user', content: buildPrompt(usedNames) }], 4000)
  } catch (err) {
    throw new Error(`API call failed: ${err.message}`)
  }
  let result = tryParse(text) ?? tryParse(repairJSON(text))
  if (result) {
    const generatedName = result.patientInfo?.name ?? ''
    if (generatedName && nameCollides(generatedName, usedNames)) {
      process.stdout.write('  ↻ Name collision, retrying with exclusion...\n')
      try {
        const retryText = await callClaude(claudeSystem, [{ role: 'user', content: buildPrompt([...usedNames, generatedName]) }], 4000)
        const retryResult = tryParse(retryText) ?? tryParse(repairJSON(retryText))
        if (retryResult) return retryResult
      } catch { /* collision retry failed — fall through and return original */ }
    }
    return result
  }
  process.stdout.write('  ↻ JSON invalid, retrying...\n')
  await sleep(2000)
  let text2
  try {
    text2 = await callClaude(claudeSystem, [
      { role: 'user', content: buildPrompt(usedNames) },
      { role: 'assistant', content: text.slice(0, 500) + '...[truncated]' },
      { role: 'user', content: 'Your previous response had invalid JSON. Please output the complete, valid JSON object from the beginning. Start immediately with { and end with }. No markdown.' },
    ], 4000)
  } catch (err) {
    throw new Error(`Retry failed: ${err.message}`)
  }
  result = tryParse(text2) ?? tryParse(repairJSON(text2))
  if (result) return result
  throw new Error('JSON parse failed after repair and retry')
}

// ── Student analysis (uses STUDENT_SYSTEM persona, no meta-awareness) ─────────

async function studentAnalysis(caseData, difficulty) {
  const text = await callClaude(STUDENT_SYSTEM, [
    { role: 'user', content: buildStudentAnalysisPrompt(caseData, difficulty) }
  ], 800)
  const result = tryParse(text) ?? tryParse(repairJSON(text))
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

  const h = caseData.hiddenHistory ?? {}
  const backgroundHistory = [
    h.fullHistory && h.fullHistory !== 'N/A' ? `Full History: ${h.fullHistory}` : null,
    h.socialHistory  ? `Social: ${h.socialHistory}`       : null,
    h.familyHistory  ? `Family: ${h.familyHistory}`       : null,
    h.medications    ? `Medications: ${h.medications}`    : null,
    h.hiddenSymptoms ? `Hidden symptoms: ${h.hiddenSymptoms}` : null,
    h.allergies      ? `Allergies: ${h.allergies}`        : null,
  ].filter(Boolean).join('\n')

  const prompt = buildRubricPrompt({
    patientInfo: `${caseData.patientInfo.age}yo ${caseData.patientInfo.gender}, CC: "${caseData.patientInfo.chiefComplaint}"`,
    hpi: caseData.hpi,
    backgroundHistory,
    difficulty,
    orderedLabResults: labLines.join('\n'),
    orderedImagingResults: imagingLines.join('\n'),
    chatSummary: chatTranscript || '',
    reasoningText: reasoning || '',
    submittedDiagnosis: diagnosis,
    correctDiagnosis: caseData.diagnosis,
    keyQuestions: caseData.keyQuestions ?? [],
    teachingPoints: caseData.teachingPoints ?? [],
    differentials: caseData.differentials ?? [],
    expectedLabs: caseData.expectedLabs ?? [],
    expectedImaging: caseData.expectedImaging ?? [],
    supplementaryTests: caseData.supplementaryTests ?? [],
    prePresentedInfo: '',
    timedOut: false,
  })

  const text = await callClaude(GRADING_SYSTEM_PROMPT, [{ role: 'user', content: prompt }], 2500)
  let result = tryParse(text) ?? tryParse(repairJSON(text))
  if (!result) throw new Error('Could not parse grading JSON')
  if (result.dimensions) {
    result.score = Object.values(result.dimensions).reduce((sum, d) => sum + (d?.score ?? 0), 0)
  }
  return result
}

// ── Main solver export ────────────────────────────────────────────────────────

export async function runSolver({ smoke = false, targeted = false, keep = false } = {}) {
  const userId = process.env.STUDENT_AUDIT_USER_ID
  if (!userId) throw new Error('STUDENT_AUDIT_USER_ID not set in .env.local')

  const casesToRun = ALL_CASES
    .map((c, i) => ({ ...c, caseNum: i + 1 }))
    .filter(c =>
      smoke    ? (c.caseNum === 1 || c.caseNum === 25) : // Foundations Cardio + Advanced Cardio
      targeted ? c.difficulty === 'Foundations'         : // 1 per system, 12 total
      true
    )

  const toRun = keep
    ? casesToRun.filter(c => !fs.existsSync(transcriptPath(c.caseNum)))
    : casesToRun

  console.log(`Solving ${toRun.length} cases as 3rd-year student Alex Chen...`)

  const usedNames = []
  let caseIndex = 0
  for (const { difficulty, system, caseNum } of toRun) {
    const tag = `[${caseNum}/${ALL_CASES.length}] ${difficulty} · ${system}`
    process.stdout.write(`\n${'─'.repeat(60)}\n${tag}\n`)

    let caseData = null
    const transcript = { caseNum, system, difficulty, transcript: [], testsOrdered: [], diagnosis: '', reasoning: '', studentNotes: '' }

    // Step 1: Generate
    try {
      caseData = await generateCase(system, difficulty, usedNames)
      transcript.caseData = caseData
      transcript.correctDiagnosis = caseData.diagnosis
      if (caseData.patientInfo?.name) usedNames.push(caseData.patientInfo.name)
      process.stdout.write(`  ✓ ${caseData.patientInfo.name}, ${caseData.patientInfo.age}yo — Dx: ${caseData.diagnosis}\n`)
    } catch (err) {
      process.stdout.write(`  ✗ Generation failed: ${err.message}\n`)
      transcript.error = `Generation failed: ${err.message}`
      writeJSON(transcriptPath(caseNum), transcript)
      await sleep(3000)
      caseIndex++
      continue
    }

    // Step 2: Student analysis
    let plan = null
    try {
      plan = await studentAnalysis(caseData, difficulty)
      transcript.workingDiagnosis = plan.workingDiagnosis
      transcript.clinicalImpression = plan.clinicalImpression
      transcript.studentNotes = plan.studentNotes ?? ''
      process.stdout.write(`  Student working Dx: ${plan.workingDiagnosis}\n`)
    } catch (err) {
      process.stdout.write(`  ⚠ Student analysis failed: ${err.message}\n`)
      plan = {
        workingDiagnosis: caseData.differentials?.[0] ?? 'Unknown',
        clinicalImpression: 'Unable to generate initial impression.',
        patientQuestions: ['How long have you had this?', 'Any associated symptoms?'],
        testsToOrder: (caseData.availableLabs ?? []).slice(0, 4).concat((caseData.availableImaging ?? []).slice(0, 2)),
        finalDiagnosis: caseData.differentials?.[0] ?? 'Unknown',
        clinicalReasoning: 'Based on presenting symptoms.',
        studentNotes: '',
      }
    }

    // Step 3: Patient interview
    const numQuestions = difficulty === 'Foundations' ? 3 : difficulty === 'Clinical' ? 4 : 5
    const conversation = []
    const chatLines = []
    for (const question of (plan.patientQuestions ?? []).slice(0, numQuestions)) {
      try {
        const reply = await chatWithPatient(caseData, difficulty, conversation, question)
        conversation.push({ role: 'user', content: question })
        conversation.push({ role: 'assistant', content: reply })
        chatLines.push(`Student: ${question}`)
        chatLines.push(`Patient: ${reply}`)
        transcript.transcript.push({ role: 'student', content: question })
        transcript.transcript.push({ role: 'patient', content: reply })
      } catch (err) {
        process.stdout.write(`  ⚠ Chat error: ${err.message}\n`)
      }
    }

    // Step 4: Tests ordered
    const requestedTests = plan.testsToOrder ?? []
    transcript.testsOrdered = requestedTests
    const unmatchedTests = requestedTests.filter(t => {
      const inLabs = caseData.availableLabs?.some(l => l.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(l.toLowerCase()))
      const inImaging = caseData.availableImaging?.some(i => i.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(i.toLowerCase()))
      const inResults = findKey(t, caseData.labResults) || findKey(t, caseData.imagingResults)
      return !inLabs && !inImaging && !inResults
    })
    if (unmatchedTests.length) {
      transcript.unmatchedTests = unmatchedTests
    }

    // Step 5: Grade
    const matchedTests = requestedTests.filter(t => !unmatchedTests.includes(t))
    const testsToGrade = matchedTests.length >= 2 ? matchedTests :
      (caseData.availableLabs ?? []).slice(0, 4).concat((caseData.availableImaging ?? []).slice(0, 2))

    transcript.diagnosis = plan.finalDiagnosis
    transcript.reasoning = plan.clinicalReasoning ?? ''

    let grading = null
    try {
      grading = await gradeSubmission(
        caseData, difficulty, testsToGrade,
        chatLines.join('\n'),
        plan.finalDiagnosis,
        difficulty !== 'Foundations' ? plan.clinicalReasoning : ''
      )
      transcript.grading = grading
      transcript.score = grading.score
      transcript.correct = grading.correct
      const flag = grading.correct ? '✓ CORRECT' : '✗ INCORRECT'
      process.stdout.write(`  ${flag} — Score: ${grading.score}/100\n`)
    } catch (err) {
      process.stdout.write(`  ✗ Grading failed: ${err.message}\n`)
      transcript.gradingError = err.message
    }

    writeJSON(transcriptPath(caseNum), transcript)

    // Step 6: Seed Supabase (only if grading succeeded)
    if (grading && userId) {
      const doBookmark = (caseIndex % 5 === 0)
      const doNote = (caseIndex % 7 === 0) ? `Review: ${caseData.diagnosis} — ${difficulty} case` : ''
      try {
        await seedSession({
          userId, caseData, transcript, grading,
          caseIndex, totalCases: toRun.length,
          bookmark: doBookmark, notes: doNote,
        })
        if (caseIndex % 8 === 0) await seedRating({ userId, caseData, transcript, grading })
        if (caseIndex === 1) await seedCaseReport({ userId, caseData, transcript })
        process.stdout.write(`  ✓ Seeded case_sessions\n`)
      } catch (err) {
        process.stdout.write(`  ⚠ Seed failed: ${err.message}\n`)
      }
    }

    caseIndex++
    await sleep(3000) // rate limit: 8000 output tokens/min
  }

  console.log(`\nSolver complete. Transcripts: scripts/student-audit/artifacts/transcripts/`)
}
