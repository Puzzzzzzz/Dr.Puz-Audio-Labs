import test from 'node:test'
import assert from 'node:assert/strict'
import { integratedLoudness, loudnessToGainDb } from '../src/loudness.ts'

function sine(amplitude, sampleRate, seconds, frequency = 997) {
  const total = Math.round(sampleRate * seconds)
  const channel = new Float32Array(total)
  for (let index = 0; index < total; index++) channel[index] = amplitude * Math.sin(2 * Math.PI * frequency * index / sampleRate)
  return channel
}

test('doubling amplitude adds 6 dB regardless of the absolute level', () => {
  const sampleRate = 48000
  const loud = integratedLoudness([sine(1.0, sampleRate, 10)], sampleRate)
  const quiet = integratedLoudness([sine(0.5, sampleRate, 10)], sampleRate)
  assert.ok(loud !== null && quiet !== null)
  assert.ok(Math.abs((loud - quiet) - 6.02) < 0.4, `expected ≈6.02 dB gap, got ${loud - quiet}`)
})

test('stereo adds roughly 3 dB over a single identical channel', () => {
  const sampleRate = 48000
  const channel = sine(0.8, sampleRate, 10)
  const mono = integratedLoudness([channel], sampleRate)
  const stereo = integratedLoudness([channel, channel], sampleRate)
  assert.ok(mono !== null && stereo !== null)
  assert.ok(Math.abs((stereo - mono) - 3.01) < 1.0, `expected ≈3.01 dB gap, got ${stereo - mono}`)
})

test('silence has no measurable loudness', () => {
  const sampleRate = 48000
  assert.equal(integratedLoudness([new Float32Array(sampleRate * 3)], sampleRate), null)
})

test('gain follows the −18 LUFS target and clamps to ±12 dB', () => {
  assert.equal(loudnessToGainDb(-18), 0)
  assert.equal(loudnessToGainDb(-24), 6)
  assert.equal(loudnessToGainDb(-6), -12)
  assert.equal(loudnessToGainDb(-48), 12)
  assert.equal(loudnessToGainDb(null), null)
  assert.equal(loudnessToGainDb(Number.NaN), null)
})
