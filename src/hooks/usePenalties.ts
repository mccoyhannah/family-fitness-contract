import { useCallback, useEffect, useState } from 'react'
import { readCache, writeCache } from '../lib/cache'
import { shouldUsePreviewLocalScope } from '../lib/preview'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { notifySyncError } from '../lib/syncError'
import type { Penalty } from '../lib/types'

function shouldUseLocalPenalties(scope?: string) {
  return !isSupabaseConfigured || !supabase || shouldUsePreviewLocalScope(scope)
}

export function usePenalties(userId?: string) {
  const cacheScope = userId ?? 'demo'
  const [penalties, setPenalties] = useState<Penalty[]>(() => readCache(cacheScope).penalties)
  const [loading, setLoading] = useState(false)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(() => shouldUseLocalPenalties(userId) ? userId ?? null : null)
  const loadingState = loading || Boolean(userId && !shouldUseLocalPenalties(userId) && loadedUserId !== userId)

  const load = useCallback(async () => {
    if (!userId) return
    if (shouldUseLocalPenalties(userId)) {
      setPenalties(readCache(cacheScope).penalties.filter((item) => item.user_id === userId))
      setLoadedUserId(userId)
      return
    }
    const client = supabase
    if (!client) return
    try {
      setLoading(true)
      const { data, error } = await client
        .from('penalties')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
      if (error) throw error
      setPenalties(data ?? [])
      writeCache({ ...readCache(cacheScope), penalties: data ?? [] }, cacheScope)
      setLoadedUserId(userId)
    } finally {
      setLoading(false)
    }
  }, [cacheScope, userId])

  useEffect(() => {
    void load().catch(() => notifySyncError('penalties', '账款记录同步失败，请检查网络后刷新。'))
  }, [load])

  useEffect(() => {
    if (!userId || !supabase || shouldUseLocalPenalties(userId)) return
    const client = supabase
    if (!client) return
    const channel = client
      .channel(`penalties-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'penalties', filter: `user_id=eq.${userId}` },
        () => void load().catch(() => notifySyncError('penalties', '账款记录同步失败，请检查网络后刷新。')),
      )
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [load, userId])

  const upsertPenalty = async (penalty: Omit<Penalty, 'id'> & { id?: string }) => {
    const next = { ...penalty, id: penalty.id ?? `local-penalty-${penalty.date}` } as Penalty
    if (shouldUseLocalPenalties(next.user_id)) {
      const cache = readCache(cacheScope)
      const penalties = [
        ...cache.penalties.filter((item) => !(item.user_id === next.user_id && item.date === next.date)),
        next,
      ]
      writeCache({ ...cache, penalties }, cacheScope)
      setPenalties(penalties.filter((item) => item.user_id === userId))
      setLoadedUserId(userId ?? next.user_id)
      return
    }
    const row = { ...penalty }
    if (row.id?.startsWith('local-')) delete row.id
    const client = supabase
    if (!client) return
    const { error } = await client.from('penalties').upsert(row, { onConflict: 'user_id,date', ignoreDuplicates: true })
    if (error) throw error
    await load()
  }

  const updatePenalty = async (id: string, status: Penalty['status']) => {
    if (shouldUseLocalPenalties(userId)) {
      const cache = readCache(cacheScope)
      const penalties = cache.penalties.map((penalty) => (penalty.id === id ? { ...penalty, status } : penalty))
      writeCache({ ...cache, penalties }, cacheScope)
      setPenalties(penalties.filter((item) => item.user_id === userId))
      if (userId) setLoadedUserId(userId)
      return
    }
    const client = supabase
    if (!client) return
    const { error } = await client.from('penalties').update({ status }).eq('id', id)
    if (error) throw error
    await load()
  }

  return { penalties, loading: loadingState, reload: load, upsertPenalty, updatePenalty, setPenalties }
}
