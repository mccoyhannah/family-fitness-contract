import { AlertTriangle, Dumbbell } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { isLocalhostPreview } from '../lib/preview'
import { isSupabaseConfigured } from '../lib/supabase'
import type { Role } from '../lib/types'

const REMEMBERED_EMAIL_KEY = 'family-fitness-contract:remembered-email'

function readRememberedEmail() {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeRememberedEmail(email: string) {
  try {
    if (email) localStorage.setItem(REMEMBERED_EMAIL_KEY, email)
    else localStorage.removeItem(REMEMBERED_EMAIL_KEY)
  } catch {
    // Ignore storage failures so login still works in restrictive browsers.
  }
}

export default function Login() {
  const { authError, loading, previewAs, profile, signIn } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(readRememberedEmail)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [rememberEmail, setRememberEmail] = useState(Boolean(email))
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

  useEffect(() => {
    if (loading || !profile) return
    navigate(profile.role === 'coach' ? '/admin' : '/', { replace: true })
  }, [loading, navigate, profile])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const nextEmail = email.trim()
    const message = await signIn(nextEmail, password)
    if (message) setError(message)
    else {
      writeRememberedEmail(rememberEmail ? nextEmail : '')
      navigate(from, { replace: true })
    }
  }

  const toggleRememberEmail = (checked: boolean) => {
    setRememberEmail(checked)
    if (!checked) writeRememberedEmail('')
  }

  const preview = (role: Role) => {
    previewAs(role)
    window.setTimeout(() => {
      navigate(role === 'coach' ? '/admin' : '/', { replace: true })
    }, 0)
  }

  if (loading || profile) {
    return (
      <main className="center-screen">
        <section className="login-card loading-card" aria-label="正在进入应用">
          <span className="skeleton-line medium" />
          <span className="skeleton-line title" />
          <span className="skeleton-line" />
        </section>
      </main>
    )
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
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="username"
            />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Supabase Auth 密码"
              autoComplete="current-password"
            />
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={rememberEmail}
              onChange={(event) => toggleRememberEmail(event.target.checked)}
            />
            <span>记住邮箱，下次自动填入；密码交给浏览器保存。</span>
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
