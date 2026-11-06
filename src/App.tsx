import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderInput, Plus, Repeat, X } from 'lucide-react'
import type { PersistedState, Playlist, SystemStats, Track } from '../shared/types'
import { defaultState, getKind, makeTrack, MEDIA_EXTENSIONS } from '../shared/types'
import { formatTime, pathToFileUrl } from '../shared/format'
import { estimateBeatGrid } from './bpm'
import { BUILTIN_PRESETS, type EqPreset } from './presets'
import { integratedLoudness, loudnessToGainDb } from './loudness'
import { extractArtwork, artworkToDataUrl } from './art'
import { computeWavePeaks } from './waveform'
import { normalizeGainDb, pickAutoDjCandidates } from './autodj'
import { detectKey } from './key'
import Visualizer, { VISUALS, type VisualMode } from './Visualizer'
import { playbackClock, usePlaybackTime } from './clock'
import { fromM3U, playbackRateFor, secondsUntilNextBeat, seekAudioTo } from './playback'
import { crossfadeBarsLabel, filesLabel, tracksLabel, watchedFoldersLabel } from './labels'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { Dock } from './components/Dock'
import { LibraryPage } from './components/LibraryPage'
import { PlaylistsPage } from './components/PlaylistsPage'
import { QueuePanel } from './components/QueuePanel'
import { SettingsPage } from './components/SettingsPage'
import { StatsPage } from './components/StatsPage'
import Equalizer from './Equalizer'
import { PlaylistPickerDialog, TextDialog } from './components/Dialog'
import type { Page } from './nav'

const EMPTY_STATS: SystemStats = { cpuSystem: null, memoryUsed: null, memoryTotal: null, appCpu: null, appMemory: null, gpu: null, gpuName: null }
type AudioDeck = 0 | 1
const CROSSFADE_BAR_OPTIONS = [1, 2, 4, 8, 16] as const
interface CrossfadeTransition { outgoing: HTMLAudioElement; incoming: HTMLAudioElement; currentTrack: Track; nextTrack: Track; nextDeck: AudioDeck; bars: number; loopStart: number; loopEnd: number; frame: number | null; started: boolean; fading: boolean; loopRestarting: boolean }
interface TrackCueLoop { trackId: string; a: number; b: number; active: boolean }
const WAVE_CACHE_LIMIT = 24
const waveCache = new Map<string, number[]>()

function WaveStrip({ peaks, duration, loop, onSeek }: { peaks: number[] | null; duration: number; loop: TrackCueLoop | null; onSeek: (fraction: number) => void }) {
  const now = usePlaybackTime()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 600
    const height = canvas.clientHeight || 56
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)
    const playedFraction = duration > 0 ? Math.min(1, Math.max(0, now / duration)) : 0
    if (!peaks?.length) {
      context.fillStyle = 'rgba(235, 232, 229, 0.18)'
      for (let i = 0; i < 90; i++) context.fillRect(i * (width / 90) + 1, height / 2 - 1, Math.max(2, width / 90 - 2), 2)
      return
    }
    const count = peaks.length
    const bandWidth = width / count
    const limitA = loop && loop.active ? loop.a / duration : null
    const limitB = loop && loop.active ? loop.b / duration : null
    for (let index = 0; index < count; index++) {
      const fraction = index / count
      const insideLoop = limitA !== null && limitB !== null && fraction >= limitA && fraction <= limitB
      const played = fraction <= playedFraction
      context.fillStyle = played ? (insideLoop ? '#f76bd4' : '#f445c8') : (insideLoop ? 'rgba(244, 69, 200, 0.32)' : 'rgba(235, 232, 229, 0.22)')
      const barHeight = Math.max(2, peaks[index] * (height - 8))
      context.fillRect(Math.floor(index * bandWidth), Math.round((height - barHeight) / 2), Math.max(1, bandWidth - 1), barHeight)
    }
    if (limitA !== null && limitB !== null) {
      context.fillStyle = 'rgba(244, 69, 200, 0.9)'
      context.fillRect(limitA * width, 0, 1.5, height)
      context.fillRect(Math.min(limitB * width, width - 1.5), 0, 1.5, height)
    }
    context.fillStyle = '#f445c8'
    context.fillRect(playedFraction * width - 1, 0, 2, height)
  }, [peaks, now, duration, loop])
  return <canvas ref={canvasRef} className="wave-canvas" onClick={event => {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width > 0) onSeek((event.clientX - bounds.left) / bounds.width)
  }}/>
}

type Draft = { title: string; trackIds: string[] } | null
type PickerTarget = Track | null
type AnalyzeProgress = { current: number; total: number } | null

