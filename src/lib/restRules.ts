import { addDays, fromISODate, formatDay, toISODate } from './date'
import type { CheckIn, Penalty, Plan } from './types'

export type RestConflict = {
  date: string
  kind: 'missed' | 'rest'
  message: string
  position: 'next' | 'previous'
}

function adjacentDate(date: string, offset: -1 | 1) {
  return toISODate(addDays(fromISODate(date), offset))
}

function isEffectiveMissedPenalty(penalty?: Pick<Penalty, 'source_type' | 'status'>) {
  return Boolean(
    penalty &&
      penalty.status !== 'waived' &&
      (!penalty.source_type || penalty.source_type === 'missed_checkin'),
  )
}

function dayConflictKind(
  date: string,
  plans: Array<Pick<Plan, 'date' | 'is_training'>>,
  checkIns: Array<Pick<CheckIn, 'date' | 'status'>>,
  penalties: Array<Pick<Penalty, 'date' | 'source_type' | 'status'>>,
): RestConflict['kind'] | null {
  const plan = plans.find((item) => item.date === date)
  if (plan && !plan.is_training) return 'rest'

  const checkIn = checkIns.find((item) => item.date === date)
  if (checkIn?.status === 'missed') return 'missed'

  const penalty = penalties.find((item) => item.date === date)
  if (isEffectiveMissedPenalty(penalty)) return 'missed'

  return null
}

function conflictMessage(position: RestConflict['position'], kind: RestConflict['kind'], date: string) {
  if (position === 'previous') {
    return kind === 'rest'
      ? `昨天（${formatDay(date)}）已经休息，今天只能训练或申请请假，不能连续休息。`
      : `昨天（${formatDay(date)}）已经缺卡，今天只能训练或申请请假，不能再记休息。`
  }

  return kind === 'rest'
    ? `后一天（${formatDay(date)}）已经休息，这一天不能再记休息。`
    : `后一天（${formatDay(date)}）已经缺卡，这一天不能再记休息。`
}

export function getRestConflict(
  date: string,
  plans: Array<Pick<Plan, 'date' | 'is_training'>>,
  checkIns: Array<Pick<CheckIn, 'date' | 'status'>>,
  penalties: Array<Pick<Penalty, 'date' | 'source_type' | 'status'>>,
): RestConflict | null {
  const previousDate = adjacentDate(date, -1)
  const previousKind = dayConflictKind(previousDate, plans, checkIns, penalties)
  if (previousKind) {
    return {
      date: previousDate,
      kind: previousKind,
      message: conflictMessage('previous', previousKind, previousDate),
      position: 'previous',
    }
  }

  const nextDate = adjacentDate(date, 1)
  const nextKind = dayConflictKind(nextDate, plans, checkIns, penalties)
  if (nextKind) {
    return {
      date: nextDate,
      kind: nextKind,
      message: conflictMessage('next', nextKind, nextDate),
      position: 'next',
    }
  }

  return null
}
