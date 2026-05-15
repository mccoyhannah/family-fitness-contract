import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Profile, Role } from '../lib/types'

type AuthContextValue = {
  loading: boolean
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
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user.id) void loadProfile(data.session.user.id)
      else setLoading(false)
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
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(error ? null : data)
    setLoading(false)
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      profile,
      signIn: async (email, password) => {
        if (!supabase) return 'Supabase 未配置，无法真实登录。'
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return error?.message ?? null
      },
      signOut: async () => {
        if (supabase) await supabase.auth.signOut()
        setSession(null)
        setProfile(null)
      },
      previewAs: (role) => {
        setProfile(demoProfiles[role])
        setSession(null)
      },
    }),
    [loading, profile, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
