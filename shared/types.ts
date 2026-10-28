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
  openMedia: () => Promise<Track[]>
  chooseFolder: () => Promise<string | null>
  scanFolder: (folder: string) => Promise<Track[]>
  watchFolders: (folders: string[]) => Promise<boolean>
  loadState: () => Promise<PersistedState>
  saveState: (state: PersistedState) => Promise<boolean>
  openSubtitle: () => Promise<{ name: string; text: string } | null>
  importPlaylist: () => Promise<{ path: string; text: string } | null>
  exportPlaylist: (name: string, text: string) => Promise<boolean>
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
  customPresets: [], shuffle: false, repeat: 'off', alwaysOnTop: false
}
