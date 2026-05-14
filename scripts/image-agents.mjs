/**
 * Two-agent image pipeline for medical case images.
 *
 * Agent 1 — Image Finder (three-tier):
 *   Tier 1: diagnosis-specific Open-i query (same logic as prefetch-imaging)
 *   Tier 2: imagingCategory alone (broader fallback)
 *   Tier 3: first 3 keywords of the diagnosis query (last resort)
 *   "Normal" imaging queries (psychiatric/tox cases) are detected and skipped —
 *   Open-i has no usable "normal study" images.
 *
 * Agent 2 — Medical Verifier (Claude claude-opus-4-7 with vision):
 *   Downloads each candidate and asks Claude whether the image accurately depicts
 *   the pathology described in the case. First image that passes confidence >= 0.70
 *   is stored in the verified_images column.
 *
 * Usage:
 *   node scripts/image-agents.mjs
 *   node scripts/image-agents.mjs --system Cardiovascular
 *   node scripts/image-agents.mjs --difficulty Foundations
 *   node scripts/image-agents.mjs --force          # re-verify already verified cases
 *   node scripts/image-agents.mjs --dry-run        # show work without writing
 *   node scripts/image-agents.mjs --concurrency 2  # parallel cases (default 1)
 *   node scripts/image-agents.mjs --limit 10       # cap total cases processed
 *
 * Requires in .env.local:
 *   ANTHROPIC_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Requires the verified_images column in Supabase (run once):
 *   ALTER TABLE cases ADD COLUMN IF NOT EXISTS verified_images JSONB DEFAULT NULL;
 */

import path from 'path'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import {
  isECG, isSpecialOrProcedure, isNormalQuery,
  getTestParams, getDiagQuery, fetchOpenI, fetchImagesForTest,
} from './lib/imaging-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not set.'); process.exit(1)
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.'); process.exit(1)
}

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = flag => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
const filterSystem     = getArg('--system')
const filterDifficulty = getArg('--difficulty')
const force            = args.includes('--force')
const dryRun           = args.includes('--dry-run')
const concurrency      = parseInt(getArg('--concurrency') ?? '1', 10)
const limitArg         = getArg('--limit')
const limitCount       = limitArg ? parseInt(limitArg, 10) : null

// ── Clients ───────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase  = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// ── Agent 1: Image Finder (three-tier) ───────────────────────────────────────

async function findCandidates(testName, caseData) {
  const { diagnosis, imagingCategory } = caseData

  // Tier 1: full diagnosis-specific query
  const { results, query, skipped, unknown } = await fetchImagesForTest(testName, diagnosis, imagingCategory)

  if (skipped)  return { candidates: null, skipped: true }
  if (unknown)  return { candidates: [], unknown: true }

  // Open-i has no "normal study" images — skip rather than burn Claude calls
  if (isNormalQuery(query)) return { candidates: [], normal: true, query }

  if (results?.length) return { candidates: results, query, tier: 1 }

  // Need params for fallback queries
  const params = getTestParams(testName)
  if (!params || params === 'skip') return { candidates: [], query }

  // Tier 2: imagingCategory alone (e.g. "bilateral pleural effusion")
  if (imagingCategory && !isNormalQuery(imagingCategory)) {
    const t2 = await fetchOpenI(imagingCategory, params.it, params.coll)
    if (t2.length) return { candidates: t2, query: imagingCategory, tier: 2 }
  }

  // Tier 3: first 3 words of the diagnosis query (strips case-specific noise)
  if (query) {
    const simplified = query.split(/\s+/).slice(0, 3).join(' ')
    if (simplified !== query && simplified.length > 4) {
      const t3 = await fetchOpenI(simplified, params.it, params.coll)
      if (t3.length) return { candidates: t3, query: simplified, tier: 3 }
    }
  }

  return { candidates: [], query }
}

// ── Agent 2: Medical Verifier ─────────────────────────────────────────────────

const VERIFIER_SYSTEM = `You are an experienced radiologist and medical educator reviewing images for a clinical training application. Your role is to assess whether a medical image accurately represents the expected pathological findings for a given case.

Criteria:
- Approve if the image clearly shows the expected pathology, even if not a perfect match to the exact case details.
- Reject if the wrong pathology is shown, the modality is incorrect, or findings are too subtle to be educational.
- Do NOT reject solely because the image is from a different patient — representativeness is what matters.

Respond ONLY with valid JSON — no markdown, no text outside the JSON:
{
  "approved": true or false,
  "confidence": 0.0 to 1.0,
  "reason": "one sentence explaining your decision"
}`

async function downloadImageBase64(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MedTrainer-ImageAgent/1.0' },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const contentType = res.headers.get('content-type') || 'image/jpeg'
  const mediaType = contentType.split(';')[0].trim()
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) {
    throw new Error(`Unsupported media type: ${mediaType}`)
  }
  const buffer = await res.arrayBuffer()
  return { base64: Buffer.from(buffer).toString('base64'), mediaType }
}

