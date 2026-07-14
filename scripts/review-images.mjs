/**
 * Automated image attribute tagger (the review pass).
 *
 * For each local image, a Claude vision call extracts structured attributes
 * (laterality, features, severity) which are written to the dataset's
 * `attributes.json` sidecar. The serve-time fail-safe then serves only images
 * confirmed to match a case's specified side.
 *
 * This is the "runs when credits are back" piece — it needs ANTHROPIC_API_KEY.
 * Use --dry-run any time (no API) to see exactly what would be tagged.
 *
 * Usage:
 *   node scripts/review-images.mjs --dry-run                 # plan only, no API
 *   node scripts/review-images.mjs --dataset chest           # tag NIH chest films
 *   node scripts/review-images.mjs --dataset fundus --limit 20
 *   node scripts/review-images.mjs --all                     # every raster dataset
 *   node scripts/review-images.mjs --dataset derm --force    # re-tag already-tagged
 *   node scripts/review-images.mjs --dataset chest --concurrency 3
 *
 * Requires ANTHROPIC_API_KEY in .env.local (except --dry-run).
 * Attributes are committed assets — run locally, then commit the sidecars.
 */

import path from 'path'
import { config } from 'dotenv'
import {
  ROOT, DATASETS, DATASET_NAMES,
  listDatasetImages, readAttributes, writeAttributes, mergeAttribute,
  fileToBase64, EXTRACT_SYSTEM, VALID_LATERALITY,
} from './lib/imageReview.mjs'

config({ path: path.join(ROOT, '.env.local') })

const args = process.argv.slice(2)
const getArg = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null }
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')
const all = args.includes('--all')
const limit = parseInt(getArg('--limit') ?? '0', 10)
const concurrency = Math.max(1, parseInt(getArg('--concurrency') ?? '2', 10))
const model = getArg('--model') ?? 'claude-opus-4-7'
const datasetArg = getArg('--dataset')

const targets = all
  ? DATASET_NAMES.filter(n => DATASETS[n].raster)
  : datasetArg ? [datasetArg] : null

if (!targets) {
  console.error('Specify --dataset <name> or --all. Datasets:', DATASET_NAMES.join(', '))
  process.exit(2)
}
for (const t of targets) {
  if (!DATASETS[t]) { console.error(`Unknown dataset: ${t}`); process.exit(2) }
}
if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY not set — use --dry-run to plan without calling the API.')
  process.exit(1)
}

// Lazy import so --dry-run needs neither the SDK nor a key.
let anthropic = null
async function getClient() {
  if (!anthropic) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropic
}

async function extractAttributes(img, modalityLabel) {
  const data = await fileToBase64(img.absPath)
  if (!data) return { skip: 'non-raster (e.g. SVG) — not vision-readable' }
  const client = await getClient()
  const userPrompt = `Modality: ${modalityLabel}. Category context (may be noisy, do not over-trust): ${img.category}.
Extract the visible attributes as JSON.`
  const res = await client.messages.create({
    model,
    max_tokens: 300,
    system: [{ type: 'text', text: EXTRACT_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: data.mediaType, data: data.base64 } },
        { type: 'text', text: userPrompt },
      ],
    }],
  })
  const raw = (res.content[0]?.text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(raw)
  if (!VALID_LATERALITY.includes(parsed.laterality)) parsed.laterality = 'unknown'
  return {
    attribute: {
      laterality: parsed.laterality,
      features: Array.isArray(parsed.features) ? parsed.features.slice(0, 6) : [],
      severity: ['mild', 'moderate', 'severe'].includes(parsed.severity) ? parsed.severity : undefined,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
      review: 'auto',
    },
  }
}

async function runDataset(name) {
  const images = await listDatasetImages(name)
  const attrs = await readAttributes(name)
  const pending = images.filter(img => force || !attrs[img.key])
  const planned = limit > 0 ? pending.slice(0, limit) : pending

  console.log(`\n[${name}] ${images.length} images, ${images.length - pending.length} already tagged, ${planned.length} to ${dryRun ? 'plan' : 'review'}`)
  if (dryRun) {
    const byCat = {}
    for (const img of planned) byCat[img.category] = (byCat[img.category] ?? 0) + 1
    for (const [cat, n] of Object.entries(byCat)) console.log(`  ${cat.padEnd(24)} ${n}`)
    return { name, planned: planned.length, tagged: 0, skipped: 0 }
  }

  let tagged = 0, skipped = 0
  const modalityLabel = name === 'chest' ? 'Chest radiograph' : name
  for (let i = 0; i < planned.length; i += concurrency) {
    const batch = planned.slice(i, i + concurrency)
    const settled = await Promise.allSettled(batch.map(img => extractAttributes(img, modalityLabel)))
    settled.forEach((s, j) => {
      const img = batch[j]
      if (s.status === 'rejected') { console.warn(`  ✗ ${img.key}: ${s.reason?.message ?? s.reason}`); skipped++; return }
      if (s.value.skip) { console.warn(`  – ${img.key}: ${s.value.skip}`); skipped++; return }
      mergeAttribute(attrs, img.key, s.value.attribute)
      tagged++
      console.log(`  ✓ ${img.key} → ${s.value.attribute.laterality} (${s.value.attribute.confidence ?? '?'})`)
    })
    await writeAttributes(name, attrs) // persist incrementally so a crash keeps progress
  }
  return { name, planned: planned.length, tagged, skipped }
}

let totalTagged = 0, totalPlanned = 0
for (const name of targets) {
  const r = await runDataset(name)
  totalPlanned += r.planned
  totalTagged += r.tagged
}
console.log(`\n${dryRun ? '[dry-run] would review' : 'Tagged'} ${dryRun ? totalPlanned : totalTagged} image(s).`)
if (!dryRun) console.log('Commit the updated attributes.json sidecars.')
