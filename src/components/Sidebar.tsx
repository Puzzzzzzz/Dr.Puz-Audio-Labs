import { Activity, BarChart3, Library, ListMusic, Music2, Settings, SlidersHorizontal, Star } from 'lucide-react'
import type { Page } from '../nav'
import type { SystemStats } from '../../shared/types'

const ITEMS: Array<{ id: Page; label: string; icon: typeof Music2 }> = [
  { id: 'now', label: 'Teraz odtwarzane', icon: Music2 },
  { id: 'library', label: 'Biblioteka', icon: Library },
  { id: 'visualizer', label: 'Wizualizacje', icon: Activity },
  { id: 'equalizer', label: 'Equalizer', icon: SlidersHorizontal },
  { id: 'stats', label: 'Statystyki', icon: BarChart3 },
  { id: 'playlists', label: 'Playlisty', icon: ListMusic },
  { id: 'favorites', label: 'Ulubione', icon: Star },
  { id: 'settings', label: 'Ustawienia', icon: Settings }
]

interface Props {
  page: Page
  trackCount: number
  stats: SystemStats
  onNav: (page: Page) => void
}

export function Sidebar({ page, trackCount, stats, onNav }: Props) {
  const ramPercent = stats.memoryUsed && stats.memoryTotal ? Math.round(stats.memoryUsed / stats.memoryTotal * 100) : null
  return <aside className="sidebar">
    <div className="side-label">Kolekcja</div>
    <nav aria-label="Nawigacja">
      {ITEMS.map(item => {
        const Icon = item.icon
        return <button key={item.id} onClick={() => onNav(item.id)} className={`nav-item ${page === item.id ? 'selected' : ''}`} aria-current={page === item.id ? 'page' : undefined}>
          <Icon size={16}/><span>{item.label}</span>
          {item.id === 'library' && trackCount > 0 && <small>{trackCount}</small>}
        </button>
      })}
    </nav>
    <div className="side-bottom">
      <div className="system-card">
        <div className="system-title">System</div>
        <div className="system-values">
          <span>CPU <b>{stats.cpuSystem === null ? '—' : `${Math.round(stats.cpuSystem)}%`}</b></span>
          <span>RAM <b>{ramPercent === null ? '—' : `${ramPercent}%`}</b></span>
        </div>
        <div className="gpu-line"><span>GPU</span><b>{stats.gpu === null ? '—' : `${Math.round(stats.gpu)}%`}</b></div>
      </div>
    </div>
  </aside>
}
