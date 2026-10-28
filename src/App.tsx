import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AudioLines, AudioWaveform, Check, ChevronDown, Disc3, FolderOpen, Heart, Home, ListMusic, Maximize2, MoreVertical, Music2, Pause, Play, Plus, Radio, Repeat, Repeat1, Search, Settings, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Sparkles, Star, Video, Volume2, VolumeX, X } from 'lucide-react'
import type { EqPreset, MediaKind, PersistedState, Playlist, SystemStats, Track } from '../shared/types'
import { defaultState, makeTrack } from '../shared/types'
import { formatTime, pathToFileUrl } from '../shared/format'
import Equalizer from './Equalizer'
import { BUILTIN_PRESETS } from './presets'
import Visualizer, { VISUALS, type VisualMode } from './Visualizer'

type Page = 'now' | 'library' | 'visualizer' | 'equalizer' | 'playlists' | 'favorites' | 'settings'
const NAV = [
  { id: 'now', label: 'Teraz odtwarzane', icon: AudioWaveform },
  { id: 'library', label: 'Biblioteka', icon: Music2 },
  { id: 'visualizer', label: 'Wizualizacje', icon: Activity },
  { id: 'equalizer', label: 'Equalizer', icon: SlidersHorizontal },
  { id: 'playlists', label: 'Playlisty', icon: ListMusic },
  { id: 'favorites', label: 'Ulubione', icon: Star },
  { id: 'settings', label: 'Ustawienia', icon: Settings }
] as const

const EMPTY_STATS: SystemStats = { cpuSystem: null, memoryUsed: null, memoryTotal: null, appCpu: null, appMemory: null, gpu: null, gpuName: null }

function fromM3U(text: string, sourcePath: string): Track[] {
  const base = sourcePath.slice(0, Math.max(sourcePath.lastIndexOf('/'), sourcePath.lastIndexOf('\\')) + 1)
  return text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => {
    let path = line
    if (/^file:\/\//i.test(path)) path = decodeURIComponent(path.replace(/^file:\/\//i, '').replace(/^\//, ''))
    else if (!/^[a-z]:[\\/]/i.test(path) && !path.startsWith('\\\\')) path = `${base}${path}`
    return makeTrack(path)
  })
}

function titleFromPath(path: string) { return path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'Utwór' }

