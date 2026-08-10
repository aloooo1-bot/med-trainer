import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAnkiTsv, ankiExportFilename } from '../ankiExport'
import type { ReviewItem } from '../types'

const T0 = 1_700_000_000_000

function item(over: Partial<ReviewItem>): ReviewItem {
  return {
    id: 'iga-nephropathy::mechanism',
    prompt: 'What is the underlying mechanism of IgA Nephropathy?',
    answer: 'Galactose-deficient IgA1 immune complexes deposit in the mesangium.',
    diagnosis: 'IgA Nephropathy',
    system: 'Renal',
    tag: 'mechanism',
    ease: 2.5,
    intervalDays: 0,
    repetitions: 0,
    dueAt: T0,
    createdAt: T0,
    ...over,
  }
}

test('buildAnkiTsv emits Anki header directives then one row per card', () => {
  const tsv = buildAnkiTsv([item({}), item({ id: 'x::management', tag: 'management' })])
  const lines = tsv.trimEnd().split('\n')
  assert.deepEqual(lines.slice(0, 4), ['#separator:tab', '#html:false', '#tags column:3', '#deck:MedTrainer Recall'])
  assert.equal(lines.length, 6)
  const [front, back, tags] = lines[4].split('\t')
  assert.match(front, /^What is the underlying mechanism/)
  assert.match(back, /mesangium\.$/)
  assert.equal(tags, 'MedTrainer MedTrainer::sys::Renal MedTrainer::type::mechanism')
})

test('system names with spaces and slashes become single hyphenated Anki tags', () => {
  const tsv = buildAnkiTsv([item({ system: 'Endocrine / Metabolic' })])
  const tags = tsv.trimEnd().split('\n')[4].split('\t')[2]
  assert.ok(tags.includes('MedTrainer::sys::Endocrine-Metabolic'), tags)
  // a tag must never contain whitespace (space-separated tag list)
  for (const t of tags.split(' ')) assert.doesNotMatch(t, /\s/)
})

test('tabs and newlines inside prompt/answer are collapsed so rows stay 3 cells', () => {
  const tsv = buildAnkiTsv([item({ prompt: 'Line one\nline\ttwo', answer: 'a\r\nb' })])
  const row = tsv.trimEnd().split('\n')[4]
  assert.equal(row.split('\t').length, 3)
  assert.match(row, /^Line one line two\t/)
  assert.match(row, /\ta b\t/)
})

test('empty deck exports headers only', () => {
  const lines = buildAnkiTsv([]).trimEnd().split('\n')
  assert.equal(lines.length, 4)
})

test('ankiExportFilename is dated and stable-width', () => {
  assert.equal(ankiExportFilename(Date.UTC(2026, 7, 10, 12)), 'medtrainer-anki-2026-08-10.txt')
})
