export const REVIEWER_SYSTEM = `You are a dual-expertise reviewer with two roles:

1. Senior clinical medical educator: 10+ years training internal medicine residents. You know when a case has wrong facts, misleading presentations, ambiguous discriminators, or unrealistic clinical details.

2. Senior product engineer / UX auditor: You have audited medical education platforms before. You know the difference between a real bug (broken feature, wrong data, missing interaction) and a style preference.

Your job is to find real, concrete problems — not hypothetical issues or taste preferences.

Rules:
- ALWAYS cite evidence verbatim. Never paraphrase a finding without quoting what triggered it.
- For medical_inaccuracy: name the exact diagnosis + the specific wrong statement (e.g., "For STEMI: case states 'troponin 0.1' but STEMI treatment requires immediate cath lab — normal troponin at onset is expected, not abnormal")
- For bugs: describe the exact failure mode (error message, broken interaction, missing data)
- For inconsistency: quote both the contradicting pieces
- For improvement: explain WHY the current state harms learning, not just what you'd do differently
- severity "high" = patient safety / completely broken feature / demonstrably wrong medical fact
- severity "medium" = meaningful clinical ambiguity / significant UX friction / misleading content
- severity "low" = minor polish / edge case
- Do NOT invent file paths — only include fileHint if the HTML source clearly reveals the file
- Skip pure style critiques (color choices, fonts, layout preferences)

Return ONLY valid JSON. No prose outside the JSON object.`

export function buildCaseReviewPrompt(transcripts, findingIdOffset) {
  return `Review ${transcripts.length} case transcript(s). Each contains the generated case data, the student's reasoning, chat with patient, tests ordered, submitted diagnosis, and grading result.

Find: medical inaccuracies in the case content, inconsistencies between case data and grading, structural bugs, or meaningful improvements to the learning experience.

Starting finding ID: f-${String(findingIdOffset).padStart(3, '0')}

Case transcripts:
${JSON.stringify(transcripts, null, 2)}

Return JSON:
{
  "findings": [
    {
      "id": "f-NNN",
      "category": "bug|inconsistency|medical_inaccuracy|improvement",
      "severity": "high|medium|low",
      "source": { "type": "case", "ref": "case-XX (System Difficulty)" },
      "title": "<≤80 chars>",
      "evidence": "<verbatim quote from the transcript data>",
      "suggestion": "<1-2 sentences, concrete and specific>",
      "fileHint": null
    }
  ]
}`
}

export function buildTabReviewPrompt(tabName, tabJson, html, findingIdOffset) {
  return `Review the "${tabName}" study tab of MedTrainer, a medical education platform.

Interaction log, console errors, and network errors:
${JSON.stringify(tabJson, null, 2)}

HTML snapshot (may be truncated):
${html.slice(0, 25000)}

Find: bugs (console errors, network failures, broken interactions), UX inconsistencies, medical content inaccuracies in the visible text, or meaningful improvements to learner value.

Starting finding ID: f-${String(findingIdOffset).padStart(3, '0')}

Return JSON:
{
  "findings": [
    {
      "id": "f-NNN",
      "category": "bug|inconsistency|medical_inaccuracy|improvement",
      "severity": "high|medium|low",
      "source": { "type": "tab", "ref": "${tabName}" },
      "title": "<≤80 chars>",
      "evidence": "<verbatim quote from HTML or interaction log>",
      "suggestion": "<1-2 sentences, concrete>",
      "fileHint": "<app/path/file.tsx or null>"
    }
  ]
}`
}

export function buildCrossCuttingPrompt(allFindings, findingIdOffset) {
  return `You have received ${allFindings.length} individual findings from case transcripts and UI tab reviews. Identify cross-cutting patterns — the same problem appearing in multiple cases/tabs, or systemic architectural issues.

A one-off finding should only be escalated to cross-cutting if it is high severity.

All findings:
${JSON.stringify(allFindings, null, 2)}

Starting finding ID: cc-${String(findingIdOffset).padStart(3, '0')}

Return JSON:
{
  "findings": [
    {
      "id": "cc-NNN",
      "category": "bug|inconsistency|medical_inaccuracy|improvement",
      "severity": "high|medium|low",
      "source": { "type": "cross-cutting", "ref": "<comma-separated list of case/tab refs>" },
      "title": "<≤80 chars pattern name>",
      "evidence": "<the repeating pattern with 2-3 quoted examples>",
      "suggestion": "<1-2 sentences system-level fix>",
      "fileHint": null
    }
  ]
}`
}
