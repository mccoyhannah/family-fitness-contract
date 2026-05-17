import { useCallback, useEffect, useState } from 'react'
import { readCache, writeCache } from '../lib/cache'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { CheckIn, Penalty, Profile } from '../lib/types'

const demoStudent: Profile = {
  id: '00000000-0000-0000-0000-000000000101',
  name: '爸爸',
  role: 'student',
}

const previewRoleKey = 'family-fitness-contract:preview-role'

function isLocalhostPreview() {
  return ['127.0.0.1', 'localhost'].includes(window.location.hostname)
}

function shouldUseDemoCoachData() {
  return !isSupabaseConfigured || !supabase || (isLocalhostPreview() && localStorage.getItem(previewRoleKey) === 'coach')
}

export function useCoachData() {
  const [profiles, setProfiles] = useState<Profile[]>(() => shouldUseDemoCoachData() ? [demoStudent] : [])
  const [checkIns, setCheckIns] = useState<CheckIn[]>(() => readCache('coach').checkIns)
  const [penalties, setPenalties] = useState<Penalty[]>(() => readCache('coach').penalties)

  const load = useCallback(async () => {
    if (shouldUseDemoCoachData()) {
      const cache = readCache(demoStudent.id)
      setProfiles([demoStudent])
      setCheckIns(cache.checkIns)
      setPenalties(cache.penalties)
      return
    }
    const client = supabase
    if (!client) return
    const [{ data: profileRows }, { data: checkInRows }, { data: penaltyRows }] = await Promise.all([
      client.from('profiles').select('*').eq('role', 'student').order('created_at', { ascending: true }),
      client.from('check_ins').select('*').order('date', { ascending: false }),
      client.from('penalties').select('*').order('date', { ascending: false }),
    ])
    setProfiles((profileRows ?? []) as Profile[])
    setCheckIns(checkInRows ?? [])
    setPenalties(penaltyRows ?? [])
    const cache = readCache('coach')
    writeCache({ ...cache, checkIns: checkInRows ?? [], penalties: penaltyRows ?? [] }, 'coach')
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
      const cache = readCache(demoStudent.id)
      const next = cache.checkIns.map((item) => (item.id === id ? { ...item, status } : item))
      writeCache({ ...cache, checkIns: next }, demoStudent.id)
      setCheckIns(next)
      return
    }
    await supabase.from('check_ins').update({ status }).eq('id', id)
    await load()
  }

  const updatePenalty = async (id: string, status: Penalty['status']) => {
    if (!supabase) {
      const cache = readCache(demoStudent.id)
      const next = cache.penalties.map((item) => (item.id === id ? { ...item, status } : item))
      writeCache({ ...cache, penalties: next }, demoStudent.id)
      setPenalties(next)
      return
    }
    await supabase.from('penalties').update({ status }).eq('id', id)
    await load()
  }

  return { profiles, checkIns, penalties, reload: load, updateCheckIn, updatePenalty }
}
