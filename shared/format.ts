export function formatTime(seconds = 0): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const value = Math.floor(seconds)
  const hours = Math.floor(value / 3600)
  const mins = Math.floor((value % 3600) / 60)
  const secs = value % 60
  return hours ? `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function pathToFileUrl(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return `file:///${encodeURI(normalized).replace(/#/g, '%23').replace(/\?/g, '%3F')}`
}
