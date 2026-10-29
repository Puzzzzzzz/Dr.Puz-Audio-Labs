import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron'
import { existsSync, promises as fs, watch, type FSWatcher } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import * as si from 'systeminformation'
import { AUDIO_EXTENSIONS, defaultState, MEDIA_EXTENSIONS, makeTrack, type PersistedState, type SystemStats } from '../../shared/types'

let mainWindow: BrowserWindow | null = null
let statePath = ''
const folderWatchers = new Map<string, FSWatcher>()

function readState(): PersistedState {
  try {
    const parsed = JSON.parse(require('node:fs').readFileSync(statePath, 'utf8')) as Partial<PersistedState> & { playbackTempo?: number; crossfadeSeconds?: number }
    const globalBpm = Number.isFinite(parsed.globalBpm) ? parsed.globalBpm! : Math.round(120 * (parsed.playbackTempo ?? 1))
    const legacyBars = (parsed.crossfadeSeconds ?? 8) * globalBpm / 240
    const options = [1, 2, 4, 8, 16]
    const crossfadeBars = options.includes(parsed.crossfadeBars ?? -1)
      ? parsed.crossfadeBars!
      : options.reduce((closest, bars) => Math.abs(bars - legacyBars) < Math.abs(closest - legacyBars) ? bars : closest, 4)
    const { playbackTempo: _playbackTempo, crossfadeSeconds: _crossfadeSeconds, ...saved } = parsed
    return { ...defaultState, ...saved, globalBpm, crossfadeBars }
  }
  catch { return structuredClone(defaultState) }
}

async function saveState(state: PersistedState) {
  await fs.mkdir(dirname(statePath), { recursive: true })
  const temporary = `${statePath}.tmp`
  await fs.writeFile(temporary, JSON.stringify(state, null, 2), 'utf8')
  await fs.rename(temporary, statePath)
  return true
}

async function scanFolder(folder: string) {
  const tracks: ReturnType<typeof makeTrack>[] = []
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > 14 || tracks.length >= 30000) return
    let entries
    try { entries = await fs.readdir(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const fullPath = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !['$RECYCLE.BIN', 'System Volume Information'].includes(entry.name)) await visit(fullPath, depth + 1)
      } else if (entry.isFile() && MEDIA_EXTENSIONS.includes(extname(entry.name).slice(1).toLowerCase())) {
        try { const info = await fs.stat(fullPath); tracks.push(makeTrack(fullPath, info.size, info.birthtimeMs || info.mtimeMs)) } catch { /* file disappeared during scan */ }
      }
    }
  }
  await visit(folder, 0)
  return tracks
}

function watchFolder(folder: string) {
  if (folderWatchers.has(folder) || !existsSync(folder)) return
  try {
    const watcher = watch(folder, { recursive: true }, () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('library:folder-changed', folder)
    })
    watcher.on('error', () => { watcher.close(); folderWatchers.delete(folder) })
    folderWatchers.set(folder, watcher)
  } catch { /* monitoring is best effort; manual rescan remains available */ }
}

