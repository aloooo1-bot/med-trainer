/**
 * Transcript cleanup shared by the ROS summariser and the grader.
 *
 * The patient agent is instructed to roleplay, and it emits stage directions in
 * asterisks — *shakes head*, *pauses*, *counts on fingers*. Those are theatre,
 * not clinical data, but every downstream consumer received them verbatim. The
 * ROS summariser duly documented "Reports touching chest area during dyspnea"
 * from a *touches chest*, inventing a physical finding out of a gesture. The
 * grader read them too.
 *
 * Pure + testable: no model calls, no server-only imports.
 */

// Non-greedy, single-line: a stray asterisk cannot swallow the rest of the
// reply, and a multi-sentence gesture block still goes as one unit.
const STAGE_DIRECTION = /\*[^*\n]{1,120}\*/g

/**
 * Remove roleplay stage directions from a patient utterance, leaving the spoken
 * content. Whitespace and orphaned punctuation left behind are tidied so the
 * result reads as prose rather than as something with holes in it.
 */
export function stripStageDirections(text: string): string {
  if (!text) return ''
  return text
    .replace(STAGE_DIRECTION, ' ')
    // A gesture between sentences leaves " . " or doubled punctuation behind.
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/([.,!?;:])\1+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** True when the text is nothing but stage directions (no spoken content). */
export function isOnlyStageDirections(text: string): boolean {
  return !!text.trim() && stripStageDirections(text) === ''
}
