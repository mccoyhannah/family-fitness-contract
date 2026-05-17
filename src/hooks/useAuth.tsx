import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { clearCache } from '../lib/cache'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Profile, Role } from '../lib/types'

type AuthContextValue = {
  loading: boolean
  authError: string | null
  session: Session | null
  profile: Profile | null
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  previewAs: (role: Role) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const demoProfiles: Record<Role, Profile> = {
  student: {
    id: '00000000-0000-0000-0000-000000000101',
    name: '爸爸',
    role: 'student',
    email: 'dad@example.com',
    member_code: 'DAD001',
  },
  coach: {
    id: '00000000-0000-0000-0000-000000000102',
    name: '我',
    role: 'coach',
    email: 'coach@example.com',
    member_code: 'COACH01',
  },
}

const PREVIEW_ROLE_KEY = 'family-fitness-contract:preview-role'

function isLocalhost() {
  return ['127.0.0.1', 'localhost'].includes(window.location.hostname)
}

function readPreviewRole(): Role | null {
  const role = localStorage.getItem(PREVIEW_ROLE_KEY)
  return role === 'student' || role === 'coach' ? role : null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  const loadProfile = useCallback(async (userId: string, email?: string | null) => {
    if (!supabase) return
    setLoading(true)
    setAuthError(null)
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error || !data) {
      setProfile(null)
      setAuthError('无法加载账号档案。请确认 Supabase profiles 已创建，或稍后重试。')
    } else {
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
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const loadPreview = () => {
      const previewRole = isLocalhost() ? readPreviewRole() : null
      if (!previewRole) return false
      setSession(null)
      setProfile(demoProfiles[previewRole])
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
        if (data.session?.user.id) void loadProfile(data.session.user.id, data.session.user.email ?? null)
        else setLoading(false)
      })
      .catch(() => {
        setAuthError('无法连接 Supabase，请稍后重试。')
        setLoading(false)
      })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (loadPreview()) return
      setSession(nextSession)
      if (nextSession?.user.id) void loadProfile(nextSession.user.id, nextSession.user.email ?? null)
      else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => data.subscription.unsubscribe()
  }, [loadProfile])

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      authError,
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
        localStorage.removeItem(PREVIEW_ROLE_KEY)
        setSession(null)
        setProfile(null)
        setAuthError(null)
      },
      previewAs: (role) => {
        if (isSupabaseConfigured && !isLocalhost()) return
        localStorage.setItem(PREVIEW_ROLE_KEY, role)
        setProfile(demoProfiles[role])
        setSession(null)
        setAuthError(null)
      },
    }),
    [authError, loading, profile, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
