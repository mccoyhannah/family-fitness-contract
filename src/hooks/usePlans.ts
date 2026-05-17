import { useCallback, useEffect, useState } from 'react'
import { readCache, writeCache } from '../lib/cache'
import { shouldUsePreviewLocalScope } from '../lib/preview'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
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

export function usePlans(userId?: string) {
  const cacheScope = userId ?? 'demo'
  const [plans, setPlans] = useState<Plan[]>(() => readCache(cacheScope).plans)
  const [loading, setLoading] = useState(false)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(() => shouldUseLocalPlans(userId) ? userId ?? null : null)
  const loadingState = loading || Boolean(userId && !shouldUseLocalPlans(userId) && loadedUserId !== userId)

  const load = useCallback(async () => {
    if (!userId) return
    if (shouldUseLocalPlans(userId)) {
      setPlans(readCache(cacheScope).plans.filter((plan) => plan.user_id === userId))
      setLoadedUserId(userId)
      return
    }
    const client = supabase
    if (!client) return

    setLoading(true)
    const { data, error } = await client
      .from('plans')
      .select('*, plan_items(*)')
      .eq('user_id', userId)
      .order('date', { ascending: true })
    setLoading(false)

    if (error) throw error
    const nextPlans = ((data ?? []) as PlanRow[]).map(normalizePlan)
    setPlans(nextPlans)
    writeCache({ ...readCache(cacheScope), plans: nextPlans }, cacheScope)
    setLoadedUserId(userId)
  }, [cacheScope, userId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!userId || !supabase || shouldUseLocalPlans(userId)) return
    const client = supabase
    const channel = client
      .channel(`plans-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans', filter: `user_id=eq.${userId}` }, () =>
        void load(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_items' }, () => void load())
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [load, userId])

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

    await client.from('plan_items').delete().eq('plan_id', data.id)
    if (draft.items.length > 0) {
      const { error: itemError } = await client.from('plan_items').insert(
        draft.items.map((item, index) => ({
          plan_id: data.id,
          name: item.name,
          sets: item.sets,
          reps: item.reps,
          note: item.note,
          sort_order: index,
        })),
      )
      if (itemError) throw itemError
    }

    await load()
    return normalizePlan({ ...(data as Omit<Plan, 'items'>), plan_items: [] })
  }

  return { loading: loadingState, plans, reload: load, savePlan, setPlans }
}
