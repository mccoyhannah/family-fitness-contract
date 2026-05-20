import { Dumbbell, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import { useAuth } from '../hooks/useAuth'
import { isSupabaseConfigured } from '../lib/supabase'
import type { Role } from '../lib/types'

export default function AppShell({ role }: { role: Role }) {
  const { profile, signOut } = useAuth()
  const keyboardOpen = useKeyboardOpen()

  return (
    <main className="app-shell contract-app-shell">
      <section className={`app-frame contract-paper${keyboardOpen ? ' keyboard-open' : ''}`}>
        <header className="topbar contract-paper-header">
          <div className="brand-block contract-party-block">
            <span className="brand-mark">
              <Dumbbell size={18} />
            </span>
            <div>
              <p>{role === 'coach' ? '管理端' : '学员端'}</p>
              <h1>{profile?.name ?? '家庭健身契约'}</h1>
            </div>
          </div>
          <button className="ghost-button" type="button" onClick={() => void signOut()}>
            <LogOut size={18} />
            退出登录
          </button>
        </header>
        {!isSupabaseConfigured && (
          <div className="config-banner">
            Supabase 未配置：当前是本地预览，填写 .env.local 后切到云同步。
          </div>
        )}
        <div className="app-content contract-paper-body">
          <Outlet />
        </div>
        <BottomNav role={role} />
      </section>
    </main>
  )
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function useKeyboardOpen() {
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  useEffect(() => {
    let editableFocused = isEditableTarget(document.activeElement)
    const initialViewportHeight = window.visualViewport?.height ?? window.innerHeight

    const update = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const viewportShrunk = initialViewportHeight - viewportHeight > 90
      setKeyboardOpen(window.innerWidth <= 760 && (editableFocused || viewportShrunk))
    }

    const onFocusIn = (event: FocusEvent) => {
      editableFocused = isEditableTarget(event.target)
      update()
    }
    const onFocusOut = () => {
      editableFocused = false
      window.setTimeout(update, 80)
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    window.visualViewport?.addEventListener('resize', update)
    window.addEventListener('resize', update)
    update()

    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      window.visualViewport?.removeEventListener('resize', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return keyboardOpen
}
