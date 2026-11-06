import { ListMusic, Plus, Video, X } from 'lucide-react'
import type { Track } from '../../shared/types'
import { formatTime } from '../../shared/format'
import { tracksLabel } from '../labels'
import { QueueItem } from './QueueItem'
import { useVirtualRows } from './useVirtualRows'

const ROW_HEIGHT = 64

interface Props {
  tracks: Track[]
  currentId: string | null
  isPlaying: boolean
  crossfadeEnabled: boolean
  crossfadeBars: number
  crossfadeBarsLabel: (bars: number) => string
  autoDj: boolean
  onAutoDj: () => void
  onAddFiles: () => void
  onClear: () => void
  onSaveAsPlaylist: () => void
  onSelect: (track: Track) => void
  onRemove: (track: Track) => void
}

export function QueuePanel({ tracks, currentId, isPlaying, crossfadeEnabled, crossfadeBars, crossfadeBarsLabel, autoDj, onAutoDj, onAddFiles, onClear, onSaveAsPlaylist, onSelect, onRemove }: Props) {
  const list = useVirtualRows(tracks.length, ROW_HEIGHT)
  const totalSeconds = tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0)
  return <aside className="queue-panel">
    <div className="queue-head">
      <div><h2>Kolejka <small>{tracks.length}</small></h2></div>
      <div className="queue-head-actions">
        <button title="Dodaj pliki" onClick={onAddFiles}><Plus size={16}/></button>
        <button title="Wyczyść kolejkę" onClick={onClear}><X size={16}/></button>
      </div>
    </div>
    <div className="queue-subhead">
      <span>{crossfadeEnabled ? `Set · crossfade ${crossfadeBarsLabel(crossfadeBars)}` : 'Kolejka odtwarzania'}</span>
      <span className="queue-subhead-actions">
        <button className={autoDj ? 'autodj-toggle active' : 'autodj-toggle'} aria-pressed={autoDj}
          title={autoDj ? 'Auto DJ: dopasowuje kolejne utwory (BPM i tonacja); kliknij, aby wyłączyć' : 'Auto DJ: uzupełniaj kolejkę zgodnymi utworami'}
          onClick={onAutoDj}>Auto DJ</button>
        <button onClick={onSaveAsPlaylist}>Zapisz jako playlistę</button>
      </span>
    </div>
    <div className="queue-list" ref={list.containerRef} onScroll={list.onScroll}>
      {tracks.length === 0
        ? <div className="queue-empty"><ListMusic size={24}/><b>Kolejka jest pusta</b><span>Dodaj pliki lub wybierz utwór z biblioteki</span><button onClick={onAddFiles}><Plus size={14}/> Dodaj pliki</button></div>
        : <>
          <div style={{ height: list.topOffset }} aria-hidden="true"/>
          {tracks.slice(list.startIndex, list.endIndex).map((track, offset) => {
            const index = list.startIndex + offset
            return <QueueItem key={`${track.id}-${index}`} track={track} index={index} playing={track.id === currentId} animating={isPlaying}
              onSelect={() => onSelect(track)} onRemove={() => onRemove(track)}/>
          })}
          <div style={{ height: list.bottomOffset }} aria-hidden="true"/>
        </>}
    </div>
    <div className="queue-footer">
      <span>{tracksLabel(tracks.length)} · {formatTime(totalSeconds)}</span>
      {tracks.some(track => track.kind === 'video') && <span className="queue-footer-hint"><Video size={14}/> Zawiera wideo</span>}
    </div>
  </aside>
}
