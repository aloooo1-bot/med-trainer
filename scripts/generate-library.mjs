/**
 * Offline case library generator.
 *
 * Usage:
 *   node scripts/generate-library.mjs
 *   node scripts/generate-library.mjs --system Cardiovascular
 *   node scripts/generate-library.mjs --system Respiratory --difficulty Foundations
 *   node scripts/generate-library.mjs --force          # regenerate all even if they exist
 *   node scripts/generate-library.mjs --variants 2     # generate 2 variants per diagnosis
 *   node scripts/generate-library.mjs --concurrency 3  # max parallel API calls
 *
 * Requires ANTHROPIC_API_KEY in env (or .env.local file).
 * Reads/writes public/cases/index.json and public/cases/*.json.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { MANIFEST, VARIANT_SEEDS } from './case-manifest.mjs'
import { buildCaseSystemPrompt, buildCasePrompt } from '../app/lib/casePrompt.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CASES_DIR = path.join(ROOT, 'public', 'cases')
const INDEX_PATH = path.join(CASES_DIR, 'index.json')

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(flag) {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : null
}
const filterSystem = getArg('--system')
const filterDifficulty = getArg('--difficulty')
const filterDiagnosis = getArg('--diagnosis')
const force = args.includes('--force')
const variantCount = parseInt(getArg('--variants') ?? '3', 10)
const concurrency = parseInt(getArg('--concurrency') ?? '5', 10)

// ── Setup ─────────────────────────────────────────────────────────────────────
// Load .env.local if present
const envPath = path.join(ROOT, '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '')
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not set. Add it to .env.local or export it before running.')
  process.exit(1)
}

fs.mkdirSync(CASES_DIR, { recursive: true })

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Index helpers ─────────────────────────────────────────────────────────────
function loadIndex() {
  if (fs.existsSync(INDEX_PATH)) {
    try { return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')) } catch { return [] }
  }
  return []
}

function saveIndex(index) {
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2))
}

function slug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function caseId(system, difficulty, diagnosis, variantIndex) {
  return `${slug(system)}-${slug(difficulty)}-${slug(diagnosis)}-${variantIndex}`
}

// ── Generation ────────────────────────────────────────────────────────────────
async function generateVariant(system, difficulty, diagnosis, variantIndex) {
  const variantSeed = VARIANT_SEEDS[variantIndex] ?? null
  const systemPrompt = buildCaseSystemPrompt(null)
  const userPrompt = buildCasePrompt(system, difficulty, diagnosis, variantSeed)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 12000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = message.content[0]?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in response')
  const parsed = JSON.parse(match[0])

  // Merge relevantTests into labResults/imagingResults (mirrors page.tsx logic)
  if (Array.isArray(parsed.relevantTests)) {
    for (const rt of parsed.relevantTests) {
      if (!rt.name) continue
      if (rt.isImaging && rt.imagingResult) {
        parsed.imagingResults[rt.name] = rt.imagingResult
        if (!parsed.availableImaging.includes(rt.name)) parsed.availableImaging.push(rt.name)
      } else if (!rt.isImaging && rt.labResult) {
        parsed.labResults[rt.name] = rt.labResult
        if (!parsed.availableLabs.includes(rt.name)) parsed.availableLabs.push(rt.name)
      }
    }
  }

  return parsed
}

// ── Semaphore ─────────────────────────────────────────────────────────────────
function makeSemaphore(limit) {
  let running = 0
  const queue = []
  function next() {
    if (running >= limit || queue.length === 0) return
    running++
    const { fn, resolve, reject } = queue.shift()
    fn().then(v => { running--; resolve(v); next() }).catch(e => { running--; reject(e); next() })
  }
  return fn => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next() })
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const index = loadIndex()
  const existingIds = new Set(index.map(e => e.id))

  // Build work list
  const work = []
  for (const [system, difficulties] of Object.entries(MANIFEST)) {
    if (filterSystem && system !== filterSystem) continue
    for (const [difficulty, diagnoses] of Object.entries(difficulties)) {
      if (filterDifficulty && difficulty !== filterDifficulty) continue
      for (const diagnosis of diagnoses) {
        if (filterDiagnosis && diagnosis !== filterDiagnosis) continue
        for (let v = 0; v < variantCount; v++) {
          const id = caseId(system, difficulty, diagnosis, v)
          const filePath = path.join(CASES_DIR, `${id}.json`)
          if (!force && existingIds.has(id) && fs.existsSync(filePath)) continue
          work.push({ system, difficulty, diagnosis, variantIndex: v, id, filePath })
        }
      }
    }
  }

  if (work.length === 0) {
    console.log('Nothing to generate — all cases already exist. Use --force to regenerate.')
    return
  }

  console.log(`Generating ${work.length} cases (${variantCount} variants each) with concurrency ${concurrency}...\n`)

  const sem = makeSemaphore(concurrency)
  let done = 0
  let failed = 0

  await Promise.all(work.map(item => sem(async () => {
    const label = `[${item.system} / ${item.difficulty}] ${item.diagnosis} v${item.variantIndex}`
    try {
      const caseData = await generateVariant(item.system, item.difficulty, item.diagnosis, item.variantIndex)

      // Save individual case file
      fs.writeFileSync(item.filePath, JSON.stringify(caseData, null, 2))

      // Upsert into index
      const entry = {
        id: item.id,
        system: item.system,
        difficulty: item.difficulty,
        diagnosis: item.diagnosis,
        variantIndex: item.variantIndex,
        patientName: caseData.patientInfo?.name ?? '',
      }
      const existing = index.findIndex(e => e.id === item.id)
      if (existing !== -1) index[existing] = entry
      else index.push(entry)
      existingIds.add(item.id)
      saveIndex(index)

      done++
      console.log(`✓ [${done}/${work.length}] ${label}`)
    } catch (e) {
      failed++
      console.error(`✗ FAILED ${label}: ${e.message}`)
    }
  })))

  console.log(`\nDone. ${done} generated, ${failed} failed. Index has ${index.length} total entries.`)
}

main().catch(e => { console.error(e); process.exit(1) })
