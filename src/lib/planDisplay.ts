import type { Exercise, PlanSource } from './types'

const misleadingCoachFocus = new Set(['自定训练', '自主训练', '自由训练', '自己制定'])
const unitPattern = /(组|次|秒|分钟|分|小时|步|遍|个)/

export function formatPlanSourceLabel(source?: PlanSource | null) {
  return source === 'coach' ? '教练制定' : '自己制定'
}

export function defaultPlanFocusForSource(source?: PlanSource | null) {
  return source === 'coach' ? '基础训练' : '自主训练'
}

export function formatPlanFocus(focus?: string | null, source?: PlanSource | null) {
  const value = focus?.trim()
  if (!value) return defaultPlanFocusForSource(source)
  if (source === 'coach' && misleadingCoachFocus.has(value)) return defaultPlanFocusForSource(source)
  return value
}

export function formatPlanFocusText(focus?: string | null, source?: PlanSource | null) {
  return `训练重点：${formatPlanFocus(focus, source)}`
}

export function formatExerciseDose(exercise: Pick<Exercise, 'sets' | 'reps'>) {
  const sets = normalizeDoseToken(exercise.sets)
  const reps = normalizeDoseToken(exercise.reps)

  if (!sets) return reps
  if (!reps) return sets
  if (isOneOffDose(sets)) return reps
  if (sets.includes('组')) return `${sets} × ${formatPerSet(reps)}`
  return `${sets} × ${reps}`
}

function normalizeDoseToken(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(\d+)\s*[-~至]\s*(\d+)/g, '$1-$2')
    .replace(/(\d)(组|次|秒|分钟|分|小时|步|遍|个)/g, '$1 $2')
    .replace(/每侧\s*/g, '每侧 ')
    .replace(/单侧\s*/g, '单侧 ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isOneOffDose(sets: string) {
  return /^1\s*(次|遍)$/.test(sets)
}

function formatPerSet(reps: string) {
  if (reps.startsWith('每组')) return reps
  if (reps.startsWith('每侧') || reps.startsWith('单侧')) return `每组${reps}`
  if (!unitPattern.test(reps)) return reps
  return `每组 ${reps}`
}
