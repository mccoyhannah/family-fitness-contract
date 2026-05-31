import type { PenaltySettings } from './types'

export const DEFAULT_CHECK_IN_DEADLINE = '23:00'
export const CHECK_IN_DEADLINE_OPTIONS = ['21:00', '22:00', '22:30', '23:00', '23:30']

export const DEFAULT_PENALTY_SETTINGS: PenaltySettings = {
  id: true,
  base_amount: 10,
  check_in_deadline: DEFAULT_CHECK_IN_DEADLINE,
  daily_increment: 10,
  max_amount: 50,
  updated_by: null,
}

export function normalizeCheckInDeadline(value?: string | null, fallback = DEFAULT_CHECK_IN_DEADLINE) {
  const normalizedFallback = /^([01]\d|2[0-3]):[0-5]\d$/.test(fallback) ? fallback : DEFAULT_CHECK_IN_DEADLINE
  const trimmed = value?.trim() ?? ''
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed) ? trimmed : normalizedFallback
}

export function normalizePenaltySettings(settings?: Partial<PenaltySettings> | null): PenaltySettings {
  const base = Math.max(0, Math.round(Number(settings?.base_amount ?? DEFAULT_PENALTY_SETTINGS.base_amount)))
  const increment = Math.max(0, Math.round(Number(settings?.daily_increment ?? DEFAULT_PENALTY_SETTINGS.daily_increment)))
  const max = Math.max(base, Math.round(Number(settings?.max_amount ?? DEFAULT_PENALTY_SETTINGS.max_amount)))

  return {
    id: true,
    base_amount: base,
    check_in_deadline: normalizeCheckInDeadline(settings?.check_in_deadline),
    daily_increment: increment,
    max_amount: max,
    updated_at: settings?.updated_at,
    updated_by: settings?.updated_by ?? null,
  }
}
