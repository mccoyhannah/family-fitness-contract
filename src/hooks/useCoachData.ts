import { useCallback, useEffect, useState } from 'react'
import { readCache, writeCache } from '../lib/cache'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { CheckIn, Penalty, Profile } from '../lib/types'

const demoStudent: Profile = {
  id: '00000000-0000-0000-0000-000000000101',
  name: '爸爸',
  role: 'student',
}

export function useCoachData() {
  const [profiles, setProfiles] = useState<Profile[]>([demoStudent])
  const [checkIns, setCheckIns] = useState<CheckIn[]>(() => readCache().checkIns)
  const [penalties, setPenalties] = useState<Penalty[]>(() => readCache().penalties)

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      const cache = readCache()
      setProfiles([demoStudent])
      setCheckIns(cache.checkIns)
      setPenalties(cache.penalties)
      return
    }
    const [{ data: profileRows }, { data: checkInRows }, { data: penaltyRows }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: true }),
      supabase.from('check_ins').select('*').order('date', { ascending: false }),
      supabase.from('penalties').select('*').order('date', { ascending: false }),
    ])
    setProfiles(profileRows ?? [])
    setCheckIns(checkInRows ?? [])
    setPenalties(penaltyRows ?? [])
    writeCache({ checkIns: checkInRows ?? [], penalties: penaltyRows ?? [] })
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    if (!client) return
    const channel = client
      .channel('coach-data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'penalties' }, () => void load())
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [load])

  const updateCheckIn = async (id: string, status: CheckIn['status']) => {
    if (!supabase) {
      const cache = readCache()
      const next = cache.checkIns.map((item) => (item.id === id ? { ...item, status } : item))
      writeCache({ ...cache, checkIns: next })
      setCheckIns(next)
      return
    }
    await supabase.from('check_ins').update({ status }).eq('id', id)
    await load()
  }

  const updatePenalty = async (id: string, status: Penalty['status']) => {
    if (!supabase) {
      const cache = readCache()
      const next = cache.penalties.map((item) => (item.id === id ? { ...item, status } : item))
      writeCache({ ...cache, penalties: next })
      setPenalties(next)
      return
    }
    await supabase.from('penalties').update({ status }).eq('id', id)
    await load()
  }

  return { profiles, checkIns, penalties, reload: load, updateCheckIn, updatePenalty }
}
