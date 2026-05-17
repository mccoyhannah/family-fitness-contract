import { useEffect, useRef, useState } from 'react'
import type { AppNoticeEvent, Notice } from '../lib/notice'

export default function AppNotice() {
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeIdRef = useRef(0)

  useEffect(() => {
    const nextId = () => {
      noticeIdRef.current += 1
      return noticeIdRef.current
    }
    const show = (event: Event) => {
      const customEvent = event as AppNoticeEvent
      setNotice({ ...customEvent.detail, id: nextId() })
    }
    const offline = () =>
      setNotice({
        id: nextId(),
        tone: 'warning',
        message: '网络已断开，已保存的计划和账本仍可查看。',
      })
    const online = () =>
      setNotice({
        id: nextId(),
        tone: 'success',
        message: '网络已恢复，云端同步会继续更新。',
      })

    window.addEventListener('family-fitness-contract:notice', show)
    window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    return () => {
      window.removeEventListener('family-fitness-contract:notice', show)
      window.removeEventListener('offline', offline)
      window.removeEventListener('online', online)
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), notice.action ? 9000 : 4200)
    return () => window.clearTimeout(timer)
  }, [notice])

  if (!notice) return null

  return (
    <div className={`app-notice ${notice.tone}`} role="status">
      <span>{notice.message}</span>
      <div className="app-notice-actions">
        {notice.action && notice.actionLabel && (
          <button type="button" onClick={notice.action}>
            {notice.actionLabel}
          </button>
        )}
        <button aria-label="关闭提示" type="button" onClick={() => setNotice(null)}>
          关闭
        </button>
      </div>
    </div>
  )
}
