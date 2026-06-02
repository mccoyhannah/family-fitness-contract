import { addDays, fromISODate, getWeekStart, toISODate } from './date'
import { isLeaveArrangementCheckIn } from './leaveRequest'
import type { Plan } from './types'

export type MonthCalendarDay = {
  date: string
  dayOfMonth: number
  inCurrentMonth: boolean
  isToday: boolean
}

export type StudentPlanCardAction = {
  canConvertRestToTraining: boolean
  canEdit: boolean
  canWithdrawRest: boolean
  canView: boolean
  editLabel: '制定计划' | '编辑计划' | '改成训练' | null
}

type StudentPlanCheckInState = {
  leave_reason?: string | null
  status: 'completed' | 'excused' | 'missed' | 'pending_review'
}

export function getWeekDates(date: string) {
  const weekStart = getWeekStart(fromISODate(date))
  return Array.from({ length: 7 }, (_item, index) => toISODate(addDays(weekStart, index)))
}

export function getMonthCalendarDays(monthDate: string, today = toISODate(new Date())): MonthCalendarDay[] {
  const anchor = fromISODate(monthDate)
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
  const gridStart = getWeekStart(firstOfMonth)
  const lastDayOfWeek = lastOfMonth.getDay() || 7
  const gridEnd = addDays(lastOfMonth, 7 - lastDayOfWeek)
  const dayCount = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1

  return Array.from({ length: dayCount }, (_item, index) => {
    const dateValue = addDays(gridStart, index)
    const date = toISODate(dateValue)
    return {
      date,
      dayOfMonth: dateValue.getDate(),
      inCurrentMonth: dateValue.getMonth() === anchor.getMonth(),
      isToday: date === today,
    }
  })
}

export function getPlansInWeek<T extends Pick<Plan, 'date'>>(plans: T[], selectedDate: string) {
  const weekDates = new Set(getWeekDates(selectedDate))
  return plans
    .filter((plan) => weekDates.has(plan.date))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function getStudentPlanCardAction(
  plan?: Pick<Plan, 'is_training' | 'source'> & Partial<Pick<Plan, 'date'>>,
  today = toISODate(new Date()),
  checkIn?: StudentPlanCheckInState,
): StudentPlanCardAction {
  if (isLeaveArrangementCheckIn(checkIn)) {
    return {
      canConvertRestToTraining: false,
      canEdit: false,
      canWithdrawRest: false,
      canView: false,
      editLabel: null,
    }
  }

  if (!plan) {
    return {
      canConvertRestToTraining: false,
      canEdit: true,
      canWithdrawRest: false,
      canView: false,
      editLabel: '制定计划',
    }
  }

  if (plan.is_training) {
    return {
      canConvertRestToTraining: false,
      canEdit: plan.source === 'student',
      canWithdrawRest: false,
      canView: true,
      editLabel: plan.source === 'student' ? '编辑计划' : null,
    }
  }

  return {
    canConvertRestToTraining: plan.source === 'student',
    canEdit: false,
    canWithdrawRest: plan.source === 'student' && plan.date === today,
    canView: false,
    editLabel: plan.source === 'student' ? '改成训练' : null,
  }
}

export function getMonthStartDate(date: string) {
  const anchor = fromISODate(date)
  return toISODate(new Date(anchor.getFullYear(), anchor.getMonth(), 1))
}

export function shiftMonth(date: string, amount: number) {
  const anchor = fromISODate(date)
  return toISODate(new Date(anchor.getFullYear(), anchor.getMonth() + amount, 1))
}
