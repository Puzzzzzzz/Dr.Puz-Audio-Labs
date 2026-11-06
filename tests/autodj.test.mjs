import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeGainDb, pickAutoDjCandidates } from '../src/autodj.ts'

function track(id, bpm, key) {
  return { id, path: `C:\\music\\${id}.mp3`, title: id, artist: '', album: '', kind: 'audio', extension: 'mp3', size: 10, addedAt: 0, bpm, key }
}

test('prefers matching tempo and key over random picks', () => {
  const reference = track('ref', 124, '8A')
  const perfect = track('perfect', 124, '8A')
  const second = track('second', 123, '9A')
  const far = track('far', 90, '1B')
  const picked = pickAutoDjCandidates([far, second, perfect], reference, {}, 2)
  assert.deepEqual(picked.map(item => item.id), ['perfect', 'second'])
})

test('least-played tracks rotate to the front', () => {
  const reference = track('ref', 124, '8A')
  const twinA = track('a', 124, '8A')
  const twinB = track('b', 124, '8A')
  const picked = pickAutoDjCandidates([twinA, twinB], reference, { a: 12 }, 1)
  assert.deepEqual(picked.map(item => item.id), ['b'])
})

test('still picks tracks without a reference track', () => {
  const empty = track('empty', 124, '8A')
  const picked = pickAutoDjCandidates([empty, track('other', 130, '3A')], null, {}, 5)
  assert.ok(picked.length >= 1)
})

test('respects the requested count', () => {
  const pool = [track('a', 124, '8A'), track('b', 125, '9A'), track('c', 126, '10B')]
  assert.equal(pickAutoDjCandidates(pool, null, {}, 2).length, 2)
  assert.equal(pickAutoDjCandidates(pool, null, {}, 0).length, 0)
})

test('normalizeGainDb clamps the stored value', () => {
  assert.equal(normalizeGainDb({ gainDb: -18 }), -12)
  assert.equal(normalizeGainDb({ gainDb: 4.5 }), 4.5)
  assert.equal(normalizeGainDb({}), 0)
  assert.equal(normalizeGainDb(null), 0)
  assert.equal(normalizeGainDb({ gainDb: Number.NaN }), 0)
})
