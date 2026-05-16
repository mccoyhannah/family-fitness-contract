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
  localStorage.setItem(cacheKey(scope), JSON.stringify(cache))
}

export function clearCache(scope = 'demo') {
  localStorage.removeItem(cacheKey(scope))
}
