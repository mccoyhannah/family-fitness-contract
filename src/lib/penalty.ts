import { addDays, toISODate } from './date'
import { DEFAULT_PENALTY_SETTINGS } from './penaltySettings'
import type { CheckIn, Penalty, PenaltySettings, Plan } from './types'

export function computePenaltyAmount(consecutiveDays: number, settings: PenaltySettings = DEFAULT_PENALTY_SETTINGS) {
  const days = Math.max(1, consecutiveDays)
  return Math.min(settings.base_amount + (days - 1) * settings.daily_increment, settings.max_amount)
}

export function computeConsecutiveMisses(
  date: string,
  plan: Array<Pick<Plan, 'date' | 'is_training'>>,
  checkIns: CheckIn[],
  penalties: Penalty[],
) {
  let count = 1
  let cursor = addDays(new Date(`${date}T00:00:00`), -1)
  const planByDate = new Map(plan.map((item) => [item.date, item]))
  const checkInByDate = new Map(checkIns.map((item) => [item.date, item]))
  const penaltyByDate = new Map(penalties.map((item) => [item.date, item]))

  for (let index = 0; index < 30; index += 1) {
    const cursorDate = toISODate(cursor)
    const day = planByDate.get(cursorDate)
    if (day && !day.is_training) break

    const checkIn = checkInByDate.get(cursorDate)
    const penalty = penaltyByDate.get(cursorDate)
    if (checkIn?.status === 'missed' || (penalty && penalty.status !== 'waived')) {
      count += 1
      cursor = addDays(cursor, -1)
      continue
    }
    break
  }

  return count
}
