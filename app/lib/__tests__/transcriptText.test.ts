import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitStageDirections, stripStageDirections } from '../transcriptText'

/**
 * The interview renders replies verbatim, so a gesture reads like clinical
 * content. These segments let the panel set the two apart WITHOUT discarding
 * the gesture — it is an emotional cue the communication feedback marks the
 * student on.
 */

const REPLY = '*shifts in seat, looking a bit uncomfortable* Well, I have had trouble with my breathing for many years now.'

test('splits an utterance into gesture and speech', () => {
  const segs = splitStageDirections(REPLY)
  assert.equal(segs.length, 2)
  assert.deepEqual(segs[0], { text: 'shifts in seat, looking a bit uncomfortable', kind: 'gesture' })
  assert.equal(segs[1].kind, 'speech')
  assert.match(segs[1].text, /trouble with my breathing/)
})

test('the asterisks are removed from the gesture text', () => {
  const segs = splitStageDirections('*nods slowly* With my pillows... yes, I need more now.')
  assert.equal(segs[0].text.includes('*'), false)
})

test('plain speech comes back as a single speech segment', () => {
  const segs = splitStageDirections('I get short of breath walking up the stairs.')
  assert.equal(segs.length, 1)
  assert.equal(segs[0].kind, 'speech')
})

test('a gesture-only reply comes back as one gesture', () => {
  const segs = splitStageDirections('*nods*')
  assert.deepEqual(segs, [{ text: 'nods', kind: 'gesture' }])
})

test('handles a gesture mid-sentence and several in one reply', () => {
  const segs = splitStageDirections('It hurts *touches chest* right here. *winces* Especially when I move.')
  assert.deepEqual(segs.map(s => s.kind), ['speech', 'gesture', 'speech', 'gesture', 'speech'])
  assert.equal(segs[1].text, 'touches chest')
  assert.equal(segs[3].text, 'winces')
})

test('an unpaired asterisk does not swallow the rest of the reply', () => {
  // The [^*\n]{1,120} bound is what prevents a stray asterisk from consuming
  // everything after it; the whole reply must still be readable.
  const segs = splitStageDirections('I take aspirin *sometimes for my back and I also walk daily and I sleep poorly')
  assert.equal(segs.length, 1)
  assert.equal(segs[0].kind, 'speech')
  assert.match(segs[0].text, /I sleep poorly$/)
})

test('empty and whitespace input produce nothing to render', () => {
  assert.deepEqual(splitStageDirections(''), [])
  assert.deepEqual(splitStageDirections('   '), [])
})

test('the segments still reconstruct what the grader is given', () => {
  // Display and grading derive independently from the same raw content; the
  // speech the panel shows must be the speech the grader reads.
  const spoken = splitStageDirections(REPLY).filter(s => s.kind === 'speech').map(s => s.text).join(' ').trim()
  assert.equal(spoken.replace(/\s+/g, ' '), stripStageDirections(REPLY))
})
