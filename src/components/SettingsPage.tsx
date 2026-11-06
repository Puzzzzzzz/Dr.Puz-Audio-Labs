import { Check, FolderOpen, MoonStar, Plus } from 'lucide-react'
import type { PersistedState, SystemStats } from '../../shared/types'
import { formatTime } from '../../shared/format'
import { crossfadeBarsLabel } from '../labels'

const EXTENSIONS = ['MP3','WAV','FLAC','M4A','AAC','OGG','OPUS','WMA','AIFF','MP4','WEBM','MOV','MKV','AVI','WMV']
const SLEEP_MINUTES = [15, 30, 45, 60, 90]

interface Props {
  state: PersistedState
  stats: SystemStats
  sleepRemaining: number | null
  onScan: () => void
  onImport: () => void
  onGlobalBpm: (bpm: number) => void
  onCrossfadeEnabled: (enabled: boolean) => void
  onCrossfadeBars: (bars: number) => void
  onNormalize: (enabled: boolean) => void
  onSleep: (minutes: number) => void
}

export function SettingsPage({ state, stats, sleepRemaining, onScan, onImport, onGlobalBpm, onCrossfadeEnabled, onCrossfadeBars, onNormalize, onSleep }: Props) {
  const ramPercent = stats.memoryUsed && stats.memoryTotal ? Math.round(stats.memoryUsed / stats.memoryTotal * 100) : null
  return <section className="library-page settings-page">
    <div className="page-title-row">
      <div><h1>Ustawienia</h1><p>Biblioteka, tempo setu i miksowanie utworów</p></div>
    </div>
    <div className="settings-grid">
      <article className="settings-card wide set-settings">
        <h3>Tempo i crossfade</h3>
        <p>Utwory z wykrytym BPM grają w tempie setu, bez zmiany wysokości dźwięku</p>
        <label className="setting-range">
          <span>Tempo setu <b>{state.globalBpm} BPM</b></span>
          <input aria-label="Tempo setu" type="range" min="60" max="180" step="1" value={state.globalBpm} onChange={event => onGlobalBpm(Number(event.target.value))}/>
          <small>60–180 BPM · utwory bez analizy grają w naturalnym tempie</small>
        </label>
        <label className="setting-toggle">
          <input type="checkbox" checked={state.crossfadeEnabled} onChange={event => onCrossfadeEnabled(event.target.checked)}/>
          <span>Crossfade między utworami</span>
        </label>
        <label className={`setting-range ${state.crossfadeEnabled ? '' : 'disabled'}`}>
          <span>Długość przejścia <b>{crossfadeBarsLabel(state.crossfadeBars)}</b></span>
          <select aria-label="Długość przejścia w taktach" value={state.crossfadeBars} disabled={!state.crossfadeEnabled} onChange={event => onCrossfadeBars(Number(event.target.value))}>
            {([1, 2, 4, 8, 16] as const).map(bars => <option value={bars} key={bars}>{crossfadeBarsLabel(bars)}</option>)}
          </select>
          <small>Metrum 4/4 · pętla intro w tle · miks zaczyna się na wspólnym uderzeniu i kończy na granicy taktu</small>
        </label>
      </article>
      <article className="settings-card">
        <h3>Analiza playlist</h3>
        <p>Przycisk analizy na karcie playlisty mierzy lokalnie tempo, tonację (Camelot) i głośność (LUFS)</p>
        <p>Błędny halftime lub double-time popraw w bibliotece przyciskami ×2 i ÷2. Ponowne kliknięcie przywraca wynik analizy.</p>
      </article>
      <article className="settings-card">
        <h3>Wyrównywanie głośności</h3>
        <p>Odtwarzanie dopasowuje głośność, żeby utwory brzmiały podobnie</p>
        <label className="setting-toggle">
          <input type="checkbox" checked={state.normalize} onChange={event => onNormalize(event.target.checked)}/>
          <span>Wyrównuj głośność (cel −18 LUFS)</span>
        </label>
        <p className="muted">Działa również podczas crossfade</p>
      </article>
      <article className="settings-card">
        <h3>Timer snu</h3>
        <p>Dźwięk wycisza się przez ostatnie 10 sekund, po czym odtwarzanie zatrzymuje się samo</p>
        <div className="sleep-controls">
          {SLEEP_MINUTES.map(minutes => <button key={minutes} onClick={() => onSleep(minutes)}>{minutes} min</button>)}
          {sleepRemaining !== null && <button className="sleep-cancel" onClick={() => onSleep(0)}>Wyłącz</button>}
        </div>
        <p className="sleep-status"><MoonStar size={14}/> {sleepRemaining !== null ? `Sen za ${formatTime(sleepRemaining)}` : 'Timer wyłączony'}</p>
      </article>
      <article className="settings-card wide">
        <h3>Obserwowane foldery</h3>
        {state.folders.map(folder => <div className="folder-line" key={folder}><FolderOpen size={16}/><span>{folder}</span><Check size={14}/></div>)}
        {!state.folders.length && <p className="muted">Nie dodano jeszcze folderów</p>}
        <button className="outline-button" onClick={onScan}><Plus size={16}/> Dodaj folder</button>
      </article>
      <article className="settings-card">
        <h3>Monitoring systemu</h3>
        <p>CPU: <b>{stats.cpuSystem === null ? '—' : `${Math.round(stats.cpuSystem)}%`}</b></p>
        <p>RAM: <b>{ramPercent === null ? '—' : `${ramPercent}%`}</b>{stats.memoryUsed && stats.memoryTotal ? <span className="stat-detail">{(stats.memoryUsed / 1073741824).toFixed(1)} / {(stats.memoryTotal / 1073741824).toFixed(1)} GB</span> : null}</p>
        <p>GPU: <b>{stats.gpu === null ? '—' : `${Math.round(stats.gpu)}%`}</b>{stats.gpuName ? <span className="stat-detail">{stats.gpuName}</span> : null}</p>
      </article>
      <article className="settings-card wide">
        <h3>Rozpoznawane typy plików</h3>
        <p>Odtworzenie zależy od kodeka w pliku i wersji Chromium</p>
        <div className="format-list">{EXTENSIONS.map(extension => <span key={extension}>{extension}</span>)}</div>
      </article>
      <article className="settings-card">
        <h3>M3U</h3>
        <p>Playlisty zapisują się lokalnie na tym komputerze</p>
        <button className="outline-button" onClick={onImport}><FolderOpen size={16}/> Importuj M3U</button>
      </article>
    </div>
  </section>
}
