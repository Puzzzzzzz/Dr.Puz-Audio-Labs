import type { Track } from '../shared/types'
import { makeTrack } from '../shared/types'

function playbackRateFor(track: Track | null | undefined, globalBpm: number) {
  if (!track || track.kind !== 'audio' || !track.bpm) return 1
  return Math.min(3, Math.max(1 / 3, globalBpm / track.bpm))
}

function seekAudioToWait(media: HTMLAudioElement, time: number) {
  if (Math.abs(media.currentTime - time) < 0.01 || media.readyState < 1) return Promise.resolve()
  return new Promise<void>(resolve => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      window.clearTimeout(timeout)
      media.removeEventListener('seeked', finish)
      media.removeEventListener('error', finish)
      resolve()
    }
    const timeout = window.setTimeout(finish, 1000)
    media.addEventListener('seeked', finish, { once: true })
    media.addEventListener('error', finish, { once: true })
    try {
      media.currentTime = time
      if (!media.seeking) finish()
    } catch { finish() }
  })
}

function secondsUntilNextBeat(media: HTMLAudioElement, bpm: number, beatOffset: number) {
  const period = 60 / bpm
  const untilBeat = ((beatOffset - media.currentTime) % period + period) % period
  return untilBeat / Math.max(0.01, media.playbackRate)
}

function fromM3U(text: string, sourcePath: string): Track[] {
  const base = sourcePath.slice(0, Math.max(sourcePath.lastIndexOf('/'), sourcePath.lastIndexOf('\\')) + 1)
  return text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => {
    let path = line
    if (/^file:\/\//i.test(path)) path = decodeURIComponent(path.replace(/^file:\/\//i, '').replace(/^\//, ''))
    else if (!/^[a-z]:[\\/]/i.test(path) && !path.startsWith('\\\\')) path = `${base}${path}`
    return makeTrack(path)
  })
}

export { fromM3U, playbackRateFor, secondsUntilNextBeat, seekAudioToWait as seekAudioTo }