function registerIpc() {
  ipcMain.on('window:control', (_event, action: 'minimize' | 'maximize' | 'close') => {
    if (!mainWindow) return
    if (action === 'minimize') mainWindow.minimize()
    else if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
    else if (action === 'close') mainWindow.close()
  })
  ipcMain.on('window:always-on-top', (_event, enabled: unknown) => {
    if (typeof enabled === 'boolean' && mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(enabled)
  })
  ipcMain.handle('dialog:open-media', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Media', extensions: MEDIA_EXTENSIONS }] })
    return result.canceled ? [] : Promise.all(result.filePaths.map(async path => {
      try { const info = await fs.stat(path); return makeTrack(path, info.size, info.birthtimeMs || info.mtimeMs) }
      catch { return makeTrack(path) }
    }))
  })
  ipcMain.handle('dialog:choose-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('library:scan', async (_event, folder: string) => scanFolder(folder))
  ipcMain.handle('media:read-audio', async (_event, candidate: unknown) => {
    if (typeof candidate !== 'string' || !AUDIO_EXTENSIONS.includes(extname(candidate).slice(1).toLowerCase())) throw new Error('Nieprawidłowy plik audio.')
    const info = await fs.stat(candidate)
    if (!info.isFile() || info.size > 256 * 1024 * 1024) throw new Error('Plik audio jest nieprawidłowy lub przekracza limit 256 MB.')
    const data = await fs.readFile(candidate)
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
  })
  ipcMain.handle('library:watch', async (_event, folders: string[]) => { folders.forEach(watchFolder); return true })
  ipcMain.handle('state:load', () => readState())
  ipcMain.handle('state:save', (_event, state: PersistedState) => saveState(state))
  ipcMain.handle('dialog:open-subtitle', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Napisy', extensions: ['srt', 'vtt'] }] })
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0]
    return { name: basename(path), text: await fs.readFile(path, 'utf8') }
  })
  ipcMain.handle('playlist:import', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Playlisty M3U', extensions: ['m3u', 'm3u8'] }] })
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0]
    return { path, text: await fs.readFile(path, 'utf8') }
  })
  ipcMain.handle('playlist:export', async (_event, { name, text }: { name: string; text: string }) => {
    const result = await dialog.showSaveDialog({ defaultPath: `${name}.m3u8`, filters: [{ name: 'Playlisty M3U', extensions: ['m3u8', 'm3u'] }] })
    if (result.canceled || !result.filePath) return false
    await fs.writeFile(result.filePath, text, 'utf8')
    return true
  })
  ipcMain.handle('stats:read', async (): Promise<SystemStats> => {
    const [load, mem, graphics, appMetrics] = await Promise.allSettled([si.currentLoad(), si.mem(), si.graphics(), Promise.resolve(app.getAppMetrics())])
    const totalCpu = load.status === 'fulfilled' && Number.isFinite(load.value.currentLoad) ? load.value.currentLoad : null
    const memoryUsed = mem.status === 'fulfilled' ? mem.value.active : null
    const memoryTotal = mem.status === 'fulfilled' ? mem.value.total : null
    const controllers = graphics.status === 'fulfilled' ? graphics.value.controllers : []
    const validGpus = controllers.filter(gpu => typeof gpu.utilizationGpu === 'number' && Number.isFinite(gpu.utilizationGpu))
    const appValues = appMetrics.status === 'fulfilled' ? appMetrics.value : []
    const appCpu = appValues.reduce((sum, metric) => sum + metric.cpu.percentCPUUsage, 0)
    const appMemory = appValues.reduce((sum, metric) => sum + metric.memory.workingSetSize, 0) * 1024
    return {
      cpuSystem: totalCpu,
      memoryUsed,
      memoryTotal,
      appCpu: appValues.length ? appCpu : null,
      appMemory: appValues.length ? appMemory : null,
      gpu: validGpus.length ? validGpus.reduce((sum, gpu) => sum + (gpu.utilizationGpu ?? 0), 0) / validGpus.length : null,
      gpuName: controllers[0]?.model || null
    }
  })
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.min(1600, workArea.width)
  const height = Math.min(960, workArea.height)
  mainWindow = new BrowserWindow({
    x: workArea.x + Math.max(0, Math.floor((workArea.width - width) / 2)),
    y: workArea.y + Math.max(0, Math.floor((workArea.height - height) / 2)),
    width, height, minWidth: Math.min(1120, workArea.width), minHeight: Math.min(600, workArea.height), frame: false,
    backgroundColor: '#050713', title: 'Dr.Puz Audio Lab', autoHideMenuBar: true,
    alwaysOnTop: readState().alwaysOnTop,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  statePath = join(app.getPath('userData'), 'library-state.json')
  registerIpc()
  readState().folders.forEach(watchFolder)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('before-quit', () => { for (const watcher of [...folderWatchers.values()]) watcher.close() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
