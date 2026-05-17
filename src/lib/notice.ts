export type Notice = {
  id: number
  tone: 'info' | 'success' | 'warning'
  message: string
  actionLabel?: string
  action?: () => void
}

export type AppNoticeEvent = CustomEvent<Omit<Notice, 'id'>>

export function notifyApp(detail: Omit<Notice, 'id'>) {
  window.dispatchEvent(new CustomEvent('family-fitness-contract:notice', { detail }))
}
