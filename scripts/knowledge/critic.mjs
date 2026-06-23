/**
 * Critic-as-a-gate: an automated accuracy check run on a freshly generated case
 * BEFORE it is published. This is the cheap substitute for per-case physician
 * review — combine with the authored profile (loadProfile) so the critic verifies
 * both internal medical accuracy AND conformance to the verified profile.
 *
 * Usage (in a generation loop):
 *   const verdict = await critiqueCase(caseData, loadProfile(diagnosis), anthropic)
 *   if (!verdict.pass) { regenerate or flag }
 */
import { profileFactSheet } from '../../app/lib/knowledge/format.ts'

function caseSummary(c) {
  const labs = Object.entries(c.labResults ?? {}).slice(0, 8).map(([name, r]) => {
    const abn = (r.components ?? []).filter(x => x.status && x.status !== 'normal')
      .map(x => `${x.name} ${x.value}${x.unit ? x.unit : ''} [${x.status}]`)
    return abn.length ? `${name}: ${abn.join(', ')}` : null
  }).filter(Boolean).join(' | ')
  const imaging = Object.entries(c.imagingResults ?? {}).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join('\n')
  return [
    `Diagnosis: ${c.diagnosis}`,
    `Vitals: BP ${c.vitals?.bp} HR ${c.vitals?.hr} RR ${c.vitals?.rr} Temp ${c.vitals?.temp}F SpO2 ${c.vitals?.spo2}%`,
    `HPI: ${c.hpi}`,
    `Abnormal labs: ${labs || '(none)'}`,
    `Imaging: ${imaging || '(none)'}`,
    `Differentials: ${(c.differentials ?? []).join(' | ')}`,
    `Teaching points: ${(c.teachingPoints ?? []).join(' | ')}`,
  ].join('\n')
}

export async function critiqueCase(caseData, profile, anthropic) {
  const factSheet = profile ? profileFactSheet(profile) : '(no verified profile available for this diagnosis)'
  const prompt = `You are a clinical-medicine faculty reviewer acting as a publish gate.

VERIFIED PROFILE (ground truth):
${factSheet}

GENERATED CASE:
${caseSummary(caseData)}

Check: (1) is every lab/vital/finding medically plausible and internally consistent with the diagnosis? (2) does the case contradict the verified profile? (3) are the teaching points factually correct?

Return ONLY JSON: {"pass": <true unless there is a MAJOR medical error or a direct contradiction of the profile>, "severity": "ok"|"minor"|"major", "issues": ["<specific, actionable issue>", ...]}`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: 'You are a clinical-medicine faculty reviewer. Return ONLY valid JSON.',
    messages: [{ role: 'user', content: prompt }],
  })
  const text = msg.content.find(c => c.type === 'text')?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return { pass: false, severity: 'major', issues: ['critic returned no parseable verdict'] }
  try {
    const v = JSON.parse(match[0])
    return { pass: v.pass !== false, severity: v.severity ?? 'ok', issues: v.issues ?? [] }
  } catch {
    return { pass: false, severity: 'major', issues: ['critic verdict was not valid JSON'] }
  }
}
