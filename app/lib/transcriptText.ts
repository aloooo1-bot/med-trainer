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
//
// Held as a source string so the matching and splitting forms cannot drift —
// the display and the graded transcript must agree on what counts as a gesture.
const STAGE_DIRECTION_SOURCE = '\\*[^*\\n]{1,120}\\*'
const STAGE_DIRECTION = new RegExp(STAGE_DIRECTION_SOURCE, 'g')
// Capturing, so String.split keeps the gestures instead of discarding them.
const STAGE_DIRECTION_SPLIT = new RegExp(`(${STAGE_DIRECTION_SOURCE})`, 'g')

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

export interface TranscriptSegment {
  /** Gesture segments have their surrounding asterisks removed. */
  text: string
  kind: 'speech' | 'gesture'
}

/**
 * Split an utterance into spoken content and roleplay gesture, for display.
 *
 * The interview renders replies verbatim, so "*shifts in seat, looking a bit
 * uncomfortable* Well, I've had trouble with my breathing…" arrives as one
 * undifferentiated run of text and the gesture reads like clinical content.
 *
 * Deliberately splits rather than strips. These gestures are the patient's
 * emotional cues — the material the communication feedback marks a student on —
 * so hiding them would conceal a signal they are assessed against. The grader
 * strips them independently on the server, so what is displayed and what is
 * graded stay decoupled while sharing one definition of a gesture.
 */
export function splitStageDirections(text: string): TranscriptSegment[] {
  if (!text?.trim()) return []
  return text
    .split(STAGE_DIRECTION_SPLIT)
    .map((part): TranscriptSegment | null => {
      if (!part) return null
      const isGesture = part.startsWith('*') && part.endsWith('*') && part.length > 2
      const body = isGesture ? part.slice(1, -1).trim() : part
      return body.trim() ? { text: body, kind: isGesture ? 'gesture' : 'speech' } : null
    })
    .filter((s): s is TranscriptSegment => s !== null)
}
