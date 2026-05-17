/**
 * Phase C — Reviewer Agent
 * Reads all artifacts (case transcripts + tab snapshots) and produces
 * findings.json + findings.md with bugs, inconsistencies, medical
 * inaccuracies, and improvements.
 *
 * Uses Anthropic SDK directly (not the localhost proxy) — offline analysis.
 */

import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '..', '..', '.env.local') })

import Anthropic from '@anthropic-ai/sdk'
import {
  FINDINGS_JSON, FINDINGS_MD,
  listTranscripts, listTabArtifacts, writeJSON,
} from './lib/artifacts.mjs'
import {
  REVIEWER_SYSTEM,
  buildCaseReviewPrompt,
  buildTabReviewPrompt,
  buildCrossCuttingPrompt,
} from './lib/reviewer-prompt.mjs'

const MODEL = 'claude-sonnet-4-6'

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function repairJSON(text) {
  const start = text.indexOf('{')
  if (start === -1) return null
  let raw = text.slice(start)
  let inString = false, escape = false
  const stack = []
  let lastEnd = -1
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (escape) { escape = false; continue }
    if (c === '\\' && inString) { escape = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']')
    else if (c === '}' || c === ']') {
      if (stack.length > 0) { stack.pop(); if (stack.length === 0) lastEnd = i }
    }
  }
  if (stack.length === 0 && lastEnd !== -1) return raw.slice(0, lastEnd + 1)
  let t = raw.replace(/,(\s*[}\]])/g, '$1').replace(/,\s*$/, '')
  const repaired = t + stack.reverse().join('')
  try { JSON.parse(repaired); return repaired } catch { return null }
}

function tryParseFindings(text) {
  const tryParse = src => {
    if (!src) return null
    const m = src.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      const parsed = JSON.parse(m[0])
      return Array.isArray(parsed.findings) ? parsed.findings : null
    } catch { return null }
  }
  return tryParse(text) ?? tryParse(repairJSON(text))
}

async function callReviewer(client, userContent) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: REVIEWER_SYSTEM,
    messages: [{ role: 'user', content: userContent }],
  })
  return res.content[0].text
}

// ── Phase C: case review ──────────────────────────────────────────────────────

async function reviewCases(client, transcripts) {
  const allFindings = []
  let idOffset = 1

  // Batch 3 cases per call
  const BATCH = 3
  for (let i = 0; i < transcripts.length; i += BATCH) {
    const batch = transcripts.slice(i, i + BATCH)
    const batchNums = batch.map(t => `case-${String(t.caseNum).padStart(2, '0')}`).join(', ')
    process.stdout.write(`  Cases ${batchNums}... `)

    // Slim down each transcript to reduce token usage — don't send full caseData
    const slimBatch = batch.map(t => ({
      caseNum: t.caseNum,
      system: t.system,
      difficulty: t.difficulty,
      correctDiagnosis: t.correctDiagnosis,
      caseData: t.caseData ? {
        patientInfo: t.caseData.patientInfo,
        hpi: t.caseData.hpi,
        vitals: t.caseData.vitals,
        diagnosis: t.caseData.diagnosis,
        differentials: t.caseData.differentials,
        keyQuestions: t.caseData.keyQuestions,
        teachingPoints: t.caseData.teachingPoints,
        availableLabs: t.caseData.availableLabs,
        availableImaging: t.caseData.availableImaging,
        labResults: t.caseData.labResults,
        imagingResults: t.caseData.imagingResults,
        hiddenHistory: t.caseData.hiddenHistory,
        ecgFindings: t.caseData.ecgFindings,
        hematologyFindings: t.caseData.hematologyFindings,
      } : null,
      workingDiagnosis: t.workingDiagnosis,
      transcript: t.transcript,
      testsOrdered: t.testsOrdered,
      unmatchedTests: t.unmatchedTests,
      diagnosis: t.diagnosis,
      reasoning: t.reasoning,
      studentNotes: t.studentNotes,
      grading: t.grading ? {
        score: t.grading.score,
        correct: t.grading.correct,
        feedback: t.grading.feedback,
        dimensions: t.grading.dimensions,
        missedQuestions: t.grading.missedQuestions,
      } : null,
      error: t.error,
      gradingError: t.gradingError,
    }))

    try {
      const text = await callReviewer(client, buildCaseReviewPrompt(slimBatch, idOffset))
      const findings = tryParseFindings(text) ?? []
      allFindings.push(...findings)
      idOffset += findings.length + 1
      console.log(`${findings.length} findings`)
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
    }
    await sleep(1000)
  }
  return allFindings
}

// ── Phase C: tab review ───────────────────────────────────────────────────────

async function reviewTabs(client, tabs) {
  const allFindings = []
  let idOffset = 200

  for (const { name, json, html } of tabs) {
    process.stdout.write(`  Tab: ${name}... `)
    try {
      const text = await callReviewer(client, buildTabReviewPrompt(name, json, html, idOffset))
      const findings = tryParseFindings(text) ?? []
      allFindings.push(...findings)
      idOffset += findings.length + 1
      console.log(`${findings.length} findings`)
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
    }
    await sleep(1000)
  }
  return allFindings
}

