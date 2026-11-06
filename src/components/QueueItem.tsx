import { memo } from 'react'
import { Video, X } from 'lucide-react'
import type { Track } from '../../shared/types'
import { formatTime } from '../../shared/format'

interface Props {
  track: Track
  index: number
  playing: boolean
  animating: boolean
  onSelect: () => void
  onRemove: () => void
}

function QueueItemBase({ track, index, playing, animating, onSelect, onRemove }: Props) {
  return <div className={`queue-item ${playing ? 'playing' : ''}`} onDoubleClick={onSelect}>
    <div className="queue-index">
      {playing ? <span className={animating ? 'playing-bars' : 'playing-bars paused'}><i/><i/><i/></span> : String(index + 1).padStart(2, '0')}
    </div>
    <button className="queue-cover" onClick={onSelect} title="Odtwórz">
      <span>{track.kind === 'video' ? <Video size={14}/> : track.title.slice(0, 1).toUpperCase()}</span>
    </button>
    <button className="queue-title" onClick={onSelect} title={track.title}>
      <b>{track.title}</b>
      <span>{track.artist}{track.bpm ? ` · ${Math.round(track.bpm)} BPM` : ''}</span>
    </button>
    <span className="queue-duration">{formatTime(track.duration ?? 0)}</span>
    <button className="more-button" title="Usuń z kolejki" onClick={onRemove}><X size={16}/></button>
  </div>
}

export const QueueItem = memo(QueueItemBase, (previous, next) =>
  previous.track === next.track && previous.index === next.index &&
  previous.playing === next.playing && previous.animating === next.animating)