export default function App() {
  const [state, setState] = useState<PersistedState>(() => structuredClone(defaultState))
  const [ready, setReady] = useState(false)
  const [page, setPage] = useState<Page>('now')
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState<SystemStats>(EMPTY_STATS)
  const [visualMode, setVisualMode] = useState<VisualMode>('orb')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [subtitleUrl, setSubtitleUrl] = useState('')
  const [subtitleName, setSubtitleName] = useState('')
  const [now, setNow] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const filtersRef = useRef<BiquadFilterNode[]>([])
  const sourcesRef = useRef<WeakSet<HTMLMediaElement>>(new WeakSet())
  const pendingPlayRef = useRef(false)
  const persistTimer = useRef<number | undefined>(undefined)

  const current = useMemo(() => state.tracks.find(track => track.id === state.currentTrackId) ?? null, [state.currentTrackId, state.tracks])
  const isVideo = current?.kind === 'video'
  const currentMedia = isVideo ? videoRef.current : audioRef.current
  const presetList = useMemo(() => [...BUILTIN_PRESETS, ...state.customPresets], [state.customPresets])
  const currentPreset = presetList.find(preset => preset.name === state.eqPreset) ?? BUILTIN_PRESETS[0]
  const queueTracks = useMemo(() => state.queue.map(id => state.tracks.find(track => track.id === id)).filter((track): track is Track => Boolean(track)), [state.queue, state.tracks])
  const filteredTracks = useMemo(() => {
    const query = search.trim().toLowerCase()
    const tracks = page === 'favorites' ? state.tracks.filter(track => state.favorites.includes(track.id)) : state.tracks
    return tracks.filter(track => !query || `${track.title} ${track.artist} ${track.album} ${track.extension}`.toLowerCase().includes(query))
  }, [page, search, state.favorites, state.tracks])

  const update = useCallback((patch: Partial<PersistedState> | ((current: PersistedState) => Partial<PersistedState>)) => {
    setState(currentState => ({ ...currentState, ...(typeof patch === 'function' ? patch(currentState) : patch) }))
  }, [])

  useEffect(() => {
    window.mediaApp.loadState().then(saved => {
      const restored = { ...defaultState, ...saved, currentTime: saved.currentTime || 0 }
      setState(restored)
      setReady(true)
      if (restored.folders.length) window.mediaApp.watchFolders(restored.folders)
    }).catch(() => setReady(true))
    return () => { if (persistTimer.current) window.clearTimeout(persistTimer.current) }
  }, [])

  useEffect(() => {
    if (!ready) return
    if (persistTimer.current) window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => { void window.mediaApp.saveState(state) }, 450)
  }, [ready, state])

  useEffect(() => {
    let active = true
    const poll = async () => { try { const next = await window.mediaApp.readStats(); if (active) setStats(next) } catch { /* optional system sensor */ } }
    void poll()
    const id = window.setInterval(poll, 2200)
    return () => { active = false; window.clearInterval(id) }
  }, [])

  useEffect(() => window.mediaApp.onFolderChanged(folder => {
    window.mediaApp.scanFolder(folder).then(found => update(currentState => {
      const rest = currentState.tracks.filter(track => !track.path.toLowerCase().startsWith(folder.toLowerCase()))
      return { tracks: [...rest, ...found] }
    }))
  }), [update])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const media = isVideo ? videoRef.current : audioRef.current
      if (media && !media.paused) setNow(media.currentTime)
    }, 300)
    return () => window.clearInterval(timer)
  }, [isVideo])

  useEffect(() => {
    if (!current) return
    const audio = audioRef.current
    const video = videoRef.current
    const activeMedia = current.kind === 'video' ? video : audio
    const passiveMedia = current.kind === 'video' ? audio : video
    if (passiveMedia) { passiveMedia.pause(); passiveMedia.removeAttribute('src'); passiveMedia.load() }
    if (activeMedia) {
      activeMedia.currentTime = current.id === state.currentTrackId ? Math.max(0, state.currentTime) : 0
      activeMedia.load()
    }
  }, [current?.id])

  useEffect(() => {
    filtersRef.current.forEach((filter, index) => { filter.gain.setTargetAtTime(state.eqValues[index] ?? 0, contextRef.current?.currentTime ?? 0, 0.035) })
  }, [state.eqValues])

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const media = isVideo ? videoRef.current : audioRef.current
      if (event.code === 'Space') { event.preventDefault(); void togglePlayback() }
      if (event.code === 'ArrowRight' && media) media.currentTime = Math.min(media.duration || 0, media.currentTime + 5)
      if (event.code === 'ArrowLeft' && media) media.currentTime = Math.max(0, media.currentTime - 5)
      if (event.code === 'ArrowUp') update(currentState => ({ volume: Math.min(1, currentState.volume + 0.05) }))
      if (event.code === 'ArrowDown') update(currentState => ({ volume: Math.max(0, currentState.volume - 0.05) }))
      if (event.code === 'MediaTrackNext') skipNext()
      if (event.code === 'MediaTrackPrevious') skipPrevious()
      if (event.ctrlKey && event.key.toLowerCase() === 'k') { event.preventDefault(); setPage('library'); window.setTimeout(() => searchRef.current?.focus(), 0) }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, isVideo, state.queue, state.repeat, state.shuffle])

  useEffect(() => {
    if (!current) return
    const media = current.kind === 'video' ? videoRef.current : audioRef.current
    if (media) media.volume = state.volume
  }, [current?.id, state.volume])

  const addTracks = useCallback((tracks: Track[], enqueue = true) => {
    if (!tracks.length) return
    update(currentState => {
      const combined = new Map(currentState.tracks.map(track => [track.id, track]))
      tracks.forEach(track => combined.set(track.id, { ...combined.get(track.id), ...track }))
      return { tracks: [...combined.values()], queue: enqueue ? [...currentState.queue, ...tracks.map(track => track.id).filter(id => !currentState.queue.includes(id))] : currentState.queue }
    })
    setNotice(`Dodano ${tracks.length} ${tracks.length === 1 ? 'plik' : 'plików'} do biblioteki`)
    window.setTimeout(() => setNotice(''), 2600)
  }, [update])

  const selectTrack = useCallback((track: Track, autoplay = false) => {
    update(currentState => ({
      tracks: currentState.tracks.some(item => item.id === track.id) ? currentState.tracks : [...currentState.tracks, track],
      queue: currentState.queue.includes(track.id) ? currentState.queue : [...currentState.queue, track.id],
      currentTrackId: track.id, currentTime: 0
    }))
    pendingPlayRef.current = autoplay
    setNow(0)
  }, [update])

  const ensureAudioGraph = useCallback(() => {
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!contextRef.current && AudioContextClass) {
      const context = new AudioContextClass()
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.82
      const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
      const filters = frequencies.map((frequency, index) => {
        const filter = context.createBiquadFilter()
        filter.type = index === 0 ? 'lowshelf' : index === frequencies.length - 1 ? 'highshelf' : 'peaking'
        filter.frequency.value = frequency
        if (filter.type === 'peaking') filter.Q.value = 1.05
        return filter
      })
      filters.forEach((filter, index) => filter.connect(filters[index + 1] ?? analyser))
      analyser.connect(context.destination)
      contextRef.current = context
      analyserRef.current = analyser
      filtersRef.current = filters
      filters.forEach((filter, index) => { filter.gain.value = state.eqValues[index] ?? 0 })
    }
    const context = contextRef.current
    if (context?.state === 'suspended') void context.resume()
    const media = isVideo ? videoRef.current : audioRef.current
    if (media && context && !sourcesRef.current.has(media)) {
      try {
        const source = context.createMediaElementSource(media)
        source.connect(filtersRef.current[0])
        sourcesRef.current.add(media)
      } catch { /* source can only be attached once per media element */ }
    }
  }, [isVideo, state.eqValues])

  const togglePlayback = useCallback(async () => {
    const media = isVideo ? videoRef.current : audioRef.current
    if (!media || !current) return
    setError('')
    if (media.paused) {
      ensureAudioGraph()
      if (media.readyState < 2) { pendingPlayRef.current = true; media.load(); return }
      pendingPlayRef.current = false
      try { await media.play() } catch { setError('Ten plik nie jest obsługiwany przez aktualny silnik Chromium.') }
    } else media.pause()
  }, [current, ensureAudioGraph, isVideo])

  const playNextId = useCallback((direction: 1 | -1) => {
    if (!state.queue.length) return
    if (state.repeat === 'one' && direction === 1) {
      const media = isVideo ? videoRef.current : audioRef.current
      if (media) { media.currentTime = 0; void togglePlayback() }
      return
    }
    const currentIndex = Math.max(0, state.queue.indexOf(state.currentTrackId ?? ''))
    let nextIndex = currentIndex + direction
    if (state.shuffle && direction === 1 && state.queue.length > 1) {
      do { nextIndex = Math.floor(Math.random() * state.queue.length) } while (nextIndex === currentIndex)
    } else if (nextIndex >= state.queue.length && state.repeat === 'all') nextIndex = 0
    else if (nextIndex < 0 && state.repeat === 'all') nextIndex = state.queue.length - 1
    if (nextIndex < 0 || nextIndex >= state.queue.length) return
    const nextTrack = state.tracks.find(track => track.id === state.queue[nextIndex])
    if (nextTrack) selectTrack(nextTrack, true)
  }, [isVideo, selectTrack, state.currentTrackId, state.queue, state.repeat, state.shuffle, state.tracks, togglePlayback])

  const skipNext = useCallback(() => playNextId(1), [playNextId])
  const skipPrevious = useCallback(() => {
    const media = isVideo ? videoRef.current : audioRef.current
    if (media && media.currentTime > 3) { media.currentTime = 0; return }
    playNextId(-1)
  }, [isVideo, playNextId])

  const onCanPlay = () => {
    if (pendingPlayRef.current) { pendingPlayRef.current = false; ensureAudioGraph(); void (isVideo ? videoRef.current : audioRef.current)?.play().catch(() => setError('Nie udało się odtworzyć pliku. Sprawdź obsługiwany format.')) }
  }

  const scanLibraryFolder = async () => {
    const folder = await window.mediaApp.chooseFolder()
    if (!folder) return
    setNotice('Skanowanie folderu…')
    const found = await window.mediaApp.scanFolder(folder)
    update(currentState => ({ folders: currentState.folders.includes(folder) ? currentState.folders : [...currentState.folders, folder] }))
    await window.mediaApp.watchFolders([folder])
    addTracks(found, false)
    setNotice(`Skanowanie zakończone · ${found.length} plików`)
    window.setTimeout(() => setNotice(''), 3000)
  }

  const importM3U = async () => {
    const result = await window.mediaApp.importPlaylist()
    if (!result) return
    const tracks = fromM3U(result.text, result.path)
    addTracks(tracks, false)
    const playlist: Playlist = { id: crypto.randomUUID(), name: result.path.split(/[\\/]/).pop()?.replace(/\.m3u8?$/i, '') || 'Zaimportowana lista', trackIds: tracks.map(track => track.id), updatedAt: Date.now() }
    update(currentState => ({ playlists: [...currentState.playlists, playlist] }))
    setPage('playlists')
  }

  const exportM3U = async (playlist: Playlist) => {
    const content = ['#EXTM3U', ...playlist.trackIds.flatMap(id => {
      const track = state.tracks.find(item => item.id === id)
      return track ? [`#EXTINF:-1,${track.artist} - ${track.title}`, track.path] : []
    })].join('\r\n')
    await window.mediaApp.exportPlaylist(playlist.name, content)
  }

  const makePlaylist = () => {
    const name = window.prompt('Nazwa nowej playlisty')
    if (!name?.trim()) return
    update(currentState => ({ playlists: [...currentState.playlists, { id: crypto.randomUUID(), name: name.trim(), trackIds: [], updatedAt: Date.now() }] }))
  }

  const saveQueueAsPlaylist = () => {
    if (!state.queue.length) { setNotice('Dodaj utwory do kolejki przed zapisaniem playlisty'); window.setTimeout(() => setNotice(''), 2500); return }
    const name = window.prompt('Nazwa playlisty z bieżącej kolejki')
    if (!name?.trim()) return
    update(currentState => ({ playlists: [...currentState.playlists, { id: crypto.randomUUID(), name: name.trim(), trackIds: [...currentState.queue], updatedAt: Date.now() }] }))
    setPage('playlists')
  }

  const addTrackToPlaylist = (track: Track) => {
    if (!state.playlists.length) {
      const name = window.prompt('Nie masz playlist. Podaj nazwę nowej playlisty:')
      if (!name?.trim()) return
      update(currentState => ({ playlists: [...currentState.playlists, { id: crypto.randomUUID(), name: name.trim(), trackIds: [track.id], updatedAt: Date.now() }] }))
      setNotice(`Dodano „${track.title}” do playlisty „${name.trim()}”`)
    } else {
      const choices = state.playlists.map((playlist, index) => `${index + 1}. ${playlist.name}`).join('\n')
      const answer = window.prompt(`Dodaj „${track.title}” do playlisty:\n${choices}\n\nWpisz numer playlisty`)
      const playlist = state.playlists[Number(answer) - 1]
      if (!playlist) return
      update(currentState => ({ playlists: currentState.playlists.map(item => item.id === playlist.id ? { ...item, trackIds: item.trackIds.includes(track.id) ? item.trackIds : [...item.trackIds, track.id], updatedAt: Date.now() } : item) }))
      setNotice(`Dodano „${track.title}” do playlisty „${playlist.name}”`)
    }
    window.setTimeout(() => setNotice(''), 2500)
  }

  const saveCustomPreset = () => {
    const name = window.prompt('Nazwa presetu equalizera')
    if (!name?.trim()) return
    const preset: EqPreset = { name: name.trim(), values: [...state.eqValues] }
    update(currentState => ({ customPresets: [...currentState.customPresets.filter(item => item.name !== preset.name), preset], eqPreset: preset.name }))
  }

  const toggleFavorite = (track: Track) => update(currentState => ({ favorites: currentState.favorites.includes(track.id) ? currentState.favorites.filter(id => id !== track.id) : [...currentState.favorites, track.id] }))
  const toggleQueue = (track: Track) => update(currentState => ({ queue: currentState.queue.includes(track.id) ? currentState.queue.filter(id => id !== track.id) : [...currentState.queue, track.id] }))
  const setPreset = (name: string) => {
    const preset = presetList.find(item => item.name === name) ?? BUILTIN_PRESETS[0]
    update({ eqPreset: name, eqValues: [...preset.values] })
  }
  const handleEnded = () => playNextId(1)
  const volumePercent = Math.round(state.volume * 100)
  const systemRamPercent = stats.memoryUsed && stats.memoryTotal ? Math.round(stats.memoryUsed / stats.memoryTotal * 100) : null
  const currentVisual = VISUALS.find(item => item.id === visualMode) ?? VISUALS[0]
  const cover = current ? current.title.slice(0, 2).toUpperCase() : 'DP'
  const ms = current?.kind === 'video' ? videoRef.current : audioRef.current
  const progress = ms && Number.isFinite(ms.duration) && ms.duration > 0 ? Math.min(100, now / ms.duration * 100) : 0

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => setPage('now')}><span className="brand-symbol">DP</span><span>Dr.Puz <b>Audio Lab</b></span></button>
      <div className="top-audio-status"><AudioLines size={17} className="cyan"/><div className="mini-spectrum">{Array.from({ length: 15 }, (_, i) => <i key={i} style={{ height: `${7 + (i * 11 % 15)}px` }} />)}</div><span>{current ? 'AUDIO READY' : 'GOTOWY'}</span><span className="status-dot" /></div>
      <div className="top-spacer" />
      <button className="icon-button" title="Ustawienia" onClick={() => setPage('settings')}><Settings size={17}/></button>
      <div className="window-controls"><button aria-label="Minimalizuj" onClick={() => window.mediaApp.controlWindow('minimize')}>—</button><button aria-label="Maksymalizuj" onClick={() => window.mediaApp.controlWindow('maximize')}>□</button><button aria-label="Zamknij" onClick={() => window.mediaApp.controlWindow('close')}>×</button></div>
    </header>

    <aside className="sidebar">
      <div className="side-label">LABORATORIUM</div>
      <nav>{NAV.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setPage(item.id)} className={`nav-item ${page === item.id ? 'selected' : ''}`}><Icon size={19}/><span>{item.label}</span>{item.id === 'library' && state.tracks.length > 0 && <small>{state.tracks.length}</small>}</button> })}</nav>
      <div className="side-bottom">
        <div className="system-card"><div className="system-title"><span className="live-pulse"/> SYSTEM STATUS</div><div className="system-wave">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ height: `${5 + (i * 17 % 26)}px` }} />)}</div><div className="system-values"><span>CPU <b>{stats.cpuSystem === null ? '—' : `${Math.round(stats.cpuSystem)}%`}</b></span><span>RAM <b>{systemRamPercent === null ? '—' : `${systemRamPercent}%`}</b></span></div><div className="gpu-line"><span>GPU</span><b>{stats.gpu === null ? 'N/D' : `${Math.round(stats.gpu)}%`}</b></div></div>
        <div className="sidebar-foot">WERSJA {window.mediaApp.version()} <span>● ONLINE</span></div>
      </div>
    </aside>

    <main className="workspace">
      <section className={`stage stage-${page}`}>
        <div className="stage-head"><div className="breadcrumbs"><span>DR.PUZ AUDIO LAB</span><i>/</i><b>{NAV.find(item => item.id === page)?.label.toUpperCase()}</b></div><div className="stage-actions"><button className="outline-button" onClick={() => void window.mediaApp.openMedia().then(tracks => addTracks(tracks))}><Plus size={16}/> DODAJ PLIKI</button><button className="square-button" title="Skanuj folder" onClick={() => void scanLibraryFolder()}><FolderOpen size={17}/></button></div></div>

        {page === 'library' || page === 'favorites' ? <section className="library-page">
          <div className="page-title-row"><div><span className="eyebrow">KOLEKCJA AUDIO / VIDEO</span><h1>{page === 'favorites' ? 'Twoje ulubione' : 'Biblioteka multimediów'}</h1><p>{filteredTracks.length} plików · {state.folders.length} obserwowanych folderów</p></div><button className="primary-button" onClick={() => void scanLibraryFolder()}><Plus size={16}/> Dodaj folder</button></div>
          <div className="library-toolbar"><label className="search-box"><Search size={16}/><input ref={searchRef} value={search} onChange={event => setSearch(event.target.value)} placeholder="Szukaj utworu, wykonawcy lub albumu"/><kbd>Ctrl K</kbd></label><button className="filter-button"><span>WSZYSTKIE TYPY</span><ChevronDown size={14}/></button></div>
          <div className="track-table"><div className="track-table-head"><span>#</span><span>TYTUŁ / WYKONAWCA</span><span>FORMAT</span><span>ROZMIAR</span><span></span></div>{filteredTracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} active={track.id === current?.id} favorite={state.favorites.includes(track.id)} onPlay={() => selectTrack(track, true)} onFavorite={() => toggleFavorite(track)} onQueue={() => toggleQueue(track)} onPlaylist={() => addTrackToPlaylist(track)}/>)}{!filteredTracks.length && <div className="empty-state"><Music2 size={28}/><b>Biblioteka jest pusta</b><span>Dodaj pliki albo wskaż folder, który mam obserwować.</span><button className="outline-button" onClick={() => void scanLibraryFolder()}><FolderOpen size={15}/> WYBIERZ FOLDER</button></div>}</div>
        </section> : page === 'playlists' ? <section className="library-page">
          <div className="page-title-row"><div><span className="eyebrow">TWOJE ZESTAWY</span><h1>Playlisty</h1><p>Listy są przechowywane lokalnie na tym komputerze.</p></div><div className="row-actions"><button className="outline-button" onClick={() => void importM3U()}><FolderOpen size={15}/> IMPORT M3U</button><button className="primary-button" onClick={makePlaylist}><Plus size={16}/> Nowa playlista</button></div></div>
          <div className="playlist-grid">{state.playlists.map(playlist => <article className="playlist-card" key={playlist.id}><div className="playlist-art"><ListMusic size={27}/><span>{String(playlist.trackIds.length).padStart(2, '0')}</span></div><div className="playlist-info"><b>{playlist.name}</b><small>{playlist.trackIds.length} utworów</small></div><button className="icon-button" title="Eksportuj playlistę M3U" onClick={() => void exportM3U(playlist)}><MoreVertical size={17}/></button><button className="play-overlay" title="Odtwórz playlistę" onClick={() => { const track = state.tracks.find(item => item.id === playlist.trackIds[0]); if (track) { update({ queue: [...playlist.trackIds] }); selectTrack(track, true) } }}><Play size={17} fill="currentColor"/></button></article>)}{!state.playlists.length && <div className="empty-state"><ListMusic size={28}/><b>Brak playlist</b><span>Utwórz nową listę albo zaimportuj plik M3U.</span></div>}</div>
        </section> : page === 'settings' ? <SettingsPage state={state} stats={stats} onScan={() => void scanLibraryFolder()} onImport={() => void importM3U()} /> : <>
          {page === 'now' && <div className="now-playing-info"><div className="cover-art"><Disc3 size={34}/><span>{cover}</span></div><div className="track-meta"><span className="eyebrow">{current?.kind === 'video' ? 'TERAZ OGLĄDASZ' : 'TERAZ ODTWARZANE'}</span><h1>{current?.title ?? 'Wybierz coś do odtworzenia'}</h1><p>{current?.artist ?? 'Dodaj pliki lub folder do swojej biblioteki'}</p><div className="file-badges">{current && <><span>{current.extension.toUpperCase()}</span><span>{current.size ? `${(current.size / 1048576).toFixed(1)} MB` : 'LOCAL'}</span></>}</div></div><div className="track-stat"><span>JAKOŚĆ ŹRÓDŁA</span><b>{current ? current.extension.toUpperCase() : '—'}</b><small>LOKALNY PLIK</small></div></div>}
          {page === 'visualizer' && <div className="visual-page-header"><div><span className="eyebrow">SYNCHRONIZACJA W CZASIE RZECZYWISTYM</span><h1>Laboratorium wizualizacji</h1></div><span className="visual-live"><i/> LIVE AUDIO INPUT</span></div>}
          {page === 'equalizer' && <div className="visual-page-header"><div><span className="eyebrow">PRECYZYJNA KOREKCJA CZĘSTOTLIWOŚCI</span><h1>Equalizer</h1></div><span className="visual-live"><i/> {state.eqPreset.toUpperCase()}</span></div>}
          {page !== 'equalizer' && <div className={`visual-panel ${page !== 'now' ? 'visual-panel-tall' : ''} ${isVideo ? 'video-panel' : ''}`}>
            {isVideo ? <div className="video-wrap"><video ref={videoRef} src={current ? pathToFileUrl(current.path) : undefined} onCanPlay={onCanPlay} onTimeUpdate={event => setNow(event.currentTarget.currentTime)} onLoadedMetadata={event => update({ currentTime: state.currentTime, tracks: state.tracks.map(track => track.id === current?.id ? { ...track, duration: event.currentTarget.duration } : track) })} onEnded={handleEnded} onError={() => setError('Nie można odtworzyć tego filmu. Format lub kodek może nie być obsługiwany.')} crossOrigin="anonymous">{subtitleUrl && <track kind="subtitles" src={subtitleUrl} srcLang="pl" label={subtitleName} default/>}</video>{!current && <div className="video-empty"><Video size={38}/><span>Obraz wideo pojawi się tutaj</span></div>}</div> : <><Visualizer mode={visualMode} analyser={analyserRef.current} active={Boolean(current && !(isVideo ? videoRef.current : audioRef.current)?.paused)}/><div className="visual-grid-overlay"/><div className="visual-label"><span className="visual-dot"/> AUDIO REACTIVE <span>·</span> {currentVisual.name.toUpperCase()}</div><div className="visual-mode-dots">{VISUALS.map((visual, index) => <button key={visual.id} className={visualMode === visual.id ? 'active' : ''} title={visual.name} onClick={() => setVisualMode(visual.id)}>{String(index + 1).padStart(2, '0')}</button>)}</div><div className="viz-corner viz-corner-left">44.1 <small>KHZ</small><br/>24 <small>BIT</small></div><button className="viz-expand" title="Pełny ekran" onClick={() => document.querySelector('.visual-panel')?.requestFullscreen()}><Maximize2 size={15}/></button></>}
            {isVideo && <button className="subtitles-button" onClick={async () => { const result = await window.mediaApp.openSubtitle(); if (!result) return; if (subtitleUrl) URL.revokeObjectURL(subtitleUrl); const vtt = result.name.toLowerCase().endsWith('.srt') ? `WEBVTT\n\n${result.text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}` : result.text; setSubtitleUrl(URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))); setSubtitleName(result.name) }}><Video size={14}/> {subtitleName || 'Dodaj napisy SRT / VTT'}</button>}
            {error && <div className="media-error"><span>{error}</span><button onClick={() => setError('')}><X size={14}/></button></div>}
          </div>}
          {page === 'now' && <div className="eq-inline"><Equalizer values={state.eqValues} presetName={state.eqPreset} presets={presetList} onChange={values => update({ eqValues: values, eqPreset: 'Własny' })} onPreset={setPreset} onSave={saveCustomPreset}/></div>}
          {page === 'visualizer' && <div className="visual-picker">{VISUALS.map(visual => <button key={visual.id} className={visualMode === visual.id ? 'active' : ''} onClick={() => setVisualMode(visual.id)}><Sparkles size={14}/>{visual.name}<span className="picker-dot" style={{ background: visual.color }}/></button>)}</div>}
          {page === 'equalizer' && <div className="eq-expanded"><Equalizer values={state.eqValues} presetName={state.eqPreset} presets={presetList} onChange={values => update({ eqValues: values, eqPreset: 'Własny' })} onPreset={setPreset} onSave={saveCustomPreset}/><div className="eq-note"><Check size={15}/> Equalizer działa w czasie rzeczywistym dla obsługiwanego audio i wideo.</div></div>}
        </>}
      </section>

      <section className="player-dock">
        <div className="dock-progress"><span>{formatTime(now)}</span><input aria-label="Pozycja utworu" type="range" min="0" max="1000" value={Math.round(progress * 10)} onChange={event => { const media = isVideo ? videoRef.current : audioRef.current; if (media?.duration) { media.currentTime = media.duration * (Number(event.target.value) / 1000); update({ currentTime: media.currentTime }) } }}/><span>{formatTime(current?.duration ?? ms?.duration ?? 0)}</span></div>
        <div className="dock-bottom"><div className="dock-track"><div className="dock-cover">{current?.kind === 'video' ? <Video size={19}/> : <Music2 size={19}/>}</div><div><b>{current?.title ?? 'Dr.Puz Audio Lab'}</b><span>{current?.artist ?? 'Gotowy do odtwarzania'}</span></div><button className={`heart-button ${current && state.favorites.includes(current.id) ? 'active' : ''}`} title="Ulubione" onClick={() => current && toggleFavorite(current)}><Heart size={17} fill={current && state.favorites.includes(current.id) ? 'currentColor' : 'none'}/></button></div>
          <div className="transport"><button className={state.shuffle ? 'active' : ''} title="Losowo" onClick={() => update({ shuffle: !state.shuffle })}><Shuffle size={17}/></button><button title="Poprzedni" onClick={skipPrevious}><SkipBack size={19} fill="currentColor"/></button><button className="play-button" title={currentMedia?.paused === false ? 'Pauza' : 'Odtwórz'} onClick={() => void togglePlayback()}>{currentMedia?.paused === false ? <Pause size={23} fill="currentColor"/> : <Play size={23} fill="currentColor"/>}</button><button title="Następny" onClick={skipNext}><SkipForward size={19} fill="currentColor"/></button><button className={state.repeat !== 'off' ? 'active' : ''} title={`Powtarzanie: ${state.repeat}`} onClick={() => update({ repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' })}>{state.repeat === 'one' ? <Repeat1 size={17}/> : <Repeat size={17}/>}</button></div>
          <div className="dock-volume"><button title={state.volume === 0 ? 'Włącz dźwięk' : 'Wycisz'} onClick={() => update({ volume: state.volume === 0 ? 0.78 : 0 })}>{state.volume === 0 ? <VolumeX size={19}/> : <Volume2 size={19}/>}</button><input aria-label="Głośność" type="range" min="0" max="100" value={volumePercent} onChange={event => update({ volume: Number(event.target.value) / 100 })}/><span>{volumePercent}%</span></div>
        </div>
        <audio ref={audioRef} src={current && !isVideo ? pathToFileUrl(current.path) : undefined} onCanPlay={onCanPlay} onTimeUpdate={event => { setNow(event.currentTarget.currentTime); if (Math.floor(event.currentTarget.currentTime) % 5 === 0) update({ currentTime: event.currentTarget.currentTime }) }} onLoadedMetadata={event => { const duration = event.currentTarget.duration; if (Number.isFinite(duration)) update(currentState => ({ tracks: currentState.tracks.map(track => track.id === current?.id ? { ...track, duration } : track) })) }} onEnded={handleEnded} onError={event => { if (current && !isVideo) setError('Nie można odtworzyć tego pliku. Format lub kodek może nie być obsługiwany.') }} />
      </section>
    </main>

    <aside className="queue-panel"><div className="queue-head"><div><span className="eyebrow">PLAYBACK</span><h2><span>NEON</span> QUEUE <small>{queueTracks.length}</small></h2></div><div className="queue-head-actions"><button title="Dodaj pliki" onClick={() => void window.mediaApp.openMedia().then(tracks => addTracks(tracks))}><Plus size={18}/></button><button title="Wyczyść kolejkę" onClick={() => update({ queue: [] })}><X size={17}/></button></div></div><div className="queue-subhead"><span>KOLEJKA ODTWARZANIA</span><button onClick={saveQueueAsPlaylist}>ZAPISZ JAKO PLAYLISTĘ</button></div><div className="queue-list">{queueTracks.map((track, index) => <div className={`queue-item ${track.id === current?.id ? 'playing' : ''}`} key={`${track.id}-${index}`} onDoubleClick={() => selectTrack(track, true)}><div className="queue-index">{track.id === current?.id ? <span className="playing-bars"><i/><i/><i/></span> : String(index + 1).padStart(2, '0')}</div><button className="queue-cover" onClick={() => selectTrack(track, true)}><span>{track.kind === 'video' ? <Video size={15}/> : track.title.slice(0, 1).toUpperCase()}</span></button><button className="queue-title" onClick={() => selectTrack(track, true)}><b>{track.title}</b><span>{track.artist}</span></button><span className="queue-duration">{formatTime(track.duration ?? 0)}</span><button className="more-button" title="Usuń z kolejki" onClick={() => toggleQueue(track)}><MoreVertical size={16}/></button></div>)}{!queueTracks.length && <div className="queue-empty"><ListMusic size={25}/><b>Kolejka jest pusta</b><span>Dodaj pliki lub wybierz utwór z biblioteki.</span><button onClick={() => void window.mediaApp.openMedia().then(tracks => addTracks(tracks))}><Plus size={14}/> DODAJ PLIKI</button></div>}</div><div className="queue-footer"><span><b>{String(queueTracks.length).padStart(2, '0')}</b> UTWORÓW</span><span>{formatTime(queueTracks.reduce((sum, track) => sum + (track.duration ?? 0), 0))}</span></div><div className="queue-stats"><div><span>CPU APLIKACJI</span><b>{stats.appCpu === null ? '—' : `${stats.appCpu.toFixed(1)}%`}</b></div><div><span>PAMIĘĆ APLIKACJI</span><b>{stats.appMemory === null ? '—' : `${(stats.appMemory / 1048576).toFixed(0)} MB`}</b></div><div><span>GPU</span><b>{stats.gpu === null ? 'N/D' : `${Math.round(stats.gpu)}%`}</b></div></div></aside>
    {notice && <div className="toast"><Check size={15}/>{notice}</div>}
  </div>
}

function TrackRow({ track, index, active, favorite, onPlay, onFavorite, onQueue, onPlaylist }: { track: Track; index: number; active: boolean; favorite: boolean; onPlay: () => void; onFavorite: () => void; onQueue: () => void; onPlaylist: () => void }) {
  return <div className={`track-row ${active ? 'active' : ''}`} onDoubleClick={onPlay}><span className="row-number">{active ? <AudioLines size={15}/> : String(index + 1).padStart(2, '0')}</span><button className="row-art" onClick={onPlay}>{track.kind === 'video' ? <Video size={16}/> : <Music2 size={16}/>}</button><button className="row-main" onClick={onPlay}><b>{track.title}</b><span>{track.artist}</span></button><span className="format-pill">{track.extension.toUpperCase()}</span><span className="file-size">{track.size ? `${(track.size / 1048576).toFixed(1)} MB` : '—'}</span><div className="row-tools"><button className={favorite ? 'active' : ''} title="Ulubione" onClick={onFavorite}><Heart size={15} fill={favorite ? 'currentColor' : 'none'}/></button><button title="Dodaj do playlisty" onClick={onPlaylist}><ListMusic size={15}/></button><button title="Dodaj/usuń z kolejki" onClick={onQueue}><MoreVertical size={16}/></button></div></div>
}

function SettingsPage({ state, stats, onScan, onImport }: { state: PersistedState; stats: SystemStats; onScan: () => void; onImport: () => void }) {
  const extensions = ['MP3','WAV','FLAC','M4A','AAC','OGG','OPUS','WMA','AIFF','MP4','WEBM','MOV','MKV','AVI','WMV']
  return <section className="library-page settings-page"><div className="page-title-row"><div><span className="eyebrow">KONFIGURACJA APLIKACJI</span><h1>Ustawienia</h1><p>Informacje o lokalnej bibliotece i dostępnych zasobach.</p></div></div><div className="settings-grid"><article className="settings-card wide"><span className="eyebrow">BIBLIOTEKA LOKALNA</span><h3>Obserwowane foldery</h3>{state.folders.map(folder => <div className="folder-line" key={folder}><FolderOpen size={15}/><span>{folder}</span><Check size={14}/></div>)}{!state.folders.length && <p className="muted">Nie dodano jeszcze folderów.</p>}<button className="outline-button" onClick={onScan}><Plus size={15}/> DODAJ FOLDER</button></article><article className="settings-card"><span className="eyebrow">ZASOBY SYSTEMOWE</span><h3>Monitoring w czasie rzeczywistym</h3><p>CPU całego systemu: <b>{stats.cpuSystem === null ? 'Brak danych' : `${Math.round(stats.cpuSystem)}%`}</b></p><p>Pamięć fizyczna: <b>{stats.memoryUsed && stats.memoryTotal ? `${(stats.memoryUsed / 1073741824).toFixed(1)} / ${(stats.memoryTotal / 1073741824).toFixed(1)} GB` : 'Brak danych'}</b></p><p>Karta graficzna: <b>{stats.gpuName ?? 'Brak odczytu GPU'}</b></p><p>Wykorzystanie GPU: <b>{stats.gpu === null ? 'N/D' : `${Math.round(stats.gpu)}%`}</b></p></article><article className="settings-card wide"><span className="eyebrow">ZGODNOŚĆ MEDIÓW</span><h3>Typy plików rozpoznawane przez bibliotekę</h3><p>Rzeczywista możliwość odtwarzania zależy od kodeka użytego w pliku i wersji Chromium w tej aplikacji.</p><div className="format-list">{extensions.map(extension => <span key={extension}>{extension}</span>)}</div></article><article className="settings-card"><span className="eyebrow">PLAYLISTY</span><h3>Import / eksport M3U</h3><p>Playlisty są zapisywane lokalnie.</p><button className="outline-button" onClick={onImport}><FolderOpen size={15}/> IMPORTUJ M3U</button></article></div></section>
}
