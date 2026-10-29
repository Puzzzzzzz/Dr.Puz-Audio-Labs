import { contextBridge, ipcRenderer } from 'electron'
import type { PersistedState, Track, SystemStats } from '../../shared/types'

const mediaApp = {
  version: () => '0.1.11',
  controlWindow: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.send('window:control', action),
  setAlwaysOnTop: (enabled: boolean) => ipcRenderer.send('window:always-on-top', enabled),
  readAudioFile: (path: string): Promise<Uint8Array> => ipcRenderer.invoke('media:read-audio', path),
  openMedia: (): Promise<Track[]> => ipcRenderer.invoke('dialog:open-media'),
  chooseFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:choose-folder'),
  scanFolder: (folder: string): Promise<Track[]> => ipcRenderer.invoke('library:scan', folder),
  watchFolders: (folders: string[]): Promise<boolean> => ipcRenderer.invoke('library:watch', folders),
  loadState: (): Promise<PersistedState> => ipcRenderer.invoke('state:load'),
  saveState: (state: PersistedState): Promise<boolean> => ipcRenderer.invoke('state:save', state),
  openSubtitle: (): Promise<{ name: string; text: string } | null> => ipcRenderer.invoke('dialog:open-subtitle'),
  importPlaylist: (): Promise<{ path: string; text: string } | null> => ipcRenderer.invoke('playlist:import'),
  exportPlaylist: (name: string, text: string): Promise<boolean> => ipcRenderer.invoke('playlist:export', { name, text }),
  readStats: (): Promise<SystemStats> => ipcRenderer.invoke('stats:read'),
  onFolderChanged: (callback: (folder: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, folder: string) => callback(folder)
    ipcRenderer.on('library:folder-changed', listener)
    return () => ipcRenderer.removeListener('library:folder-changed', listener)
  }
}

contextBridge.exposeInMainWorld('mediaApp', mediaApp)
