/**
 * The knowledge spine's job at generation time: turn a verified DiagnosisProfile
 * into a constraint block the case generator must conform to. This is the Tier-0
 * accuracy lever — instead of reviewing every generated case, you author/verify a
 * profile ONCE per diagnosis and every case variant is generated against it.
 *
 * Pure + bundleable (no fs / no SDK) so it can be unit-tested and imported from
 * both the server generators and scripts.
 */
import type { DiagnosisProfile } from '../reasoning/types'

export function formatProfileForPrompt(profile: DiagnosisProfile): string {
  const lines: string[] = []
  lines.push(
    `VERIFIED KNOWLEDGE PROFILE — the generated case MUST conform to this reviewed profile for "${profile.diagnosis}". Do not contradict any item below; any additional findings must remain consistent with it.`,
  )

  if (profile.discriminators?.length) {
    lines.push(
      `- Discriminating features (each MUST be discoverable in the case via exam, labs, imaging, or elicitable history): ${profile.discriminators.join('; ')}`,
    )
  }

  if (profile.expectedWorkup?.length) {
    const w = profile.expectedWorkup
      .map(x => `${x.test} → ${x.typicalResult}${x.cutoff ? ` (cutoff ${x.cutoff})` : ''}`)
      .join(' | ')
    lines.push(`- Expected workup with typical results (case results MUST be consistent with these): ${w}`)
  }

  if (profile.differentials?.length) {
    const d = profile.differentials
      .map(x => `${x.name} [${x.category}] — distinguished by ${x.howToDistinguish}`)
      .join(' | ')
    lines.push(`- Differentials to include and how each is distinguished: ${d}`)
  }

  if (profile.firstLineManagement?.length) {
    const m = profile.firstLineManagement
      .map(x => [x.step, x.drug, x.dose, x.threshold].filter(Boolean).join(' '))
      .join('; ')
    lines.push(`- First-line management (at least one teachingPoint MUST reflect this): ${m}`)
  }

  if (profile.mechanism) {
    lines.push(`- Mechanism (base the case's mechanism field on this): ${profile.mechanism}`)
  }

  return lines.join('\n')
}

/**
 * A compact JSON view of the profile for the critic/verifier — the gate that
 * checks a generated case against its profile before publishing.
 */
export function profileFactSheet(profile: DiagnosisProfile): string {
  return JSON.stringify(
    {
      diagnosis: profile.diagnosis,
      discriminators: profile.discriminators,
      expectedWorkup: profile.expectedWorkup,
      differentials: profile.differentials,
      firstLineManagement: profile.firstLineManagement,
    },
    null,
    1,
  )
}