async function verifyImage(candidate, caseData, testName) {
  const { diagnosis, imagingCategory, imagingResults } = caseData

  let imageData
  try {
    imageData = await downloadImageBase64(candidate.imageUrl)
  } catch (e) {
    return { approved: false, confidence: 0, reason: `Download failed: ${e.message}` }
  }
  const { base64, mediaType } = imageData

  const reportSnippet = (imagingResults?.[testName] ?? '').slice(0, 300)
  const userPrompt = `Case:
- Diagnosis: ${diagnosis}
- Imaging study: ${testName}
- Expected key finding: ${imagingCategory || 'see report'}
- Report excerpt: ${reportSnippet || 'not available'}

Evaluate this image.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 200,
      system: [{ type: 'text', text: VERIFIER_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: userPrompt },
        ],
      }],
    })

    const raw = (response.content[0]?.text ?? '').trim()
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    return JSON.parse(jsonStr)
  } catch (e) {
    return { approved: false, confidence: 0, reason: `Verification error: ${e.message}` }
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

async function main() {
  let query = supabase
    .from('cases')
    .select('id, case_data, verified_images')
    .eq('is_generated', true)

  if (!force)         query = query.is('verified_images', null)
  if (filterSystem)   query = query.eq('system', filterSystem)
  if (filterDifficulty) query = query.eq('difficulty', filterDifficulty)
  if (limitCount)     query = query.limit(limitCount)

  const { data: cases, error } = await query
  if (error) { console.error('Supabase error:', error.message); process.exit(1) }
  if (!cases?.length) { console.log('No cases to process.'); return }

  const workList = cases.filter(c => {
    const imaging = c.case_data?.availableImaging ?? []
    return imaging.some(t => !isECG(t) && !isSpecialOrProcedure(t))
  })

  console.log(`\n${cases.length} cases fetched — ${workList.length} with radiology imaging`)
  if (filterSystem)     console.log(`  System:     ${filterSystem}`)
  if (filterDifficulty) console.log(`  Difficulty: ${filterDifficulty}`)
  if (dryRun) console.log('  DRY RUN — no writes\n')
  else        console.log()

  const stats = {
    cases: 0,
    testsChecked: 0,
    normalSkipped: 0,
    noResults: 0,
    candidatesEvaluated: 0,
    approved: 0,
    rejected: 0,
  }

  const queue = [...workList]
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const c = queue.shift()
      if (!c) break
      await processCase(c, stats)
    }
  })
  await Promise.all(workers)

  console.log('\n─────────────────────────────────────────────────────')
  console.log(`Cases processed      : ${stats.cases}`)
  console.log(`Tests evaluated      : ${stats.testsChecked}`)
  console.log(`  Normal study skip  : ${stats.normalSkipped}`)
  console.log(`  No Open-i results  : ${stats.noResults}`)
  console.log(`Candidates reviewed  : ${stats.candidatesEvaluated}`)
  console.log(`  Approved           : ${stats.approved}`)
  console.log(`  Rejected           : ${stats.rejected}`)
  console.log()
}

async function processCase(row, stats) {
  const { id, case_data: caseData } = row
  const imaging = caseData?.availableImaging ?? []
  const radTests = imaging.filter(t => !isECG(t) && !isSpecialOrProcedure(t))
  if (!radTests.length) return

  console.log(`\n[${id}]`)
  const verifiedImages = force ? { ...(row.verified_images ?? {}) } : {}

  for (const testName of radTests) {
    stats.testsChecked++
    process.stdout.write(`  ${testName} — `)

    // Agent 1: find candidates
    const { candidates, tier, skipped, unknown, normal, query } = await findCandidates(testName, caseData)

    if (skipped) { process.stdout.write('skipped (ECG/special/procedure)\n'); stats.testsChecked--; continue }
    if (unknown) { process.stdout.write('unknown test mapping\n'); stats.noResults++; continue }
    if (normal)  { process.stdout.write(`normal study — skipped (query: "${query}")\n`); stats.normalSkipped++; continue }
    if (!candidates?.length) {
      process.stdout.write(`no Open-i results${query ? ` (query: "${query}")` : ''}\n`)
      stats.noResults++
      continue
    }

    const tierTag = tier && tier > 1 ? ` [tier-${tier} fallback]` : ''
    process.stdout.write(`${candidates.length} candidates${tierTag}\n`)

    // Agent 2: verify each candidate
    let approved = null
    for (const candidate of candidates) {
      stats.candidatesEvaluated++
      const verdict = await verifyImage(candidate, caseData, testName)
      const pass = verdict.approved && verdict.confidence >= 0.70
      console.log(`    [${pass ? 'PASS' : 'FAIL'}] conf=${verdict.confidence.toFixed(2)} — ${verdict.reason}`)

      if (pass) {
        approved = {
          uid:                candidate.uid,
          imageUrl:           candidate.imageUrl,
          thumbnailUrl:       candidate.thumbnailUrl,
          caption:            candidate.caption,
          modality:           candidate.modality,
          agentVerified:      true,
          confidence:         verdict.confidence,
          verificationReason: verdict.reason,
          verifiedAt:         new Date().toISOString(),
        }
        stats.approved++
        break
      }
      stats.rejected++
    }

    if (approved) {
      verifiedImages[testName] = approved
      console.log(`    => Saved verified image for "${testName}"`)
    } else {
      console.log(`    => No image passed verification for "${testName}"`)
    }
  }

  stats.cases++

  if (!dryRun && Object.keys(verifiedImages).length > 0) {
    const { error } = await supabase
      .from('cases')
      .update({ verified_images: verifiedImages })
      .eq('id', id)
    if (error) console.error(`  [DB ERROR] ${id}: ${error.message}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
