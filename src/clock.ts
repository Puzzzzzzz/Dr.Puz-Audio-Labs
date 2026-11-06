import { useSyncExternalStore } from 'react'

let currentTime = 0
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach(listener => listener())
}

export const playbackClock = {
  get: () => currentTime,
  set(time: number) {
    if (!Number.isFinite(time) || Math.abs(time - currentTime) < 0.05) return
    currentTime = time
    emit()
  },
  reset() {
    if (currentTime === 0) return
    currentTime = 0
    emit()
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function getSnapshot() {
  return currentTime
}

export function usePlaybackTime() {
  return useSyncExternalStore(subscribe, getSnapshot)
}
