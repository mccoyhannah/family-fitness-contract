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

export function recalculateMissedPenalties(
  userId: string,
  plan: Array<Pick<Plan, 'date' | 'is_training'>>,
  checkIns: CheckIn[],
  penalties: Penalty[],
  settings?: PenaltySettings,
) {
  const sortedPlan = plan.slice().sort((a, b) => a.date.localeCompare(b.date))
  const userCheckIns = checkIns.filter((checkIn) => checkIn.user_id === userId)
  const userPenalties = penalties.filter((penalty) => penalty.user_id === userId)
  const missedCheckInByDate = new Map(
    userCheckIns
      .filter((checkIn) => checkIn.status === 'missed')
      .map((checkIn) => [checkIn.date, checkIn]),
  )

  return penalties.map((penalty) => {
    if (penalty.user_id !== userId) return penalty
    if (penalty.source_type !== 'missed_checkin' && !missedCheckInByDate.has(penalty.date)) return penalty

    const consecutive = computeConsecutiveMisses(penalty.date, sortedPlan, userCheckIns, userPenalties)
    return {
      ...penalty,
      amount: computePenaltyAmount(consecutive, settings),
      consecutive_count: consecutive,
    }
  })
}
