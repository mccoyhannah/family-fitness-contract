import { useCallback, useEffect, useState } from 'react'
import { readCache, writeCache } from '../lib/cache'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Penalty } from '../lib/types'

export function usePenalties(userId?: string) {
  const cacheScope = userId ?? 'demo'
  const [penalties, setPenalties] = useState<Penalty[]>(() => readCache(cacheScope).penalties)
  const [loading, setLoading] = useState(false)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const loadingState = loading || Boolean(userId && isSupabaseConfigured && loadedUserId !== userId)

  const load = useCallback(async () => {
    if (!userId) return
    if (!isSupabaseConfigured || !supabase) return
    try {
      setLoading(true)
      const { data } = await supabase
        .from('penalties')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
      setPenalties(data ?? [])
      writeCache({ ...readCache(cacheScope), penalties: data ?? [] }, cacheScope)
      setLoadedUserId(userId)
    } finally {
      setLoading(false)
    }
  }, [cacheScope, userId])

  useEffect(() => {
    if (userId && !isSupabaseConfigured) {
      setPenalties(readCache(cacheScope).penalties.filter((item) => item.user_id === userId))
    }
    void load()
  }, [cacheScope, load, userId])

  useEffect(() => {
    if (!userId || !supabase) return
    const client = supabase
    if (!client) return
    const channel = client
      .channel(`penalties-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'penalties', filter: `user_id=eq.${userId}` },
        () => void load(),
      )
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [load, userId])

  const upsertPenalty = async (penalty: Omit<Penalty, 'id'> & { id?: string }) => {
    const next = { ...penalty, id: penalty.id ?? `local-penalty-${penalty.date}` } as Penalty
    if (!supabase) {
      const cache = readCache(cacheScope)
      const penalties = [
        ...cache.penalties.filter((item) => !(item.user_id === next.user_id && item.date === next.date)),
        next,
      ]
      writeCache({ ...cache, penalties }, cacheScope)
      setPenalties(penalties.filter((item) => item.user_id === userId))
      return
    }
    const row = { ...penalty }
    if (row.id?.startsWith('local-')) delete row.id
    await supabase.from('penalties').upsert(row, { onConflict: 'user_id,date' })
    await load()
  }

  const updatePenalty = async (id: string, status: Penalty['status']) => {
    if (!supabase) {
      const cache = readCache(cacheScope)
      const penalties = cache.penalties.map((penalty) => (penalty.id === id ? { ...penalty, status } : penalty))
      writeCache({ ...cache, penalties }, cacheScope)
      setPenalties(penalties.filter((item) => item.user_id === userId))
      return
    }
    await supabase.from('penalties').update({ status }).eq('id', id)
    await load()
  }

  return { penalties, loading: loadingState, reload: load, upsertPenalty, updatePenalty, setPenalties }
}
