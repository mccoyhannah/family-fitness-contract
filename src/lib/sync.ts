import { isPastDeadline } from './date'
import { computeConsecutiveMisses, computePenaltyAmount } from './penalty'
import type { CheckIn, Penalty, Plan } from './types'

export function buildMissedPenalty(
  userId: string,
  date: string,
  plan: Array<Pick<Plan, 'date' | 'is_training'>>,
  checkIns: CheckIn[],
  penalties: Penalty[],
  sourceId?: string | null,
): Penalty {
  const sortedPlan = plan.slice().sort((a, b) => a.date.localeCompare(b.date))
  const consecutive = computeConsecutiveMisses(
    date,
    sortedPlan,
    checkIns.filter((checkIn) => checkIn.user_id === userId),
    penalties.filter((penalty) => penalty.user_id === userId),
  )

  return {
    id: `local-penalty-${date}`,
    user_id: userId,
    date,
    amount: computePenaltyAmount(consecutive),
    consecutive_count: consecutive,
    status: 'pending',
    reason: '训练日未打卡',
    source_type: 'missed_checkin',
    source_id: sourceId ?? null,
  }
}

export function buildMissedSync(
  userId: string,
  plan: Array<Pick<Plan, 'id' | 'date' | 'deadline' | 'is_training'>>,
  checkIns: CheckIn[],
  penalties: Penalty[],
  now = new Date(),
) {
  const nextCheckIns = [...checkIns]
  const nextPenalties = [...penalties]

  const sortedPlan = plan.slice().sort((a, b) => a.date.localeCompare(b.date))

  sortedPlan
    .filter((day) => day.is_training && isPastDeadline(day.date, day.deadline, now))
    .forEach((day) => {
      const existingCheckIn = nextCheckIns.find(
        (checkIn) => checkIn.user_id === userId && checkIn.date === day.date,
      )
      const existingPenalty = nextPenalties.find(
        (penalty) => penalty.user_id === userId && penalty.date === day.date,
      )
      if (existingCheckIn?.status === 'completed' || existingCheckIn?.status === 'excused') return
      if (existingPenalty) return

      const missedCheckInId = `local-missed-${day.date}`

      nextCheckIns.push({
        id: missedCheckInId,
        user_id: userId,
        plan_id: day.id,
        date: day.date,
        status: 'missed',
        fatigue: null,
        issues: [],
        note: '过了截止时间自动判定缺卡',
        leave_reason: null,
      })
      nextPenalties.push(buildMissedPenalty(userId, day.date, sortedPlan, nextCheckIns, nextPenalties, null))
    })

  return { checkIns: nextCheckIns, penalties: nextPenalties }
}
