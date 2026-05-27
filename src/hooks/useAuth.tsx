import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { clearCache } from '../lib/cache'
import { DEMO_COACH_ID, DEMO_STUDENT_ID, PREVIEW_ROLE_KEY, isLocalhostPreview, readPreviewRole } from '../lib/preview'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Profile, Role } from '../lib/types'
import { clearCoachDataCache } from './useCoachData'

type AuthContextValue = {
  loading: boolean
  authError: string | null
  loginRunId: string | null
  session: Session | null
  profile: Profile | null
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  previewAs: (role: Role) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const LOGIN_RUN_ID_KEY = 'family-fitness-contract:login-run-id'

const demoProfiles: Record<Role, Profile> = {
  student: {
    id: DEMO_STUDENT_ID,
    name: '1号',
    role: 'student',
    email: 'member@example.com',
    member_code: 'MEMBER01',
  },
  coach: {
    id: DEMO_COACH_ID,
    name: '我',
    role: 'coach',
    email: 'coach@example.com',
    member_code: 'COACH01',
  },
}

function createLoginRunId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function readStoredLoginRunId() {
  try {
    return sessionStorage.getItem(LOGIN_RUN_ID_KEY)
  } catch {
    return null
  }
}

function writeStoredLoginRunId(value: string) {
  try {
    sessionStorage.setItem(LOGIN_RUN_ID_KEY, value)
  } catch {
    // Storage can be unavailable in privacy modes; in-memory state still works.
  }
}

function clearStoredLoginRunId() {
  try {
    sessionStorage.removeItem(LOGIN_RUN_ID_KEY)
  } catch {
    // Ignore storage failures; logout still clears React state below.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [loginRunId, setLoginRunId] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const activeUserIdRef = useRef<string | null>(null)

  const ensureLoginRunId = useCallback(() => {
    const next = readStoredLoginRunId() ?? createLoginRunId()
    writeStoredLoginRunId(next)
    setLoginRunId(next)
    return next
  }, [])

  const startLoginRunId = useCallback(() => {
    const next = createLoginRunId()
    writeStoredLoginRunId(next)
    setLoginRunId(next)
    return next
  }, [])

  const clearLoginRunId = useCallback(() => {
    clearStoredLoginRunId()
    setLoginRunId(null)
    activeUserIdRef.current = null
  }, [])

  const attachSessionRun = useCallback((nextSession: Session | null, forceNew = false) => {
    const userId = nextSession?.user.id
    if (!userId) {
      clearLoginRunId()
      return
    }

    if (forceNew || activeUserIdRef.current !== userId) {
      activeUserIdRef.current = userId
      if (forceNew) startLoginRunId()
      else ensureLoginRunId()
      return
    }

    ensureLoginRunId()
  }, [clearLoginRunId, ensureLoginRunId, startLoginRunId])

  const loadProfile = useCallback(async (userId: string, email?: string | null) => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    setAuthError(null)
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
      if (error || !data) {
        setProfile(null)
        setAuthError('无法加载账号档案。请确认 Supabase profiles 已创建，或稍后重试。')
        return
      }
      const nextProfile = data as Profile
      if (email && nextProfile.email !== email) {
        const { data: updated } = await supabase
          .from('profiles')
          .update({ email: email.toLowerCase() })
          .eq('id', userId)
          .select('*')
          .single()
        setProfile((updated as Profile | null) ?? { ...nextProfile, email: email.toLowerCase() })
      } else {
        setProfile(nextProfile)
      }
    } catch {
      setProfile(null)
      setAuthError('无法连接 Supabase，请检查网络后重试。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const loadPreview = () => {
      const previewRole = isLocalhostPreview() ? readPreviewRole() : null
      if (!previewRole) return false
      setSession(null)
      setProfile(demoProfiles[previewRole])
      ensureLoginRunId()
      setAuthError(null)
      setLoading(false)
      return true
    }

    if (loadPreview()) return

    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (loadPreview()) return
        if (error) {
          setAuthError('无法读取登录状态，请检查网络或 Supabase 配置。')
          setLoading(false)
          return
        }
        setSession(data.session)
        attachSessionRun(data.session)
        if (data.session?.user.id) void loadProfile(data.session.user.id, data.session.user.email ?? null)
        else setLoading(false)
      })
      .catch(() => {
        setAuthError('无法连接 Supabase，请稍后重试。')
        setLoading(false)
      })

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (loadPreview()) return
      setSession(nextSession)
      attachSessionRun(nextSession, event === 'SIGNED_IN' && activeUserIdRef.current !== nextSession?.user.id)
      if (nextSession?.user.id) void loadProfile(nextSession.user.id, nextSession.user.email ?? null)
      else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => data.subscription.unsubscribe()
  }, [attachSessionRun, ensureLoginRunId, loadProfile])

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      authError,
      loginRunId,
      session,
      profile,
      signIn: async (email, password) => {
        if (!supabase) return 'Supabase 未配置，无法真实登录。'
        setAuthError(null)
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (!error) return null
        return '邮箱或密码错误，或账号还没有开通。'
      },
      signOut: async () => {
        if (supabase) await supabase.auth.signOut()
        if (profile?.id) clearCache(profile.id)
        clearCache('coach')
        clearCache('demo')
        clearCoachDataCache()
        localStorage.removeItem(PREVIEW_ROLE_KEY)
        clearLoginRunId()
        setSession(null)
        setProfile(null)
        setAuthError(null)
      },
      previewAs: (role) => {
        if (isSupabaseConfigured && !isLocalhostPreview()) return
        localStorage.setItem(PREVIEW_ROLE_KEY, role)
        startLoginRunId()
        setProfile(demoProfiles[role])
        setSession(null)
        setAuthError(null)
      },
    }),
    [authError, clearLoginRunId, loading, loginRunId, profile, session, startLoginRunId],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
