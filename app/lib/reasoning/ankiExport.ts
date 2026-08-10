/**
 * Anki plain-text export of the personal recall deck.
 *
 * Produces Anki's native "Notes in Plain Text" import format (File → Import in
 * Anki desktop): header directives, then one tab-separated row per card of
 * Front / Back / Tags. Cards import as NEW notes — SM-2 scheduling deliberately
 * stays in-app (Anki restarts its own scheduling; a TSV cannot carry history).
 *
 * Pure module (no storage, no DOM) so it unit-tests like spacedRepetition.ts;
 * the download plumbing lives in the caller (DeckBrowser).
 */
import type { ReviewItem } from './types'

const HEADER = [
  '#separator:tab',
  '#html:false',
  '#tags column:3',
  '#deck:MedTrainer Recall',
]

/** Anki tags are space-separated: collapse spaces/slashes inside one tag to '-'. */
function tagify(s: string): string {
  return s.replace(/\s*\/\s*/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

/** TSV cells cannot contain tabs or newlines — collapse to single spaces. */
function cell(s: string): string {
  return s.replace(/[\t\r\n]+/g, ' ').trim()
}

export function buildAnkiTsv(items: ReviewItem[]): string {
  const rows = items.map(i => {
    const tags = ['MedTrainer', `MedTrainer::sys::${tagify(i.system)}`, `MedTrainer::type::${tagify(i.tag)}`]
    return [cell(i.prompt), cell(i.answer), tags.join(' ')].join('\t')
  })
  return [...HEADER, ...rows].join('\n') + '\n'
}

/** Dated filename so repeated exports don't shadow each other in Downloads. */
export function ankiExportFilename(now: number): string {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `medtrainer-anki-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.txt`
}
