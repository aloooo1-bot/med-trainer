import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  isCommerciallyUsable, requiresAttribution, licenseProblem, resolveProvenance,
  type DatasetProvenance, type ImageProvenance,
} from '../imageAttributes'
import { readEcgEntry, entryProvenance, getECGCategory } from '../ecgImageLookup'

/**
 * The licence defects these guard against were all invisible in review, because
 * each recorded claim looked like an answer: "ISIC Archive — CC-BY license",
 * "NIH Open-i / PubMed Central (open access)". Neither was checkable, and the
 * second is not a licence at all.
 *
 * So the file assertions below read the REAL provenance records rather than
 * fixtures. A test that restates the data it is checking cannot fail when the
 * data is wrong, which is exactly the failure mode here.
 */

const pub = (rel: string) => JSON.parse(readFileSync(path.join(process.cwd(), 'public', rel), 'utf8'))

// ── the predicate ────────────────────────────────────────────────────────────

test('only licences that permit selling access are cleared', () => {
  const p = (license: string): ImageProvenance =>
    ({ source: 'X', license: license as ImageProvenance['license'], attribution: 'X' })
  for (const ok of ['CC0-1.0', 'public-domain', 'CC-BY-3.0', 'CC-BY-4.0']) {
    assert.equal(isCommerciallyUsable(p(ok)), true, ok)
  }
  for (const no of ['CC-BY-NC-4.0', 'CC-BY-ND-4.0', 'CC-BY-NC-ND-4.0', 'unverified']) {
    assert.equal(isCommerciallyUsable(p(no)), false, no)
  }
  // Share-alike is excluded deliberately: it places conditions on the work it
  // is embedded in, which is a decision to take knowingly.
  assert.equal(isCommerciallyUsable(p('CC-BY-SA-4.0')), false)
  assert.equal(isCommerciallyUsable(undefined), false, 'unknown is not permission')
})

test('a CC-BY image with no credit line is as blocked as an NC one', () => {
  // The licence grants use ON CONDITION the attribution is given, so a missing
  // credit line is a breach rather than an untidy display.
  const bare: ImageProvenance = { source: 'PTB-XL', license: 'CC-BY-4.0' }
  assert.equal(isCommerciallyUsable(bare), true, 'the licence itself permits it')
  assert.equal(requiresAttribution(bare), true)
  assert.match(licenseProblem(bare)!, /requires attribution/)
  assert.equal(licenseProblem({ ...bare, attribution: 'Wagner P, et al.' }), null)
})

test('each way a licence can be missing gets its own explanation', () => {
  assert.match(licenseProblem(undefined)!, /no provenance recorded/)
  assert.match(
    licenseProblem({ source: 'NIH Open-i / PubMed Central' } as ImageProvenance)!,
    /says where the file came from, not what may be done with it/,
  )
  assert.match(
    licenseProblem({ source: 'ISIC', license: 'unverified' })!,
    /not established/,
  )
  assert.match(licenseProblem({ source: 'X', license: 'CC-BY-NC-4.0' })!, /does not permit/)
})

test('a per-image record layers over the dataset default', () => {
  const dataset: DatasetProvenance = {
    default: { source: 'PTB-XL', license: 'CC-BY-4.0', attribution: 'Wagner P, et al.' },
  }
  // The common case: the image contributes only the id that identifies it.
  const r = resolveProvenance(dataset, 'afib/00351.svg', { sourceId: 'ptb-xl:351' })
  assert.equal(r?.license, 'CC-BY-4.0')
  assert.equal(r?.sourceId, 'ptb-xl:351')
  // An override wins, which is what a mixed-licence archive like ISIC needs.
  const over = resolveProvenance(
    { ...dataset, overrides: { 'a/b.png': { license: 'CC-BY-NC-4.0' } } }, 'a/b.png',
  )
  assert.equal(over?.license, 'CC-BY-NC-4.0')
  assert.equal(isCommerciallyUsable(over), false)
  assert.equal(resolveProvenance(undefined, 'x'), undefined)
})

// ── the real records ─────────────────────────────────────────────────────────

