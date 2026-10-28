export interface BeatGrid {
  bpm: number
  /** Beat position within the first beat period, measured from the file start. */
  beatOffset: number
}

/** Estimates tempo and the beat phase from changes in short-window audio energy. */
export function estimateBeatGrid(buffer: AudioBuffer): BeatGrid | null {
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
  let beatPeriodFrames = bestLag + offset
  let bpm = 60 * framesPerSecond / beatPeriodFrames

  // Autocorrelation often locks onto every other beat in half-time music.
  // If the faster octave has a clear pulse of its own, prefer that beat grid.
  const fasterBpm = bpm * 2
  const fasterLag = Math.round(bestLag / 2)
  if (bpm < 90 && fasterBpm <= 180 && fasterLag >= minLag && scores[fasterLag] >= bestScore * 0.45) {
    bpm = fasterBpm
    beatPeriodFrames /= 2
  }
  if (bpm < 60 || bpm > 180) return null

  // Fold early onsets over the beat period to find the most likely pulse phase.
  // A short neighborhood tolerates the envelope's 23 ms frame resolution.
  let bestPhase = 0
  let bestPhaseScore = -1
  const phaseHorizon = Math.min(frameCount, Math.floor(framesPerSecond * 30))
  const beatCount = Math.floor(phaseHorizon / beatPeriodFrames)
  for (let phase = 0; phase < beatPeriodFrames; phase++) {
    let phaseScore = 0
    for (let beat = 0; beat < beatCount; beat++) {
      const center = Math.round(phase + beat * beatPeriodFrames)
      let onset = 0
      for (let nearby = -2; nearby <= 2; nearby++) {
        const index = center + nearby
        if (index >= 0 && index < phaseHorizon) onset = Math.max(onset, envelope[index])
      }
      phaseScore += onset
    }
    if (phaseScore > bestPhaseScore) { bestPhaseScore = phaseScore; bestPhase = phase }
  }

  return {
    bpm: Math.round(bpm * 100) / 100,
    beatOffset: bestPhase / framesPerSecond
  }
}

/** Returns a start point for the incoming file that aligns its next beat with the outgoing beat. */
export function alignBeatStartTime(
  outgoingTime: number,
  outgoingBpm: number,
  outgoingPhase: number,
  outgoingRate: number,
  incomingBpm: number,
  incomingPhase: number,
  incomingRate: number
): number {
  if (![outgoingTime, outgoingBpm, outgoingPhase, outgoingRate, incomingBpm, incomingPhase, incomingRate].every(Number.isFinite)
    || outgoingBpm <= 0 || incomingBpm <= 0 || outgoingRate <= 0 || incomingRate <= 0) return 0

  const outgoingPeriod = 60 / outgoingBpm
  const incomingPeriod = 60 / incomingBpm
  const positiveModulo = (value: number, modulus: number) => ((value % modulus) + modulus) % modulus
  const untilOutgoingBeat = positiveModulo(outgoingPhase - outgoingTime, outgoingPeriod) / outgoingRate
  const incomingFileDelta = untilOutgoingBeat * incomingRate
  return positiveModulo(incomingPhase - incomingFileDelta, incomingPeriod)
}
