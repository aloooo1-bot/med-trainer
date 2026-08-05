import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createToken, verifyToken, PREF_COLUMN } from '../tokenCrypto'

const KEY = 'test-signing-secret'
const UID = 'e6ffee0d-2db6-4c53-aaf1-f049c243dc39'

test('a token round-trips to its claims', () => {
  assert.deepEqual(verifyToken(createToken(UID, 'summary', KEY), KEY), { userId: UID, kind: 'summary' })
  assert.deepEqual(verifyToken(createToken(UID, 'reminders', KEY), KEY), { userId: UID, kind: 'reminders' })
})

test('a token signed with another key is rejected', () => {
  assert.equal(verifyToken(createToken(UID, 'summary', KEY), 'a-different-secret'), null)
})

test('tampering with the payload is rejected', () => {
  const token = createToken(UID, 'summary', KEY)
  const [payload, sig] = token.split('.')
  // Re-encode the payload as a different user, keeping the original signature.
  const forged = Buffer.from('someone-elses-id:summary').toString('base64url') + '.' + sig
  assert.equal(verifyToken(forged, KEY), null)
  // And a mangled signature.
  assert.equal(verifyToken(`${payload}.${sig.slice(0, -1)}x`, KEY), null)
})

test('a token cannot be replayed against the other preference', () => {
  // Swapping the kind invalidates the signature, so a "reminders" link can
  // never be used to switch off weekly summaries.
  const token = createToken(UID, 'reminders', KEY)
  const sig = token.split('.')[1]
  const swapped = Buffer.from(`${UID}:summary`).toString('base64url') + '.' + sig
  assert.equal(verifyToken(swapped, KEY), null)
})

test('an unknown kind is rejected even when correctly signed', () => {
  // Guards against a future kind being honoured before it is supported.
  const rogue = createToken(UID, 'billing' as never, KEY)
  assert.equal(verifyToken(rogue, KEY), null)
})

test('malformed input never throws', () => {
  for (const bad of [null, undefined, '', '.', 'no-dot', 'a.b', '....', '%%%.%%%', 'x'.repeat(5000)]) {
    assert.equal(verifyToken(bad as never, KEY), null)
  }
})

test('verification without a key fails closed', () => {
  assert.equal(verifyToken(createToken(UID, 'summary', KEY), ''), null)
})

test('each kind maps to its own profile column', () => {
  assert.equal(PREF_COLUMN.reminders, 'email_case_reminders')
  assert.equal(PREF_COLUMN.summary, 'email_weekly_summary')
})
