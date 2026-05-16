import { isPastDeadline } from './date'
import { computeConsecutiveMisses, computePenaltyAmount } from './penalty'
import type { CheckIn, Penalty, Plan } from './types'

export function buildMissedSync(
  userId: string,
  plan: Array<Pick<Plan, 'id' | 'date' | 'deadline' | 'is_training'>>,
  checkIns: CheckIn[],
  penalties: Penalty[],
  now = new Date(),
) {
  const nextCheckIns = [...checkIns]
  const nextPenalties = [...penalties]

  plan
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

      const consecutive = computeConsecutiveMisses(
        day.date,
        plan,
        nextCheckIns.filter((checkIn) => checkIn.user_id === userId),
        nextPenalties.filter((penalty) => penalty.user_id === userId),
      )

      nextCheckIns.push({
        id: `local-missed-${day.date}`,
        user_id: userId,
        plan_id: day.id,
        date: day.date,
        status: 'missed',
        fatigue: null,
        issues: [],
        note: '过了截止时间自动判定缺卡',
        leave_reason: null,
      })
      nextPenalties.push({
        id: `local-penalty-${day.date}`,
        user_id: userId,
        date: day.date,
        amount: computePenaltyAmount(consecutive),
        consecutive_count: consecutive,
        status: 'pending',
        reason: '训练日未打卡',
      })
    })

  return { checkIns: nextCheckIns, penalties: nextPenalties }
}
