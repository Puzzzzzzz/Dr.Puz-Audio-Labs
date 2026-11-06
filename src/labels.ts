/** Picks the Polish plural form: 1 utwór, 2 utwory, 5 utworów, 22 utwory. */
export function plural(count: number, one: string, few: string, many: string) {
  if (count === 1) return one
  const lastDigit = count % 10
  const lastTwoDigits = count % 100
  return lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14) ? few : many
}

export function tracksLabel(count: number) {
  return `${count} ${plural(count, 'utwór', 'utwory', 'utworów')}`
}

export function filesLabel(count: number) {
  return `${count} ${plural(count, 'plik', 'pliki', 'plików')}`
}

export function watchedFoldersLabel(count: number) {
  return `${count} ${plural(count, 'obserwowany folder', 'obserwowane foldery', 'obserwowanych folderów')}`
}

export function crossfadeBarsLabel(bars: number) {
  return `${bars} ${plural(bars, 'takt', 'takty', 'taktów')}`
}
