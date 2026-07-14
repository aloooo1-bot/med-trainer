/**
 * Image ↔ case matching by structured attributes (laterality fail-safe).
 *
 * Selecting an image by pathology CATEGORY alone is blind to case-specific
 * detail: a "right pleural effusion" case pulling a random effusion film is
 * just as likely to show a LEFT effusion. In a diagnostic-reasoning trainer a
 * contradictory image actively teaches the wrong thing, so the governing rule
 * is: **a wrong image is worse than no image.** When we cannot confirm an image
 * matches the case's specified side, we suppress it and show the report only.
 *
 * This module is the pure matching core (no fs, no server-only) so both the
 * server selector and the review scripts can share it, and it is unit-tested.
 */

export type Laterality = 'left' | 'right' | 'bilateral' | 'midline' | 'unknown'

/** Runtime list of valid laterality values (for validation in routes/scripts). */
export const VALID_LATERALITY_VALUES: readonly Laterality[] = ['left', 'right', 'bilateral', 'midline', 'unknown']

/** Per-image attributes, produced by the review pass (scripts/review-images.mjs). */
export interface ImageAttributes {
  laterality?: Laterality
  /** Structured findings, e.g. ['pleural effusion', 'blunted costophrenic angle']. */
  features?: string[]
  severity?: 'mild' | 'moderate' | 'severe'
  /** Provenance: automated vision pass vs a human reviewer. */
  review?: 'auto' | 'human'
  /** Reviewer confidence 0-1. */
  confidence?: number
  reason?: string
}

/**
 * strict  — for a lateralized case, serve ONLY images confirmed to match the
 *           side; otherwise suppress (report-only). Default.
 * lenient — prefer confirmed matches, but fall back to unconfirmed images
 *           (flagged); still never serve a confirmed-conflicting side.
 */
export type LateralityPolicy = 'strict' | 'lenient'

export interface ImageMatch {
  /** The laterality the case requires. */
  required: Laterality
  /** Outcome for the served image (or lack of one). */
  status: 'confirmed' | 'unconfirmed' | 'suppressed'
  reason?: string
}

// ── Laterality extraction ─────────────────────────────────────────────────────

const BILATERAL_RE = /\b(bilateral|both\s+(?:lungs?|sides?|kidneys?|eyes?|lower\s+lobes?)|right\s+and\s+left|left\s+and\s+right)\b/
const RIGHT_RE = /\bright(?:[-\s]sided?)?\b/
const LEFT_RE = /\bleft(?:[-\s]sided?)?\b/
const MIDLINE_RE = /\bmidline\b/

/** Parse a single text fragment for the laterality it describes. */
export function extractLaterality(text: string): Laterality {
  const t = (text ?? '').toLowerCase()
  if (!t) return 'unknown'
  if (BILATERAL_RE.test(t)) return 'bilateral'
  const hasR = RIGHT_RE.test(t)
  const hasL = LEFT_RE.test(t)
  if (hasR && hasL) return 'bilateral' // both sides named without "bilateral"
  if (hasR) return 'right'
  if (hasL) return 'left'
  if (MIDLINE_RE.test(t)) return 'midline'
  return 'unknown'
}

/**
 * The laterality the case requires for its imaging. `imagingCategory` is the
 * short authoritative descriptor (e.g. "right pleural effusion"); longer
 * fallbacks (report text) are consulted only if it is silent.
 */
export function caseLaterality(imagingCategory: string | undefined, ...fallbacks: Array<string | undefined>): Laterality {
  const primary = extractLaterality(imagingCategory ?? '')
  if (primary !== 'unknown') return primary
  for (const f of fallbacks) {
    const l = extractLaterality(f ?? '')
    if (l !== 'unknown') return l
  }
  return 'unknown'
}

/**
 * Relationship between what the case requires and what an image shows.
 * A missing/unknown image side is 'unconfirmed' — we cannot vouch for it, which
 * (under strict policy) is NOT good enough to serve for a lateralized case.
 */
export function lateralityRelation(required: Laterality, imageSide: Laterality | undefined): 'match' | 'conflict' | 'unconfirmed' {
  if (required === 'unknown') return 'match' // case is non-lateralized → no constraint
  const img = imageSide ?? 'unknown'
  if (img === 'unknown') return 'unconfirmed'
  return img === required ? 'match' : 'conflict'
}

// ── Selection over a candidate pool ──────────────────────────────────────────

export interface Candidate<T> {
  item: T
  laterality?: Laterality
}

export interface Classified<T> {
  matches: T[]
  unconfirmed: T[]
  conflicts: T[]
}

/** Pure partition of candidates by their relation to the required side. */
export function classifyCandidates<T>(candidates: Array<Candidate<T>>, required: Laterality): Classified<T> {
  const matches: T[] = []
  const unconfirmed: T[] = []
  const conflicts: T[] = []
  for (const c of candidates) {
    const rel = lateralityRelation(required, c.laterality)
    if (rel === 'match') matches.push(c.item)
    else if (rel === 'unconfirmed') unconfirmed.push(c.item)
    else conflicts.push(c.item)
  }
  return { matches, unconfirmed, conflicts }
}

/**
 * Choose one image that is safe to show for this case, honoring the fail-safe.
 * `pick` selects one element from a non-empty list (injectable for determinism
 * in tests; defaults to random).
 */
export function selectByLaterality<T>(
  candidates: Array<Candidate<T>>,
  required: Laterality,
  policy: LateralityPolicy = 'strict',
  pick: (xs: T[]) => T = xs => xs[Math.floor(Math.random() * xs.length)],
): { item: T | null; match: ImageMatch } {
  const { matches, unconfirmed } = classifyCandidates(candidates, required)
  if (matches.length) {
    return { item: pick(matches), match: { required, status: 'confirmed' } }
  }
  if (policy === 'lenient' && unconfirmed.length) {
    return {
      item: pick(unconfirmed),
      match: { required, status: 'unconfirmed', reason: 'image laterality not verified for this case' },
    }
  }
  return {
    item: null,
    match: {
      required,
      status: 'suppressed',
      reason: required === 'unknown'
        ? 'no image available for this study'
        : `no image confirmed to match ${required} laterality — showing report only`,
    },
  }
}

/**
 * Filter a list of already-fetched images (e.g. live Open-i results) by the
 * case's required side, reading each image's side from its own text (caption/
 * abstract). Confirmed conflicts are always dropped; matches are sorted first.
 * Under strict policy a lateralized case with no confirmed match yields an
 * empty list (→ report only).
 */
export function filterByLaterality<T>(
  items: T[],
  textOf: (t: T) => string,
  required: Laterality,
  policy: LateralityPolicy = 'strict',
): { items: T[]; match: ImageMatch } {
  if (required === 'unknown') {
    return { items, match: { required, status: items.length ? 'unconfirmed' : 'suppressed' } }
  }
  const tagged = items.map(t => ({ t, rel: lateralityRelation(required, extractLaterality(textOf(t))) }))
  const matches = tagged.filter(x => x.rel === 'match').map(x => x.t)
  const unconfirmed = tagged.filter(x => x.rel === 'unconfirmed').map(x => x.t)

  if (matches.length) {
    // matches first, then unconfirmed as secondary options; conflicts dropped.
    return { items: [...matches, ...unconfirmed], match: { required, status: 'confirmed' } }
  }
  if (policy === 'lenient' && unconfirmed.length) {
    return { items: unconfirmed, match: { required, status: 'unconfirmed', reason: 'image laterality not verified for this case' } }
  }
  return { items: [], match: { required, status: 'suppressed', reason: `no image confirmed to match ${required} laterality — showing report only` } }
}
