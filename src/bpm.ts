/** Estimates a song's beat rate from changes in short-window audio energy. */
export function estimateBpm(buffer: AudioBuffer): number | null {
  if (buffer.duration < 12 || buffer.numberOfChannels < 1) return null

  const hop = 1024
  const frameCount = Math.floor(buffer.length / hop)
  if (frameCount < 500) return null

  const channels = Array.from({ length: Math.min(buffer.numberOfChannels, 2) }, (_, index) => buffer.getChannelData(index))
  const envelope = new Float32Array(frameCount)
  let previous = 0
  let envelopeSum = 0

  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * hop
    const end = Math.min(start + hop, buffer.length)
    let energy = 0
    for (const channel of channels) {
      let squareSum = 0
      for (let sample = start; sample < end; sample++) squareSum += channel[sample] * channel[sample]
      energy += Math.sqrt(squareSum / Math.max(1, end - start))
    }
    const level = energy / channels.length
    const onset = Math.max(0, level - previous)
    envelope[frame] = onset
    envelopeSum += onset
    previous = level
  }

  const mean = envelopeSum / frameCount
  for (let frame = 0; frame < frameCount; frame++) envelope[frame] = Math.max(0, envelope[frame] - mean)

  const framesPerSecond = buffer.sampleRate / hop
  const minLag = Math.floor(framesPerSecond * 60 / 180)
  const maxLag = Math.ceil(framesPerSecond * 60 / 60)
  const scores = new Float32Array(maxLag + 1)
  let bestLag = 0
  let bestScore = 0

  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0
    for (let frame = lag; frame < frameCount; frame++) score += envelope[frame] * envelope[frame - lag]
    score /= frameCount - lag
    scores[lag] = score
    if (score > bestScore) { bestScore = score; bestLag = lag }
  }

  if (!bestLag || bestScore < 1e-12) return null
  const previousScore = scores[Math.max(minLag, bestLag - 1)]
  const nextScore = scores[Math.min(maxLag, bestLag + 1)]
  const curvature = previousScore - 2 * bestScore + nextScore
  const offset = curvature ? Math.max(-0.5, Math.min(0.5, 0.5 * (previousScore - nextScore) / curvature)) : 0
  const bpm = 60 * framesPerSecond / (bestLag + offset)
  return bpm >= 60 && bpm <= 180 ? Math.round(bpm) : null
}
