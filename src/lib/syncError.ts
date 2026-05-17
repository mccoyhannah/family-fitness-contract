import { notifyApp } from './notice'

const lastNotifiedAt = new Map<string, number>()

export function notifySyncError(key: string, message: string) {
  const now = Date.now()
  const previous = lastNotifiedAt.get(key) ?? 0
  if (now - previous < 5000) return
  lastNotifiedAt.set(key, now)
  notifyApp({ tone: 'warning', message })
}
