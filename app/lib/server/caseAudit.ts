import 'server-only'
import {
  studentFacingProse,
  applyAuthoringNoteFindings,
  findAuthoringNote,
  type CheckableCase,
} from '../caseConsistency'
import { AUTHORING_AUDIT_SYSTEM, buildAuthoringAuditPrompt } from '../authoringNotePrompt'
import { callModel, extractJson } from './llm'
import type { RawUsage } from '../analytics'

/**
 * Model-driven audit for authoring notes in student-facing prose.
 *
 * The regex family in caseConsistency.ts is a ratchet against phrasings that
 * have actually been found — "not volunteered initially", "reveal only if
 * asked". It cannot catch a wording nobody has written yet, and generation is
 * the one moment the case is in hand before a student reads it.
 *
 * The division of labour is the point. The MODEL decides what is an
 * instruction to the actor rather than a fact about the patient — a judgement
 * no pattern can make. The CODE does the surgery, excising only spans the
 * model quoted verbatim. A model asked to rewrite clinical prose will quietly
 * reword findings; a model asked only to point is far harder to get wrong, and
 * applyAuthoringNoteFindings discards anything it cannot verify.
 *
 * Fails open in every direction. A case carrying a stage direction is worse
 * than one without, but much better than no case at all, so a refusal, a
 * timeout, unparseable JSON or a hallucinated span all leave the case as it
 * arrived.
 */

export interface AuthoringNoteAudit {
  /** Human-readable record of what was removed, for the generation log. */
  removed: string[]
  usage?: RawUsage
}

/**
 * Audit and repair IN PLACE, returning what was removed.
 *
 * Mutates because it sits in the generation pipeline beside sanitizePmhLeak and
 * reconcileHistoryConsistency, which hand the same object along.
 */
export async function auditAuthoringNotes(
  caseData: CheckableCase,
  onUsage?: (usage: RawUsage) => void,
): Promise<AuthoringNoteAudit> {
  const fields = studentFacingProse(caseData)
    .filter((f): f is [string, string] => typeof f[1] === 'string' && f[1].trim().length > 0)
  if (!fields.length) return { removed: [] }

  try {
    const { text, usage } = await callModel('case_audit', {
      system: AUTHORING_AUDIT_SYSTEM,
      messages: [{ role: 'user', content: buildAuthoringAuditPrompt(fields) }],
      maxTokens: 600,
    })
    onUsage?.(usage)
    const parsed = extractJson<{ findings?: unknown }>(text)
    return { removed: applyAuthoringNoteFindings(caseData, parsed?.findings), usage }
  } catch (err) {
    // Fail open — a flawed case beats no case. But say so: an audit that
    // silently never runs is indistinguishable from one that finds nothing,
    // and this is the only guard against a phrasing the patterns cannot see.
    console.warn(`[caseAudit] authoring-note audit skipped: ${err instanceof Error ? err.message : String(err)}`)
    return { removed: [] }
  }
}

/**
 * The notes the cheap pattern family can already see, for comparison against
 * what the audit removes — so a novel phrasing becomes a new pattern rather
 * than a silent repair nobody learns from. A safety net that catches something
 * the cheap check should have caught is worth knowing about.
 *
 * Must be called BEFORE the audit: it repairs in place, and the generation
 * pipeline's repair steps share nested objects, so there is no intact "before"
 * copy to read afterwards.
 */
export function knownAuthoringNotes(c: CheckableCase): string[] {
  return studentFacingProse(c)
    .map(([, v]) => (typeof v === 'string' ? findAuthoringNote(v) : null))
    .filter((s): s is string => !!s)
}
