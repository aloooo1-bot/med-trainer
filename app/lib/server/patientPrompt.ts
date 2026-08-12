import 'server-only'
import type { CaseData } from '../../trainer/_lib/types'
import {
  buildPatientSystemPrompt as _buildPatientSystemPrompt,
  DOMAIN_DISCLOSURE_RULE as _DOMAIN_DISCLOSURE_RULE,
} from './patientPrompt.mjs'

/**
 * Patient-agent system prompt. Server-side so hidden history never reaches the
 * browser and students cannot tamper with the roleplay rules.
 *
 * The prompt itself lives in patientPrompt.mjs — plain ESM, like rubric.mjs and
 * caseTiers.mjs — so it can be tested without Next's server-only guard. This
 * file is the boundary, nothing more.
 */
export const DOMAIN_DISCLOSURE_RULE: string = _DOMAIN_DISCLOSURE_RULE

export function buildPatientSystemPrompt(
  caseData: CaseData,
  caseDifficulty: string,
  revealedExamRegions: Set<string>,
): string {
  return _buildPatientSystemPrompt(
    caseData as unknown as Record<string, unknown>,
    caseDifficulty,
    revealedExamRegions,
  ) as string
}
