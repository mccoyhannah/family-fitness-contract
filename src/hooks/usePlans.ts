import { useCallback, useEffect, useMemo, useState } from 'react'
import { readCache, writeCache } from '../lib/cache'
import { toISODate } from '../lib/date'
import { shouldUsePreviewLocalScope } from '../lib/preview'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { friendlySupabaseMessage } from '../lib/supabaseErrors'
import { notifySyncError } from '../lib/syncError'
import type { Plan, PlanDraft, PlanItem } from '../lib/types'

type PlanRow = Omit<Plan, 'items'> & {
  plan_items?: PlanItem[]
}

function normalizePlan(row: PlanRow): Plan {
  return {
    ...row,
    items: (row.plan_items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
  }
}

function shouldUseLocalPlans(scope?: string) {
  return !isSupabaseConfigured || !supabase || shouldUsePreviewLocalScope(scope)
}

function isUuid(value?: string) {
  return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i))
}

export function usePlans(userId?: string) {
  const cacheScope = userId ?? 'demo'
  const [plans, setPlans] = useState<Plan[]>(() => readCache(cacheScope).plans)
  const [loading, setLoading] = useState(false)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(() => shouldUseLocalPlans(userId) ? userId ?? null : null)
  const loadingState = loading || Boolean(userId && !shouldUseLocalPlans(userId) && loadedUserId !== userId)
  const planIds = useMemo(() => plans.map((plan) => plan.id).sort().join(','), [plans])

  const load = useCallback(async () => {
    if (!userId) return
    if (shouldUseLocalPlans(userId)) {
      setPlans(readCache(cacheScope).plans.filter((plan) => plan.user_id === userId))
      setLoadedUserId(userId)
      return
    }
    const client = supabase
    if (!client) return

    try {
      setLoading(true)
      const { data, error } = await client
        .from('plans')
        .select('*, plan_items(*)')
        .eq('user_id', userId)
        .order('date', { ascending: true })
      if (error) throw error
      const nextPlans = ((data ?? []) as PlanRow[]).map(normalizePlan)
      setPlans(nextPlans)
      writeCache({ ...readCache(cacheScope), plans: nextPlans }, cacheScope)
      setLoadedUserId(userId)
    } finally {
      setLoading(false)
    }
  }, [cacheScope, userId])

  useEffect(() => {
    void load().catch(() => notifySyncError('plans', '计划同步失败，请检查网络后刷新。'))
  }, [load])

  useEffect(() => {
    if (!userId || !supabase || shouldUseLocalPlans(userId)) return
    const client = supabase
    const channel = client
      .channel(`plans-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans', filter: `user_id=eq.${userId}` }, () =>
        void load().catch(() => notifySyncError('plans', '计划同步失败，请检查网络后刷新。')),
      )
    if (planIds) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'plan_items', filter: `plan_id=in.(${planIds})` }, () =>
        void load().catch(() => notifySyncError('plans', '计划同步失败，请检查网络后刷新。')),
      )
    }
    channel
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [load, planIds, userId])

  const savePlan = async (draft: PlanDraft) => {
    const localPlan: Plan = {
      ...draft,
      id: draft.id ?? `local-plan-${draft.user_id}-${draft.date}`,
      items: draft.items.map((item, index) => ({
        id: item.id ?? `local-item-${draft.date}-${index}`,
        name: item.name,
        sets: item.sets,
        reps: item.reps,
        note: item.note,
        sort_order: index,
      })),
    }

    if (shouldUseLocalPlans(draft.user_id)) {
      const cache = readCache(cacheScope)
      const plans = [...cache.plans.filter((plan) => !(plan.user_id === draft.user_id && plan.date === draft.date)), localPlan]
      writeCache({ ...cache, plans }, cacheScope)
      setPlans(plans.filter((plan) => plan.user_id === userId))
      setLoadedUserId(userId ?? draft.user_id)
      return localPlan
    }

    const planRow = {
      id: draft.id?.startsWith('local-') ? undefined : draft.id,
      user_id: draft.user_id,
      date: draft.date,
      title: draft.title,
      focus: draft.focus,
      deadline: draft.deadline,
      is_training: draft.is_training,
      source: draft.source,
    }
    const client = supabase
    if (!client) throw new Error('Supabase 未配置，无法保存计划。')
    const { data, error } = await client
      .from('plans')
      .upsert(planRow, { onConflict: 'user_id,date' })
      .select('*')
      .single()
    if (error) throw error

    const itemRows = draft.items.map((item, index) => ({
      id: isUuid(item.id) ? item.id : undefined,
      plan_id: data.id,
      name: item.name,
      sets: item.sets,
      reps: item.reps,
      note: item.note,
      sort_order: index,
    }))
    const existingRows = itemRows.filter((item) => item.id)
    const newRows = itemRows.filter((item) => !item.id).map(({ id: _id, ...item }) => item)
    const keptItemIds: string[] = []

    if (existingRows.length > 0) {
      const { data: savedItems, error: itemError } = await client
        .from('plan_items')
        .upsert(existingRows, { onConflict: 'id' })
        .select('id')
      if (itemError) throw itemError
      keptItemIds.push(...((savedItems ?? []) as Pick<PlanItem, 'id'>[]).map((item) => item.id))
    }
    if (newRows.length > 0) {
      const { data: insertedItems, error: itemError } = await client
        .from('plan_items')
        .insert(newRows)
        .select('id')
      if (itemError) throw itemError
      keptItemIds.push(...((insertedItems ?? []) as Pick<PlanItem, 'id'>[]).map((item) => item.id))
    }
    if (keptItemIds.length === 0) {
      const { error: deleteError } = await client.from('plan_items').delete().eq('plan_id', data.id)
      if (deleteError) throw deleteError
    } else {
      const { data: currentItems, error: listError } = await client.from('plan_items').select('id').eq('plan_id', data.id)
      if (listError) throw listError
      const staleItemIds = ((currentItems ?? []) as Pick<PlanItem, 'id'>[])
        .map((item) => item.id)
        .filter((id) => !keptItemIds.includes(id))
      if (staleItemIds.length > 0) {
        const { error: deleteError } = await client.from('plan_items').delete().in('id', staleItemIds)
        if (deleteError) throw deleteError
      }
    }

    await load()
    return normalizePlan({ ...(data as Omit<Plan, 'items'>), plan_items: [] })
  }

  const withdrawPlan = async (plan: Plan) => {
    const today = toISODate(new Date())
    if (plan.source !== 'student' || plan.date !== today || plan.is_training) {
      throw new Error('只有自己设置的今日休息可以撤回。')
    }

    if (shouldUseLocalPlans(plan.user_id)) {
      const cache = readCache(cacheScope)
      const nextPlans = cache.plans.filter((item) => item.id !== plan.id)
      writeCache({ ...cache, plans: nextPlans }, cacheScope)
      const visibleUserId = userId ?? plan.user_id
      setPlans(nextPlans.filter((item) => item.user_id === visibleUserId))
      setLoadedUserId(visibleUserId)
      return
    }

    const client = supabase
    if (!client) throw new Error('Supabase 未配置，无法撤回休息。')
    const { data, error } = await client
      .from('plans')
      .delete()
      .eq('id', plan.id)
      .eq('user_id', plan.user_id)
      .eq('source', 'student')
      .eq('date', today)
      .eq('is_training', false)
      .select('id')

    if (error) throw new Error(friendlySupabaseMessage(error, '撤回休息失败：'))
    if (!data || data.length === 0) {
      throw new Error('撤回休息失败，请刷新后重试。')
    }

    await load()
  }

  return { loading: loadingState, plans, reload: load, savePlan, setPlans, withdrawPlan }
}
