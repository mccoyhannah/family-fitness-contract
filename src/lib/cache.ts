import type { CheckIn, Penalty } from './types'

export type OfflineCache = {
  checkIns: CheckIn[]
  penalties: Penalty[]
}

const CACHE_KEY = 'family-fitness-contract:v2-cache'

function cacheKey(scope = 'demo') {
  return `${CACHE_KEY}:${scope}`
}

export function readCache(scope = 'demo'): OfflineCache {
  try {
    const raw = localStorage.getItem(cacheKey(scope))
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

export function writeCache(cache: OfflineCache, scope = 'demo') {
  localStorage.setItem(cacheKey(scope), JSON.stringify(cache))
}

export function clearCache(scope = 'demo') {
  localStorage.removeItem(cacheKey(scope))
}
