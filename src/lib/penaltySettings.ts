import type { PenaltySettings } from './types'

export const DEFAULT_PENALTY_SETTINGS: PenaltySettings = {
  id: true,
  base_amount: 10,
  daily_increment: 10,
  max_amount: 50,
  updated_by: null,
}

export function normalizePenaltySettings(settings?: Partial<PenaltySettings> | null): PenaltySettings {
  const base = Math.max(0, Math.round(Number(settings?.base_amount ?? DEFAULT_PENALTY_SETTINGS.base_amount)))
  const increment = Math.max(0, Math.round(Number(settings?.daily_increment ?? DEFAULT_PENALTY_SETTINGS.daily_increment)))
  const max = Math.max(base, Math.round(Number(settings?.max_amount ?? DEFAULT_PENALTY_SETTINGS.max_amount)))

  return {
    id: true,
    base_amount: base,
    daily_increment: increment,
    max_amount: max,
    updated_at: settings?.updated_at,
    updated_by: settings?.updated_by ?? null,
  }
}
