import type { CheckIn, Penalty } from './types'

export type OfflineCache = {
  checkIns: CheckIn[]
  penalties: Penalty[]
}

const CACHE_KEY = 'family-fitness-contract:v2-cache'

export function readCache(): OfflineCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return { checkIns: [], penalties: [] }
    const parsed = JSON.parse(raw) as OfflineCache
    return {
      checkIns: parsed.checkIns ?? [],
      penalties: parsed.penalties ?? [],
    }
  } catch {
    return { checkIns: [], penalties: [] }
  }
}

export function writeCache(cache: OfflineCache) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
}