export default function App() {
  const [state, setState] = useState<PersistedState>(() => structuredClone(defaultState))
  const latestStateRef = useRef(state)
  latestStateRef.current = state
  const [ready, setReady] = useState(false)
  const [page, setPage] = useState<Page>('now')
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState<SystemStats>(EMPTY_STATS)
  const [visualMode, setVisualMode] = useState<VisualMode>('orb')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [subtitleUrl, setSubtitleUrl] = useState('')
  const [subtitleName, setSubtitleName] = useState('')
  const [playing, setPlaying] = useState(false)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [analyzing, setAnalyzing] = useState<AnalyzeProgress>(null)
  const [analyzingPlaylistId, setAnalyzingPlaylistId] = useState<string | null>(null)
  const [presetDialog, setPresetDialog] = useState(false)
  const [draft, setDraft] = useState<Draft>(null)
  const [pickerTrack, setPickerTrack] = useState<PickerTarget>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const secondAudioRef = useRef<HTMLAudioElement>(null)
  const [activeAudioDeck, setActiveAudioDeck] = useState<AudioDeck>(0)
  const activeAudioDeckRef = useRef<AudioDeck>(0)
  const playingRef = useRef(false)
  const transitionRef = useRef<CrossfadeTransition | null>(null)
  const promotedDeckRef = useRef<AudioDeck | null>(null)
  const restoreTimeRef = useRef(0)
  const analyzingRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const filtersRef = useRef<BiquadFilterNode[]>([])
  const sourcesRef = useRef<WeakSet<HTMLMediaElement>>(new WeakSet())
  const pendingPlayRef = useRef(false)
  const persistTimer = useRef<number | undefined>(undefined)
  const mediaGainRef = useRef(new Map<HTMLMediaElement, { node: GainNode; db: number }>())
  const recDestRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recChunksRef = useRef<Blob[]>([])
  const [recording, setRecording] = useState<{ startedAt: number } | null>(null)
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null)
  const sleepEndsAtRef = useRef<number | null>(null)
  const [dropping, setDropping] = useState(false)
  const dragDepthRef = useRef(0)
  const [artDataUrl, setArtDataUrl] = useState('')
  const [wavePeaks, setWavePeaks] = useState<number[] | null>(null)
  const cueLoopRef = useRef<TrackCueLoop | null>(null)
  const [loopState, setLoopState] = useState<TrackCueLoop | null>(null)
  const loggedPlayRef = useRef('')
  const decodeContextRef = useRef<AudioContext | null>(null)

  const current = useMemo(() => state.tracks.find(track => track.id === state.currentTrackId) ?? null, [state.currentTrackId, state.tracks])
  const isVideo = current?.kind === 'video'
  const activeAudioElement = activeAudioDeck === 0 ? audioRef.current : secondAudioRef.current
  const currentMedia = isVideo ? videoRef.current : activeAudioElement
  const getActiveAudioElement = useCallback(() => activeAudioDeckRef.current === 0 ? audioRef.current : secondAudioRef.current, [])
  const getInactiveAudioElement = useCallback(() => activeAudioDeckRef.current === 0 ? secondAudioRef.current : audioRef.current, [])
  const presetList = useMemo(() => [...BUILTIN_PRESETS, ...state.customPresets], [state.customPresets])
  const queueTracks = useMemo(() => state.queue.map(id => state.tracks.find(track => track.id === id)).filter((track): track is Track => Boolean(track)), [state.queue, state.tracks])
  const filteredTracks = useMemo(() => {
    const query = search.trim().toLowerCase()
    const tracks = page === 'favorites' ? state.tracks.filter(track => state.favorites.includes(track.id)) : state.tracks
    return tracks.filter(track => !query || `${track.title} ${track.artist} ${track.album} ${track.extension}`.toLowerCase().includes(query))
  }, [page, search, state.favorites, state.tracks])

  const duration = current?.duration
    ?? (isVideo ? videoRef.current?.duration : getActiveAudioElement()?.duration) ?? 0

  const update = useCallback((patch: Partial<PersistedState> | ((current: PersistedState) => Partial<PersistedState>)) => {
    setState(currentState => ({ ...currentState, ...(typeof patch === 'function' ? patch(currentState) : patch) }))
  }, [])
  const toggleAlwaysOnTop = useCallback(() => update(currentState => ({ alwaysOnTop: !currentState.alwaysOnTop })), [update])

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
    if (ready) window.mediaApp.setAlwaysOnTop(state.alwaysOnTop)
  }, [ready, state.alwaysOnTop])

  useEffect(() => {
    let active = true
    const id = window.setInterval(() => {
      if (document.hidden) return
      void window.mediaApp.readStats().then(next => { if (active) setStats(next) }).catch(() => { /* optional system sensor */ })
    }, 2200)
    const wake = () => { void window.mediaApp.readStats().then(next => { if (active) setStats(next) }).catch(() => undefined) }
    document.addEventListener('visibilitychange', wake)
    void window.mediaApp.readStats().then(next => { if (active) setStats(next) }).catch(() => undefined)
    return () => { active = false; window.clearInterval(id); document.removeEventListener('visibilitychange', wake) }
  }, [])

  useEffect(() => window.mediaApp.onFolderChanged(folder => {
    window.mediaApp.scanFolder(folder).then(found => update(currentState => {
      const rest = currentState.tracks.filter(track => !track.path.toLowerCase().startsWith(folder.toLowerCase()))
      return { tracks: [...rest, ...found] }
    }))
  }), [update])

  // Single playback clock: keeps the progress bar out of the main render tree.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const media = isVideo ? videoRef.current : activeAudioDeck === 0 ? audioRef.current : secondAudioRef.current
      const isPlaying = Boolean(media && !media.paused)
      if (isPlaying !== playingRef.current) { playingRef.current = isPlaying; setPlaying(isPlaying) }
      if (media && !media.paused) playbackClock.set(media.currentTime)
    }, 300)
    return () => window.clearInterval(timer)
  }, [isVideo, activeAudioDeck])

  useEffect(() => {
    if (!current) return
    const audio = activeAudioDeck === 0 ? audioRef.current : secondAudioRef.current
    const inactiveAudio = activeAudioDeck === 0 ? secondAudioRef.current : audioRef.current
    const video = videoRef.current
    const activeMedia = current.kind === 'video' ? video : audio
    const passiveMedia = current.kind === 'video' ? audio : video
    if (passiveMedia) { passiveMedia.pause(); passiveMedia.removeAttribute('src'); passiveMedia.load() }
    if (inactiveAudio) { inactiveAudio.pause(); inactiveAudio.removeAttribute('src'); inactiveAudio.load() }
    if (activeMedia) {
      activeMedia.volume = state.volume
      activeMedia.playbackRate = playbackRateFor(current.kind === 'audio' ? current : null, state.globalBpm)
      activeMedia.preservesPitch = true
      if (current.kind === 'audio' && promotedDeckRef.current === activeAudioDeck) promotedDeckRef.current = null
      else {
        restoreTimeRef.current = Math.max(0, state.currentTime)
        if (current.kind === 'audio') activeMedia.src = pathToFileUrl(current.path)
        activeMedia.load()
      }
    }
  }, [activeAudioDeck, current?.id])

  useEffect(() => {
    filtersRef.current.forEach((filter, index) => { filter.gain.setTargetAtTime(state.eqValues[index] ?? 0, contextRef.current?.currentTime ?? 0, 0.035) })
  }, [state.eqValues])

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const media = isVideo ? videoRef.current : activeAudioDeck === 0 ? audioRef.current : secondAudioRef.current
      if (event.code === 'Space') { event.preventDefault(); void togglePlayback() }
      if (event.code === 'ArrowRight' && media) media.currentTime = Math.min(media.duration || 0, media.currentTime + 5)
      if (event.code === 'ArrowLeft' && media) media.currentTime = Math.max(0, media.currentTime - 5)
      if (event.code === 'ArrowUp') update(currentState => ({ volume: Math.min(1, currentState.volume + 0.05) }))
      if (event.code === 'ArrowDown') update(currentState => ({ volume: Math.max(0, currentState.volume - 0.05) }))
      if (event.code === 'MediaTrackNext') skipNext()
      if (event.code === 'MediaTrackPrevious') skipPrevious()
      if (event.code === 'KeyK' && !event.ctrlKey && !event.metaKey && current && current.kind === 'audio') { event.preventDefault(); addCue() }
      if (event.code === 'KeyL' && !event.ctrlKey && !event.metaKey && current && current.kind === 'audio' && !event.repeat) { event.preventDefault(); toggleLoop() }
      if (event.ctrlKey && event.key.toLowerCase() === 'k') { event.preventDefault(); setPage('library'); window.setTimeout(() => searchRef.current?.focus(), 0) }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAudioDeck, current?.id, isVideo, state.queue, state.repeat, state.shuffle])

  useEffect(() => {
    const audioA = audioRef.current
    const audioB = secondAudioRef.current
    const transition = transitionRef.current
    if (transition?.fading) {
      const progress = Math.max(0, Math.min(1, (transition.incoming.currentTime - transition.loopStart) / (transition.loopEnd - transition.loopStart)))
      transition.outgoing.volume = state.volume * Math.cos(progress * Math.PI / 2)
      transition.incoming.volume = state.volume * Math.sin(progress * Math.PI / 2)
    } else if (transition) {
      transition.outgoing.volume = state.volume
      transition.incoming.volume = 0
    } else {
      const active = activeAudioDeck === 0 ? audioA : audioB
      const inactive = activeAudioDeck === 0 ? audioB : audioA
      if (active) active.volume = state.volume
      if (inactive) inactive.volume = 0
    }
    const video = videoRef.current
    if (video) video.volume = state.volume
  }, [activeAudioDeck, current?.id, state.volume])

  useEffect(() => {
    const media = isVideo ? videoRef.current : getActiveAudioElement()
    if (media) { media.playbackRate = playbackRateFor(current, state.globalBpm); media.preservesPitch = true }
    const transition = transitionRef.current
    if (transition) {
      transition.outgoing.playbackRate = playbackRateFor(transition.currentTrack, state.globalBpm)
      transition.incoming.playbackRate = playbackRateFor(transition.nextTrack, state.globalBpm)
      transition.incoming.preservesPitch = true
    }
  }, [activeAudioDeck, current?.bpm, current?.id, getActiveAudioElement, isVideo, state.globalBpm])

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

  const ensureAudioGraph = useCallback((media: HTMLMediaElement | null = getActiveAudioElement(), track: Track | null = null) => {
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!contextRef.current && AudioContextClass) {
      const context = new AudioContextClass()
      const analyserNode = context.createAnalyser()
      analyserNode.fftSize = 512
      analyserNode.smoothingTimeConstant = 0.82
      const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
      const filters = frequencies.map((frequency, index) => {
        const filter = context.createBiquadFilter()
        filter.type = index === 0 ? 'lowshelf' : index === frequencies.length - 1 ? 'highshelf' : 'peaking'
        filter.frequency.value = frequency
        if (filter.type === 'peaking') filter.Q.value = 1.05
        return filter
      })
      filters.forEach((filter, index) => filter.connect(filters[index + 1] ?? analyserNode))
      analyserNode.connect(context.destination)
      const recDestination = context.createMediaStreamDestination()
      analyserNode.connect(recDestination)
      recDestRef.current = recDestination
      contextRef.current = context
      analyserRef.current = analyserNode
      filtersRef.current = filters
      filters.forEach((filter, index) => { filter.gain.value = state.eqValues[index] ?? 0 })
      setAnalyser(analyserNode)
    }
    const context = contextRef.current
    if (context?.state === 'suspended') void context.resume()
    if (media && context && !sourcesRef.current.has(media)) {
      try {
        const source = context.createMediaElementSource(media)
        const gainNode = context.createGain()
        const db = latestStateRef.current.normalize ? normalizeGainDb(track) : 0
        gainNode.gain.value = Math.pow(10, db / 20)
        source.connect(gainNode)
        gainNode.connect(filtersRef.current[0])
        mediaGainRef.current.set(media, { node: gainNode, db })
        sourcesRef.current.add(media)
      } catch { /* source can only be attached once per media element */ }
    }
  }, [getActiveAudioElement, state.eqValues])

  useEffect(() => {
    mediaGainRef.current.forEach(entry => {
      const target = latestStateRef.current.normalize ? Math.pow(10, entry.db / 20) : 1
      const context = contextRef.current
      if (context) entry.node.gain.setTargetAtTime(target, context.currentTime, 0.05)
    })
  }, [state.normalize])

  const cancelCrossfade = useCallback(() => {
    const transition = transitionRef.current
    if (!transition) return
    if (transition.frame !== null) cancelAnimationFrame(transition.frame)
    transition.outgoing.volume = latestStateRef.current.volume
    transition.incoming.pause()
    transition.incoming.volume = 0
    transition.incoming.removeAttribute('src')
    transition.incoming.load()
    transitionRef.current = null
  }, [state.volume])

  useEffect(() => {
    if (!state.crossfadeEnabled && transitionRef.current) cancelCrossfade()
  }, [cancelCrossfade, state.crossfadeEnabled])

  const finishCrossfade = useCallback((transition: CrossfadeTransition) => {
    if (transitionRef.current !== transition) return
    if (transition.frame !== null) cancelAnimationFrame(transition.frame)
    transition.outgoing.pause()
    transition.outgoing.volume = 0
    transition.incoming.volume = latestStateRef.current.volume
    transitionRef.current = null
    promotedDeckRef.current = transition.nextDeck
    activeAudioDeckRef.current = transition.nextDeck
    setActiveAudioDeck(transition.nextDeck)
    playbackClock.set(transition.incoming.currentTime)
    update(currentState => ({
      currentTrackId: transition.nextTrack.id,
      currentTime: transition.incoming.currentTime,
      tracks: currentState.tracks.map(track => track.id === transition.nextTrack.id && Number.isFinite(transition.incoming.duration) ? { ...track, duration: transition.incoming.duration } : track)
    }))
  }, [state.volume, update])

  const startCrossfadeFade = useCallback((transition: CrossfadeTransition) => {
    if (transitionRef.current !== transition || transition.fading) return
    transition.fading = true
    const tick = () => {
      if (transitionRef.current !== transition) return
      const loopLength = Math.max(0.01, transition.loopEnd - transition.loopStart)
      const progress = Math.max(0, Math.min(1, (transition.incoming.currentTime - transition.loopStart) / loopLength))
      transition.outgoing.volume = latestStateRef.current.volume * Math.cos(progress * Math.PI / 2)
      transition.incoming.volume = latestStateRef.current.volume * Math.sin(progress * Math.PI / 2)
      if (progress >= 1) finishCrossfade(transition)
      else transition.frame = requestAnimationFrame(tick)
    }
    transition.frame = requestAnimationFrame(tick)
  }, [finishCrossfade])

  const startTransitionPlayback = useCallback(async (transition: CrossfadeTransition) => {
    if (transitionRef.current !== transition || transition.started || transition.incoming.readyState < 2) return
    transition.started = true
    const globalBpm = latestStateRef.current.globalBpm
    transition.outgoing.playbackRate = playbackRateFor(transition.currentTrack, globalBpm)
    transition.incoming.playbackRate = playbackRateFor(transition.nextTrack, globalBpm)
    transition.outgoing.preservesPitch = true
    transition.incoming.preservesPitch = true
    await seekAudioTo(transition.incoming, transition.loopStart)
    if (transitionRef.current !== transition) return
    const canSyncBeat = transition.currentTrack.bpm && transition.currentTrack.beatOffset !== undefined
      && transition.nextTrack.bpm && transition.nextTrack.beatOffset !== undefined
    if (canSyncBeat) {
      const delay = secondsUntilNextBeat(transition.outgoing, transition.currentTrack.bpm!, transition.currentTrack.beatOffset!)
      if (delay > 0.015) await new Promise(resolve => window.setTimeout(resolve, delay * 1000))
    }
    if (transitionRef.current !== transition) return
    ensureAudioGraph(transition.incoming, transition.nextTrack)
    try { await transition.incoming.play() }
    catch {
      if (transitionRef.current === transition) {
        cancelCrossfade()
        setError('Nie udało się rozpocząć miksowania następnego utworu.')
      }
      return
    }
    if (transitionRef.current !== transition) return
    transition.started = true
    transition.incoming.volume = 0
    const loopWallSeconds = (transition.loopEnd - transition.loopStart) / Math.max(0.01, transition.incoming.playbackRate)
    const remainingWallSeconds = Math.max(0, transition.outgoing.duration - transition.outgoing.currentTime) / Math.max(0.01, transition.outgoing.playbackRate)
    if (remainingWallSeconds <= loopWallSeconds * 2) startCrossfadeFade(transition)
  }, [cancelCrossfade, ensureAudioGraph, startCrossfadeFade, state.volume])

  const beginCrossfade = useCallback((nextTrack: Track, bars: number) => {
    const outgoing = getActiveAudioElement()
    const incoming = getInactiveAudioElement()
    if (!outgoing || !incoming || !current || nextTrack.kind !== 'audio') return
    cancelCrossfade()
    incoming.pause()
    incoming.volume = 0
    incoming.playbackRate = playbackRateFor(nextTrack, state.globalBpm)
    incoming.preservesPitch = true
    incoming.currentTime = 0
    incoming.src = pathToFileUrl(nextTrack.path)
    incoming.load()
    const nextDeck: AudioDeck = activeAudioDeckRef.current === 0 ? 1 : 0
    const loopStart = Math.max(0, nextTrack.beatStart ?? nextTrack.beatOffset ?? 0)
    const loopBpm = nextTrack.bpm ?? state.globalBpm
    const loopEnd = loopStart + bars * 240 / loopBpm
    const transition: CrossfadeTransition = { outgoing, incoming, currentTrack: current, nextTrack, nextDeck, bars, loopStart, loopEnd, frame: null, started: false, fading: false, loopRestarting: false }
    transitionRef.current = transition
    ensureAudioGraph(incoming, nextTrack)
    if (incoming.readyState >= 2) void startTransitionPlayback(transition)
  }, [cancelCrossfade, current, ensureAudioGraph, getActiveAudioElement, getInactiveAudioElement, startTransitionPlayback, state.globalBpm])

  const selectTrack = useCallback((track: Track, autoplay = false) => {
    cancelCrossfade()
    loggedPlayRef.current = ''
    if (track.kind === 'audio') {
      const media = getActiveAudioElement()
      if (media) {
        media.playbackRate = playbackRateFor(track, latestStateRef.current.globalBpm)
        media.preservesPitch = true
        media.loop = false
      }
    }
    update(currentState => ({
      tracks: currentState.tracks.some(item => item.id === track.id) ? currentState.tracks : [...currentState.tracks, track],
      queue: currentState.queue.includes(track.id) ? currentState.queue : [...currentState.queue, track.id],
      currentTrackId: track.id, currentTime: 0
    }))
    pendingPlayRef.current = autoplay
    playbackClock.reset()
  }, [cancelCrossfade, getActiveAudioElement, update])

  const togglePlayback = useCallback(async () => {
    const media = isVideo ? videoRef.current : getActiveAudioElement()
    if (!media || !current) return
    setError('')
    if (media.paused) {
      ensureAudioGraph(media, current)
      if (media.readyState < 2) { pendingPlayRef.current = true; media.load(); return }
      pendingPlayRef.current = false
      try { await media.play() } catch { setError('Ten plik nie jest obsługiwany przez aktualny silnik Chromium.') }
    } else {
      if (transitionRef.current) cancelCrossfade()
      media.pause()
    }
  }, [cancelCrossfade, current, ensureAudioGraph, getActiveAudioElement, isVideo])

  const getNextQueuedTrack = useCallback(() => {
    if (state.queue.length < 2 || state.repeat === 'one') return null
    const currentIndex = Math.max(0, state.queue.indexOf(state.currentTrackId ?? ''))
    let nextIndex = currentIndex + 1
    if (state.shuffle) {
      do { nextIndex = Math.floor(Math.random() * state.queue.length) } while (nextIndex === currentIndex)
    } else if (nextIndex >= state.queue.length) {
      if (state.repeat !== 'all') return null
      nextIndex = 0
    }
    return state.tracks.find(track => track.id === state.queue[nextIndex]) ?? null
  }, [state.currentTrackId, state.queue, state.repeat, state.shuffle, state.tracks])

  const maybeBeginCrossfade = useCallback((media: HTMLAudioElement) => {
    if (!state.crossfadeEnabled || !current || current.kind !== 'audio' || transitionRef.current || !Number.isFinite(media.duration)) return
    const nextTrack = getNextQueuedTrack()
    if (!nextTrack || nextTrack.kind !== 'audio') return
    const globalBpm = state.globalBpm
    const nextStart = Math.max(0, nextTrack.beatStart ?? nextTrack.beatOffset ?? 0)
    const nextRate = playbackRateFor(nextTrack, globalBpm)
    const options = CROSSFADE_BAR_OPTIONS.filter(bars => bars <= state.crossfadeBars).reverse()
    const fit = options.find(bars => {
      const barSeconds = bars * 240 / globalBpm
      const currentFits = barSeconds * 2 + 60 / globalBpm <= media.duration / Math.max(0.01, media.playbackRate)
      const nextFits = nextTrack.duration === undefined || barSeconds <= (nextTrack.duration - nextStart) / Math.max(0.01, nextRate)
      return currentFits && nextFits
    }) ?? 1
    const barSeconds = fit * 240 / globalBpm
    const leadSeconds = barSeconds * 2 + 60 / globalBpm
    const remainingSeconds = (media.duration - media.currentTime) / Math.max(0.01, media.playbackRate)
    if (remainingSeconds > leadSeconds) return
    beginCrossfade(nextTrack, fit)
  }, [beginCrossfade, current, getNextQueuedTrack, state.crossfadeBars, state.crossfadeEnabled, state.globalBpm])

  const playNextId = useCallback((direction: 1 | -1) => {
    if (!state.queue.length) return
    if (state.repeat === 'one' && direction === 1) {
      const media = isVideo ? videoRef.current : getActiveAudioElement()
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
  }, [getActiveAudioElement, isVideo, selectTrack, state.currentTrackId, state.queue, state.repeat, state.shuffle, state.tracks, togglePlayback])

  const skipNext = useCallback(() => playNextId(1), [playNextId])
  const skipPrevious = useCallback(() => {
    const media = isVideo ? videoRef.current : getActiveAudioElement()
    if (media && media.currentTime > 3) { media.currentTime = 0; return }
    playNextId(-1)
  }, [getActiveAudioElement, isVideo, playNextId])

  const onCanPlay = (media?: HTMLAudioElement) => {
    const transition = transitionRef.current
    if (media && transition?.incoming === media) { void startTransitionPlayback(transition); return }
    const activeMedia = isVideo ? videoRef.current : getActiveAudioElement()
    if (media && media !== activeMedia) return
    if (!isVideo && current && activeMedia) {
      activeMedia.playbackRate = playbackRateFor(current, latestStateRef.current.globalBpm)
      activeMedia.preservesPitch = true
    }
    if (pendingPlayRef.current) { pendingPlayRef.current = false; ensureAudioGraph(activeMedia, current); void activeMedia?.play().catch(() => setError('Nie udało się odtworzyć pliku. Sprawdź obsługiwany format.')) }
  }

  const handleAudioLoadedMetadata = (media: HTMLAudioElement) => {
    const transition = transitionRef.current
    const duration = media.duration
    if (!Number.isFinite(duration)) return
    if (transition?.incoming === media) {
      const loopBpm = transition.nextTrack.bpm ?? latestStateRef.current.globalBpm
      transition.loopStart = Math.min(transition.loopStart, Math.max(0, duration - 0.1))
      const maxBars = CROSSFADE_BAR_OPTIONS.filter(bars => bars <= transition.bars).reverse()
        .find(bars => bars * 240 / loopBpm <= duration - transition.loopStart)
      if (maxBars) {
        transition.bars = maxBars
        transition.loopEnd = transition.loopStart + maxBars * 240 / loopBpm
      } else transition.loopEnd = Math.max(transition.loopStart + 0.05, duration - 0.01)
      update(currentState => ({ tracks: currentState.tracks.map(track => track.id === transition.nextTrack.id ? { ...track, duration } : track) }))
      return
    }
    if (media !== getActiveAudioElement() || !current || current.kind !== 'audio') return
    if (restoreTimeRef.current > 0 && restoreTimeRef.current < duration) media.currentTime = restoreTimeRef.current
    restoreTimeRef.current = 0
    update(currentState => ({ tracks: currentState.tracks.map(track => track.id === current.id ? { ...track, duration } : track) }))
  }

  const handleAudioTimeUpdate = (media: HTMLAudioElement) => {
    const transition = transitionRef.current
    if (transition?.incoming === media) {
      if (transition.fading && media.currentTime >= transition.loopEnd) finishCrossfade(transition)
      else if (transition.started && !transition.fading && !transition.loopRestarting && media.currentTime >= transition.loopEnd) {
        transition.loopRestarting = true
        media.pause()
        void seekAudioTo(media, transition.loopStart).then(async () => {
          if (transitionRef.current !== transition) return
          if (transition.currentTrack.bpm && transition.currentTrack.beatOffset !== undefined) {
            const delay = secondsUntilNextBeat(transition.outgoing, transition.currentTrack.bpm, transition.currentTrack.beatOffset)
            if (delay > 0.015) await new Promise(resolve => window.setTimeout(resolve, delay * 1000))
          }
          if (transitionRef.current !== transition) return
          try {
            await media.play()
            if (transitionRef.current === transition) startCrossfadeFade(transition)
          } catch {
            if (transitionRef.current === transition) {
              cancelCrossfade()
              setError('Nie udało się wznowić pętli następnego utworu.')
            }
          }
        })
      }
      return
    }
    if (media !== getActiveAudioElement()) return
    playbackClock.set(media.currentTime)
    if (current && media.currentTime > 4) logPlayback(current.id)
    if (Math.floor(media.currentTime) % 5 === 0) {
      update({ currentTime: media.currentTime })
      maybeReplenishQueue()
      maybeBeginCrossfade(media)
    }
  }

  const handleAudioError = (media: HTMLAudioElement) => {
    if (transitionRef.current?.incoming === media) {
      cancelCrossfade()
      setError('Nie można odtworzyć następnego pliku. Crossfade został anulowany.')
    } else if (current && !isVideo && media === getActiveAudioElement()) {
      setError('Nie można odtworzyć tego pliku. Format lub kodek może nie być obsługiwany.')
    }
  }

  const handleEnded = () => {
    loggedPlayRef.current = ''
    if (transitionRef.current) finishCrossfade(transitionRef.current)
    else playNextId(1)
  }

  const seekTo = useCallback((time: number) => {
    const media = isVideo ? videoRef.current : getActiveAudioElement()
    if (!media?.duration) return
    if (transitionRef.current) cancelCrossfade()
    media.currentTime = time
    update({ currentTime: media.currentTime })
    playbackClock.set(time)
  }, [cancelCrossfade, getActiveAudioElement, isVideo, update])

  const logPlayback = useCallback((trackId: string) => {
    if (loggedPlayRef.current === trackId) return
    loggedPlayRef.current = trackId
    update(currentState => ({
      playCounts: { ...currentState.playCounts, [trackId]: (currentState.playCounts[trackId] ?? 0) + 1 },
      history: [...currentState.history, { trackId, at: Date.now() }].slice(-300)
    }))
  }, [update])

  const maybeReplenishQueue = useCallback(() => {
    const currentState = latestStateRef.current
    if (!currentState.autoDj) return
    const currentIndex = Math.max(0, currentState.queue.indexOf(currentState.currentTrackId ?? ''))
    if (currentState.queue.length - currentIndex > 2) return
    const currentTrack = currentState.tracks.find(track => track.id === currentState.currentTrackId) ?? null
    const pool = currentState.tracks.filter(track => track.kind === 'audio' && !currentState.queue.includes(track.id))
    if (!pool.length) return
    const picked = pickAutoDjCandidates(pool, currentTrack, currentState.playCounts, 3)
    if (!picked.length) return
    update(state => ({ queue: [...state.queue, ...picked.map(track => track.id)] }))
    setNotice(`Auto DJ dodał ${tracksLabel(picked.length)} do kolejki`)
    window.setTimeout(() => setNotice(''), 2600)
  }, [update])

  const snapToBeat = useCallback((time: number, track: Track | null, floor = false) => {
    if (!track || !track.bpm || track.beatOffset === undefined) return Number(time.toFixed(3))
    const period = 60 / track.bpm
    const beats = floor ? Math.floor((time - track.beatOffset) / period + 1e-6) : Math.round((time - track.beatOffset) / period)
    return Math.max(0, track.beatOffset + Math.max(0, beats) * period)
  }, [])

  const addCue = useCallback(() => {
    const currentState = latestStateRef.current
    const track = currentState.tracks.find(item => item.id === currentState.currentTrackId)
    const media = getActiveAudioElement()
    if (!track) return
    const live = media?.currentTime ?? 0
    const time = Math.max(0, Math.min(live, media?.duration && Number.isFinite(media.duration) ? media.duration : live))
    const snapped = (track.cues ?? []).some(cue => Math.abs(cue.time - time) < 0.35) ? time : snapToBeat(time, track)
    update(state => ({ tracks: state.tracks.map(item => item.id !== track.id ? item : { ...item, cues: [...(item.cues ?? []), { time: snapped }].slice(-12) }) }))
    setNotice(`Cue zapisany w ${formatTime(snapped)}`)
    window.setTimeout(() => setNotice(''), 2000)
  }, [getActiveAudioElement, snapToBeat, update])

  const removeCue = useCallback((trackId: string, index: number) => {
    update(state => ({ tracks: state.tracks.map(track => track.id !== trackId ? track : { ...track, cues: track.cues?.filter((_, position) => position !== index) }) }))
  }, [update])

  const toggleLoop = useCallback(() => {
    const currentState = latestStateRef.current
    const track = currentState.tracks.find(item => item.id === currentState.currentTrackId)
    const media = getActiveAudioElement()
    const loop = cueLoopRef.current
    if (track && media && loop && loop.trackId === track.id) {
      if (!loop.active) {
        const period = Math.max(0.2, track.bpm ? 60 / track.bpm : currentState.globalBpm / 120)
        loop.b = Math.max(loop.a + period, snapToBeat(media.currentTime, track, true))
        loop.active = true
      } else {
        cueLoopRef.current = null
      }
    } else if (track && media && Number.isFinite(media.currentTime)) {
      cueLoopRef.current = { trackId: track.id, a: snapToBeat(media.currentTime, track, true), b: 0, active: false }
    }
    setLoopState(cueLoopRef.current ? { ...cueLoopRef.current } : null)
  }, [getActiveAudioElement, snapToBeat])

  useEffect(() => {
    if (!loopState?.active) return
    let frame: number | null = null
    const wrapLoop = () => {
      const loop = cueLoopRef.current
      const media = getActiveAudioElement()
      if (media && loop && loop.active && !transitionRef.current && !media.seeking && media.currentTime >= loop.b) {
        try {
          media.currentTime = loop.a
          playbackClock.set(loop.a)
        } catch {
          cueLoopRef.current = null
          setLoopState(null)
          return
        }
      }
      frame = cueLoopRef.current?.active ? requestAnimationFrame(wrapLoop) : null
    }
    frame = requestAnimationFrame(wrapLoop)
    return () => { if (frame !== null) cancelAnimationFrame(frame) }
  }, [loopState?.active, getActiveAudioElement])

  useEffect(() => {
    cueLoopRef.current = null
    setLoopState(null)
    if (audioRef.current) audioRef.current.loop = false
    if (secondAudioRef.current) secondAudioRef.current.loop = false
  }, [current?.id])

  const toggleRecording = useCallback(async () => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
      recorderRef.current = null
      setRecording(null)
      return
    }
    ensureAudioGraph(getActiveAudioElement(), latestStateRef.current.tracks.find(item => item.id === latestStateRef.current.currentTrackId) ?? null)
    const context = contextRef.current
    const destination = recDestRef.current
    if (!context || !destination) { setError('Nagrywanie wymaga dostępnej biblioteki Web Audio.'); return }
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type))
    if (!mimeType) { setError('Ta wersja Chromium nie obsługuje nagrywania WebM.'); return }
    if (context.state === 'suspended') void context.resume()
    const next = new MediaRecorder(destination.stream, { mimeType, audioBitsPerSecond: 256000 })
    recChunksRef.current = []
    next.ondataavailable = event => { if (event.data.size) recChunksRef.current.push(event.data) }
    next.onstop = async () => {
      const chunks = recChunksRef.current
      recChunksRef.current = []
      const blob = new Blob(chunks, { type: next.mimeType })
      if (!blob.size) { setNotice('Nagranie było puste'); window.setTimeout(() => setNotice(''), 2200); return }
      try {
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-')
        const saved = await window.mediaApp.saveRecording(bytes, `DrPuz miks ${stamp}`)
        setNotice(saved ? 'Miks zapisany na dysku' : 'Nagranie anulowane')
      } catch { setError('Nie udało się zapisać nagrania.') }
      window.setTimeout(() => setNotice(''), 3000)
    }
    next.start(1000)
    recorderRef.current = next
    setRecording({ startedAt: Date.now() })
  }, [ensureAudioGraph, getActiveAudioElement])

  const setSleepTimer = useCallback((minutes: number) => {
    if (!minutes || minutes <= 0) {
      sleepEndsAtRef.current = null
      setSleepRemaining(null)
      const volume = latestStateRef.current.volume
      if (audioRef.current) audioRef.current.volume = volume
      if (secondAudioRef.current) secondAudioRef.current.volume = volume
      if (videoRef.current) videoRef.current.volume = volume
      setNotice('Timer snu wyłączony')
      window.setTimeout(() => setNotice(''), 1800)
      return
    }
    sleepEndsAtRef.current = Date.now() + minutes * 60000
    setSleepRemaining(minutes * 60)
    setNotice(`Timer snu: ${minutes} minut`)
    window.setTimeout(() => setNotice(''), 2200)
  }, [])

  useEffect(() => {
    if (sleepEndsAtRef.current === null) return undefined
    const tick = () => {
      const endsAt = sleepEndsAtRef.current
      if (endsAt === null) return
      const remaining = (endsAt - Date.now()) / 1000
      if (remaining <= 0) {
        if (transitionRef.current) cancelCrossfade()
        audioRef.current?.pause()
        secondAudioRef.current?.pause()
        videoRef.current?.pause()
        const volume = latestStateRef.current.volume
        if (audioRef.current) audioRef.current.volume = volume
        if (secondAudioRef.current) secondAudioRef.current.volume = volume
        if (videoRef.current) videoRef.current.volume = volume
        sleepEndsAtRef.current = null
        setSleepRemaining(null)
        return
      }
      setSleepRemaining(remaining)
      if (remaining < 10) {
        const volume = latestStateRef.current.volume * Math.max(0, remaining / 10)
        if (audioRef.current) audioRef.current.volume = volume
        if (secondAudioRef.current) secondAudioRef.current.volume = volume
        if (videoRef.current) videoRef.current.volume = volume
      }
    }
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [sleepRemaining !== null, cancelCrossfade])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const mediaSession = navigator.mediaSession
    mediaSession.metadata = current ? new MediaMetadata({
      title: current.title,
      artist: current.artist,
      album: current.album || 'Dr.Puz Audio Lab',
      artwork: artDataUrl && current.kind === 'audio' ? [{ src: artDataUrl, sizes: '512x512', type: artDataUrl.slice(5, artDataUrl.indexOf(';')) }] : []
    }) : null
    mediaSession.playbackState = playing ? 'playing' : 'paused'
    mediaSession.setActionHandler('play', () => void togglePlayback())
    mediaSession.setActionHandler('pause', () => void togglePlayback())
    mediaSession.setActionHandler('previoustrack', skipPrevious)
    mediaSession.setActionHandler('nexttrack', skipNext)
    mediaSession.setActionHandler('seekbackward', () => seekTo(Math.max(0, playbackClock.get() - 10)))
    mediaSession.setActionHandler('seekforward', () => seekTo(playbackClock.get() + 10))
    mediaSession.setActionHandler('seekto', details => { if (details.seekTime !== undefined) seekTo(details.seekTime) })
  }, [current, playing, artDataUrl, seekTo, skipNext, skipPrevious, togglePlayback])

  const handleDropFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return
    const filePaths: string[] = []
    const folders: string[] = []
    for (const file of Array.from(files)) {
      let path = ''
      try { path = window.mediaApp.pathForFile(file) } catch { path = '' }
      if (!path) continue
      const lastSegment = path.split(/[\\/]/).pop() ?? ''
      const extension = lastSegment.split('.').pop()?.toLowerCase() ?? ''
      if (MEDIA_EXTENSIONS.includes(extension)) filePaths.push(path)
      else if (!lastSegment.includes('.')) folders.push(path)
    }
    if (!filePaths.length && !folders.length) {
      setNotice('Przeciągnięte elementy nie mają ścieżki — dodaj pliki z Eksploratora')
      window.setTimeout(() => setNotice(''), 2800)
      return
    }
    try {
      const scanned = folders.length ? (await Promise.all(folders.map(folder => window.mediaApp.scanFolder(folder)))).flat() : []
      if (folders.length) {
        update(state => ({ folders: [...state.folders, ...folders.filter(folder => !state.folders.includes(folder))] }))
        await window.mediaApp.watchFolders(folders)
      }
      addTracks([...scanned, ...filePaths.map(path => makeTrack(path))])
    } catch { setError('Nie udało się dodać przeciągniętych plików.') }
  }, [addTracks, update])

  useEffect(() => {
    if (!ready) return
    setArtDataUrl('')
    setWavePeaks(null)
    if (!current || current.kind !== 'audio') return
    const trackId = current.id
    let cancelled = false
    void (async () => {
      try {
        const bytes = await window.mediaApp.readAudioFile(current.path)
        if (cancelled || latestStateRef.current.currentTrackId !== trackId) return
        const artwork = extractArtwork(bytes)
        if (artwork && !cancelled) setArtDataUrl(artworkToDataUrl(artwork))
        if (cancelled || bytes.byteLength > 80 * 1024 * 1024) { waveCache.delete(trackId); return }
        const cached = waveCache.get(trackId)
        if (cached) { setWavePeaks(cached); return }
        if (!decodeContextRef.current) {
          const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          if (!AudioContextClass) return
          decodeContextRef.current = new AudioContextClass({ sampleRate: 44100 })
        }
        const decoded = await decodeContextRef.current.decodeAudioData(bytes.slice().buffer as ArrayBuffer)
        if (cancelled) return
        const peaks = computeWavePeaks(decoded)
        waveCache.set(trackId, peaks)
        if (waveCache.size > WAVE_CACHE_LIMIT) {
          const oldest = waveCache.keys().next()
          if (!oldest.done && oldest.value !== trackId) waveCache.delete(oldest.value)
        }
        setWavePeaks(peaks)
      } catch { /* decorations stay empty for unsupported files */ }
    })()
    return () => { cancelled = true }
  }, [current?.id, current?.kind, ready])

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

  const analyzePlaylistBpm = async (playlist: Playlist) => {
    if (analyzingRef.current) return
    const tracks = playlist.trackIds.map(id => state.tracks.find(track => track.id === id)).filter((track): track is Track => Boolean(track && track.kind === 'audio'))
    if (!tracks.length) { setNotice('Ta playlista nie zawiera utworów audio'); window.setTimeout(() => setNotice(''), 2500); return }
    analyzingRef.current = true
    setAnalyzingPlaylistId(playlist.id)
    setAnalyzing({ current: 0, total: tracks.length })
    let detected = 0
    let keyed = 0
    let normalized = 0
    let failed = 0
    try {
      for (let index = 0; index < tracks.length; index++) {
        const track = tracks[index]
        setAnalyzing({ current: index + 1, total: tracks.length })
        try {
          const bytes = await window.mediaApp.readAudioFile(track.path)
          const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          if (!AudioContextClass) throw new Error('Web Audio niedostępne')
          const context = new AudioContextClass()
          try {
            const audio = await context.decodeAudioData(bytes.slice().buffer)
            const beatGrid = estimateBeatGrid(audio)
            const keyResult = detectKey(audio)
            const right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : audio.getChannelData(0)
            const loudness = integratedLoudness([audio.getChannelData(0), right], audio.sampleRate)
            const gainDb = loudnessToGainDb(loudness)
            if (beatGrid) detected++
            if (keyResult) keyed++
            if (gainDb !== null) normalized++
            if (!beatGrid && !keyResult && gainDb === null) { failed++; continue }
            update(currentState => ({ tracks: currentState.tracks.map(item => {
              if (item.id !== track.id) return item
              const multiplier = item.bpmAdjustment === 'double' ? 2 : item.bpmAdjustment === 'half' ? 0.5 : 1
              return {
                ...item,
                bpmOriginal: beatGrid ? beatGrid.bpm : item.bpmOriginal,
                bpm: beatGrid ? Math.round(beatGrid.bpm * multiplier * 100) / 100 : item.bpm,
                beatOffset: beatGrid ? beatGrid.beatOffset : item.beatOffset,
                beatStart: beatGrid ? beatGrid.beatStart : item.beatStart,
                key: keyResult ? keyResult.camelot : item.key,
                keyName: keyResult ? keyResult.key : item.keyName,
                loudness: loudness ?? item.loudness,
                gainDb: gainDb ?? item.gainDb
              }
            }) }))
          } finally { await context.close() }
        } catch { failed++ }
      }
      setNotice(`Analiza: BPM ${detected}/${tracks.length} · tonacja ${keyed} · głośność ${normalized}${failed ? ` · bez wyniku: ${failed}` : ''}`)
    } finally {
      analyzingRef.current = false
      setAnalyzingPlaylistId(null)
      setAnalyzing(null)
      window.setTimeout(() => setNotice(''), 4500)
    }
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

  const confirmDraft = (name: string) => {
    if (!draft) return
    update(currentState => ({ playlists: [...currentState.playlists, { id: crypto.randomUUID(), name, trackIds: draft.trackIds, updatedAt: Date.now() }] }))
    setDraft(null)
    setPage('playlists')
  }

  const saveTrackToPlaylist = (track: Track, playlist: Playlist) => {
    update(currentState => ({ playlists: currentState.playlists.map(item => item.id === playlist.id ? { ...item, trackIds: item.trackIds.includes(track.id) ? item.trackIds : [...item.trackIds, track.id], updatedAt: Date.now() } : item) }))
    setPickerTrack(null)
    setNotice(`Dodano do „${playlist.name}”`)
    window.setTimeout(() => setNotice(''), 2500)
  }

  const createPlaylistForTrack = (track: Track, name: string) => {
    const playlist: Playlist = { id: crypto.randomUUID(), name, trackIds: [track.id], updatedAt: Date.now() }
    update(currentState => ({ playlists: [...currentState.playlists, playlist] }))
    setPickerTrack(null)
    setNotice(`Dodano do „${name}”`)
    window.setTimeout(() => setNotice(''), 2500)
  }

  const saveCustomPreset = (name: string) => {
    const preset: EqPreset = { name, values: [...state.eqValues] }
    update(currentState => ({ customPresets: [...currentState.customPresets.filter(item => item.name !== preset.name), preset], eqPreset: preset.name }))
    setPresetDialog(false)
  }

  const toggleFavorite = (track: Track) => update(currentState => ({ favorites: currentState.favorites.includes(track.id) ? currentState.favorites.filter(id => id !== track.id) : [...currentState.favorites, track.id] }))
  const toggleQueue = (track: Track) => update(currentState => ({ queue: currentState.queue.includes(track.id) ? currentState.queue.filter(id => id !== track.id) : [...currentState.queue, track.id] }))
  const adjustTrackBpm = (trackId: string, adjustment: 'double' | 'half') => update(currentState => ({
    tracks: currentState.tracks.map(track => {
      if (track.id !== trackId || !track.bpm) return track
      const original = track.bpmOriginal ?? track.bpm
      const nextAdjustment = track.bpmAdjustment === adjustment ? undefined : adjustment
      const multiplier = nextAdjustment === 'double' ? 2 : nextAdjustment === 'half' ? 0.5 : 1
      return { ...track, bpmOriginal: original, bpmAdjustment: nextAdjustment, bpm: Math.round(original * multiplier * 100) / 100 }
    })
  }))
  const setPreset = (name: string) => {
    const preset = presetList.find(item => item.name === name) ?? BUILTIN_PRESETS[0]
    update({ eqPreset: name, eqValues: [...preset.values] })
  }
  const currentVisual = VISUALS.find(item => item.id === visualMode) ?? VISUALS[0]
  const cover = current ? current.title.slice(0, 2).toUpperCase() : '—'
  const muted = state.volume === 0
  const addFiles = () => void window.mediaApp.openMedia().then(tracks => addTracks(tracks))
  const playPlaylist = (playlist: Playlist) => {
    const track = state.tracks.find(item => item.id === playlist.trackIds[0])
    if (track) { update({ queue: [...playlist.trackIds] }); selectTrack(track, true) }
  }

  return <div className="app-shell"
    onDragEnter={event => { if (!event.dataTransfer?.types.includes('Files')) return; event.preventDefault(); dragDepthRef.current += 1; setDropping(true) }}
    onDragOver={event => { if (!event.dataTransfer?.types.includes('Files')) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
    onDragLeave={() => { dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (!dragDepthRef.current) setDropping(false) }}
    onDrop={event => { event.preventDefault(); dragDepthRef.current = 0; setDropping(false); void handleDropFiles(event.dataTransfer.files) }}
  >
    <Topbar version={window.mediaApp.version()} playing={playing} muted={muted} analyser={analyser} alwaysOnTop={state.alwaysOnTop}
      onHome={() => setPage('now')} onSettings={() => setPage('settings')} onAlwaysOnTop={toggleAlwaysOnTop}
      onAddFiles={addFiles} onAddFolder={() => void scanLibraryFolder()}/>

    <Sidebar page={page} trackCount={state.tracks.length} stats={stats} onNav={setPage}/>

    <main className="workspace">
      <section className={`stage stage-${page}`}>
        {page === 'library' || page === 'favorites' ? <LibraryPage
          title={page === 'favorites' ? 'Ulubione' : 'Biblioteka'}
          descriptor={`${filesLabel(filteredTracks.length)} · ${watchedFoldersLabel(state.folders.length)}`}
          query={search} onQuery={setSearch} searchRef={searchRef}
          tracks={filteredTracks} currentId={current?.id ?? null} favorites={state.favorites}
          onScan={() => void scanLibraryFolder()}
          onPlay={track => selectTrack(track, true)}
          onFavorite={toggleFavorite} onQueue={toggleQueue}
          onPlaylist={track => setPickerTrack(track)}
          onBpmAdjustment={adjustTrackBpm}
        /> : page === 'stats' ? <StatsPage
          state={state}
          onPlay={track => selectTrack(track, true)}
          onAnalyze={() => {
            if (!state.playlists.length) { setNotice('Utwórz playlistę, aby uruchomić analizę'); window.setTimeout(() => setNotice(''), 2400); return }
            setPage('playlists')
          }}
        /> : page === 'playlists' ? <PlaylistsPage
          playlists={state.playlists} tracks={state.tracks}
          analyzingPlaylistId={analyzingPlaylistId} analyzingProgress={analyzing}
          onAnalyze={playlist => void analyzePlaylistBpm(playlist)}
          onExport={playlist => void exportM3U(playlist)}
          onPlay={playPlaylist}
        /> : page === 'settings' ? <SettingsPage
          state={state} stats={stats}
          sleepRemaining={sleepRemaining}
          onScan={() => void scanLibraryFolder()} onImport={() => void importM3U()}
          onGlobalBpm={globalBpm => update({ globalBpm })}
          onCrossfadeEnabled={crossfadeEnabled => update({ crossfadeEnabled })}
          onCrossfadeBars={crossfadeBars => update({ crossfadeBars })}
          onNormalize={normalize => update({ normalize })}
          onSleep={setSleepTimer}
        /> : <>
          {page === 'now' && <div className="now-playing-info">
            <div className="cover-art">{current?.kind === 'video' ? 'Video' : artDataUrl ? <img src={artDataUrl} alt="" draggable={false}/> : cover}</div>
            <div className="track-meta">
              <h1>{current?.title ?? 'Wybierz coś do odtworzenia'}</h1>
              <p>{current?.artist ?? 'Dodaj pliki lub folder do swojej biblioteki'}</p>
              {!current && <div className="now-empty-actions">
                <button className="primary-button" onClick={addFiles}><Plus size={16}/> Dodaj pliki</button>
                <button className="outline-button" onClick={() => void scanLibraryFolder()}>Dodaj folder</button>
              </div>}
              <div className="file-badges">{current && <>
                <span>{current.extension.toUpperCase()}</span>
                {current.size ? <span>{(current.size / 1048576).toFixed(1)} MB</span> : null}
                {current.bpm ? <span title="Wykryte tempo">{Math.round(current.bpm)} BPM</span> : null}
                {current.key ? <span title={`Tonacja: ${current.keyName ?? current.key} (Camelot)`}>{current.key}</span> : null}
                {current.gainDb !== undefined && state.normalize ? <span title="Wyrównanie głośności (−18 LUFS)">{current.gainDb > 0 ? '+' : ''}{current.gainDb.toFixed(1)} dB</span> : null}
              </>}</div>
            </div>
          </div>}
          {page === 'now' && current?.kind === 'audio' && <div className="cue-row">
            <div className="wave-strip">
              <WaveStrip peaks={wavePeaks} duration={current.duration ?? 0} loop={loopState} onSeek={fraction => {
                const total = current.duration ?? 0
                if (total > 0) seekTo(fraction * total)
              }}/>
            </div>
            <div className="cue-bar">
              <button className="tiny-action" onClick={addCue}><Plus size={14}/> Cue <kbd>K</kbd></button>
              <button className={loopState ? 'tiny-action active' : 'tiny-action'} onClick={toggleLoop}><Repeat size={14}/> Pętla <kbd>L</kbd></button>
              {(current.cues ?? []).map((cue, index) => <span className="cue-chip" key={`${cue.time}-${index}`}>
                <button title="Przeskocz do cue" onClick={() => seekTo(cue.time)}>C{index + 1} · {formatTime(cue.time)}</button>
                <button title="Usuń cue" onClick={() => removeCue(current.id, index)}><X size={14}/></button>
              </span>)}
              {loopState && <span className="cue-chip loop-chip">
                <button title="Przeskocz do początku pętli" onClick={() => seekTo(loopState.a)}>{loopState.active ? `Pętla ${formatTime(loopState.a)}–${formatTime(loopState.b)}` : `Punkt A · ${formatTime(loopState.a)}`}</button>
                <button title="Usuń pętlę" onClick={toggleLoop}><X size={14}/></button>
              </span>}
              {!loopState && !current.cues?.length && <span className="cue-hint">Cue i pętle zapisują się w gridzie beatów utworu</span>}
            </div>
          </div>}
          {page === 'visualizer' && <div className="visual-page-header"><h1>Wizualizacje</h1></div>}
          {page === 'equalizer' && <div className="visual-page-header"><h1>Equalizer</h1></div>}
          {page !== 'equalizer' && <div className={`visual-panel ${page !== 'now' ? 'visual-panel-tall' : ''} ${isVideo ? 'video-panel' : ''}`}>
            {isVideo
              ? <div className="video-wrap"><video ref={videoRef} src={current ? pathToFileUrl(current.path) : undefined} onCanPlay={() => onCanPlay()} onTimeUpdate={event => playbackClock.set(event.currentTarget.currentTime)} onLoadedMetadata={event => update({ tracks: state.tracks.map(track => track.id === current?.id ? { ...track, duration: event.currentTarget.duration } : track) })} onEnded={handleEnded} onError={() => setError('Nie można odtworzyć tego filmu. Format lub kodek może nie być obsługiwany.')} crossOrigin="anonymous">{subtitleUrl && <track kind="subtitles" src={subtitleUrl} srcLang="pl" label={subtitleName} default/>}</video>{!current && <div className="video-empty"><span>Obraz wideo pojawi się tutaj</span></div>}</div>
              : <>
                <Visualizer mode={visualMode} analyser={analyser} active={Boolean(current && !currentMedia?.paused)}/>
                {page === 'now' && <div className="visual-label">{currentVisual.name}</div>}
                {page === 'now' && <div className="visual-mode-dots">{VISUALS.map((visual, index) => <button key={visual.id} className={visualMode === visual.id ? 'active' : ''} title={visual.name} onClick={() => setVisualMode(visual.id)}>{String(index + 1).padStart(2, '0')}</button>)}</div>}
                <button className="viz-expand" title="Pełny ekran" onClick={() => document.querySelector('.visual-panel')?.requestFullscreen()}>Pełny ekran</button>
              </>}
            {isVideo && <button className="subtitles-button" onClick={async () => { const result = await window.mediaApp.openSubtitle(); if (!result) return; if (subtitleUrl) URL.revokeObjectURL(subtitleUrl); const vtt = result.name.toLowerCase().endsWith('.srt') ? `WEBVTT\n\n${result.text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}` : result.text; setSubtitleUrl(URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))); setSubtitleName(result.name) }}>{subtitleName || 'Dodaj napisy SRT / VTT'}</button>}
            {error && <div className="media-error"><span>{error}</span><button onClick={() => setError('')} aria-label="Zamknij komunikat">×</button></div>}
          </div>}
          {page === 'now' && <div className="eq-inline"><Equalizer values={state.eqValues} presetName={state.eqPreset} presets={presetList} onChange={values => update({ eqValues: values, eqPreset: 'Własny' })} onPreset={setPreset} onSave={() => setPresetDialog(true)}/></div>}
          {page === 'visualizer' && <div className="visual-picker">{VISUALS.map(visual => <button key={visual.id} className={visualMode === visual.id ? 'active' : ''} onClick={() => setVisualMode(visual.id)}>{visual.name}</button>)}</div>}
          {page === 'equalizer' && <div className="eq-expanded"><Equalizer values={state.eqValues} presetName={state.eqPreset} presets={presetList} onChange={values => update({ eqValues: values, eqPreset: 'Własny' })} onPreset={setPreset} onSave={() => setPresetDialog(true)}/><div className="eq-note">Equalizer działa w czasie rzeczywistym dla obsługiwanego audio i wideo</div></div>}
        </>}
      </section>

      <Dock
        track={current} duration={isVideo ? (videoRef.current?.duration ?? 0) : (current?.duration ?? getActiveAudioElement()?.duration ?? 0)}
        favorite={Boolean(current && state.favorites.includes(current.id))}
        volume={state.volume} shuffle={state.shuffle} repeat={state.repeat} playing={playing}
        recording={recording}
        onPlayPause={() => void togglePlayback()}
        onSeek={seekTo}
        onPrevious={skipPrevious} onNext={skipNext}
        onShuffle={() => update({ shuffle: !state.shuffle })}
        onRepeat={() => update({ repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' })}
        onFavorite={() => { if (current) toggleFavorite(current) }}
        onVolume={volume => update({ volume })}
        onToggleRecording={() => void toggleRecording()}
      />
      <audio ref={audioRef} onCanPlay={event => onCanPlay(event.currentTarget)} onTimeUpdate={event => handleAudioTimeUpdate(event.currentTarget)} onLoadedMetadata={event => handleAudioLoadedMetadata(event.currentTarget)} onEnded={handleEnded} onError={event => handleAudioError(event.currentTarget)} /><audio ref={secondAudioRef} onCanPlay={event => onCanPlay(event.currentTarget)} onTimeUpdate={event => handleAudioTimeUpdate(event.currentTarget)} onLoadedMetadata={event => handleAudioLoadedMetadata(event.currentTarget)} onEnded={handleEnded} onError={event => handleAudioError(event.currentTarget)} />
    </main>

    <QueuePanel
      tracks={queueTracks} currentId={current?.id ?? null} isPlaying={playing}
      crossfadeEnabled={state.crossfadeEnabled} crossfadeBars={state.crossfadeBars} crossfadeBarsLabel={crossfadeBarsLabel}
      autoDj={state.autoDj} onAutoDj={() => update({ autoDj: !state.autoDj })}
      onAddFiles={addFiles}
      onClear={() => update({ queue: [] })}
      onSaveAsPlaylist={() => {
        if (!state.queue.length) { setNotice('Dodaj utwory do kolejki przed zapisaniem playlisty'); window.setTimeout(() => setNotice(''), 2500); return }
        setDraft({ title: 'Zapisz kolejkę jako playlistę', trackIds: [...state.queue] })
      }}
      onSelect={track => selectTrack(track, true)}
      onRemove={toggleQueue}
    />

    {dropping && <div className="drop-overlay"><div className="drop-card"><FolderInput size={24}/><b>Upuść pliki</b><span>Dodadzą się do biblioteki; foldery zostaną przeskanowane</span></div></div>}
    {notice && <div className="toast">{notice}</div>}
    {draft && <TextDialog title={draft.title} eyebrow="Playlisty" label="Nazwa playlisty" confirmText={draft.title.startsWith('Zapisz') ? 'Zapisz' : 'Utwórz'} onClose={() => setDraft(null)} onSubmit={confirmDraft}/>}
    {presetDialog && <TextDialog title="Zapisz preset equalizera" eyebrow="Equalizer" label="Nazwa presetu" confirmText="Zapisz" onClose={() => setPresetDialog(false)} onSubmit={saveCustomPreset}/>}
    {pickerTrack && <PlaylistPickerDialog trackTitle={pickerTrack.title} playlists={state.playlists} onClose={() => setPickerTrack(null)}
      onPick={playlist => saveTrackToPlaylist(pickerTrack, playlist)}
      onCreate={name => createPlaylistForTrack(pickerTrack, name)}/>}
  </div>
}
