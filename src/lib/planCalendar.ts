import { addDays, fromISODate, getWeekStart, toISODate } from './date'
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
  canView: boolean
  editLabel: '制定计划' | '编辑计划' | '改成训练' | null
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

export function getStudentPlanCardAction(plan?: Pick<Plan, 'is_training' | 'source'>): StudentPlanCardAction {
  if (!plan) {
    return {
      canConvertRestToTraining: false,
      canEdit: true,
      canView: false,
      editLabel: '制定计划',
    }
  }

  if (plan.is_training) {
    return {
      canConvertRestToTraining: false,
      canEdit: plan.source === 'student',
      canView: true,
      editLabel: plan.source === 'student' ? '编辑计划' : null,
    }
  }

  return {
    canConvertRestToTraining: plan.source === 'student',
    canEdit: false,
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
