import { useCallback, useEffect, useState } from 'react'
import { readCache, writeCache } from '../lib/cache'
import { DEMO_COACH_ID, isLocalPreviewActive } from '../lib/preview'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { notifySyncError } from '../lib/syncError'
import type { FundExpense } from '../lib/types'

const FUND_EXPENSE_SCOPE = 'coach'

function shouldUseLocalFundExpenses() {
  return !isSupabaseConfigured || !supabase || isLocalPreviewActive()
}

function sortExpenses(expenses: FundExpense[]) {
  return expenses.slice().sort((a, b) => b.spent_on.localeCompare(a.spent_on) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
}

export function useFundExpenses(coachId?: string) {
  const [expenses, setExpenses] = useState<FundExpense[]>(() => sortExpenses(readCache(FUND_EXPENSE_SCOPE).fundExpenses))
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (shouldUseLocalFundExpenses()) {
      setExpenses(sortExpenses(readCache(FUND_EXPENSE_SCOPE).fundExpenses))
      return
    }

    const client = supabase
    if (!client) return
    try {
      setLoading(true)
      let query = client.from('fund_expenses').select('*').order('spent_on', { ascending: false }).order('created_at', { ascending: false })
      if (coachId) query = query.eq('coach_id', coachId)
      const { data, error } = await query
      if (error) throw error
      setExpenses((data ?? []) as FundExpense[])
    } finally {
      setLoading(false)
    }
  }, [coachId])

  useEffect(() => {
    void load().catch(() => notifySyncError('fund-expenses', '家庭基金支出同步失败，请检查网络后刷新。'))
  }, [load])

  useEffect(() => {
    if (!supabase || shouldUseLocalFundExpenses()) return
    const client = supabase
    if (!client) return
    const channel = client
      .channel(`fund-expenses-${coachId ?? 'related'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fund_expenses' }, () =>
        void load().catch(() => notifySyncError('fund-expenses', '家庭基金支出同步失败，请检查网络后刷新。')),
      )
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [coachId, load])

  const addExpense = async (expense: Omit<FundExpense, 'id' | 'coach_id' | 'created_at' | 'updated_at'>) => {
    const ownerId = coachId ?? DEMO_COACH_ID
    if (shouldUseLocalFundExpenses()) {
      const cache = readCache(FUND_EXPENSE_SCOPE)
      const nextExpense: FundExpense = {
        ...expense,
        coach_id: ownerId,
        created_at: new Date().toISOString(),
        id: `local-fund-expense-${Date.now()}`,
        updated_at: new Date().toISOString(),
      }
      const next = sortExpenses([nextExpense, ...cache.fundExpenses])
      writeCache({ ...cache, fundExpenses: next }, FUND_EXPENSE_SCOPE)
      setExpenses(next)
      return nextExpense
    }

    const client = supabase
    if (!client || !coachId) throw new Error('缺少教练账号，无法记录基金支出。')
    const { data, error } = await client
      .from('fund_expenses')
      .insert({ ...expense, coach_id: coachId })
      .select('*')
      .single()
    if (error) throw error
    await load()
    return data as FundExpense
  }

  const updateExpense = async (id: string, expense: Omit<FundExpense, 'id' | 'coach_id' | 'created_at' | 'updated_at'>) => {
    if (shouldUseLocalFundExpenses()) {
      const cache = readCache(FUND_EXPENSE_SCOPE)
      const next = sortExpenses(
        cache.fundExpenses.map((item) =>
          item.id === id ? { ...item, ...expense, updated_at: new Date().toISOString() } : item,
        ),
      )
      writeCache({ ...cache, fundExpenses: next }, FUND_EXPENSE_SCOPE)
      setExpenses(next)
      return
    }

    const client = supabase
    if (!client || !coachId) throw new Error('缺少教练账号，无法更新基金支出。')
    const { error } = await client.from('fund_expenses').update(expense).eq('id', id).eq('coach_id', coachId)
    if (error) throw error
    await load()
  }

  const deleteExpense = async (id: string) => {
    if (shouldUseLocalFundExpenses()) {
      const cache = readCache(FUND_EXPENSE_SCOPE)
      const next = cache.fundExpenses.filter((item) => item.id !== id)
      writeCache({ ...cache, fundExpenses: next }, FUND_EXPENSE_SCOPE)
      setExpenses(next)
      return
    }

    const client = supabase
    if (!client || !coachId) throw new Error('缺少教练账号，无法删除基金支出。')
    const { error } = await client.from('fund_expenses').delete().eq('id', id).eq('coach_id', coachId)
    if (error) throw error
    await load()
  }

  return { addExpense, deleteExpense, expenses, loading, reload: load, updateExpense }
}
