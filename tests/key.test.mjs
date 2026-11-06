import test from 'node:test'
import assert from 'node:assert/strict'
import { camelotScore, keyFromChroma, pitchProfile } from '../src/key.ts'

test('camelot compatibility matches the harmonic wheel', () => {
  assert.equal(camelotScore('8A', '8A'), 3)
  assert.equal(camelotScore('8B', '8B'), 3)
  assert.equal(camelotScore('8A', '8B'), 1.5)
  assert.equal(camelotScore('8A', '9A'), 2)
  assert.equal(camelotScore('8B', '7B'), 2)
  assert.equal(camelotScore('8A', '9B'), 1)
  assert.equal(camelotScore('12B', '1B'), 2)
  assert.equal(camelotScore('8A', '1B'), 0)
  assert.equal(camelotScore('8A', undefined), 0)
})

test('detects a C major chord as 8B and an A minor chord as 8A', () => {
  const sampleRate = 8000
  const c = 261.626, e = 329.628, g = 392.0, a = 220.0
  const major = synthChord([c, e, g], sampleRate, 1.2)
  const minor = synthChord([a, c, e], sampleRate, 1.2)

  const majorKey = keyFromChroma(pitchProfile(major, sampleRate))
  assert.ok(majorKey, 'major chord should resolve')
  assert.equal(majorKey.key, 'C-dur')
  assert.equal(majorKey.camelot, '8B')

  const minorKey = keyFromChroma(pitchProfile(minor, sampleRate))
  assert.ok(minorKey, 'minor chord should resolve')
  assert.equal(minorKey.key, 'a-moll')
  assert.equal(minorKey.camelot, '8A')
})

test('keyFromChroma prefers the dominating pitch class', () => {
  const chroma = new Array(12).fill(0.01)
  chroma[9] += 0.3
  chroma[0] += 0.08
  chroma[4] += 0.08
  const result = keyFromChroma(chroma)
  assert.ok(result)
  assert.equal(result.camelot, '8A')
})

test('rejects an empty chroma vector', () => {
  assert.equal(keyFromChroma(new Array(12).fill(0)), null)
})

function synthChord(frequencies, sampleRate, seconds) {
  const total = Math.round(sampleRate * seconds)
  const mono = new Float32Array(total)
  for (let index = 0; index < total; index++) {
    let value = 0
    for (const frequency of frequencies) value += Math.sin(2 * Math.PI * frequency * index / sampleRate)
    mono[index] = value / frequencies.length
  }
  return mono
}
