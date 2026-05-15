import { Dumbbell, LogOut } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import { useAuth } from '../hooks/useAuth'
import { isSupabaseConfigured } from '../lib/supabase'
import type { Role } from '../lib/types'

export default function AppShell({ role }: { role: Role }) {
  const { profile, signOut } = useAuth()

  return (
    <main className="app-shell">
      <section className="app-frame">
        <header className="topbar">
          <div className="brand-block">
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
            退出
          </button>
        </header>
        {!isSupabaseConfigured && (
          <div className="config-banner">
            Supabase 未配置：当前是本地预览，填写 .env.local 后切到云同步。
          </div>
        )}
        <Outlet />
        <BottomNav role={role} />
      </section>
    </main>
  )
}
