/** Downsamples decoded audio into loudness peaks [0..1] for a waveform strip. */
export function computeWavePeaks(buffer: AudioBuffer, buckets = 480): number[] {
  const channels: Float32Array[] = []
  for (let channel = 0; channel < Math.min(buffer.numberOfChannels, 2); channel++) channels.push(buffer.getChannelData(channel))
  const length = channels[0].length
  if (!length || buckets < 8) return []

  const perBucket = Math.max(1, Math.floor(length / buckets))
  const peaks = new Array<number>(buckets).fill(0)
  const stride = Math.max(1, Math.floor(perBucket / 3000))

  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = bucket * perBucket
    const end = Math.min(start + perBucket, length)
    let peak = 0
    for (let index = start; index < end; index += stride) {
      let squareSum = 0
      for (const channel of channels) {
        const value = channel[Math.min(index, length - 1)]
        squareSum += value * value
      }
      const level = Math.sqrt(squareSum / channels.length)
      if (level > peak) peak = level
    }
    peaks[bucket] = peak
  }

  const maximum = peaks.reduce((best, value) => Math.max(best, value), 0)
  if (maximum <= 0) return peaks
  const floor = Math.max(0.04, maximum * 0.12)
  return peaks.map(value => Math.min(1, Math.max(floor, value / maximum)))
}
