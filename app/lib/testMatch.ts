import { MASTER_TEST_LIST, type TestEntry } from './testMasterList'

/**
 * Fuzzy matching between a free-typed test order and a case's result keys
 * (Advanced fairness, remediation 4.3). A correctly ordered test phrased
 * differently — "CT pulmonary angiogram" vs the case's "CTPA" — must resolve
 * to the stored result instead of "(no result available)".
 *
 * Conservative by design:
 *  - AUTO match only on a strong, unambiguous score.
 *  - Middling or contested scores return SUGGESTIONS so the student confirms
 *    the canonical name rather than being silently rerouted.
 * Pure and deterministic so order-time and resume-time resolution agree.
 */

export interface FuzzyResolution {
  /** Auto-resolved result key, or null. */
  match: string | null
  /** Candidate keys to confirm when the match is plausible but ambiguous. */
  suggestions: string[]
}

const AUTO_THRESHOLD = 0.72
const AUTO_GAP = 0.15
const SUGGEST_THRESHOLD = 0.4

export function normalizeTestString(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

const STOP_WORDS = new Set(['with', 'and', 'the', 'of', 'for', 'a', 'an', 'test', 'level', 'levels', 'panel', 'study'])

function tokenSet(s: string): Set<string> {
  return new Set(normalizeTestString(s).split(' ').filter(w => w && !STOP_WORDS.has(w)))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

/**
 * Expand a query into every phrasing the master list knows for it: if the
 * query names a master entry (by name, abbreviation, or synonym), all of that
 * entry's phrasings become aliases of the query.
 */
export function expandQueryAliases(query: string, list: TestEntry[] = MASTER_TEST_LIST): string[] {
  const norm = normalizeTestString(query)
  const aliases = new Set<string>([query])
  for (const entry of list) {
    const phrasings = [entry.name, ...entry.abbreviations, ...entry.synonyms]
    const hit = phrasings.some(p => {
      const np = normalizeTestString(p)
      return np === norm || (np.length > 3 && jaccard(tokenSet(np), tokenSet(norm)) >= 0.99)
    })
    if (hit) for (const p of phrasings) aliases.add(p)
  }
  return Array.from(aliases)
}

/** Best fuzzy score between the query (with alias expansion) and one key. */
export function scoreAgainstKey(queryAliases: string[], key: string): number {
  const keyTokens = tokenSet(key)
  let best = 0
  for (const alias of queryAliases) {
    const s = jaccard(tokenSet(alias), keyTokens)
    if (s > best) best = s
  }
  return best
}

/**
 * Resolve a free-typed order against the case's available result keys.
 * Returns an auto-match only when one key clearly wins; otherwise up to three
 * suggestions for the student to confirm (or nothing when implausible).
 */
export function fuzzyResolveTest(
  query: string,
  candidateKeys: string[],
  list: TestEntry[] = MASTER_TEST_LIST,
): FuzzyResolution {
  if (!query.trim() || candidateKeys.length === 0) return { match: null, suggestions: [] }

  const aliases = expandQueryAliases(query, list)
  const scored = candidateKeys
    .map(key => ({ key, score: scoreAgainstKey(aliases, key) }))
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  const second = scored[1]

  if (best.score >= AUTO_THRESHOLD && (!second || best.score - second.score >= AUTO_GAP || second.score < SUGGEST_THRESHOLD)) {
    return { match: best.key, suggestions: [] }
  }
  const suggestions = scored.filter(s => s.score >= SUGGEST_THRESHOLD).slice(0, 3).map(s => s.key)
  // A single plausible candidate that just missed the auto bar is still a
  // suggestion, not a match — conservative on purpose.
  return { match: null, suggestions }
}
