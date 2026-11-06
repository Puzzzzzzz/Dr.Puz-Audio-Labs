export type MediaKind = 'audio' | 'video'

export interface Track {
  id: string
  path: string
  title: string
  artist: string
  album: string
  kind: MediaKind
  extension: string
  duration?: number
  size: number
  addedAt: number
  bpm?: number
  /** BPM detected by analysis before a manual half-time/double-time correction. */
  bpmOriginal?: number
  bpmAdjustment?: 'double' | 'half'
  beatOffset?: number
  beatStart?: number
  /** Harmonic key written as a Camelot code, e.g. "8A". */
  key?: string
  /** Human-readable key from the same analysis, e.g. "A-moll". */
  keyName?: string
  /** Integrated loudness (LUFS) measured during analysis. */
  loudness?: number
  /** ReplayGain value in dB that aligns the track with the −18 LUFS target. */
  gainDb?: number
  /** Manual cue points in seconds, snapped to the beat grid when available. */
  cues?: CuePoint[]
}

export interface CuePoint {
  time: number
}

export interface PlayedEntry {
  trackId: string
  at: number
}

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
  updatedAt: number
}

export interface EqPreset {
  name: string
  values: number[]
}

export interface PersistedState {
  folders: string[]
  tracks: Track[]
  playlists: Playlist[]
  favorites: string[]
  queue: string[]
  currentTrackId: string | null
  currentTime: number
  volume: number
  eqValues: number[]
  eqPreset: string
  customPresets: EqPreset[]
  shuffle: boolean
  repeat: 'off' | 'all' | 'one'
  alwaysOnTop: boolean
  globalBpm: number
  crossfadeEnabled: boolean
  crossfadeBars: number
  /** Auto DJ replenishes the queue with tempo/key-compatible tracks. */
  autoDj: boolean
  /** Align track loudness with the −18 LUFS target during playback. */
  normalize: boolean
  playCounts: Record<string, number>
  history: PlayedEntry[]
}

export interface SystemStats {
  cpuSystem: number | null
  memoryUsed: number | null
  memoryTotal: number | null
  appCpu: number | null
  appMemory: number | null
  gpu: number | null
  gpuName: string | null
}

export interface MediaAppApi {
  version: () => string
  controlWindow: (action: 'minimize' | 'maximize' | 'close') => void
  setAlwaysOnTop: (enabled: boolean) => void
  readAudioFile: (path: string) => Promise<Uint8Array>
  openMedia: () => Promise<Track[]>
  chooseFolder: () => Promise<string | null>
  scanFolder: (folder: string) => Promise<Track[]>
  watchFolders: (folders: string[]) => Promise<boolean>
  loadState: () => Promise<PersistedState>
  saveState: (state: PersistedState) => Promise<boolean>
  openSubtitle: () => Promise<{ name: string; text: string } | null>
  importPlaylist: () => Promise<{ path: string; text: string } | null>
  exportPlaylist: (name: string, text: string) => Promise<boolean>
  /** Resolves the absolute path of a dropped File; empty string when unavailable. */
  pathForFile: (file: unknown) => string
  /** Saves recorded mix bytes through a native save dialog. */
  saveRecording: (bytes: Uint8Array, name: string) => Promise<boolean>
  readStats: () => Promise<SystemStats>
  onFolderChanged: (callback: (folder: string) => void) => () => void
}

export const AUDIO_EXTENSIONS = ['mp3','wav','flac','m4a','aac','ogg','opus','oga','wma','aiff','aif','mid','midi']
export const VIDEO_EXTENSIONS = ['mp4','m4v','webm','mov','mkv','avi','wmv','ogv','mpeg','mpg','3gp']
export const MEDIA_EXTENSIONS = [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS]

export function getKind(path: string): MediaKind {
  return VIDEO_EXTENSIONS.includes(path.split('.').pop()?.toLowerCase() ?? '') ? 'video' : 'audio'
}

export function makeTrack(path: string, size = 0, addedAt = Date.now()): Track {
  const filename = path.split(/[\\/]/).pop() ?? path
  const extension = filename.split('.').pop()?.toLowerCase() ?? ''
  const title = filename.replace(/\.[^.]+$/, '')
  const chunks = title.split(' - ')
  return {
    id: path.toLowerCase(), path, title: chunks.at(-1) ?? title,
    artist: chunks.length > 1 ? chunks.slice(0, -1).join(' - ') : 'Nieznany wykonawca',
    album: '', kind: getKind(path), extension, size, addedAt
  }
}

export const defaultState: PersistedState = {
  folders: [], tracks: [], playlists: [], favorites: [], queue: [], currentTrackId: null,
  currentTime: 0, volume: 0.78, eqValues: Array(10).fill(0), eqPreset: 'Płaski',
  customPresets: [], shuffle: false, repeat: 'off', alwaysOnTop: false,
  globalBpm: 120, crossfadeEnabled: false, crossfadeBars: 4,
  autoDj: false, normalize: false, playCounts: {}, history: []
}
