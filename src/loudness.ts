const BLOCK_SECONDS = 0.4

interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

function shelfCoefficients(sampleRate: number): Biquad {
  const f0 = 1681.9744509555319
  const gain = 3.999843853973347
  const q = 0.7071752369554196
  const k = Math.tan(Math.PI * f0 / sampleRate)
  const vh = Math.pow(10, gain / 20)
  const vb = Math.pow(vh, 0.49966677684)
  const a0 = 1 + k / q + k * k
  return {
    b0: (vh + vb * k / q + k * k) / a0,
    b1: 2 * (k * k - vh) / a0,
    b2: (vh - vb * k / q + k * k) / a0,
    a1: 2 * (k * k - 1) / a0,
    a2: (1 - k / q + k * k) / a0
  }
}

function highpassCoefficients(sampleRate: number): Biquad {
  const f0 = 38.13547087602444
  const q = 0.5003270373238773
  const k = Math.tan(Math.PI * f0 / sampleRate)
  const denominator = 1 + k / q + k * k
  return {
    b0: 1, b1: -2, b2: 1,
    a1: 2 * (k * k - 1) / denominator,
    a2: (1 - k / q + k * k) / denominator
  }
}

function applyFilter(samples: Float32Array, filter: Biquad): Float32Array {
  const output = new Float32Array(samples.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let index = 0; index < samples.length; index++) {
    const current = samples[index]
    const value = filter.b0 * current + filter.b1 * x1 + filter.b2 * x2 - filter.a1 * y1 - filter.a2 * y2
    x2 = x1
    x1 = current
    y2 = y1
    y1 = value
    output[index] = value
  }
  return output
}

function channelWeight(channels: number): number {
  if (channels <= 3) return 1
  return 1.41
}

/** Integrated loudness (LUFS) with absolute −70 and relative −10 dB gating. */
export function integratedLoudness(channels: Float32Array[], sampleRate: number): number | null {
  if (!channels.length || sampleRate <= 0) return null
  const length = Math.min(...channels.map(channel => channel.length))
  if (length < sampleRate * 0.5) return null

  const hop = Math.round(sampleRate * 0.1)
  const blockSize = Math.round(sampleRate * BLOCK_SECONDS)
  const blockCount = Math.floor((length - blockSize) / hop) + 1
  if (blockCount < 1) return null
  const usable = hop * (blockCount - 1) + blockSize

  const shelf = shelfCoefficients(sampleRate)
  const highpass = highpassCoefficients(sampleRate)
  const filtered = channels.map(channel => applyFilter(applyFilter(
    channel.subarray(0, Math.min(length, usable)).slice(), shelf
  ), highpass))

  const channelScores = filtered.map(channel => {
    const scores = new Float32Array(blockCount)
    for (let block = 0; block < blockCount; block++) {
      let squareSum = 0
      const start = block * hop
      for (let index = start; index < start + blockSize; index++) squareSum += channel[index] * channel[index]
      scores[block] = squareSum / blockSize
    }
    return scores
  })

  const weightCount = channelScores.length
  const primaryWeight = channelWeight(weightCount)
  const blocks = new Array<number>(blockCount).fill(0)
  for (let block = 0; block < blockCount; block++) {
    let sum = 0
    for (const scores of channelScores) sum += scores[block]
    blocks[block] = primaryWeight * sum
  }

  const loudnessOf = (z: number) => z > 0 ? -0.691 + 10 * Math.log10(z) : -Infinity

  const absolutelyGated = blocks.filter(z => loudnessOf(z) >= -70)
  if (!absolutelyGated.length) return null
  const absoluteMean = absolutelyGated.reduce((sum, z) => sum + z, 0) / absolutelyGated.length
  const relativeThreshold = loudnessOf(absoluteMean) - 10
  const relativelyGated = blocks.filter(z => loudnessOf(z) >= relativeThreshold)
  if (!relativelyGated.length) return null
  const gatedMean = relativelyGated.reduce((sum, z) => sum + z, 0) / relativelyGated.length
  const loudness = loudnessOf(gatedMean)
  return Number.isFinite(loudness) ? loudness : null
}

/** Loudness gain for playback, normalized to a −18 LUFS target and clamped to ±12 dB. */
export function loudnessToGainDb(lufs: number | null, targetLufs = -18): number | null {
  if (lufs === null || !Number.isFinite(lufs)) return null
  const gain = targetLufs - lufs
  if (!Number.isFinite(gain)) return null
  const clamped = Math.max(-12, Math.min(12, gain))
  return Math.round(clamped * 10) / 10
}
