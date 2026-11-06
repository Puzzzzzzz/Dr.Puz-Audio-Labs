import { BarChart3, Clock, Headphones, Music2, Play } from 'lucide-react'
import type { PersistedState, Track } from '../../shared/types'
import { formatTime } from '../../shared/format'
import { plural, tracksLabel } from '../labels'

interface Props {
  state: PersistedState
  onPlay: (track: Track) => void
  onAnalyze: () => void
}

function StatLine({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="stat-line"><span>{label}</span><b>{value}</b>{detail ? <small className="stat-detail">{detail}</small> : null}</div>
}

export function StatsPage({ state, onPlay, onAnalyze }: Props) {
  const tracks = state.tracks
  const totalSize = tracks.reduce((sum, track) => sum + track.size, 0)
  const totalDuration = tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0)
  const bpmCount = tracks.filter(track => track.bpm).length
  const keyCount = tracks.filter(track => track.key).length
  const gainCount = tracks.filter(track => track.gainDb !== undefined).length
  const totalPlays = Object.values(state.playCounts).reduce((sum, count) => sum + count, 0)
  const topTracks = [...Object.entries(state.playCounts)]
    .filter(([id]) => tracks.some(track => track.id === id))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
  const recentHistory = state.history
    .filter(entry => tracks.some(track => track.id === entry.trackId))
    .slice(-12)
    .reverse()

  return <section className="library-page">
    <div className="page-title-row">
      <div><h1>Statystyki</h1><p>Odsłuchy, historia i stan analizy biblioteki</p></div>
      <button className="primary-button" onClick={onAnalyze}><BarChart3 size={16}/> Analizuj playlistę</button>
    </div>
    <div className="settings-grid">
      <article className="settings-card wide stats-summary">
        <h3>Biblioteka</h3>
        <div className="stats-numbers">
          <span><b>{tracks.length}</b><small>{plural(tracks.length, 'plik', 'pliki', 'plików')}</small></span>
          <span><b>{formatSize(totalSize)}</b><small>pojemność</small></span>
          <span><b>{formatTime(totalDuration)}</b><small>czas całkowity</small></span>
          <span><b>{totalPlays}</b><small>{plural(totalPlays, 'odsłuch', 'odsłuchy', 'odsłuchów')}</small></span>
        </div>
        <div className="stats-analysis">
          <StatLine label="Tempo (BPM)" value={bpmCount ? tracksLabel(bpmCount) : '—'} detail={tracks.length ? `${Math.round(bpmCount / tracks.length * 100)}%` : undefined}/>
          <StatLine label="Tonacja (Camelot)" value={keyCount ? tracksLabel(keyCount) : '—'} detail={tracks.length ? `${Math.round(keyCount / tracks.length * 100)}%` : undefined}/>
          <StatLine label="Głośność (LUFS)" value={gainCount ? tracksLabel(gainCount) : '—'} detail={tracks.length ? `${Math.round(gainCount / tracks.length * 100)}%` : undefined}/>
        </div>
        <p className="muted">Analizę uruchomisz przyciskiem „Analiza” na dowolnej playliście — wyniki zasilają Auto DJ i wyrównywanie głośności</p>
      </article>

      <article className="settings-card wide">
        <h3>Najczęściej odtwarzane</h3>
        {topTracks.length
          ? <div className="stats-list">
            {topTracks.map(([id, count], index) => {
              const track = tracks.find(item => item.id === id)
              if (!track) return null
              return <button key={id} className="stats-row" onClick={() => onPlay(track)}>
                <span className="stats-rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="stats-track"><b>{track.title}</b><small>{track.artist}</small></span>
                <span className="stats-count"><Headphones size={14}/> {count}×</span>
              </button>
            })}
          </div>
          : <p className="muted">Jeszcze nic nie odsłuchano — liczniki startują przy pierwszym odtworzeniu</p>}
      </article>

      <article className="settings-card wide">
        <h3>Ostatnio odtwarzane</h3>
        {recentHistory.length
          ? <div className="stats-list">
            {recentHistory.map((entry, index) => {
              const track = tracks.find(item => item.id === entry.trackId)
              if (!track) return null
              return <div key={`${entry.at}-${index}`} className="stats-row stats-row-recent">
                <span className="stats-rank"><Clock size={14}/></span>
                <span className="stats-track"><b>{track.title}</b><small>{track.artist}</small></span>
                <button className="stats-play" title="Odtwórz" onClick={() => onPlay(track)}><Play size={14}/></button>
                <span className="stats-count">{new Date(entry.at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', minute: '2-digit', hour: '2-digit' })}</span>
              </div>
            })}
          </div>
          : <p className="muted">Historia pojawi się po pierwszym odsłuchu</p>}
      </article>

      {!tracks.length && <div className="empty-state"><Music2 size={24}/><b>Biblioteka jest pusta</b><span>Dodaj pliki albo wskaż folder, aby zbierać statystyki</span></div>}
    </div>
  </section>
}

function formatSize(size: number): string {
  if (!size) return '0'
  if (size < 1048576) return `${(size / 1024).toFixed(0)} KB`
  if (size < 1073741824) return `${(size / 1048576).toFixed(1)} MB`
  return `${(size / 1073741824).toFixed(2)} GB`
}
