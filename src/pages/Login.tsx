import { AlertTriangle, Dumbbell } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { isLocalhostPreview } from '../lib/preview'
import { isSupabaseConfigured } from '../lib/supabase'
import type { Role } from '../lib/types'

export default function Login() {
  const { authError, previewAs, signIn } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const autoPreviewRef = useRef(false)
  const from = typeof location.state?.from === 'string' ? location.state.from : '/'
  const canPreview = !isSupabaseConfigured || isLocalhostPreview()

  useEffect(() => {
    if (!canPreview || autoPreviewRef.current) return
    const previewRole = searchParams.get('preview')
    if (previewRole !== 'student' && previewRole !== 'coach') return
    autoPreviewRef.current = true
    previewAs(previewRole)
    window.setTimeout(() => {
      navigate(searchParams.get('to') || (previewRole === 'coach' ? '/admin' : '/'), { replace: true })
    }, 0)
  }, [canPreview, navigate, previewAs, searchParams])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const message = await signIn(email, password)
    if (message) setError(message)
    else navigate(from, { replace: true })
  }

  const preview = (role: Role) => {
    previewAs(role)
    window.setTimeout(() => {
      navigate(role === 'coach' ? '/admin' : '/', { replace: true })
    }, 0)
  }

  return (
    <main className="center-screen">
      <section className="login-card">
        <div className="login-mark">
          <Dumbbell size={30} />
        </div>
        <h1>家庭健身契约</h1>
        <p>邮箱密码登录后，系统会按 Supabase profile.role 自动进入学员端或管理端。</p>

        {!isSupabaseConfigured && (
          <div className="config-warning">
            <AlertTriangle size={20} />
            <span>Supabase 尚未配置。当前可用本地预览入口，不会真实云同步。</span>
          </div>
        )}

        <form onSubmit={submit}>
          <label>
            邮箱
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Supabase Auth 密码"
            />
          </label>
          {(error || authError) && <strong className="form-error">{error || authError}</strong>}
          <button className="primary-action" disabled={!isSupabaseConfigured} type="submit">
            登录
          </button>
        </form>

        {canPreview && (
          <div className="preview-actions">
            <button type="button" onClick={() => preview('student')}>
              预览学员端
            </button>
            <button type="button" onClick={() => preview('coach')}>
              预览管理端
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
