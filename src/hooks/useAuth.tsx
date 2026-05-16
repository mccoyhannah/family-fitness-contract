import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
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
  student: { id: '00000000-0000-0000-0000-000000000101', name: '爸爸', role: 'student' },
  coach: { id: '00000000-0000-0000-0000-000000000102', name: '我', role: 'coach' },
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          setAuthError('无法读取登录状态，请检查网络或 Supabase 配置。')
          setLoading(false)
          return
        }
        setSession(data.session)
        if (data.session?.user.id) void loadProfile(data.session.user.id)
        else setLoading(false)
      })
      .catch(() => {
        setAuthError('无法连接 Supabase，请稍后重试。')
        setLoading(false)
      })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user.id) void loadProfile(nextSession.user.id)
      else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => data.subscription.unsubscribe()
  }, [])

  const loadProfile = async (userId: string) => {
    if (!supabase) return
    setLoading(true)
    setAuthError(null)
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error) {
      setProfile(null)
      setAuthError('无法加载账号档案。请确认 Supabase profiles 已创建，或稍后重试。')
    } else {
      setProfile(data)
    }
    setLoading(false)
  }

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
        console.warn('Supabase sign-in failed:', error.message)
        return '邮箱或密码错误，或账号还没有开通。'
      },
      signOut: async () => {
        if (supabase) await supabase.auth.signOut()
        if (profile?.id) clearCache(profile.id)
        setSession(null)
        setProfile(null)
        setAuthError(null)
      },
      previewAs: (role) => {
        if (isSupabaseConfigured) return
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
