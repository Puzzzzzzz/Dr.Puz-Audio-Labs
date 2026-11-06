import { useEffect, useState } from 'react'
import { Disc2, Heart, Music2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Square, Video, Volume2, VolumeX } from 'lucide-react'
import type { Track } from '../../shared/types'
import { formatTime } from '../../shared/format'
import { usePlaybackTime } from '../clock'

function RecTimer({ startedAt }: { startedAt: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick(value => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <>{formatTime(Math.max(0, (Date.now() - startedAt) / 1000))}</>
}

interface Props {
  track: Track | null
  duration: number
  favorite: boolean
  volume: number
  shuffle: boolean
  repeat: 'off' | 'all' | 'one'
  playing: boolean
  recording: { startedAt: number } | null
  onPlayPause: () => void
  onSeek: (time: number) => void
  onPrevious: () => void
  onNext: () => void
  onShuffle: () => void
  onRepeat: () => void
  onFavorite: () => void
  onVolume: (volume: number) => void
  onToggleRecording: () => void
}

export function Dock({ track, duration, favorite, volume, shuffle, repeat, playing, recording, onPlayPause, onSeek, onPrevious, onNext, onShuffle, onRepeat, onFavorite, onVolume, onToggleRecording }: Props) {
  const now = usePlaybackTime()
  const progress = duration > 0 && Number.isFinite(duration) ? Math.min(100, now / duration * 100) : 0
  const volumePercent = Math.round(volume * 100)
  const muted = volume === 0

  return <section className="player-dock">
    <div className="dock-progress">
      <span>{formatTime(now)}</span>
      <input aria-label="Pozycja utworu" type="range" min="0" max="1000"
        value={Math.round(progress * 10)}
        onChange={event => { if (duration > 0) onSeek(duration * (Number(event.target.value) / 1000)) }}/>
      <span>{formatTime(duration)}</span>
    </div>
    <div className="dock-bottom">
      <div className="dock-track">
        <div className="dock-cover">{track?.kind === 'video' ? <Video size={16}/> : <Music2 size={16}/>}</div>
        <div className="dock-meta" title={track?.title}><b>{track?.title ?? 'Dr.Puz Audio Lab'}</b><span>{track?.artist ?? 'Gotowy do odtwarzania'}</span></div>
        {track && <button className={`heart-button ${favorite ? 'active' : ''}`} title="Ulubione" aria-pressed={favorite} onClick={onFavorite}><Heart size={16} fill={favorite ? 'currentColor' : 'none'}/></button>}
      </div>
      <div className="transport">
        <button className={shuffle ? 'active' : ''} title="Losowo" aria-pressed={shuffle} onClick={onShuffle}><Shuffle size={16}/></button>
        <button title="Poprzedni" onClick={onPrevious}><SkipBack size={16} fill="currentColor"/></button>
        <button className="play-button" title={playing ? 'Pauza' : 'Odtwórz'} onClick={onPlayPause}>{playing ? <Pause size={24} fill="currentColor"/> : <Play size={24} fill="currentColor"/>}</button>
        <button title="Następny" onClick={onNext}><SkipForward size={16} fill="currentColor"/></button>
        <button className={repeat !== 'off' ? 'active' : ''} title={repeat === 'one' ? 'Powtórz utwór' : repeat === 'all' ? 'Powtórz kolejkę' : 'Powtarzanie wyłączone'} onClick={onRepeat}>{repeat === 'one' ? <Repeat1 size={16}/> : <Repeat size={16}/>}</button>
      </div>
      <div className="dock-volume">
        <button className={recording ? 'rec-button active' : 'rec-button'} title={recording ? 'Zatrzymaj i zapisz nagrywanie miks' : 'Nagrywaj miks (WebM)'} onClick={onToggleRecording}>
          {recording ? <><span className="rec-dot"/> <RecTimer startedAt={recording.startedAt}/> <Square size={14}/></> : <Disc2 size={16}/>}
        </button>
        <button title={muted ? 'Włącz dźwięk' : 'Wycisz'} onClick={() => onVolume(muted ? 0.78 : 0)}>{muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}</button>
        <input aria-label="Głośność" type="range" min="0" max="100" value={volumePercent} onChange={event => onVolume(Number(event.target.value) / 100)}/>
        <span>{volumePercent}%</span>
      </div>
    </div>
  </section>
}
