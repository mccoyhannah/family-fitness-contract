import { useCallback, useEffect, useState } from 'react'
import { readCache, writeCache } from '../lib/cache'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { CheckIn } from '../lib/types'

export function useCheckIns(userId?: string) {
  const [checkIns, setCheckIns] = useState<CheckIn[]>(() => readCache().checkIns)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    if (!isSupabaseConfigured || !supabase) return
    setLoading(true)
    const { data } = await supabase
      .from('check_ins')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
    setCheckIns(data ?? [])
    writeCache({ ...readCache(), checkIns: data ?? [] })
    setLoading(false)
  }, [userId])

  useEffect(() => {
    if (userId && !isSupabaseConfigured) {
      setCheckIns(readCache().checkIns.filter((item) => item.user_id === userId))
    }
    void load()
  }, [load])

  useEffect(() => {
    if (!userId || !supabase) return
    const client = supabase
    if (!client) return
    const channel = client
      .channel(`check-ins-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'check_ins', filter: `user_id=eq.${userId}` },
        () => void load(),
      )
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [load, userId])

  const upsertCheckIn = async (checkIn: Omit<CheckIn, 'id'> & { id?: string }) => {
    const next = { ...checkIn, id: checkIn.id ?? `local-${checkIn.date}` } as CheckIn
    if (!supabase) {
      const cache = readCache()
      const checkIns = [...cache.checkIns.filter((item) => !(item.user_id === next.user_id && item.date === next.date)), next]
      writeCache({ ...cache, checkIns })
      setCheckIns(checkIns.filter((item) => item.user_id === userId))
      return
    }
    await supabase.from('check_ins').upsert(checkIn, { onConflict: 'user_id,date' })
    await load()
  }

  return { checkIns, loading, reload: load, upsertCheckIn, setCheckIns }
}
