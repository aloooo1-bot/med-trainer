/**
 * Patient-agent system prompt.
 *
 * Plain JS (like rubric.mjs and caseTiers.mjs) so it can be tested and audited
 * without Next's server-only guard; patientPrompt.ts is the server-only wrapper
 * that the app imports.
 */

import { selectHpiForDifficulty } from './caseTiers.mjs'

/** @typedef {Record<string, any>} AnyCase */

/**
 * A question that names a history DOMAIN is a direct question about everything
 * in it.
 *
 * The grading rubric already scores it that way: naming the domain ("any
 * medical conditions?", "what medications do you take?") is a full proactive
 * hit for every key question answerable inside it, on the stated grounds that
 * a clinician cannot name a diagnosis they are trying to uncover. The patient
 * agent did not share that definition — it was told to reveal a fact only when
 * asked about "that specific topic", and cases reinforce it in prose ("will
 * only disclose if directly asked whether he has ever been told about a heart
 * valve abnormality").
 *
 * The two rules met on a Clinical endocarditis case. The student asked what
 * medical conditions the patient had; the patient listed diabetes, hypertension
 * and CKD and withheld the bicuspid aortic valve; the grader then deducted for
 * not eliciting the valve. The student asked the question the rubric rewards
 * and was penalised for the simulation's refusal to answer it.
 *
 * So the domain question wins, and it wins over the case's own prose gate —
 * otherwise every case that spells out a narrower gate re-opens the trap. What
 * still buys nothing is the CONTENTLESS prompt ("anything else?"), which names
 * no domain and is exactly what the rubric half-credits as incidental. That
 * distinction is what keeps the interview a skill instead of a magic word.
 */
export const DOMAIN_DISCLOSURE_RULE = `HOW TO TELL IF YOU'VE BEEN ASKED ABOUT SOMETHING:
A question that names the AREA a fact belongs to counts as asking about that fact directly. The physician does not have to name your specific condition — they are trying to work out what you have, so they cannot name it in advance. When they name the area, answer with everything you have in it, in one go:
- "Any medical conditions / chronic illnesses / health problems?" or "Have you been told about anything wrong with your heart?" → every condition you have, INCLUDING ones you were told were mild, incidental, or not worth following up, and ones found on a scan or test years ago.
- "What medications / supplements are you taking?" → all of them.
- "Any allergies?" → all of them.
- "Any surgeries, hospitalizations, procedures, or dental work?" → every one of them.
- "Any family history of illness?" → everything you know about your relatives.
- The same applies to any other area they name: your work, your travel, your habits, a body system.
If a note in your history says you will only mention something when asked about it by name, that note does NOT override this. A question naming the area is enough, and you answer it fully.

What does NOT count as asking: a prompt that names no area at all — "Tell me more", "Anything else?", "What else is going on?", "How are you feeling?". Answer those the way a real patient would, vaguely and briefly, and wait to be asked something specific. Never use them as a cue to unload your history.`

/**
 * Build the patient-agent system prompt for one turn of the interview.
 *
 * @param {AnyCase} caseData
 * @param {string} caseDifficulty
 * @param {Set<string>} revealedExamRegions
 * @returns {string}
 */
export function buildPatientSystemPrompt(caseData, caseDifficulty, revealedExamRegions) {
  const isGated = caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced'
  const fullHistorySection = isGated && caseData.hiddenHistory.fullHistory !== 'N/A'
    ? `\nYour complete history (reveal a detail when the physician asks about that finding or about the area of your history it belongs to — see HOW TO TELL IF YOU'VE BEEN ASKED below; do NOT volunteer these proactively):\n${caseData.hiddenHistory.fullHistory}`
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

  // Review-of-systems knowledge. The grader treats the canonical reviewOfSystems
  // as ground truth, so the patient agent must know it too — otherwise a
  // directly-asked symptom (e.g. "any vomiting?") gets denied even though the
  // case says it's present, contradicting the grade. Revealed per-system only
  // when the physician asks about that system (preserves gating / anti-cueing).
  const rosEntries = Object.entries(caseData.reviewOfSystems ?? {})
    .filter(([, v]) => typeof v === 'string' && v.trim())
  const rosSection = rosEntries.length
    ? `\nYour body-system review (report the relevant part ONLY when the physician asks about that system or symptom — do NOT volunteer these; if a detail is something you would not personally know, e.g. a finding witnessed by others, attribute it to them: "my wife said…" rather than denying it):\n${rosEntries.map(([sys, v]) => `- ${sys}: ${v}`).join('\n')}`
    : ''

  // Must match buildPresentation's rule exactly: difficulty alone. Requiring
  // relevantExamRegions here meant that for every case lacking it — i.e. all of
  // them — the patient agent was handed the FULL exam and could describe
  // findings from regions the student had not examined yet.
  const isExamGated = caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced'
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

Other information — reveal when the physician asks about that specific topic OR about the area of your history it belongs to:
- Social history: ${caseData.hiddenHistory.socialHistory}
- Family history: ${caseData.hiddenHistory.familyHistory}
- Current medications: ${caseData.hiddenHistory.medications}
- Allergies: ${caseData.hiddenHistory.allergies}
- Additional symptoms if asked: ${caseData.hiddenHistory.hiddenSymptoms}
${rosSection}

${DOMAIN_DISCLOSURE_RULE}

Rules:
- Respond naturally as a patient, NOT as a medical expert
- Use lay terms; be slightly anxious or uncertain as a real patient would
- Keep answers concise (2-4 sentences)
- Stay in character at all times
- Answer what the student asks you about, including when they ask by naming the area rather than the specific thing. Do not volunteer symptoms or findings from body systems they have not asked about. Never summarize your full symptom list unprompted.
- For physical exam questions (palpation, auscultation, etc.): report what you feel, not clinical terminology
${behaviorRules}`
}
