import type { MediaAppApi } from '../../shared/types'

declare global {
  interface Window { mediaApp: MediaAppApi }
}

export {}
