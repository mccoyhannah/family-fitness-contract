import { addDays, isPastDeadline, toISODate } from './date'
import { computeConsecutiveMisses, computePenaltyAmount } from './penalty'
import type { CheckIn, Penalty, Plan } from './types'

const MISSED_SYNC_LOOKBACK_DAYS = 7

function activeStartDate(activeFrom: string | null | undefined, now: Date) {
  return activeFrom ? activeFrom.slice(0, 10) : toISODate(now)
}

function recentPastDates(now: Date) {
  const dates: string[] = []
  for (let offset = MISSED_SYNC_LOOKBACK_DAYS; offset >= 1; offset -= 1) {
    dates.push(toISODate(addDays(now, -offset)))
  }
  return dates
}

export function buildMissedPenalty(
  userId: string,
  date: string,
  plan: Array<Pick<Plan, 'date' | 'is_training'>>,
  checkIns: CheckIn[],
  penalties: Penalty[],
  sourceId?: string | null,
  reason = '训练日未打卡',
): Penalty {
  const sortedPlan = plan.slice().sort((a, b) => a.date.localeCompare(b.date))
  const consecutive = computeConsecutiveMisses(
    date,
    sortedPlan,
    checkIns.filter((checkIn) => checkIn.user_id === userId),
    penalties.filter((penalty) => penalty.user_id === userId),
  )

  return {
    id: `local-penalty-${userId}-${date}`,
    user_id: userId,
    date,
    amount: computePenaltyAmount(consecutive),
    consecutive_count: consecutive,
    status: 'pending',
    reason,
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
  activeFrom?: string | null,
) {
  const nextCheckIns = [...checkIns]
  const nextPenalties = [...penalties]

  const activeStart = activeStartDate(activeFrom, now)
  const sortedPlan = plan.slice().sort((a, b) => a.date.localeCompare(b.date))
  const planByDate = new Map(sortedPlan.map((day) => [day.date, day]))
  const plannedMissCandidates = sortedPlan
    .filter((day) => day.is_training && isPastDeadline(day.date, day.deadline, now))
    .map((day) => ({
      date: day.date,
      note: '过了截止时间自动判定缺卡',
      planId: day.id,
      reason: '训练日未打卡',
    }))
  const unplannedMissCandidates = recentPastDates(now)
    .filter((date) => date >= activeStart)
    .filter((date) => !planByDate.has(date))
    .map((date) => ({
      date,
      note: '最近 7 天无计划且未打卡，自动判定缺卡',
      planId: null,
      reason: '无计划、未请假且未选择休息',
    }))

  ;[...plannedMissCandidates, ...unplannedMissCandidates]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((day) => {
      const existingCheckIn = nextCheckIns.find(
        (checkIn) => checkIn.user_id === userId && checkIn.date === day.date,
      )
      const existingPenalty = nextPenalties.find(
        (penalty) => penalty.user_id === userId && penalty.date === day.date,
      )
      if (existingCheckIn) return
      if (existingPenalty) return

      const missedCheckInId = `local-missed-${userId}-${day.date}`

      nextCheckIns.push({
        id: missedCheckInId,
        user_id: userId,
        plan_id: day.planId,
        date: day.date,
        status: 'missed',
        fatigue: null,
        issues: [],
        note: day.note,
        leave_reason: null,
      })
      nextPenalties.push(buildMissedPenalty(userId, day.date, sortedPlan, nextCheckIns, nextPenalties, null, day.reason))
    })

  return { checkIns: nextCheckIns, penalties: nextPenalties }
}
