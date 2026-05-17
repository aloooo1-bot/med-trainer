/**
 * Extra rule audit — checks rules not covered by audit-library.mjs.
 *
 * Checks per case (machine-verifiable only):
 *   1. availableLabs ⇄ labResults key exact-match (both directions)
 *   2. labGroups coverage (every availableLabs entry in exactly one group)
 *   3. differentialExplanations.length === differentials.length
 *   4. WHIPPLE'S BIOPSY RULE
 *   5. CLL DISCRIMINATOR RULE
 *   6. WALDENSTRÖM DISCRIMINATOR RULE
 *   7. CARDIAC TEST RULE (ECG present when chest pain / dyspnea / syncope)
 *   8. INTERPRETATION OBJECTIVITY for non-physicalExam narrative fields
 *   9. MANAGEMENT TEACHING POINT (heuristic: dose pattern or threshold)
 *
 * Usage:
 *   node scripts/audit-rules-extra.mjs
 *   node scripts/audit-rules-extra.mjs --system Cardiovascular
 *   node scripts/audit-rules-extra.mjs --difficulty Advanced
 *   node scripts/audit-rules-extra.mjs --output extra-rules-report.json
 *
 * Writes: scripts/extra-rules-report.json
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

const args = process.argv.slice(2)
function getArg(flag) { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
const filterSystem     = getArg('--system')
const filterDifficulty = getArg('--difficulty')
const outputPath       = path.resolve(ROOT, getArg('--output') ?? 'scripts/extra-rules-report.json')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function fetchCases() {
  const rows = []
  let offset = 0
  const pageSize = 100
  while (true) {
    let q = supabase.from('cases').select('id, system, difficulty, diagnosis, case_data')
      .eq('is_generated', true).range(offset, offset + pageSize - 1)
    if (filterSystem)     q = q.eq('system', filterSystem)
    if (filterDifficulty) q = q.eq('difficulty', filterDifficulty)
    const { data, error } = await q
    if (error) throw new Error(`Supabase: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }
  return rows
}

// ── Interpretation objectivity patterns (from sanitize-case-disclosure.mjs) ───
const DISCLOSURE_PATTERNS = [
  /\bconsistent with\b/i,
  /\bsuggestive of\b/i,
  /\bsuggesting\b/i,
  /\bindicative of\b/i,
  /\bindicating\b/i,
  /\bcompatible with\b/i,
  /\bcharacteristic of\b/i,
  /\bdiagnostic of\b/i,
  /\bconcerning for\b/i,
  /\bfindings of\b/i,
]
const NARRATIVE_FIELDS = ['hematologyFindings', 'urineFindings', 'fundusFindings', 'skinFindings', 'biopsyFindings']

function checkInterpretationObjectivity(c, diagnosis) {
  const flags = []
  const isStemi = /\bSTEMI\b/i.test(diagnosis ?? '')

  for (const [key, val] of Object.entries(c.imagingResults ?? {})) {
    for (const p of DISCLOSURE_PATTERNS) {
      if (p.test(val)) { flags.push(`imagingResults["${key}"]: disclosure phrase`); break }
    }
  }
  for (const [key, val] of Object.entries(c.procedureResults ?? {})) {
    for (const p of DISCLOSURE_PATTERNS) {
      if (p.test(val)) { flags.push(`procedureResults["${key}"]: disclosure phrase`); break }
    }
  }
  for (const field of NARRATIVE_FIELDS) {
    const val = c[field]
    if (!val || typeof val !== 'string') continue
    for (const p of DISCLOSURE_PATTERNS) {
      if (p.test(val)) { flags.push(`${field}: disclosure phrase`); break }
    }
  }
  for (const rt of (c.relevantTests ?? [])) {
    if (!rt.imagingResult) continue
    const skip = isStemi && rt.name?.toLowerCase().includes('ecg')
    if (!skip) {
      for (const p of DISCLOSURE_PATTERNS) {
        if (p.test(rt.imagingResult)) { flags.push(`relevantTests["${rt.name}"].imagingResult: disclosure phrase`); break }
      }
    }
  }
  if (!isStemi && c.ecgFindings) {
    for (const p of DISCLOSURE_PATTERNS) {
      if (p.test(c.ecgFindings)) { flags.push(`ecgFindings: disclosure phrase (non-STEMI case)`); break }
    }
  }
  return flags
}

// ── Management teaching point heuristic ───────────────────────────────────────
const DOSE_PATTERN      = /\b\d+(\.\d+)?\s*(mg|mcg|g|mEq|mL|mmol|units?|IU)\b/i
const THRESHOLD_PATTERN = /[<>≤≥]\s*\d+/
const DRUG_KEYWORDS     = /\b(antibiotic|antifungal|anticoagul|heparin|warfarin|apixaban|rivaroxaban|aspirin|statin|atorvastatin|metformin|insulin|thrombolytic|tPA|alteplase|corticosteroid|prednisone|dexamethasone|vancomycin|ceftriaxone|piperacillin|meropenem|azithromycin|amoxicillin|ciprofloxacin|metoprolol|labetalol|lisinopril|amlodipine|nitroglycerin|epinephrine|atropine|naloxone|flumazenil|N-acetylcysteine|NAC|FFP|platelets|PRBC|transfus|dialysis|cardioversion|defibrillation|intubat|vasopressor|norepinephrine|dopamine|dobutamine|rituximab|ibrutinib|venetoclax|ruxolitinib|obinutuzumab|bortezomib|lenalidomide|thalidomide|imatinib|levothyroxine|methimazole|propylthiouracil|propranolol|allopurinol|febuxostat|colchicine|hydroxychloroquine|methotrexate|sulfasalazine|leflunomide|ivermectin|albendazole|mebendazole|TMP-SMX|trimethoprim|doxycycline|tetracycline|clindamycin|fluconazole|voriconazole|itraconazole|amphotericin|acyclovir|valacyclovir|oseltamivir|lithium|valproate|olanzapine|quetiapine|haloperidol|risperidone|aripiprazole|ferrous|iron supplement|iron infusion|IV iron|thiamine|folate|vitamin B12|cyanocobalamin|cholestyramine|ursodeoxycholic|pyridoxine|eculizumab|ravulizumab|hydroxyurea|hydroxycarbamide|physostigmine|hemin|hematin|IVIG|immunoglobulin|opioid|morphine|oxycodone|hydromorphone|fentanyl|ketamine|phenobarbital|phenytoin|levetiracetam|lamotrigine|carbamazepine|antiepileptic|antiretroviral|tacrolimus|cyclosporine|mycophenolate|azathioprine|cyclophosphamide|secukinumab|adalimumab|infliximab|dupilumab|omalizumab)\b/i
// Procedural management: handles cases where treatment is a procedure, not a drug
const PROCEDURE_KEYWORDS = /\b(chest tube|tube thoracostomy|needle aspiration|needle decompression|paracentesis|thoracentesis|pericardiocentesis|lumbar puncture|bone marrow|pericardial window|fasciotomy|laminectomy|discectomy|surgical decompression|decompressive|escharotomy|colectomy|gastrectomy|nephrectomy|splenectomy|hepatic resection|abscess drainage|incision and drainage|debridement|ERCP|endoscopy|bronchoscopy|upper endoscopy|EGD|colonoscopy|cystoscopy|angiography|embolization|thrombectomy|endarterectomy|stent|pacemaker|ICD|ablation|cardiovert|plasmapheresis|plasma exchange|physical therapy|radiation therapy|chemotherapy|stem cell transplant|bone marrow transplant|liver transplant|kidney transplant)\b/i

function checkManagementTeachingPoint(c) {
  const points = c.teachingPoints ?? []
  for (const pt of points) {
    if (
      DOSE_PATTERN.test(pt) ||
      THRESHOLD_PATTERN.test(pt) ||
      DRUG_KEYWORDS.test(pt) ||
      PROCEDURE_KEYWORDS.test(pt)
    ) return true
  }
  return false
}

// ── Main check function ───────────────────────────────────────────────────────
function auditCase(row) {
  const c = row.case_data
  const diagnosis = row.diagnosis ?? c?.diagnosis ?? ''
  const flags = []
  if (!c) { flags.push('CRITICAL: case_data null'); return flags }

  // 1. availableLabs ⇄ labResults exact-key (both directions)
  if (c.availableLabs && c.labResults) {
    for (const lab of c.availableLabs) {
      if (!Object.prototype.hasOwnProperty.call(c.labResults, lab)) {
        flags.push(`labResults missing key for availableLab: "${lab.substring(0,60)}"`)
      }
    }
    for (const key of Object.keys(c.labResults)) {
      if (!c.availableLabs.includes(key)) {
        flags.push(`labResults has key not in availableLabs: "${key.substring(0,60)}"`)
      }
    }
  }

  // 2. labGroups coverage
  if (c.labGroups && c.availableLabs) {
    const grouped = new Set(c.labGroups.flatMap(g => g.tests ?? []))
    for (const lab of c.availableLabs) {
      if (!grouped.has(lab)) flags.push(`availableLab not in any labGroup: "${lab.substring(0,60)}"`)
    }
  }

  // 3. differentialExplanations length parity
  const diffs = c.differentials?.length ?? 0
  const exps  = c.differentialExplanations?.length ?? 0
  if (diffs > 0 && exps > 0 && diffs !== exps) {
    flags.push(`differentialExplanations length ${exps} ≠ differentials length ${diffs}`)
  }

  // 4. WHIPPLE'S BIOPSY RULE
  if (/whipple/i.test(diagnosis)) {
    const procKeys = Object.keys(c.procedureResults ?? {}).join(' ')
    const procVals = Object.values(c.procedureResults ?? {}).join(' ')
    const hasEGD = /endoscop|EGD/i.test(procKeys) || /endoscop|EGD/i.test(procKeys + ' ' + (c.availableImaging ?? []).join(' '))
    const hasPAS = /PAS.{0,20}positive|PAS.{0,20}macrophage|macrophage.{0,20}PAS/i.test(procVals)
    if (!hasEGD) flags.push("WHIPPLE'S: EGD missing from availableImaging/procedureResults")
    if (!hasPAS) flags.push("WHIPPLE'S: PAS-positive macrophages not described in procedureResults")
  }

  // 5. CLL DISCRIMINATOR RULE
  if (/chronic lymphocytic|\bCLL\b/i.test(diagnosis)) {
    const labKeys = Object.keys(c.labResults ?? {}).join(' ')
    const labVals = JSON.stringify(c.labResults ?? {})
    const hasFlow = /flow cytometry/i.test(labKeys) || /flow cytometry/i.test((c.availableLabs ?? []).join(' '))
    const hasCd   = /CD5.*CD19|CD19.*CD5|CD23/i.test(labVals)
    if (!hasFlow) flags.push('CLL: Flow Cytometry missing from availableLabs/labResults')
    if (!hasCd)   flags.push('CLL: CD5+/CD19+/CD23+ immunophenotype missing in Flow Cytometry result')
  }

  // 6. WALDENSTRÖM DISCRIMINATOR RULE
  if (/waldenstr/i.test(diagnosis)) {
    const labKeys = Object.keys(c.labResults ?? {}).join(' ')
    const labVals = JSON.stringify(c.labResults ?? {})
    const hasSpep = /SPEP|protein electrophoresis/i.test(labKeys) || /SPEP|protein electrophoresis/i.test((c.availableLabs ?? []).join(' '))
    const hasIgM  = /IgM/i.test(labVals)
    const allText = JSON.stringify(c.hiddenHistory ?? '') + ' ' + JSON.stringify(c.hiddenHistory?.fullHistory ?? '')
    const hasHypervisc = /blurred vision|headache|epistaxis|neurolog/i.test(allText)
    if (!hasSpep)       flags.push('WALDENSTRÖM: SPEP missing from availableLabs')
    if (!hasIgM)        flags.push('WALDENSTRÖM: IgM monoclonal spike not in SPEP result')
    if (!hasHypervisc)  flags.push('WALDENSTRÖM: no hyperviscosity symptom in hiddenHistory')
  }

  // 7. CARDIAC TEST RULE
  const cc = (c.patientInfo?.chiefComplaint ?? c.diagnosis ?? '').toLowerCase()
  if (/chest pain|dyspnea|shortness of breath|syncope|palpitation/i.test(cc)) {
    const hasECG = (c.availableImaging ?? []).some(img => /ECG|EKG|electrocardiogram/i.test(img))
    if (!hasECG) flags.push('CARDIAC TEST RULE: ECG missing from availableImaging for chest pain/dyspnea/syncope case')
  }

  // 8. INTERPRETATION OBJECTIVITY (non-physicalExam fields)
  flags.push(...checkInterpretationObjectivity(c, diagnosis))

  // 9. MANAGEMENT TEACHING POINT
  // Skip purely radiographic/descriptive diagnoses where no specific treatment is expected
  const isPurelyRadiographic = /\bnormal\b.*\bradiograph|\bradiograph.*\bnormal\b|^normal chest|^normal radiograph|incidental|^cardiomegaly|^left atrial.*enlargement|surgical clip/i.test(diagnosis)
  if (!isPurelyRadiographic && (c.teachingPoints?.length ?? 0) > 0 && !checkManagementTeachingPoint(c)) {
    flags.push('MANAGEMENT TEACHING POINT: no teaching point contains a concrete management directive')
  }

  return flags
}

// ── Run ───────────────────────────────────────────────────────────────────────
console.log('Fetching cases…')
const rows = await fetchCases()
console.log(`Auditing ${rows.length} cases…`)

const results = rows.map(row => {
  const flags = auditCase(row)
  return { id: row.id, system: row.system, difficulty: row.difficulty, diagnosis: row.diagnosis, flags }
})

const flagged = results.filter(r => r.flags.length > 0)
const byType = {}
for (const r of flagged) for (const f of r.flags) {
  const key = f.replace(/[:"].*/,'').trim()
  byType[key] = (byType[key] ?? 0) + 1
}

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))

console.log(`\n═══ RESULTS ═══`)
console.log(`  Total audited:  ${results.length}`)
console.log(`  Cases flagged:  ${flagged.length} (${((flagged.length/results.length)*100).toFixed(1)}%)`)
console.log(`  Cases clean:    ${results.length - flagged.length}`)
console.log(`\n═══ FLAG BREAKDOWN ═══`)
for (const [k, v] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${v.toString().padStart(3)}  ${k}`)
}
console.log(`\nReport written to: ${outputPath}`)