test('every ECG tracing is traceable to its PTB-XL record', () => {
  // CC BY is conditional on crediting the source, and a credit nobody can check
  // is not much of one. The filename stem is the ecg_id, so every entry can
  // carry the identifier that makes the claim verifiable.
  const meta = pub('ecg/metadata.json') as Record<string, { report: string; sourceId?: string }>
  const entries = Object.entries(meta)
  assert.ok(entries.length >= 100, 'the library should not have shrunk')
  for (const [key, entry] of entries) {
    assert.equal(typeof entry.report, 'string', key)
    assert.match(entry.sourceId ?? '', /^ptb-xl:\d+$/, `${key} has no checkable record id`)
    const stem = Number(path.basename(key).replace(/\.[^.]+$/, ''))
    assert.equal(entry.sourceId, `ptb-xl:${stem}`, `${key} id disagrees with its filename`)
  }
})

test('the ECG dataset record satisfies its own licence', () => {
  const prov = pub('ecg/provenance.json') as DatasetProvenance
  assert.equal(prov.default.license, 'CC-BY-4.0')
  assert.equal(licenseProblem(prov.default), null, 'PTB-XL is CC BY — the credit line must be recorded')
  assert.match(prov.default.attribution ?? '', /PTB-XL/)
})

test('datasets whose licence is not established say so', () => {
  // These are the images fetched from archives that license per item, where the
  // fetch discarded the answer. Recording a guess would be worse than recording
  // that nobody knows — the sweep can act on "unverified" and cannot act on a
  // plausible-looking string.
  for (const dir of ['images/derm', 'images/fundus', 'images/biopsy', 'images/urine']) {
    const prov = pub(`${dir}/provenance.json`) as DatasetProvenance
    assert.equal(prov.default.license, 'unverified', dir)
    assert.equal(isCommerciallyUsable(prov.default), false, dir)
    assert.ok((prov.notes ?? '').length > 80, `${dir} should record WHY it is unverified`)
  }
})

test('the datasets that are cleared really are', () => {
  for (const [dir, license] of [['imaging', 'CC0-1.0'], ['images/smear', 'public-domain']] as const) {
    const prov = pub(`${dir}/provenance.json`) as DatasetProvenance
    assert.equal(prov.default.license, license, dir)
    assert.equal(licenseProblem(prov.default), null, dir)
  }
})

// ── ECG metadata migration ───────────────────────────────────────────────────

test('the old string metadata shape still reads', () => {
  // The reader has to accept both so the code could land before the data was
  // regenerated; dropping it would blank every report if either got reverted.
  assert.deepEqual(readEcgEntry('sinusrhythmus'), { report: 'sinusrhythmus' })
  assert.equal(readEcgEntry(undefined), null)
  assert.equal(readEcgEntry({ noReport: true } as never), null)
  const full = { report: 'r', sourceId: 'ptb-xl:1' }
  assert.deepEqual(readEcgEntry(full), full)
})

test('an entry contributes only what it states', () => {
  assert.equal(entryProvenance(readEcgEntry('just a report')), undefined)
  assert.deepEqual(entryProvenance({ report: 'r', sourceId: 'ptb-xl:7' }), { sourceId: 'ptb-xl:7' })
})

// ── paced is not bradycardia ─────────────────────────────────────────────────

test('a pacemaker case no longer routes to the bradycardia pool', () => {
  // It used to, and the pool it landed in was built entirely from paced records
  // anyway, so nothing disagreed and a bradycardia case got a paced strip.
  assert.equal(getECGCategory('Pacemaker malfunction', 'ventricular pacing spikes with capture'), 'paced')
  assert.equal(getECGCategory('Complete heart block', 'paced rhythm at 70'), 'paced')
})

test('genuine bradycardia still routes to bradycardia', () => {
  assert.equal(getECGCategory('Sick sinus syndrome', 'sinus bradycardia at 42 bpm'), 'bradycardia')
  assert.equal(getECGCategory('Hypothyroidism', 'sinus bradycardia, rate 48'), 'bradycardia')
})

test('a paced finding can never be served as bradycardia', () => {
  // The exclusion is the belt to the routing order's braces: even a finding that
  // names both must not land in the bradycardia pool.
  assert.notEqual(getECGCategory('Sick sinus syndrome', 'paced rhythm, slow rate'), 'bradycardia')
})

test('an unpaced conduction case still routes to heart_block', () => {
  // Putting 'paced' first must not swallow the block cases that are not paced.
  assert.equal(getECGCategory('Complete heart block', 'third degree AV block, rate 38'), 'heart_block')
  assert.equal(getECGCategory('Mobitz type II', 'second degree av block'), 'heart_block')
  assert.equal(getECGCategory('First degree AV block', 'pr prolonged at 240ms'), 'heart_block')
})
