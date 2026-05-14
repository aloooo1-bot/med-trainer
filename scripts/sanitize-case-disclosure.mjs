/**
 * One-pass sanitizer that strips diagnosis-disclosing phrases from narrative
 * finding fields in existing case_data rows.
 *
 * Targeted fields:
 *   imagingResults (every value), procedureResults (every value),
 *   hematologyFindings, urineFindings, fundusFindings, skinFindings,
 *   biopsyFindings, relevantTests[].imagingResult
 *
 * Skips ecgFindings for STEMI cases (STEMI requires "consistent with ... STEMI"
 * for image-selection logic).
 *
 * Usage:
 *   node scripts/sanitize-case-disclosure.mjs            # interactive confirmation
 *   node scripts/sanitize-case-disclosure.mjs --dry-run  # preview only, no writes
 *   node scripts/sanitize-case-disclosure.mjs --yes      # skip confirmation prompt
 *
 * Idempotent — re-running on already-clean rows is a no-op.
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

const dryRun = process.argv.includes('--dry-run')
const skipConfirm = process.argv.includes('--yes')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Phrase patterns to strip ──────────────────────────────────────────────────
// Broad match: "consistent with X", "suggestive of X", etc. anywhere in the string.
// Captures everything from the disclosure keyword through the next sentence boundary.
const DISCLOSURE_ANYWHERE = /\b(?:consistent with|suggestive of|suggesting|indicative of|indicating|compatible with|characteristic of|diagnostic of|concerning for|findings of)\s+[^.;\n]+?(?=[.;,\n]|$)/gi

// Verbs/words that, if a sentence ends with them, indicate the sentence is
// incomplete (its object was stripped out)
const INCOMPLETE_TAIL = new Set([
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'shows', 'show', 'reveals', 'reveal', 'demonstrates', 'demonstrate',
  'exhibits', 'exhibit', 'indicates', 'indicate', 'suggests', 'suggest',
  'displays', 'display', 'appears', 'appear', 'presents', 'present',
  'describes', 'describe', 'reads', 'read', 'notes', 'note',
  'finds', 'find', 'includes', 'include', 'contains', 'contain',
  'remains', 'remain', 'has', 'have', 'had', 'demonstrate', 'represents',
  'represent', 'reveals', 'consistent', 'compatible', 'characteristic',
  'indicative', 'suggestive', 'diagnostic',
])

function removeIncompleteSentences(text) {
  if (!text) return text
  const sentences = text.split(/(?<=[.;!?])\s+/)
  const filtered = sentences.filter(sentence => {
    const clean = sentence.replace(/[.;!?]+$/, '').trim()
    if (clean.length < 3) return false
    const words = clean.split(/\s+/)
    if (words.length <= 1) return false
    if (words.length <= 4) {
      const lastWord = words[words.length - 1].toLowerCase().replace(/[^a-z]/g, '')
      if (INCOMPLETE_TAIL.has(lastWord)) return false
    }
    return true
  })
  return filtered.join(' ')
}

function cleanup(s) {
  return removeIncompleteSentences(
    s
      // Orphaned connective words left dangling before punctuation or end-of-string:
      // "demonstrates with." / "reveals of." / "shows with" etc.
      .replace(/\b(?:demonstrates?|shows?|reveals?|exhibits?)\s+(?:with|of|that|an?|the)\s*(?=[.;,\n]|$)/gi, '')
      // "consistent with." / "suggestive of." left alone after diagnosis strip
      .replace(/\b(?:consistent with|suggestive of|suggesting|indicative of|indicating|compatible with|characteristic of|diagnostic of|concerning for|findings of)\s*(?=[.;,\n]|$)/gi, '')
      // Dangling "with ." or "of ." at sentence boundary
      .replace(/\s+(?:with|of|for|an?|the)\s*\./gi, '.')
      // Space before punctuation, multiple periods, commas before periods
      .replace(/\s+([.;,])/g, '$1').replace(/[,;]\s*\./g, '.').replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/[,;]+\s*$/, '.')
  ).trim()
}

function sanitizeNarrative(text, diagnosis) {
  if (!text || typeof text !== 'string') return text
  // Step 1: strip "consistent with X" and similar disclosure phrases
  let s = text.replace(DISCLOSURE_ANYWHERE, '')
  // Step 2: strip bare diagnosis name mentions; also consume any immediately
  // trailing connector ("with", "of", "and", "as") so "demonstrate X with Y"
  // becomes "demonstrate Y" rather than "demonstrate with Y"
  if (diagnosis) {
    const escaped = diagnosis.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\b${escaped}\\b(?:\\s+(?:with|of|and|as|including|which|that))?`, 'gi')
    s = s.replace(re, '')
  }
  // Step 3: clean up artifacts left by the two strips above
  s = cleanup(s)
  return s
}

// ── Fields to sanitize ────────────────────────────────────────────────────────
const STRING_FIELDS = [
  'ecgFindings',
  'hematologyFindings',
  'urineFindings',
  'fundusFindings',
  'skinFindings',
  'biopsyFindings',
]

function sanitizeCaseData(caseData, diagnosis) {
  if (!caseData || typeof caseData !== 'object') return caseData
  const isStemi = /\bSTEMI\b/i.test(diagnosis ?? '')
  let changed = false
  const next = { ...caseData }

  // imagingResults
  if (next.imagingResults && typeof next.imagingResults === 'object') {
    const ir = { ...next.imagingResults }
    for (const [k, v] of Object.entries(ir)) {
      const cleaned = sanitizeNarrative(v, diagnosis)
      if (cleaned !== v) { ir[k] = cleaned; changed = true }
    }
    next.imagingResults = ir
  }

  // procedureResults
  if (next.procedureResults && typeof next.procedureResults === 'object') {
    const pr = { ...next.procedureResults }
    for (const [k, v] of Object.entries(pr)) {
      const cleaned = sanitizeNarrative(v, diagnosis)
      if (cleaned !== v) { pr[k] = cleaned; changed = true }
    }
    next.procedureResults = pr
  }

  // Simple string fields (skip ecgFindings for STEMI)
  for (const field of STRING_FIELDS) {
    if (field === 'ecgFindings' && isStemi) continue
    if (typeof next[field] === 'string') {
      const cleaned = sanitizeNarrative(next[field], diagnosis)
      if (cleaned !== next[field]) { next[field] = cleaned; changed = true }
    }
  }

  // relevantTests[].imagingResult
  if (Array.isArray(next.relevantTests)) {
    const tests = next.relevantTests.map(t => {
      if (!t.imagingResult) return t
      const cleaned = sanitizeNarrative(t.imagingResult, diagnosis)
      if (cleaned !== t.imagingResult) { changed = true; return { ...t, imagingResult: cleaned } }
      return t
    })
    if (changed) next.relevantTests = tests
  }

  return changed ? next : caseData
}

async function fetchAllCases() {
  const PAGE = 1000
  let offset = 0
  const rows = []
  while (true) {
    const { data, error } = await supabase
      .from('cases')
      .select('id, diagnosis, case_data')
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(`Fetch failed: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return rows
}

async function main() {
  console.log(dryRun ? '── DRY RUN (no writes) ──\n' : '── Sanitize case disclosure ──\n')

  const rows = await fetchAllCases()
  console.log(`Fetched ${rows.length} rows.`)

  const toUpdate = []
  for (const row of rows) {
    if (!row.case_data) continue
    const cleaned = sanitizeCaseData(row.case_data, row.diagnosis)
    if (cleaned !== row.case_data) {
      toUpdate.push({ id: row.id, case_data: cleaned, _original: row.case_data, _diagnosis: row.diagnosis })
    }
  }

  console.log(`Rows needing sanitization: ${toUpdate.length} / ${rows.length}`)

  if (toUpdate.length === 0) {
    console.log('Nothing to sanitize. All narrative fields are clean.')
    return
  }

  // Show first 5 diffs
  console.log('\nSample diffs (first 5):')
  for (const row of toUpdate.slice(0, 5)) {
    console.log(`\n  [${row.id}] (${row._diagnosis})`)
    const fields = ['imagingResults', 'procedureResults', ...STRING_FIELDS, 'relevantTests']
    for (const field of fields) {
      const before = JSON.stringify(row._original[field] ?? '')
      const after  = JSON.stringify(row.case_data[field] ?? '')
      if (before !== after) {
        const bSnip = before.slice(0, 120)
        const aSnip = after.slice(0, 120)
        if (bSnip !== aSnip) {
          console.log(`    ${field}:`)
          console.log(`      before: ${bSnip}`)
          console.log(`      after:  ${aSnip}`)
        }
      }
    }
  }

  if (dryRun) {
    console.log('\nDry-run complete — no writes performed.')
    return
  }

  if (!skipConfirm) {
    const rl = readline.createInterface({ input, output })
    const answer = await rl.question(`\nSanitize ${toUpdate.length} rows? Type "sanitize" to confirm: `)
    rl.close()
    if (answer.trim() !== 'sanitize') {
      console.log('Aborted.')
      return
    }
  }

  console.log('\nWriting…')
  const CONCURRENCY = 20
  let updated = 0
  let errors  = 0
  for (let i = 0; i < toUpdate.length; i += CONCURRENCY) {
    const batch = toUpdate.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(async ({ id, case_data }) => {
      const { error } = await supabase
        .from('cases')
        .update({ case_data })
        .eq('id', id)
      if (error) {
        console.error(`\nUpdate failed [${id}]: ${error.message}`)
        errors++
      } else {
        updated++
      }
    }))
    process.stdout.write(`\r  Updated ${updated}/${toUpdate.length}…`)
  }
  console.log()

  console.log(`\nUpdated : ${updated}`)
  console.log(`Errors  : ${errors}`)

  if (errors === 0) {
    console.log('\nRun --dry-run again to confirm nothing remains.')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
