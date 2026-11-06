import { FolderOpen, Music2, Search } from 'lucide-react'
import type { RefObject } from 'react'
import type { Track } from '../../shared/types'
import { useVirtualRows } from './useVirtualRows'
import { TrackRow } from './TrackRow'

const ROW_HEIGHT = 56

interface Props {
  title: string
  descriptor: string
  query: string
  onQuery: (query: string) => void
  searchRef: RefObject<HTMLInputElement>
  tracks: Track[]
  currentId: string | null
  favorites: string[]
  onScan: () => void
  onPlay: (track: Track) => void
  onFavorite: (track: Track) => void
  onQueue: (track: Track) => void
  onPlaylist: (track: Track) => void
  onBpmAdjustment: (trackId: string, adjustment: 'double' | 'half') => void
}

export function LibraryPage({ title, descriptor, query, onQuery, searchRef, tracks, currentId, favorites, onScan, onPlay, onFavorite, onQueue, onPlaylist, onBpmAdjustment }: Props) {
  const table = useVirtualRows(tracks.length, ROW_HEIGHT)
  return <section className="library-page">
    <div className="page-title-row">
      <div><h1>{title}</h1><p>{descriptor}</p></div>
    </div>
    <div className="library-toolbar">
      <label className="search-box">
        <Search size={16}/>
        <input ref={searchRef} value={query} onChange={event => onQuery(event.target.value)} placeholder="Szukaj"/>
        <kbd>Ctrl K</kbd>
      </label>
    </div>
    <div className="track-table" ref={table.containerRef} onScroll={table.onScroll}>
      <div className="track-table-head"><span>#</span><span/><span>Tytuł / wykonawca</span><span>Format</span><span>Rozmiar</span><span/></div>
      {tracks.length === 0
        ? <div className="empty-state"><Music2 size={24}/><b>Biblioteka jest pusta</b><span>Dodaj pliki albo wskaż folder do obserwowania</span><button className="outline-button" onClick={onScan}><FolderOpen size={16}/> Wybierz folder</button></div>
        : <>
          <div style={{ height: table.topOffset }} aria-hidden="true"/>
          {tracks.slice(table.startIndex, table.endIndex).map((track, offset) => {
            const index = table.startIndex + offset
            return <TrackRow key={track.id} track={track} index={index} active={track.id === currentId} favorite={favorites.includes(track.id)}
              onPlay={() => onPlay(track)} onFavorite={() => onFavorite(track)} onQueue={() => onQueue(track)} onPlaylist={() => onPlaylist(track)} onBpmAdjustment={onBpmAdjustment}/>
          })}
          <div style={{ height: table.bottomOffset }} aria-hidden="true"/>
        </>}
    </div>
  </section>
}
