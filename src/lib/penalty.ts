import { addDays, toISODate } from './date'
import type { CheckIn, Penalty, PlanDay } from './types'

export function computePenaltyAmount(consecutiveDays: number) {
  return Math.min(10 * Math.max(1, consecutiveDays), 50)
}

export function computeConsecutiveMisses(
  date: string,
  plan: PlanDay[],
  checkIns: CheckIn[],
  penalties: Penalty[],
) {
  let count = 1
  let cursor = addDays(new Date(`${date}T00:00:00`), -1)

  for (let index = 0; index < 30; index += 1) {
    const cursorDate = toISODate(cursor)
    const day = plan.find((item) => item.date === cursorDate)
    if (!day?.isTraining) break

    const checkIn = checkIns.find((item) => item.date === cursorDate)
    const penalty = penalties.find((item) => item.date === cursorDate)
    if (checkIn?.status === 'missed' || (penalty && penalty.status !== 'waived')) {
      count += 1
      cursor = addDays(cursor, -1)
      continue
    }
    break
  }

  return count
}
