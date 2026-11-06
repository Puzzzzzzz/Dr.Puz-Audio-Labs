import { ListMusic, Play } from 'lucide-react'
import { useMemo } from 'react'
import type { Playlist, Track } from '../../shared/types'
import { tracksLabel } from '../labels'

interface Props {
  playlists: Playlist[]
  tracks: Track[]
  analyzingPlaylistId: string | null
  analyzingProgress: { current: number; total: number } | null
  onAnalyze: (playlist: Playlist) => void
  onExport: (playlist: Playlist) => void
  onPlay: (playlist: Playlist) => void
}

export function PlaylistsPage({ playlists, tracks, analyzingPlaylistId, analyzingProgress, onAnalyze, onExport, onPlay }: Props) {
  const analyzedCounts = useMemo(() => {
    const counts = new Map<Playlist, number>()
    for (const playlist of playlists) {
      counts.set(playlist, playlist.trackIds.filter(id => tracks.find(track => track.id === id)?.bpm).length)
    }
    return counts
  }, [playlists, tracks])

  return <section className="library-page">
    <div className="page-title-row"><div><h1>Playlisty</h1><p>Listy są przechowywane lokalnie na tym komputerze</p></div><span className="page-hint">Analiza BPM · tonacji · głośności działa lokalnie</span></div>
    <div className="playlist-grid">
      {playlists.map(playlist => {
        const total = playlist.trackIds.length
        const analyzed = analyzedCounts.get(playlist) ?? 0
        const analyzing = analyzingPlaylistId === playlist.id
        return <article className="playlist-card" key={playlist.id}>
          <div className="playlist-art"><ListMusic size={24}/></div>
          <div className="playlist-info">
            <b>{playlist.name}</b>
            <small>{tracksLabel(total)}</small>
            <button className="playlist-analyze" disabled={analyzingPlaylistId !== null} onClick={() => onAnalyze(playlist)}>
              {analyzing && analyzingProgress ? `Analiza ${analyzingProgress.current}/${analyzingProgress.total}` : `Analiza ${analyzed}/${total}`}
            </button>
          </div>
          <button className="icon-button" title="Eksportuj playlistę M3U" onClick={() => onExport(playlist)}>M3U</button>
          <button className="play-overlay" title="Odtwórz playlistę" onClick={() => onPlay(playlist)}><Play size={16} fill="currentColor"/></button>
        </article>
      })}
      {!playlists.length && <div className="empty-state"><ListMusic size={24}/><b>Brak playlist</b><span>Utwórz nową listę albo zaimportuj plik M3U</span></div>}
    </div>
  </section>
}
