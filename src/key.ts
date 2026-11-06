export interface KeyMatch {
  /** Human label in Polish, e.g. "C-dur" or "a-moll". */
  key: string
  /** Camelot wheel code, e.g. "8B". */
  camelot: string
}

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

/** Camelot number for every major tonic, keyed by pitch class (C = 0). */
const MAJOR_CAMELOT: Record<number, number> = {
  0: 8, 1: 3, 2: 10, 3: 5, 4: 12, 5: 7, 6: 2, 7: 9, 8: 4, 9: 11, 10: 6, 11: 1
}

function camelotFor(tonic: number, minor: boolean): string {
  const number = MAJOR_CAMELOT[(minor ? (tonic + 3) % 12 : tonic) % 12] ?? 1
  return `${number}${minor ? 'A' : 'B'}`
}

function camelotNumber(code: string): number {
  const number = Number(code.slice(0, -1))
  return Number.isFinite(number) && number >= 1 && number <= 12 ? number : 0
}

/** Harmonic mix compatibility: 3 perfect, 2 adjacent wheel, 1.5 relative, 1 neighbour, 0 clash. */
export function camelotScore(a: string | undefined, b: string | undefined): number {
  if (!a || !b) return 0
  const first = camelotNumber(a.trim())
  const second = camelotNumber(b.trim())
  const firstM = a.trim().endsWith('A')
  const secondM = b.trim().endsWith('A')
  if (!first || !second) return 0
  if (first === second && firstM === secondM) return 3
  if (first === second) return 1.5
  const distance = Math.min((first - second + 12) % 12, (second - first + 12) % 12)
  if (distance === 0) return 1.5
  if (distance === 1) return firstM === secondM ? 2 : 1
  return 0
}

function fftMagnitudes(input: Float32Array): Float32Array {
  const n = input.length
  const result = new Float32Array(n / 2)
  const real = new Float32Array(n)
  const imaginary = new Float32Array(n)
  real.set(input)

  const levels = Math.log2(n)
  for (let index = 1; index < n; index++) {
    let reversed = 0
    for (let bit = 0; bit < levels; bit++) if (index & (1 << bit)) reversed |= 1 << (levels - 1 - bit)
    if (reversed > index) {
      const realTemp = real[index]
      real[index] = real[reversed]
      real[reversed] = realTemp
      const imaginaryTemp = imaginary[index]
      imaginary[index] = imaginary[reversed]
      imaginary[reversed] = imaginaryTemp
    }
  }

  for (let size = 2; size <= n; size <<= 1) {
    const half = size / 2
    const step = (2 * Math.PI) / size
    for (let offset = 0; offset < n; offset += size) {
      for (let pair = 0; pair < half; pair++) {
        const angle = step * pair
        const cosine = Math.cos(angle)
        const sine = -Math.sin(angle)
        const aIndex = offset + pair
        const bIndex = offset + pair + half
        const realB = real[bIndex] * cosine - imaginary[bIndex] * sine
        const imaginaryB = real[bIndex] * sine + imaginary[bIndex] * cosine
        real[bIndex] = real[aIndex] - realB
        imaginary[bIndex] = imaginary[aIndex] - imaginaryB
        real[aIndex] += realB
        imaginary[aIndex] += imaginaryB
      }
    }
  }

  for (let bin = 0; bin < result.length; bin++) result[bin] = Math.hypot(real[bin], imaginary[bin])
  return result
}

const FFT_SIZE = 4096
const WINDOW = (() => {
  const window = new Float32Array(FFT_SIZE)
  for (let index = 0; index < FFT_SIZE; index++) window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FFT_SIZE - 1))
  return window
})()

