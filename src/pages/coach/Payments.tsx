import { CheckCircle2, CircleSlash, ReceiptText, WalletCards } from 'lucide-react'
import type { FormEvent, MouseEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import MemberSelect from '../../components/MemberSelect'
import Metric from '../../components/Metric'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { useCoachData } from '../../hooks/useCoachData'
import { useFundExpenses } from '../../hooks/useFundExpenses'
import { useMembers } from '../../hooks/useMembers'
import { usePenaltySettings } from '../../hooks/usePenaltySettings'
import { formatDay, toISODate } from '../../lib/date'
import { displayMemberLabel } from '../../lib/memberLabels'
import { notifyApp } from '../../lib/notice'
import type { FundExpense, FundExpensePurpose } from '../../lib/types'

type PenaltyAction = {
  penaltyId: string
  status: 'paid' | 'waived'
}

type PaymentReturnPoint = {
  penaltyId: string
  scrollContainer: HTMLElement | null
  scrollTop: number
}

type ExpenseDraft = {
  amount: string
  note: string
  purpose: FundExpensePurpose
  spent_on: string
  title: string
}

const fundPurposeLabel: Record<FundExpensePurpose, string> = {
  ai: 'AI TOKEN / 订阅',
  fitness: '健身装备',
  general: '通用',
}

function emptyExpenseDraft(): ExpenseDraft {
  return {
    amount: '',
    note: '',
    purpose: 'fitness',
    spent_on: toISODate(new Date()),
    title: '',
  }
}

export default function CoachPayments() {
  const { profile } = useAuth()
  const {
    loading: membersLoading,
    members,
    ready: membersReady,
    selectedMember,
    selectedMemberId,
    setSelectedMemberId,
  } = useMembers(profile?.id)
  const { penalties, updatePenalty } = useCoachData()
  const { addExpense, deleteExpense, expenses: fundExpenses, loading: fundExpensesLoading, updateExpense } = useFundExpenses(profile?.id)
  const { loading: penaltySettingsLoading, saveSettings, settings: penaltySettings } = usePenaltySettings()
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'payment_reported' | 'paid' | 'waived'>('all')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'amount-desc'>('newest')
  const [activePaymentAction, setActivePaymentAction] = useState<PenaltyAction | null>(null)
  const [ruleDraft, setRuleDraft] = useState(() => ({
    base_amount: penaltySettings.base_amount,
    daily_increment: penaltySettings.daily_increment,
    max_amount: penaltySettings.max_amount,
  }))
  const [ruleMessage, setRuleMessage] = useState('')
  const [savingRule, setSavingRule] = useState(false)
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>(() => emptyExpenseDraft())
  const [editingExpenseId, setEditingExpenseId] = useState('')
  const [savingExpense, setSavingExpense] = useState(false)
  const [updatingPenaltyId, setUpdatingPenaltyId] = useState('')
  const paymentReturnPointRef = useRef<PaymentReturnPoint | null>(null)
  const scopedPenalties = useMemo(
    () => membersReady ? selectedMember ? penalties.filter((penalty) => penalty.user_id === selectedMember.id) : penalties : [],
    [membersReady, penalties, selectedMember],
  )
  const visiblePenalties = useMemo(() => {
    const filtered = statusFilter === 'all' ? scopedPenalties : scopedPenalties.filter((penalty) => penalty.status === statusFilter)
    return filtered.slice().sort((a, b) => {
      if (sortOrder === 'oldest') return a.date.localeCompare(b.date)
      if (sortOrder === 'amount-desc') return b.amount - a.amount || b.date.localeCompare(a.date)
      return b.date.localeCompare(a.date)
    })
  }, [scopedPenalties, sortOrder, statusFilter])
  const memberNameById = new Map(members.map((member) => [member.id, displayMemberLabel(member)]))
  const fundSummary = useMemo(() => {
    const paidTotal = penalties.filter((penalty) => penalty.status === 'paid').reduce((sum, penalty) => sum + penalty.amount, 0)
    const expenseTotal = fundExpenses.reduce((sum, expense) => sum + expense.amount, 0)
    return {
      balance: paidTotal - expenseTotal,
      expenseTotal,
      paidTotal,
    }
  }, [fundExpenses, penalties])
  const penaltySummary = useMemo(
    () =>
      scopedPenalties.reduce(
        (summary, penalty) => {
          const amount = Number.isFinite(penalty.amount) ? penalty.amount : 0
          if (penalty.status === 'pending') {
            summary.pendingTotal += amount
            summary.pendingCount += 1
          } else if (penalty.status === 'payment_reported') {
            summary.reportedCount += 1
          } else {
            summary.settledCount += 1
            if (penalty.status === 'waived') summary.waivedTotal += amount
          }
          return summary
        },
        { pendingCount: 0, pendingTotal: 0, reportedCount: 0, settledCount: 0, waivedTotal: 0 },
      ),
    [scopedPenalties],
  )
  const formatAmount = (amount: number) => (Number.isInteger(amount) ? `${amount}` : amount.toFixed(2))
  const compactStats = membersReady
    ? `全部 ${visiblePenalties.length} · 待贡献 ${penaltySummary.pendingCount} · 待确认 ${penaltySummary.reportedCount} · 已处理 ${penaltySummary.settledCount}`
    : '正在同步成员和家庭基金'

  useEffect(() => {
    if (savingRule) return
    setRuleDraft({
      base_amount: penaltySettings.base_amount,
      daily_increment: penaltySettings.daily_increment,
      max_amount: penaltySettings.max_amount,
    })
  }, [penaltySettings, savingRule])

  const findPaymentCard = (penaltyId: string) =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-penalty-id]')).find(
      (element) => element.dataset.penaltyId === penaltyId,
    )

  const restorePaymentPosition = () => {
    const returnPoint = paymentReturnPointRef.current
    if (!returnPoint) return
    paymentReturnPointRef.current = null
    window.requestAnimationFrame(() => {
      const paymentCard = findPaymentCard(returnPoint.penaltyId)
      if (paymentCard) {
        paymentCard.scrollIntoView({ behavior: 'auto', block: 'center' })
        return
      }
      returnPoint.scrollContainer?.scrollTo({ behavior: 'auto', top: returnPoint.scrollTop })
    })
  }

  const rememberPaymentPosition = (event: MouseEvent<HTMLButtonElement>, penaltyId: string) => {
    const paymentCard = event.currentTarget.closest<HTMLElement>('[data-penalty-id]')
    const scrollContainer = event.currentTarget.closest<HTMLElement>('.screen')
    paymentReturnPointRef.current = {
      penaltyId: paymentCard?.dataset.penaltyId ?? penaltyId,
      scrollContainer,
      scrollTop: scrollContainer?.scrollTop ?? 0,
    }
  }

  const requestPenaltyStatus = (
    event: MouseEvent<HTMLButtonElement>,
    penaltyId: string,
    status: 'paid' | 'waived',
  ) => {
    if (updatingPenaltyId) return
    rememberPaymentPosition(event, penaltyId)
    setActivePaymentAction({ penaltyId, status })
  }

  const cancelPenaltyStatus = () => {
    setActivePaymentAction(null)
    restorePaymentPosition()
  }

  const confirmPenaltyStatus = async () => {
    if (!activePaymentAction || updatingPenaltyId) return
    const { penaltyId, status } = activePaymentAction
    setUpdatingPenaltyId(penaltyId)
    try {
      await updatePenalty(penaltyId, status)
      notifyApp({ tone: 'success', message: status === 'paid' ? '这笔贡献已计入家庭基金。' : '这笔贡献已豁免。' })
      setActivePaymentAction(null)
      restorePaymentPosition()
    } catch {
      notifyApp({ tone: 'warning', message: '家庭基金操作失败，请检查网络后再试。' })
    } finally {
      setUpdatingPenaltyId('')
    }
  }

  const changeRuleDraft = (key: keyof typeof ruleDraft, value: number) => {
    setRuleDraft((current) => ({ ...current, [key]: Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0 }))
    setRuleMessage('')
  }

  const submitPenaltyRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (savingRule) return
    if (ruleDraft.max_amount < ruleDraft.base_amount) {
      setRuleMessage('封顶金额不能小于首日金额。')
      notifyApp({ tone: 'warning', message: '封顶金额不能小于首日金额。' })
      return
    }
    setSavingRule(true)
    try {
      const saved = await saveSettings(ruleDraft)
      setRuleDraft({
        base_amount: saved.base_amount,
        daily_increment: saved.daily_increment,
        max_amount: saved.max_amount,
      })
      setRuleMessage('规则已保存，只影响之后新生成的待贡献金额。')
      notifyApp({ tone: 'success', message: '贡献规则已保存。' })
    } catch {
      setRuleMessage('规则保存失败，请检查网络后再试。')
      notifyApp({ tone: 'warning', message: '规则保存失败，请检查网络后再试。' })
    } finally {
      setSavingRule(false)
    }
  }

  const changeExpenseDraft = (key: keyof ExpenseDraft, value: string) => {
    setExpenseDraft((current) => ({ ...current, [key]: value }))
  }

  const resetExpenseForm = () => {
    setEditingExpenseId('')
    setExpenseDraft(emptyExpenseDraft())
  }

  const startEditExpense = (expense: FundExpense) => {
    setEditingExpenseId(expense.id)
    setExpenseDraft({
      amount: String(expense.amount),
      note: expense.note ?? '',
      purpose: expense.purpose,
      spent_on: expense.spent_on,
      title: expense.title,
    })
  }

  const submitExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (savingExpense) return
    const amount = Math.round(Number(expenseDraft.amount))
    const title = expenseDraft.title.trim()
    if (!Number.isFinite(amount) || amount <= 0) {
      notifyApp({ tone: 'warning', message: '支出金额需要大于 0。' })
      return
    }
    if (!title) {
      notifyApp({ tone: 'warning', message: '请写一句支出用途。' })
      return
    }

    setSavingExpense(true)
    try {
      const payload = {
        amount,
        note: expenseDraft.note.trim(),
        purpose: expenseDraft.purpose,
        spent_on: expenseDraft.spent_on || toISODate(new Date()),
        title,
      }
      if (editingExpenseId) {
        await updateExpense(editingExpenseId, payload)
        notifyApp({ tone: 'success', message: '家庭基金支出已更新。' })
      } else {
        await addExpense(payload)
        notifyApp({ tone: 'success', message: '家庭基金支出已记录。' })
      }
      resetExpenseForm()
    } catch {
      notifyApp({ tone: 'warning', message: '支出保存失败，请检查网络后再试。' })
    } finally {
      setSavingExpense(false)
    }
  }

  const removeExpense = async (expenseId: string) => {
    if (savingExpense) return
    setSavingExpense(true)
    try {
      await deleteExpense(expenseId)
      notifyApp({ tone: 'success', message: '家庭基金支出已删除。' })
      if (editingExpenseId === expenseId) resetExpenseForm()
    } catch {
      notifyApp({ tone: 'warning', message: '支出删除失败，请检查网络后再试。' })
    } finally {
      setSavingExpense(false)
    }
  }

  return (
    <section className="screen with-nav payments-screen">
      <div className="page-title">
        <h2>家庭基金</h2>
        <p>缺卡贡献进入同一个家庭基金，用来买健身装备、AI TOKEN 和订阅。</p>
      </div>
      <MemberSelect loading={membersLoading} members={members} ready={membersReady} selectedMemberId={selectedMemberId} onChange={setSelectedMemberId} />
      <div className="metric-row four-col fund-metric-row">
        <Metric icon={<WalletCards />} label="基金余额" value={`¥${formatAmount(fundSummary.balance)}`} />
        <Metric icon={<ReceiptText />} label="待贡献" value={`¥${formatAmount(penaltySummary.pendingTotal)}`} />
        <Metric icon={<CheckCircle2 />} label="待确认" value={`${penaltySummary.reportedCount} 笔`} />
        <Metric icon={<CircleSlash />} label="已豁免" value={`¥${formatAmount(penaltySummary.waivedTotal)}`} />
      </div>

      <section className="status-card penalty-rule-card" aria-label="贡献规则设置">
        <div className="penalty-rule-head">
          <div>
            <strong>贡献规则</strong>
            <span>只影响之后新生成的缺卡贡献</span>
          </div>
        </div>
        <form className="penalty-rule-grid" onSubmit={(event) => void submitPenaltyRule(event)}>
          <label>
            首日金额
            <input
              max={9999}
              min={0}
              step={1}
              type="number"
              value={ruleDraft.base_amount}
              onChange={(event) => changeRuleDraft('base_amount', event.currentTarget.valueAsNumber)}
            />
          </label>
          <label>
            每天递增
            <input
              max={9999}
              min={0}
              step={1}
              type="number"
              value={ruleDraft.daily_increment}
              onChange={(event) => changeRuleDraft('daily_increment', event.currentTarget.valueAsNumber)}
            />
          </label>
          <label>
            单笔封顶
            <input
              max={9999}
              min={0}
              step={1}
              type="number"
              value={ruleDraft.max_amount}
              onChange={(event) => changeRuleDraft('max_amount', event.currentTarget.valueAsNumber)}
            />
          </label>
          <button type="submit" disabled={penaltySettingsLoading || savingRule}>
            {savingRule ? '保存中' : '保存规则'}
          </button>
        </form>
        <p className={ruleMessage ? ruleMessage.includes('失败') || ruleMessage.includes('不能') ? 'form-error penalty-rule-message' : 'form-success penalty-rule-message' : 'penalty-rule-message'} aria-live="polite">
          {ruleMessage || `当前：第 1 天 ¥${formatAmount(ruleDraft.base_amount)}，之后每天加 ¥${formatAmount(ruleDraft.daily_increment)}，最高 ¥${formatAmount(ruleDraft.max_amount)}。`}
        </p>
      </section>

      <section className="status-card fund-expense-card" aria-label="家庭基金支出">
        <div className="fund-section-head">
          <div>
            <strong>基金支出</strong>
            <span>已入账 ¥{formatAmount(fundSummary.paidTotal)} · 已支出 ¥{formatAmount(fundSummary.expenseTotal)}</span>
          </div>
          {fundExpensesLoading && <span className="mini-chip">同步中</span>}
        </div>
        <form className="fund-expense-form" onSubmit={(event) => void submitExpense(event)}>
          <label>
            金额
            <input
              min={1}
              step={1}
              type="number"
              value={expenseDraft.amount}
              onChange={(event) => changeExpenseDraft('amount', event.currentTarget.value)}
              placeholder="128"
            />
          </label>
          <label>
            用途
            <select value={expenseDraft.purpose} onChange={(event) => changeExpenseDraft('purpose', event.currentTarget.value)}>
              <option value="fitness">健身装备</option>
              <option value="ai">AI TOKEN / 订阅</option>
              <option value="general">通用</option>
            </select>
          </label>
          <label>
            日期
            <input type="date" value={expenseDraft.spent_on} onChange={(event) => changeExpenseDraft('spent_on', event.currentTarget.value)} />
          </label>
          <label>
            标题
            <input value={expenseDraft.title} onChange={(event) => changeExpenseDraft('title', event.currentTarget.value)} placeholder="AI 订阅" maxLength={40} />
          </label>
          <label className="fund-expense-note">
            备注
            <input value={expenseDraft.note} onChange={(event) => changeExpenseDraft('note', event.currentTarget.value)} placeholder="可不填" maxLength={120} />
          </label>
          <div className="fund-expense-actions">
            {editingExpenseId && (
              <button type="button" onClick={resetExpenseForm} disabled={savingExpense}>
                取消编辑
              </button>
            )}
            <button type="submit" disabled={savingExpense}>
              {savingExpense ? '保存中' : editingExpenseId ? '更新支出' : '记一笔支出'}
            </button>
          </div>
        </form>
        <div className="fund-expense-list">
          {fundExpenses.length === 0 && <p className="muted">还没有支出记录。家庭基金可以用于健身装备、AI TOKEN 和订阅。</p>}
          {fundExpenses.slice(0, 6).map((expense) => (
            <article className="fund-expense-item" key={expense.id}>
              <div>
                <strong>{expense.title}</strong>
                <span>{fundPurposeLabel[expense.purpose]} · ¥{formatAmount(expense.amount)} · {expense.spent_on}</span>
                {expense.note && <p>{expense.note}</p>}
              </div>
              <div className="fund-expense-item-actions">
                <button type="button" onClick={() => startEditExpense(expense)} disabled={savingExpense}>编辑</button>
                <button type="button" onClick={() => void removeExpense(expense.id)} disabled={savingExpense}>删除</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="payments-controls compact-payments-controls">
        <div className="payments-compact-summary" aria-live="polite">
          {compactStats}
        </div>
        <div className="payments-toolbar" aria-label="家庭基金筛选">
          <label>
            状态筛选
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">全部</option>
              <option value="pending">待贡献</option>
              <option value="payment_reported">等待入账</option>
              <option value="paid">已入账</option>
              <option value="waived">已豁免</option>
            </select>
          </label>
          <label>
            排序
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}>
              <option value="newest">最新优先</option>
              <option value="oldest">最早优先</option>
              <option value="amount-desc">金额降序</option>
            </select>
          </label>
        </div>
      </div>

      <div className="penalty-list payment-list">
        {visiblePenalties.length === 0 && <p className="muted">当前没有符合筛选条件的基金记录。</p>}
        {visiblePenalties.map((penalty) => {
          const displayName = memberNameById.get(penalty.user_id) || '成员'
          const action = activePaymentAction?.penaltyId === penalty.id ? activePaymentAction : null
          const canAct = penalty.status === 'pending' || penalty.status === 'payment_reported'
          return (
            <article className="penalty-card payment-card" data-penalty-id={penalty.id} key={penalty.id}>
              <div className="payment-copy">
                <strong>缺卡贡献 ¥{formatAmount(penalty.amount)}</strong>
                <span className="penalty-meta">{displayName} · {formatDay(penalty.date)} · 连续第 {penalty.consecutive_count} 天</span>
                {penalty.source_type === 'missed_checkin' && <span className="penalty-source-note">原因：缺卡</span>}
              </div>
              <div className="payment-status">
                <StatusPill status={penalty.status} />
              </div>
              {canAct && (
                <div className="row-actions payment-actions">
                  <button
                    type="button"
                    disabled={Boolean(updatingPenaltyId || (activePaymentAction && activePaymentAction.penaltyId !== penalty.id))}
                    onClick={(event) => requestPenaltyStatus(event, penalty.id, 'paid')}
                  >
                    确认入账
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(updatingPenaltyId || (activePaymentAction && activePaymentAction.penaltyId !== penalty.id))}
                    onClick={(event) => requestPenaltyStatus(event, penalty.id, 'waived')}
                  >
                    豁免
                  </button>
                </div>
              )}
              {action && (
                <div className="inline-confirm payment-inline-confirm">
                  <p>{action.status === 'paid' ? `确认把这笔 ¥${formatAmount(penalty.amount)} 计入家庭基金？` : '确认本次豁免，不计入家庭基金？'}</p>
                  <div>
                    <button type="button" onClick={cancelPenaltyStatus} disabled={Boolean(updatingPenaltyId)}>
                      取消
                    </button>
                    <button type="button" onClick={() => void confirmPenaltyStatus()} disabled={Boolean(updatingPenaltyId)}>
                      {updatingPenaltyId ? '处理中' : action.status === 'paid' ? '确认入账' : '确认豁免'}
                    </button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
