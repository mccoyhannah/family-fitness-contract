import { useCallback, useEffect, useState } from 'react'
import { readCache, writeCache } from '../lib/cache'
import { DEMO_STUDENT_ID, PREVIEW_ROLE_KEY, isLocalhostPreview } from '../lib/preview'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { notifySyncError } from '../lib/syncError'
import type { CheckIn, Penalty, Profile } from '../lib/types'

type CoachDataState = {
  checkIns: CheckIn[]
  loading: boolean
  penalties: Penalty[]
  profiles: Profile[]
  ready: boolean
}

const demoStudent: Profile = {
  id: DEMO_STUDENT_ID,
  name: '1号',
  role: 'student',
}

const COACH_RECORD_LIMIT = 500

let coachDataCache: Omit<CoachDataState, 'loading'> | null = null

function shouldUseDemoCoachData() {
  return !isSupabaseConfigured || !supabase || (isLocalhostPreview() && localStorage.getItem(PREVIEW_ROLE_KEY) === 'coach')
}

export function clearCoachDataCache() {
  coachDataCache = null
}

function initialCoachDataState(): CoachDataState {
  if (coachDataCache) return { ...coachDataCache, loading: false }
  if (shouldUseDemoCoachData()) {
    const cache = readCache(demoStudent.id)
    return {
      checkIns: cache.checkIns,
      loading: false,
      penalties: cache.penalties,
      profiles: [demoStudent],
      ready: true,
    }
  }
  return {
    checkIns: readCache('coach').checkIns,
    loading: Boolean(isSupabaseConfigured && supabase),
    penalties: readCache('coach').penalties,
    profiles: [],
    ready: false,
  }
}

function rememberCoachData(state: Omit<CoachDataState, 'loading'>) {
  coachDataCache = state
}

export function useCoachData() {
  const [state, setState] = useState<CoachDataState>(() => initialCoachDataState())

  const load = useCallback(async () => {
    if (shouldUseDemoCoachData()) {
      const cache = readCache(demoStudent.id)
      const next = {
        checkIns: cache.checkIns,
        loading: false,
        penalties: cache.penalties,
        profiles: [demoStudent],
        ready: true,
      }
      rememberCoachData({ checkIns: next.checkIns, penalties: next.penalties, profiles: next.profiles, ready: next.ready })
      setState(next)
      return
    }
    const client = supabase
    if (!client) return
    try {
      setState((current) => ({ ...current, loading: true }))
      const [profilesResult, checkInsResult, penaltiesResult] = await Promise.allSettled([
        client.from('profiles').select('*').eq('role', 'student').order('created_at', { ascending: true }),
        client.from('check_ins').select('*').order('date', { ascending: false }).limit(COACH_RECORD_LIMIT),
        client.from('penalties').select('*').order('date', { ascending: false }).limit(COACH_RECORD_LIMIT),
      ])
      const profilesData =
        profilesResult.status === 'fulfilled' && !profilesResult.value.error
          ? ((profilesResult.value.data ?? []) as Profile[])
          : null
      const checkInsData =
        checkInsResult.status === 'fulfilled' && !checkInsResult.value.error
          ? ((checkInsResult.value.data ?? []) as CheckIn[])
          : null
      const penaltiesData =
        penaltiesResult.status === 'fulfilled' && !penaltiesResult.value.error
          ? ((penaltiesResult.value.data ?? []) as Penalty[])
          : null
      if (profilesData === null && checkInsData === null && penaltiesData === null) {
        throw new Error('管理端数据同步失败')
      }

      const failedQueries = [
        profilesData === null ? '成员档案' : '',
        checkInsData === null ? '打卡记录' : '',
        penaltiesData === null ? '账款记录' : '',
      ].filter(Boolean)

      setState((current) => {
        const fullySynced = profilesData !== null && checkInsData !== null && penaltiesData !== null
        const next = {
          checkIns: checkInsData ?? current.checkIns,
          loading: false,
          penalties: penaltiesData ?? current.penalties,
          profiles: profilesData ?? current.profiles,
          ready: fullySynced || current.ready,
        }
        rememberCoachData({ checkIns: next.checkIns, penalties: next.penalties, profiles: next.profiles, ready: next.ready })
        const cache = readCache('coach')
        writeCache({ ...cache, checkIns: next.checkIns, penalties: next.penalties }, 'coach')
        return next
      })

      if (failedQueries.length > 0) {
        notifySyncError('coach-data-partial', `${failedQueries.join('、')}同步失败，已保留可用数据。`)
      }
    } finally {
      setState((current) => (current.loading ? { ...current, loading: false } : current))
    }
  }, [])

  useEffect(() => {
    void load().catch(() => notifySyncError('coach-data', '管理端数据同步失败，请检查网络后刷新。'))
  }, [load])

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    if (!client) return
    const channel = client
      .channel('coach-data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins' }, () =>
        void load().catch(() => notifySyncError('coach-data', '管理端数据同步失败，请检查网络后刷新。')),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'penalties' }, () =>
        void load().catch(() => notifySyncError('coach-data', '管理端数据同步失败，请检查网络后刷新。')),
      )
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [load])

  const updateCheckIn = async (id: string, status: CheckIn['status']) => {
    if (shouldUseDemoCoachData()) {
      const cache = readCache(demoStudent.id)
      const next = cache.checkIns.map((item) => (item.id === id ? { ...item, status } : item))
      writeCache({ ...cache, checkIns: next }, demoStudent.id)
      setState((current) => {
        const nextState = { ...current, checkIns: next, ready: true }
        rememberCoachData({ checkIns: nextState.checkIns, penalties: nextState.penalties, profiles: nextState.profiles, ready: nextState.ready })
        return nextState
      })
      return
    }
    const client = supabase
    if (!client) return
    const { error } = await client.from('check_ins').update({ status }).eq('id', id)
    if (error) throw error
    await load()
  }

  const updatePenalty = async (id: string, status: Penalty['status']) => {
    if (shouldUseDemoCoachData()) {
      const cache = readCache(demoStudent.id)
      const next = cache.penalties.map((item) => (item.id === id ? { ...item, status } : item))
      writeCache({ ...cache, penalties: next }, demoStudent.id)
      setState((current) => {
        const nextState = { ...current, penalties: next, ready: true }
        rememberCoachData({ checkIns: nextState.checkIns, penalties: nextState.penalties, profiles: nextState.profiles, ready: nextState.ready })
        return nextState
      })
      return
    }
    const client = supabase
    if (!client) return
    const { error } = await client.from('penalties').update({ status }).eq('id', id)
    if (error) throw error
    await load()
  }

  return {
    checkIns: state.checkIns,
    loading: state.loading,
    penalties: state.penalties,
    profiles: state.profiles,
    ready: state.ready,
    reload: load,
    updateCheckIn,
    updatePenalty,
  }
}
