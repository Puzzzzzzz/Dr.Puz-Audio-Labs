import { memo } from 'react'
import { AudioLines, Heart, ListMusic, Music2, Plus, Video } from 'lucide-react'
import type { Track } from '../../shared/types'

interface Props {
  track: Track
  index: number
  active: boolean
  favorite: boolean
  onPlay: () => void
  onFavorite: () => void
  onQueue: () => void
  onPlaylist: () => void
  onBpmAdjustment: (trackId: string, adjustment: 'double' | 'half') => void
}

function BpmCorrectionControls({ track, onChange }: { track: Track; onChange: Props['onBpmAdjustment'] }) {
  if (!track.bpm) return null
  return <span className="bpm-corrections" aria-label={`Korekta BPM dla ${track.title}`} onDoubleClick={event => event.stopPropagation()}>
    <button type="button" className={track.bpmAdjustment === 'double' ? 'selected' : ''} aria-pressed={track.bpmAdjustment === 'double'}
      title="Pomnóż BPM przez 2; kliknij ponownie, aby przywrócić wynik analizy" onClick={event => { event.stopPropagation(); onChange(track.id, 'double') }}>×2</button>
    <button type="button" className={track.bpmAdjustment === 'half' ? 'selected' : ''} aria-pressed={track.bpmAdjustment === 'half'}
      title="Podziel BPM przez 2; kliknij ponownie, aby przywrócić wynik analizy" onClick={event => { event.stopPropagation(); onChange(track.id, 'half') }}>÷2</button>
  </span>
}

function TrackRowBase({ track, index, active, favorite, onPlay, onFavorite, onQueue, onPlaylist, onBpmAdjustment }: Props) {
  return <div className={`track-row ${active ? 'active' : ''}`} onDoubleClick={onPlay}>
    <span className="row-number">{active ? <AudioLines size={16}/> : String(index + 1).padStart(2, '0')}</span>
    <button className="row-art" onClick={onPlay} title="Odtwórz">{track.kind === 'video' ? <Video size={16}/> : <Music2 size={16}/>}</button>
    <div className="row-main">
      <button className="row-main-title" onClick={onPlay}><b>{track.title}</b></button>
      <div className="row-bpm-line"><span title={track.key ? `Tonacja Camelot: ${track.key}` : undefined}>{track.artist}{track.bpm ? ` · ${Math.round(track.bpm)} BPM` : ''}{track.key ? ` · ${track.key}` : ''}</span>{track.bpm && <BpmCorrectionControls track={track} onChange={onBpmAdjustment}/>}</div>
    </div>
    <span className="format-pill">{track.extension.toUpperCase()}</span>
    <span className="file-size">{track.size ? `${(track.size / 1048576).toFixed(1)} MB` : '—'}</span>
    <div className="row-tools">
      <button className={favorite ? 'active' : ''} title="Ulubione" onClick={onFavorite}><Heart size={16} fill={favorite ? 'currentColor' : 'none'}/></button>
      <button title="Dodaj do playlisty" onClick={onPlaylist}><ListMusic size={16}/></button>
      <button title="Dodaj/usuń z kolejki" onClick={onQueue}><Plus size={16}/></button>
    </div>
  </div>
}

export const TrackRow = memo(TrackRowBase, (previous, next) =>
  previous.track === next.track && previous.index === next.index &&
  previous.active === next.active && previous.favorite === next.favorite)
