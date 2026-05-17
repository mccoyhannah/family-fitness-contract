import { useCallback, useEffect, useState } from 'react'
import { readCache, writeCache } from '../lib/cache'
import { shouldUsePreviewLocalScope } from '../lib/preview'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { CheckIn } from '../lib/types'

function shouldUseLocalCheckIns(scope?: string) {
  return !isSupabaseConfigured || !supabase || shouldUsePreviewLocalScope(scope)
}

export function useCheckIns(userId?: string) {
  const cacheScope = userId ?? 'demo'
  const [checkIns, setCheckIns] = useState<CheckIn[]>(() => readCache(cacheScope).checkIns)
  const [loading, setLoading] = useState(false)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(() => shouldUseLocalCheckIns(userId) ? userId ?? null : null)
  const loadingState = loading || Boolean(userId && !shouldUseLocalCheckIns(userId) && loadedUserId !== userId)

  const load = useCallback(async () => {
    if (!userId) return
    if (shouldUseLocalCheckIns(userId)) {
      setCheckIns(readCache(cacheScope).checkIns.filter((item) => item.user_id === userId))
      setLoadedUserId(userId)
      return
    }
    const client = supabase
    if (!client) return
    try {
      setLoading(true)
      const { data } = await client
        .from('check_ins')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
      setCheckIns(data ?? [])
      writeCache({ ...readCache(cacheScope), checkIns: data ?? [] }, cacheScope)
      setLoadedUserId(userId)
    } finally {
      setLoading(false)
    }
  }, [cacheScope, userId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!userId || !supabase || shouldUseLocalCheckIns(userId)) return
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
    if (shouldUseLocalCheckIns(next.user_id)) {
      const cache = readCache(cacheScope)
      const checkIns = [...cache.checkIns.filter((item) => !(item.user_id === next.user_id && item.date === next.date)), next]
      writeCache({ ...cache, checkIns }, cacheScope)
      setCheckIns(checkIns.filter((item) => item.user_id === userId))
      setLoadedUserId(userId ?? next.user_id)
      return next
    }
    const row = { ...checkIn }
    if (row.id?.startsWith('local-')) delete row.id
    const client = supabase
    if (!client) throw new Error('Supabase 未配置，无法保存打卡。')
    const { data, error } = await client.from('check_ins').upsert(row, { onConflict: 'user_id,date' }).select('*').single()
    if (error) throw error
    await load()
    return data as CheckIn
  }

  return { checkIns, loading: loadingState, reload: load, upsertCheckIn, setCheckIns }
}
