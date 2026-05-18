import type { CheckIn, CheckInEvidence, Penalty, Plan } from './types'

export type OfflineCache = {
  checkIns: CheckIn[]
  evidence: CheckInEvidence[]
  penalties: Penalty[]
  plans: Plan[]
}

const CACHE_KEY = 'family-fitness-contract:v2-cache'

function cacheKey(scope = 'demo') {
  return `${CACHE_KEY}:${scope}`
}

export function readCache(scope = 'demo'): OfflineCache {
  try {
    const raw = localStorage.getItem(cacheKey(scope))
    if (!raw) return { checkIns: [], evidence: [], penalties: [], plans: [] }
    const parsed = JSON.parse(raw) as OfflineCache
    return {
      checkIns: parsed.checkIns ?? [],
      evidence: parsed.evidence ?? [],
      penalties: parsed.penalties ?? [],
      plans: parsed.plans ?? [],
    }
  } catch {
    return { checkIns: [], evidence: [], penalties: [], plans: [] }
  }
}

export function writeCache(cache: OfflineCache, scope = 'demo') {
  try {
    localStorage.setItem(cacheKey(scope), JSON.stringify(cache))
  } catch {
    // Local storage may be full or blocked in private browsing; keep the app usable.
  }
}

export function clearCache(scope = 'demo') {
  try {
    localStorage.removeItem(cacheKey(scope))
  } catch {
    // Ignore storage cleanup failures for the same reason as writeCache.
  }
}
