import type { Track } from '../shared/types'
import { camelotScore } from './key.ts'

/**
 * Selects Auto DJ candidates: closest tempo, harmonic key and least-played first.
 * Returns up to `count` tracks from the pool, best first.
 */
export function pickAutoDjCandidates(pool: Track[], reference: Track | null, playCounts: Record<string, number>, count: number): Track[] {
  if (!pool.length || count <= 0) return []
  const referenceBpm = reference?.bpm
  const scored = pool.map((track, index) => {
    let score = 2
    if (referenceBpm && track.bpm) {
      const distance = Math.abs(Math.log2(track.bpm / referenceBpm))
      score += distance <= 0.06 ? 2.5 : distance <= 0.14 ? 1.2 : distance <= 0.30 ? 0.3 : -2
    }
    score += camelotScore(reference?.key, track.key)
    score -= Math.min(5, (playCounts[track.id] ?? 0) * 0.2)
    return { track, score, index }
  })
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  return scored.slice(0, Math.min(count, scored.length)).map(item => item.track)
}

/** Applies the stored loudness gain, clamped to ±12 dB, or 0 dB when missing. */
export function normalizeGainDb(track: Track | null | undefined): number {
  const gain = track?.gainDb
  if (gain === undefined || !Number.isFinite(gain)) return 0
  return Math.max(-12, Math.min(12, gain))
}
