const pad = (value: number) => String(value).padStart(2, '0')

export function toISODate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function fromISODate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function formatDay(date: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(fromISODate(date))
}

export function getWeekStart(date: Date) {
  const next = new Date(date)
  const day = next.getDay() || 7
  next.setDate(next.getDate() - day + 1)
  next.setHours(0, 0, 0, 0)
  return next
}

export function isPastDeadline(date: string, deadline: string, now = new Date()) {
  const today = toISODate(now)
  if (date < today) return true
  if (date > today) return false
  const current = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  return current >= deadline
}
