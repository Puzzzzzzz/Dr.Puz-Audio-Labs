import { Minus, Pin, Settings, Square, X } from 'lucide-react'
import { AddMenu } from './AddMenu'
import { MeterBars } from './MeterBars'
import drpuzMark from '../assets/drpuz-mark.svg'

interface Props {
  version: string
  playing: boolean
  muted: boolean
  analyser: AnalyserNode | null
  alwaysOnTop: boolean
  onHome: () => void
  onSettings: () => void
  onAlwaysOnTop: () => void
  onAddFiles: () => void
  onAddFolder: () => void
}

export function Topbar({ version, playing, muted, analyser, alwaysOnTop, onHome, onSettings, onAlwaysOnTop, onAddFiles, onAddFolder }: Props) {
  return <header className="topbar">
    <button className="brand" onClick={onHome} aria-label="Dr.Puz Audio Lab — strona główna">
      <img className="brand-logo" src={drpuzMark} alt=""/>
      <span className="brand-name"><b>Dr.Puz</b> Audio Lab</span>
      <small className="brand-version">{version}</small>
    </button>
    <div className="top-status">
      <span className={`status-dot ${playing ? 'live' : ''}`} aria-hidden="true"/>
      <span>{playing ? 'Odtwarzanie' : muted ? 'Wyciszone' : 'Gotowe'}</span>
      {playing && <MeterBars className="mini-spectrum" analyser={analyser} active bars={12}/>}
    </div>
    <div className="top-spacer"/>
    <div className="top-tools">
      <AddMenu onAddFiles={onAddFiles} onAddFolder={onAddFolder}/>
      <button className="icon-button" title="Ustawienia" onClick={onSettings}><Settings size={16}/></button>
      <button className={`icon-button pin-button ${alwaysOnTop ? 'active' : ''}`} title="Zawsze na wierzchu" aria-label="Zawsze na wierzchu" aria-pressed={alwaysOnTop} onClick={onAlwaysOnTop}><Pin size={16}/></button>
    </div>
    <div className="window-controls">
      <button aria-label="Minimalizuj" onClick={() => window.mediaApp.controlWindow('minimize')}><Minus size={16}/></button>
      <button aria-label="Maksymalizuj" onClick={() => window.mediaApp.controlWindow('maximize')}><Square size={14}/></button>
      <button aria-label="Zamknij" onClick={() => window.mediaApp.controlWindow('close')}><X size={16}/></button>
    </div>
  </header>
}
