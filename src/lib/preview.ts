import type { Role } from './types'

export const DEMO_STUDENT_ID = '00000000-0000-0000-0000-000000000101'
export const DEMO_COACH_ID = '00000000-0000-0000-0000-000000000102'
export const PREVIEW_ROLE_KEY = 'family-fitness-contract:preview-role'

export function isLocalhostPreview() {
  return ['127.0.0.1', 'localhost'].includes(window.location.hostname)
}

export function readPreviewRole(): Role | null {
  const role = localStorage.getItem(PREVIEW_ROLE_KEY)
  return role === 'student' || role === 'coach' ? role : null
}

export function isLocalPreviewActive() {
  return isLocalhostPreview() && Boolean(readPreviewRole())
}

export function shouldUsePreviewLocalScope(scope?: string) {
  if (!isLocalPreviewActive()) return false
  return scope === DEMO_STUDENT_ID || scope === DEMO_COACH_ID || scope === 'demo' || scope === 'coach'
}
