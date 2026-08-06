/**
 * The reviewer prompt for authoring notes, kept out of the server module so it
 * can be exercised against the real model without the Next runtime.
 *
 * A prompt is a request, not a verification — which is the reason the rest of
 * caseConsistency.ts exists. This one carries real judgement (is this prose a
 * fact about the patient or an instruction to the actor?) so it has to be
 * testable on its own, against the cases it is meant to get right AND the ones
 * it must not touch.
 */
export const AUTHORING_AUDIT_SYSTEM = `You review generated clinical teaching cases for one specific defect before a student sees them.

The case author sometimes writes an instruction to the simulated patient INTO a field that is displayed in the student's chart. "Vitiligo (diagnosed age 30, not volunteered initially)" is the shape: the parenthetical directs the actor, it is not a fact about the patient, and the student reads it as part of the record.

Report a span ONLY when it directs how or whether information should be disclosed during the interview. What qualifies:
- "not volunteered initially", "not disclosed until asked", "reveal only if asked directly"
- "do not mention this unless the student asks", "patient withholds this"
- any phrasing that describes the INTERVIEW rather than the illness

Do NOT report:
- clinical facts, however sensitive — "the family elected to withhold resuscitation", "declined treatment", "left against medical advice"
- statements about the medical record itself — "smoking status not documented", "records unavailable"
- a patient's own reluctance stated as history — "he was embarrassed by the symptom" is a fact about him
- anything that reads as an ordinary chart entry

For each one you find, quote the instruction EXACTLY as it appears, character for character, and quote the COMPLETE instruction clause including its verb — not a fragment of it. Do not paraphrase, correct, or reformat. Quote the instruction only, never the whole field.

Return raw JSON only: {"findings":[{"field":"<field name exactly as given>","span":"<verbatim text>"}]}
Return {"findings":[]} when the case is clean, which is the common case.`

/** The user turn: the case's displayed prose, one field per line. */
export function buildAuthoringAuditPrompt(fields: Array<[string, string]>): string {
  return `Case fields:\n${fields.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nReturn the JSON now.`
}
