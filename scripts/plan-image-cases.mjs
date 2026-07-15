/**
 * Image-first case COVERAGE PLANNER.
 *
 * Answers: "what distinct case types can my local image library support, one
 * per image type, without duplicate diagnoses?" — and how many images are
 * surplus (redundant for case-building).
 *
 * It joins the local image datasets against the combo map (one category → one
 * diagnosis) and reports, per category:
 *   - the target diagnosis + how many cases warranted (default 1)
 *   - images available vs consumed vs surplus
 *   - categories with images but NO diagnosis mapping (→ no case; e.g. "normal")
 *   - combos whose image folder is empty/missing
 *
 * No API, no DB — pure inventory. Emits scripts/image-case-plan.json.
 *
 * Usage:
 *   node scripts/plan-image-cases.mjs
 *   node scripts/plan-image-cases.mjs --per-diagnosis 1   # cases per distinct type
 *   node scripts/plan-image-cases.mjs --json out.json
 */

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { ALL_COMBOS } from './lib/imageCaseCombos.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
const getArg = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null }
const perDiagnosis = Math.max(1, parseInt(getArg('--per-diagnosis') ?? '1', 10))
const outPath = path.resolve(ROOT, getArg('--json') ?? 'scripts/image-case-plan.json')

// Where each dataset's category→[files] index lives, and the images' base dir.
const DATASET_INDEX = {
  smear:  'public/images/smear/index.json',
  biopsy: 'public/images/biopsy/index.json',
  fundus: 'public/images/fundus/index.json',
  derm:   'public/images/derm/index.json',
  urine:  'public/images/urine/index.json',
  chest:  'public/imaging-lookup.json',
}

function readIndex(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) } catch { return {} }
}

// modality → { category → imageCount }
const inventory = {}
for (const [modality, rel] of Object.entries(DATASET_INDEX)) {
  const idx = readIndex(rel)
  inventory[modality] = {}
  for (const [cat, files] of Object.entries(idx)) {
    inventory[modality][cat] = Array.isArray(files) ? files.length : 0
  }
}

// combo lookup: "modality/category" → combo
const comboByKey = new Map(ALL_COMBOS.map(c => [`${c.modality}/${c.category}`, c]))

const plan = []
const unmapped = []   // has images but no diagnosis (e.g. "normal" folders)
const emptyCombos = [] // combo exists but folder empty/missing
const seenDiagnoses = new Map() // diagnosis → count (dedupe check)

for (const [modality, cats] of Object.entries(inventory)) {
  for (const [category, imageCount] of Object.entries(cats)) {
    const combo = comboByKey.get(`${modality}/${category}`)
    if (!combo) {
      if (imageCount > 0) unmapped.push({ modality, category, imageCount })
      continue
    }
    if (imageCount === 0) { emptyCombos.push({ modality, category, diagnosis: combo.diagnosis }); continue }
    const cases = Math.min(perDiagnosis, imageCount)
    seenDiagnoses.set(combo.diagnosis, (seenDiagnoses.get(combo.diagnosis) ?? 0) + 1)
    plan.push({
      id: `local-${modality}-${category}-0`,
      modality, category,
      diagnosis: combo.diagnosis,
      system: combo.system,
      difficulty: combo.difficulty,
      imagesAvailable: imageCount,
      casesPlanned: cases,
      surplusImages: imageCount - cases,
    })
  }
}

// combos whose folder isn't even in the inventory
for (const c of ALL_COMBOS) {
  if (!(c.category in (inventory[c.modality] ?? {}))) {
    emptyCombos.push({ modality: c.modality, category: c.category, diagnosis: c.diagnosis, reason: 'folder not found' })
  }
}

const duplicateDiagnoses = [...seenDiagnoses.entries()].filter(([, n]) => n > 1).map(([d, n]) => ({ diagnosis: d, count: n }))

const totals = {
  distinctCaseTypes: plan.length,
  distinctDiagnoses: seenDiagnoses.size,
  totalImages: plan.reduce((s, p) => s + p.imagesAvailable, 0),
  imagesConsumed: plan.reduce((s, p) => s + p.casesPlanned, 0),
  surplusImages: plan.reduce((s, p) => s + p.surplusImages, 0),
  unmappedCategories: unmapped.length,
  unmappedImages: unmapped.reduce((s, u) => s + u.imageCount, 0),
}

fs.writeFileSync(outPath, JSON.stringify({ generatedAt: null, perDiagnosis, totals, plan, unmapped, emptyCombos, duplicateDiagnoses }, null, 2))

// ── Console report ─────────────────────────────────────────────────────────────
const byModality = {}
for (const p of plan) (byModality[p.modality] ??= []).push(p)

console.log(`\nImage-first case plan — ${totals.distinctCaseTypes} distinct case types (${perDiagnosis} case each)\n`)
for (const [modality, rows] of Object.entries(byModality)) {
  console.log(`${modality.toUpperCase()}`)
  for (const p of rows) {
    console.log(`  ${p.category.padEnd(20)} → ${p.diagnosis.padEnd(46)} [${p.difficulty.padEnd(11)}] ${p.imagesAvailable} img (${p.surplusImages} surplus)`)
  }
  console.log('')
}
if (unmapped.length) {
  console.log('UNMAPPED (images present, no diagnosis → no case; e.g. "normal"):')
  for (const u of unmapped) console.log(`  ${u.modality}/${u.category}  ${u.imageCount} img`)
  console.log('')
}
if (emptyCombos.length) {
  console.log('COMBOS WITH NO IMAGES (need images before generating):')
  for (const e of emptyCombos) console.log(`  ${e.modality}/${e.category} → ${e.diagnosis}${e.reason ? ` (${e.reason})` : ''}`)
  console.log('')
}
if (duplicateDiagnoses.length) {
  console.log('⚠ DUPLICATE DIAGNOSES (same dx from >1 category — dedupe the combo map):')
  for (const d of duplicateDiagnoses) console.log(`  ${d.diagnosis} ×${d.count}`)
  console.log('')
}
console.log('─'.repeat(70))
console.log(`Distinct case types : ${totals.distinctCaseTypes}   (distinct diagnoses: ${totals.distinctDiagnoses})`)
console.log(`Images: ${totals.totalImages} total → ${totals.imagesConsumed} used, ${totals.surplusImages} surplus (redundant for case-building)`)
console.log(`Unmapped: ${totals.unmappedImages} images in ${totals.unmappedCategories} categories build no case`)
console.log(`\nPlan written → ${path.relative(ROOT, outPath)}`)