// ── Phase C: cross-cutting ────────────────────────────────────────────────────

async function reviewCrossCutting(client, caseFindings, tabFindings) {
  process.stdout.write('  Cross-cutting patterns... ')
  const all = [...caseFindings, ...tabFindings]
  if (all.length === 0) { console.log('no findings to analyze'); return [] }
  try {
    const text = await callReviewer(client, buildCrossCuttingPrompt(all, 1))
    const findings = tryParseFindings(text) ?? []
    console.log(`${findings.length} patterns`)
    return findings
  } catch (err) {
    console.log(`ERROR: ${err.message}`)
    return []
  }
}

// ── Markdown report ───────────────────────────────────────────────────────────

function renderMarkdown(caseFindings, tabFindings, crossCutting) {
  const all = [...crossCutting, ...caseFindings, ...tabFindings]
  const high   = all.filter(f => f.severity === 'high')
  const medium = all.filter(f => f.severity === 'medium')
  const low    = all.filter(f => f.severity === 'low')

  const lines = []
  lines.push('# MedTrainer Student Audit — Findings Report')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push('')
  lines.push(`**Total findings:** ${all.length}  (${high.length} high · ${medium.length} medium · ${low.length} low)`)
  lines.push('')

  const top10 = [...high, ...medium].slice(0, 10)
  if (top10.length) {
    lines.push('## Top Priority Findings')
    for (const f of top10) {
      lines.push(`\n### [${f.severity.toUpperCase()}] ${f.id}: ${f.title}`)
      lines.push(`**Category:** ${f.category}  |  **Source:** ${f.source?.type} — ${f.source?.ref}`)
      lines.push(`\n**Evidence:** > ${f.evidence}`)
      lines.push(`\n**Suggestion:** ${f.suggestion}`)
      if (f.fileHint) lines.push(`\n**File:** \`${f.fileHint}\``)
    }
    lines.push('')
  }

  if (crossCutting.length) {
    lines.push('## Cross-Cutting Patterns')
    for (const f of crossCutting) {
      lines.push(`\n### ${f.id}: ${f.title} _(${f.severity})_`)
      lines.push(`**Source:** ${f.source?.ref}`)
      lines.push(`\n${f.evidence}`)
      lines.push(`\n**Fix:** ${f.suggestion}`)
    }
    lines.push('')
  }

  if (caseFindings.length) {
    lines.push('## Case-Level Findings')
    const byCategory = { bug: [], inconsistency: [], medical_inaccuracy: [], improvement: [] }
    for (const f of caseFindings) { (byCategory[f.category] ?? byCategory.improvement).push(f) }
    for (const [cat, items] of Object.entries(byCategory)) {
      if (!items.length) continue
      lines.push(`\n### ${cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} (${items.length})`)
      for (const f of items) {
        lines.push(`\n**${f.id}** [${f.severity}] ${f.title} — _${f.source?.ref}_`)
        lines.push(`> ${f.evidence}`)
        lines.push(`*${f.suggestion}*`)
      }
    }
    lines.push('')
  }

  if (tabFindings.length) {
    lines.push('## Study-Tab Findings')
    const byTab = {}
    for (const f of tabFindings) {
      const ref = f.source?.ref ?? 'unknown'
      if (!byTab[ref]) byTab[ref] = []
      byTab[ref].push(f)
    }
    for (const [tab, items] of Object.entries(byTab)) {
      lines.push(`\n### ${tab} tab (${items.length} findings)`)
      for (const f of items) {
        lines.push(`\n**${f.id}** [${f.severity}/${f.category}] ${f.title}`)
        lines.push(`> ${f.evidence}`)
        lines.push(`*${f.suggestion}*`)
        if (f.fileHint) lines.push(`File: \`${f.fileHint}\``)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runReview() {
  const client = getClient()

  const transcripts = listTranscripts()
  const tabs = listTabArtifacts()

  console.log(`  ${transcripts.length} case transcripts, ${tabs.length} tab artifacts`)

  if (transcripts.length === 0 && tabs.length === 0) {
    console.log('  No artifacts to review. Run Phase A and/or B first.')
    return
  }

  console.log('  Reviewing cases...')
  const caseFindings = transcripts.length > 0 ? await reviewCases(client, transcripts) : []

  console.log('  Reviewing tabs...')
  const tabFindings = tabs.length > 0 ? await reviewTabs(client, tabs) : []

  console.log('  Finding cross-cutting patterns...')
  const crossCutting = await reviewCrossCutting(client, caseFindings, tabFindings)

  // Write outputs
  const output = {
    generatedAt: new Date().toISOString(),
    counts: {
      cases: transcripts.length,
      tabs: tabs.length,
      findings: { case: caseFindings.length, tab: tabFindings.length, crossCutting: crossCutting.length, total: caseFindings.length + tabFindings.length + crossCutting.length },
    },
    caseFindings,
    tabFindings,
    crossCutting,
  }
  writeJSON(FINDINGS_JSON, output)
  fs.writeFileSync(FINDINGS_MD, renderMarkdown(caseFindings, tabFindings, crossCutting))

  console.log(`\n  Findings: ${output.counts.findings.total} total`)
  console.log(`  → findings.json`)
  console.log(`  → findings.md`)
}
