import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatProfileForPrompt, profileFactSheet } from '../format'
import type { DiagnosisProfile } from '../../reasoning/types'

const PROFILE: DiagnosisProfile = {
  diagnosis: 'IgA Nephropathy',
  system: 'Renal',
  discriminators: ['synpharyngitic hematuria', 'normal complement', 'dominant mesangial IgA on biopsy'],
  expectedWorkup: [
    { test: 'Urinalysis', typicalResult: 'dysmorphic RBCs + RBC casts', rationale: 'glomerular bleeding' },
    { test: 'Complement (C3/C4)', typicalResult: 'normal', cutoff: 'C3 90-180', rationale: 'distinguishes from PSGN' },
  ],
  differentials: [
    { name: 'PSGN', category: 'alternative', howToDistinguish: 'low C3 + 1-3 week latent period' },
    { name: 'Alport syndrome', category: 'cant-miss', howToDistinguish: 'sensorineural hearing loss + family history' },
  ],
  firstLineManagement: [
    { step: 'ACE inhibitor/ARB', threshold: 'proteinuria >1 g/day', drug: 'lisinopril' },
  ],
  mechanism: 'Galactose-deficient IgA1 immune complexes deposit in the mesangium.',
  sources: ['KDIGO 2021'],
  schemaVersion: 1,
}

test('formatProfileForPrompt includes every section as constraints', () => {
  const block = formatProfileForPrompt(PROFILE)
  assert.match(block, /VERIFIED KNOWLEDGE PROFILE/)
  assert.match(block, /IgA Nephropathy/)
  assert.match(block, /synpharyngitic hematuria/)
  assert.match(block, /Complement \(C3\/C4\) → normal \(cutoff C3 90-180\)/)
  assert.match(block, /PSGN \[alternative\]/)
  assert.match(block, /Alport syndrome \[cant-miss\]/)
  assert.match(block, /ACE inhibitor\/ARB/)
  assert.match(block, /immune complexes deposit in the mesangium/)
})

test('formatProfileForPrompt omits empty sections gracefully', () => {
  const sparse: DiagnosisProfile = {
    diagnosis: 'Test', system: 'X', discriminators: [], expectedWorkup: [],
    differentials: [], firstLineManagement: [], mechanism: '', sources: [], schemaVersion: 1,
  }
  const block = formatProfileForPrompt(sparse)
  assert.match(block, /VERIFIED KNOWLEDGE PROFILE/)
  assert.ok(!block.includes('Discriminating features'))
  assert.ok(!block.includes('Mechanism'))
})

test('profileFactSheet is valid JSON containing the key fields', () => {
  const parsed = JSON.parse(profileFactSheet(PROFILE))
  assert.equal(parsed.diagnosis, 'IgA Nephropathy')
  assert.equal(parsed.differentials.length, 2)
  assert.ok(parsed.expectedWorkup.length > 0)
})
