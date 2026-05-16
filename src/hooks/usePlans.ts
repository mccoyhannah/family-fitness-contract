import { useCallback, useEffect, useState } from 'react'
import { readCache, writeCache } from '../lib/cache'
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

export function usePlans(userId?: string) {
  const cacheScope = userId ?? 'demo'
  const [plans, setPlans] = useState<Plan[]>(() => readCache(cacheScope).plans)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    if (!isSupabaseConfigured || !supabase) {
      setPlans(readCache(cacheScope).plans.filter((plan) => plan.user_id === userId))
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('plans')
      .select('*, plan_items(*)')
      .eq('user_id', userId)
      .order('date', { ascending: true })
    setLoading(false)

    if (error) throw error
    const nextPlans = ((data ?? []) as PlanRow[]).map(normalizePlan)
    setPlans(nextPlans)
    writeCache({ ...readCache(cacheScope), plans: nextPlans }, cacheScope)
  }, [cacheScope, userId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!userId || !supabase) return
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

    if (!supabase) {
      const cache = readCache(cacheScope)
      const plans = [...cache.plans.filter((plan) => !(plan.user_id === draft.user_id && plan.date === draft.date)), localPlan]
      writeCache({ ...cache, plans }, cacheScope)
      setPlans(plans.filter((plan) => plan.user_id === userId))
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
    const { data, error } = await supabase
      .from('plans')
      .upsert(planRow, { onConflict: 'user_id,date' })
      .select('*')
      .single()
    if (error) throw error

    await supabase.from('plan_items').delete().eq('plan_id', data.id)
    if (draft.items.length > 0) {
      const { error: itemError } = await supabase.from('plan_items').insert(
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

  return { loading, plans, reload: load, savePlan, setPlans }
}
