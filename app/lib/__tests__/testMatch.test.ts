import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fuzzyResolveTest, expandQueryAliases, normalizeTestString } from '../testMatch'

test('normalizeTestString strips punctuation and case', () => {
  assert.equal(normalizeTestString('CT Pulmonary Angiography (CTPA)'), 'ct pulmonary angiography ctpa')
})

test('expandQueryAliases links a synonym to every phrasing of the master entry', () => {
  const aliases = expandQueryAliases('CT pulmonary angiogram')
  assert.ok(aliases.some(a => a.includes('CTPA')), `expected a CTPA alias in: ${aliases.join(' | ')}`)
})

test('typed "CT pulmonary angiogram" resolves to a case key of "CT Pulmonary Angiography (CTPA)"', () => {
  const keys = ['Complete Blood Count (CBC)', 'CT Pulmonary Angiography (CTPA)', 'D-Dimer']
  const { match } = fuzzyResolveTest('CT pulmonary angiogram', keys)
  assert.equal(match, 'CT Pulmonary Angiography (CTPA)')
})

test('typed "chem-7" resolves via BMP synonyms', () => {
  const keys = ['Basic Metabolic Panel (BMP)', 'Complete Blood Count (CBC)']
  const { match } = fuzzyResolveTest('chem-7', keys)
  assert.equal(match, 'Basic Metabolic Panel (BMP)')
})

test('exact-token phrasing differences still auto-match', () => {
  const keys = ['Troponin I or T (high sensitivity)', 'BNP / NT-proBNP']
  const { match } = fuzzyResolveTest('high sensitivity troponin', keys)
  assert.equal(match, 'Troponin I or T (high sensitivity)')
})

test('implausible orders return neither match nor suggestions', () => {
  const keys = ['Complete Blood Count (CBC)', 'Chest X-Ray (PA and Lateral)']
  const { match, suggestions } = fuzzyResolveTest('serum unicorn level', keys)
  assert.equal(match, null)
  assert.deepEqual(suggestions, [])
})

test('contested matches return suggestions instead of guessing', () => {
  const keys = ['CT Abdomen with Contrast', 'CT Abdomen without Contrast']
  const { match, suggestions } = fuzzyResolveTest('CT abdomen', keys)
  assert.equal(match, null)
  assert.ok(suggestions.length >= 2, `expected both contrast variants suggested, got: ${suggestions.join(' | ')}`)
})

test('empty inputs are safe', () => {
  assert.deepEqual(fuzzyResolveTest('', ['A']), { match: null, suggestions: [] })
  assert.deepEqual(fuzzyResolveTest('CBC', []), { match: null, suggestions: [] })
})