/** 12-bin pitch class profile (C = 0) from mono samples. */
export function pitchProfile(mono: Float32Array, sampleRate: number): number[] {
  const chroma = new Array<number>(12).fill(0)
  if (sampleRate <= 0 || mono.length < FFT_SIZE) return chroma

  const targetRate = 11025
  const stride = Math.max(1, Math.round(sampleRate / targetRate))
  const rate = sampleRate / stride
  const decimatedLength = Math.floor(mono.length / stride)
  const decimated = new Float32Array(decimatedLength)
  for (let index = 0; index < decimatedLength; index++) {
    let sum = 0
    for (let copy = 0; copy < stride; copy++) sum += mono[index * stride + copy]
    decimated[index] = sum / stride
  }

  const frames = Math.floor(decimated.length / FFT_SIZE)
  const frequencyPerBin = rate / FFT_SIZE
  for (let frame = 0; frame < frames; frame++) {
    const offset = frame * FFT_SIZE
    const windowed = new Float32Array(FFT_SIZE)
    for (let index = 0; index < FFT_SIZE; index++) windowed[index] = decimated[offset + index] * WINDOW[index]
    const magnitudes = fftMagnitudes(windowed)
    for (let bin = 1; bin < magnitudes.length; bin++) {
      const frequency = bin * frequencyPerBin
      if (frequency < 55 || frequency > 2200) continue
      const tonePitch = 12 * Math.log2(frequency / 440)
      const pitchClass = (Math.round(tonePitch) + 9 + 120) % 12
      chroma[pitchClass] += magnitudes[bin]
    }
  }

  const total = chroma.reduce((sum, value) => sum + value, 0)
  if (total > 0) return chroma.map(value => value / total)
  return chroma
}

function pearson(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length)
  let sumA = 0
  let sumB = 0
  for (let index = 0; index < length; index++) { sumA += a[index]; sumB += b[index] }
  const meanA = sumA / length
  const meanB = sumB / length
  let numerator = 0
  let squareA = 0
  let squareB = 0
  for (let index = 0; index < length; index++) {
    const deltaA = a[index] - meanA
    const deltaB = b[index] - meanB
    numerator += deltaA * deltaB
    squareA += deltaA * deltaA
    squareB += deltaB * deltaB
  }
  return squareA > 0 && squareB > 0 ? numerator / Math.sqrt(squareA * squareB) : 0
}

/** Matches a chroma vector against Krumhansl profiles for all 24 keys. */
export function keyFromChroma(chroma: number[]): KeyMatch | null {
  if (!chroma.length || !chroma.some(value => value > 0)) return null
  let best: KeyMatch | null = null
  let bestScore = -Infinity
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const minor of [false, true]) {
      const profile = minor ? MINOR_PROFILE : MAJOR_PROFILE
      const rotated = Array.from({ length: 12 }, (_, index) => chroma[(index + tonic) % 12])
      const score = pearson(rotated, profile)
      if (score > bestScore) {
        bestScore = score
        best = {
          key: minor ? `${PITCH_CLASSES[tonic].toLowerCase()}-moll` : `${PITCH_CLASSES[tonic]}-dur`,
          camelot: camelotFor(tonic, minor)
        }
      }
    }
  }
  return best
}

/** Detects the harmonic key of a decoded buffer (roughly its first 100 seconds). */
export function detectKey(buffer: AudioBuffer): KeyMatch | null {
  if (!buffer.numberOfChannels || buffer.sampleRate <= 0) return null
  const channels: Float32Array[] = []
  for (let channel = 0; channel < Math.min(buffer.numberOfChannels, 2); channel++) channels.push(buffer.getChannelData(channel))
  const limit = channels[0].length
  const offset = Math.min(Math.round(buffer.sampleRate * 6), Math.abs(Math.floor(limit / 8)))
  const span = Math.min(Math.round(buffer.sampleRate * 100), limit - offset)
  if (span <= 0) return null
  const mono = new Float32Array(span)
  for (let index = 0; index < span; index++) {
    let sum = 0
    for (const channel of channels) sum += channel[offset + index]
    mono[index] = sum / channels.length
  }
  let squareSum = 0
  for (let index = 0; index < mono.length; index += 4) squareSum += mono[index] * mono[index]
  if (squareSum / Math.max(1, mono.length / 4) < 1e-8) return null
  return keyFromChroma(pitchProfile(mono, buffer.sampleRate))
}
