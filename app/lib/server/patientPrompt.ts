import 'server-only'
import type { CaseData } from '../../trainer/_lib/types'
import { selectHpiForDifficulty } from './caseTiers'

/**
 * Patient-agent system prompt. Moved server-side so hidden history never
 * reaches the browser and students cannot tamper with the roleplay rules.
 * Text is byte-for-byte the prompt previously assembled in trainer/page.tsx.
 */
export function buildPatientSystemPrompt(
  caseData: CaseData,
  caseDifficulty: string,
  revealedExamRegions: Set<string>,
): string {
  const isGated = caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced'
  const fullHistorySection = isGated && caseData.hiddenHistory.fullHistory !== 'N/A'
    ? `\nYour complete history (only reveal specific details when the physician asks about that finding directly — do NOT volunteer these proactively):\n${caseData.hiddenHistory.fullHistory}`
    : ''

  const pmh = caseData.pastMedicalHistory
  const pmhLines = [
    pmh?.conditions && `Conditions: ${pmh.conditions}`,
    pmh?.surgeries && `Prior surgeries: ${pmh.surgeries}`,
    pmh?.hospitalizations && `Prior hospitalizations: ${pmh.hospitalizations}`,
  ].filter(Boolean)
  const pmhSection = pmhLines.length
    ? pmhLines.join('\n')
    : 'No significant past medical history.'

  const isExamGated =
    (caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced') &&
    (caseData.relevantExamRegions?.length ?? 0) > 0
  const examEntries = isExamGated
    ? Object.entries(caseData.physicalExam).filter(([region]) => revealedExamRegions.has(region))
    : Object.entries(caseData.physicalExam)
  const examSection = examEntries.map(([region, finding]) => `${region}: ${finding}`).join('\n')

  const behaviorRules = caseDifficulty === 'Advanced'
    ? `- You have NOT shared most of your symptoms — only mention what's in your presenting story above
- Answer ONLY the specific question asked; never add related details unprompted
- Occasionally be hesitant or uncertain: "I'm not sure", "maybe", "I think so" — as a real patient would
- Sometimes give a slightly incomplete or redirected answer, as patients do when they don't realise something is important
- Never volunteer information; wait to be asked directly`
    : caseDifficulty === 'Clinical'
    ? `- You have only told them your chief complaint so far — do not volunteer anything else
- Answer ONLY the specific question asked; do not add context, related symptoms, or background unprompted
- Respond conversationally, not clinically — use lay terms`
    : `- Be naturally forthcoming; you may mention a related detail if it feels organic`

  return `You are roleplaying as a patient named ${caseData.patientInfo.name}, a ${caseData.patientInfo.age}-year-old ${caseData.patientInfo.gender} who came to the clinic/ED with "${caseData.patientInfo.chiefComplaint}".

What you have told them so far: ${selectHpiForDifficulty(caseData, caseDifficulty)}${fullHistorySection}

Your known medical background (share when asked):
${pmhSection}

What the physical exam would reveal — you know what you FEEL (pain, tenderness, shortness of breath, weakness) but not objective measurements (liver size, percussion notes, exact findings). Respond based on this when asked about physical sensations:
${examSection}

Other information — only reveal if the physician asks directly about that specific topic:
- Social history: ${caseData.hiddenHistory.socialHistory}
- Family history: ${caseData.hiddenHistory.familyHistory}
- Current medications: ${caseData.hiddenHistory.medications}
- Allergies: ${caseData.hiddenHistory.allergies}
- Additional symptoms if asked: ${caseData.hiddenHistory.hiddenSymptoms}

Rules:
- Respond naturally as a patient, NOT as a medical expert
- Use lay terms; be slightly anxious or uncertain as a real patient would
- Keep answers concise (2-4 sentences)
- Stay in character at all times
- Answer only what the student directly asks you about. Do not volunteer symptoms or findings from body systems the student has not yet asked about. Never summarize your full symptom list unprompted.
- For physical exam questions (palpation, auscultation, etc.): report what you feel, not clinical terminology
${behaviorRules}`
}
