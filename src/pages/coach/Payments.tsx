import { CheckCircle2, ChevronDown, ChevronUp, CircleSlash, ReceiptText, Settings2, WalletCards } from 'lucide-react'
import type { FormEvent, MouseEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import MemberSelect from '../../components/MemberSelect'
import Metric from '../../components/Metric'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { useCoachData } from '../../hooks/useCoachData'
import { useDonationSettings } from '../../hooks/useDonationSettings'
import { useFundExpenses } from '../../hooks/useFundExpenses'
import { useMembers } from '../../hooks/useMembers'
import { usePenaltySettings } from '../../hooks/usePenaltySettings'
import { formatDay, toISODate } from '../../lib/date'
import { displayMemberLabel } from '../../lib/memberLabels'
import { notifyApp } from '../../lib/notice'
import { CHECK_IN_DEADLINE_OPTIONS } from '../../lib/penaltySettings'
import type { FundExpense, FundExpensePurpose, Penalty, PenaltySettings, PenaltyStatus } from '../../lib/types'

type PenaltyAction = {
  penaltyId: string
  status: 'paid' | 'waived'
}

type PaymentSortOrder = 'priority' | 'newest' | 'oldest' | 'amount-desc'

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

type RuleDraft = Pick<PenaltySettings, 'base_amount' | 'check_in_deadline' | 'daily_increment' | 'max_amount'>

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

function formatDonationTime(value?: string | null) {
  if (!value) return '未填写'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
  })
}

function formatPenaltyReason(penalty: Pick<Penalty, 'reason' | 'source_type'>) {
  const reason = penalty.reason?.trim()
  if (!reason || reason === 'missed_checkin') return penalty.source_type === 'missed_checkin' ? '缺卡' : '未填写'
  return reason
}

const penaltySortRank: Record<PenaltyStatus, number> = {
  payment_reported: 0,
  pending: 1,
  paid: 2,
  waived: 2,
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
  const {
    loading: donationSettingsLoading,
    saveSettings: saveDonationSettings,
    settings: donationSettings,
  } = useDonationSettings()
  const { addExpense, deleteExpense, expenses: fundExpenses, loading: fundExpensesLoading, updateExpense } = useFundExpenses(profile?.id)
  const { loading: penaltySettingsLoading, saveSettings, settings: penaltySettings } = usePenaltySettings()
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'payment_reported' | 'paid' | 'waived'>('all')
  const [sortOrder, setSortOrder] = useState<PaymentSortOrder>('priority')
  const [activePaymentAction, setActivePaymentAction] = useState<PenaltyAction | null>(null)
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(() => ({
    base_amount: penaltySettings.base_amount,
    check_in_deadline: penaltySettings.check_in_deadline,
    daily_increment: penaltySettings.daily_increment,
    max_amount: penaltySettings.max_amount,
  }))
  const [ruleMessage, setRuleMessage] = useState('')
  const [savingRule, setSavingRule] = useState(false)
  const [donationDraft, setDonationDraft] = useState(() => ({
    payment_hint: donationSettings.payment_hint,
    qr_image_url: donationSettings.qr_image_url,
  }))
  const [donationSettingsMessage, setDonationSettingsMessage] = useState('')
  const [savingDonationSettings, setSavingDonationSettings] = useState(false)
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>(() => emptyExpenseDraft())
  const [editingExpenseId, setEditingExpenseId] = useState('')
  const [expenseHistoryOpen, setExpenseHistoryOpen] = useState(false)
  const [fundSettingsOpen, setFundSettingsOpen] = useState(false)
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
      if (sortOrder === 'priority') {
        const priority = penaltySortRank[a.status] - penaltySortRank[b.status]
        if (priority !== 0) return priority
        return b.date.localeCompare(a.date)
      }
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
  const ledgerStats = [
    { label: '全部', value: membersReady ? scopedPenalties.length : '-' },
    { label: '待贡献', value: membersReady ? penaltySummary.pendingCount : '-' },
    { label: '待核对', value: membersReady ? penaltySummary.reportedCount : '-' },
    { label: '已处理', value: membersReady ? penaltySummary.settledCount : '-' },
  ]

  useEffect(() => {
    if (savingRule) return
    setRuleDraft({
      base_amount: penaltySettings.base_amount,
      check_in_deadline: penaltySettings.check_in_deadline,
      daily_increment: penaltySettings.daily_increment,
      max_amount: penaltySettings.max_amount,
    })
  }, [penaltySettings, savingRule])

  useEffect(() => {
    if (savingDonationSettings) return
    setDonationDraft({
      payment_hint: donationSettings.payment_hint,
      qr_image_url: donationSettings.qr_image_url,
    })
  }, [donationSettings, savingDonationSettings])

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

  const changeRuleAmount = (key: 'base_amount' | 'daily_increment' | 'max_amount', value: number) => {
    setRuleDraft((current) => ({ ...current, [key]: Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0 }))
    setRuleMessage('')
  }

  const changeRuleDeadline = (value: string) => {
    setRuleDraft((current) => ({ ...current, check_in_deadline: value }))
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
        check_in_deadline: saved.check_in_deadline,
        daily_increment: saved.daily_increment,
        max_amount: saved.max_amount,
      })
      setRuleMessage('规则已保存。')
      notifyApp({ tone: 'success', message: '规则已保存。' })
    } catch {
      setRuleMessage('规则保存失败，请检查网络后再试。')
      notifyApp({ tone: 'warning', message: '规则保存失败，请检查网络后再试。' })
    } finally {
      setSavingRule(false)
    }
  }

  const changeDonationDraft = (key: keyof typeof donationDraft, value: string) => {
    setDonationDraft((current) => ({ ...current, [key]: value }))
    setDonationSettingsMessage('')
  }

  const submitDonationSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (savingDonationSettings) return
    setSavingDonationSettings(true)
    try {
      const saved = await saveDonationSettings({
        payment_hint: donationDraft.payment_hint,
        qr_image_url: donationDraft.qr_image_url,
      })
      setDonationDraft({
        payment_hint: saved.payment_hint,
        qr_image_url: saved.qr_image_url,
      })
      setDonationSettingsMessage('收款码配置已保存，学生端会同步显示。')
      notifyApp({ tone: 'success', message: '收款码配置已保存。' })
    } catch {
      setDonationSettingsMessage('收款码配置保存失败，请检查网络后再试。')
      notifyApp({ tone: 'warning', message: '收款码配置保存失败。' })
    } finally {
      setSavingDonationSettings(false)
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
    setExpenseHistoryOpen(true)
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
      notifyApp({ tone: 'warning', message: '请填写支出标题。' })
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
      </div>
      <MemberSelect loading={membersLoading} members={members} ready={membersReady} selectedMemberId={selectedMemberId} onChange={setSelectedMemberId} />
      <div className="metric-row four-col fund-metric-row">
        <Metric icon={<WalletCards />} label="基金余额" value={`¥${formatAmount(fundSummary.balance)}`} />
        <Metric icon={<ReceiptText />} label="待贡献" value={`¥${formatAmount(penaltySummary.pendingTotal)}`} />
        <Metric icon={<CheckCircle2 />} label="待核对" value={`${penaltySummary.reportedCount} 笔`} />
        <Metric icon={<CircleSlash />} label="已豁免" value={`¥${formatAmount(penaltySummary.waivedTotal)}`} />
      </div>

      <div className="payments-controls compact-payments-controls">
        <div className="payments-stat-grid" aria-label="家庭基金记录统计" aria-live="polite">
          {ledgerStats.map((item) => (
            <div className="payments-stat-chip" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
        <div className="payments-toolbar" aria-label="家庭基金筛选">
          <label>
            状态筛选
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">全部</option>
              <option value="pending">待贡献</option>
              <option value="payment_reported">待核对</option>
              <option value="paid">已入账</option>
              <option value="waived">已豁免</option>
            </select>
          </label>
          <label>
            排序
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as PaymentSortOrder)}>
              <option value="priority">待处理优先</option>
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
          const penaltyReason = formatPenaltyReason(penalty)
          const action = activePaymentAction?.penaltyId === penalty.id ? activePaymentAction : null
          const canAct = penalty.status === 'pending' || penalty.status === 'payment_reported'
          return (
            <article className="penalty-card payment-card" data-penalty-id={penalty.id} key={penalty.id}>
              <div className="payment-copy">
                <div className="payment-amount-row">
                  <strong>¥{formatAmount(penalty.amount)}</strong>
                  <span>缺卡贡献</span>
                </div>
                <div className="payment-summary-grid" aria-label="账款摘要">
                  <span className="payment-summary-item">
                    <small>成员</small>
                    <strong>{displayName}</strong>
                  </span>
                  <span className="payment-summary-item">
                    <small>日期</small>
                    <strong>{formatDay(penalty.date)}</strong>
                  </span>
                  <span className="payment-summary-item">
                    <small>连续</small>
                    <strong>第 {penalty.consecutive_count} 天</strong>
                  </span>
                </div>
                <div className="payment-reason-box">
                  <small>原因</small>
                  <p>{penaltyReason}</p>
                </div>
                {penalty.status === 'payment_reported' && (
                  <div className="payment-report-note">
                    <strong>已报备</strong>
                    <span>{formatDonationTime(penalty.donation_reported_at)}</span>
                    {penalty.donation_note && <p>{penalty.donation_note}</p>}
                  </div>
                )}
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
                  <p>{action.status === 'paid' ? `确认入账 ¥${formatAmount(penalty.amount)}？` : '确认豁免？'}</p>
                  <div>
                    <button type="button" onClick={cancelPenaltyStatus} disabled={Boolean(updatingPenaltyId)}>
                      取消
                    </button>
                    <button type="button" onClick={() => void confirmPenaltyStatus()} disabled={Boolean(updatingPenaltyId)}>
                      {updatingPenaltyId ? '处理中' : '确认'}
                    </button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>

      <section className="fund-settings-panel" aria-label="基金设置">
        <button
          aria-expanded={fundSettingsOpen}
          className="fund-settings-toggle"
          type="button"
          onClick={() => setFundSettingsOpen((open) => !open)}
        >
          <span className="fund-settings-toggle-copy">
            <Settings2 aria-hidden="true" size={18} />
            <span>
              <strong>基金设置</strong>
              <small>贡献规则 / 打卡截止 / 收款码</small>
            </span>
          </span>
          {fundSettingsOpen ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
        </button>
        {fundSettingsOpen && (
          <div className="fund-settings-body">
            <section className="status-card penalty-rule-card" aria-label="贡献规则设置">
              <div className="penalty-rule-head">
                <div>
                  <strong>贡献规则</strong>
                  <span>打卡截止 {ruleDraft.check_in_deadline}</span>
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
                    onChange={(event) => changeRuleAmount('base_amount', event.currentTarget.valueAsNumber)}
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
                    onChange={(event) => changeRuleAmount('daily_increment', event.currentTarget.valueAsNumber)}
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
                    onChange={(event) => changeRuleAmount('max_amount', event.currentTarget.valueAsNumber)}
                  />
                </label>
                <fieldset className="check-in-deadline-field">
                  <legend>打卡截止</legend>
                  <div className="check-in-deadline-options" role="group" aria-label="打卡截止时间">
                    {CHECK_IN_DEADLINE_OPTIONS.map((time) => (
                      <button
                        aria-pressed={ruleDraft.check_in_deadline === time}
                        className={ruleDraft.check_in_deadline === time ? 'active' : ''}
                        key={time}
                        type="button"
                        onClick={() => changeRuleDeadline(time)}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <button type="submit" disabled={penaltySettingsLoading || savingRule}>
                  {savingRule ? '保存中' : '保存规则'}
                </button>
              </form>
              <p className={ruleMessage ? ruleMessage.includes('失败') || ruleMessage.includes('不能') ? 'form-error penalty-rule-message' : 'form-success penalty-rule-message' : 'penalty-rule-message'} aria-live="polite">
                {ruleMessage || `第 1 天 ¥${formatAmount(ruleDraft.base_amount)} · 每天 +¥${formatAmount(ruleDraft.daily_increment)} · 封顶 ¥${formatAmount(ruleDraft.max_amount)} · 截止 ${ruleDraft.check_in_deadline}`}
              </p>
            </section>

            <section className="status-card donation-settings-card" aria-label="收款码配置">
              <div className="fund-section-head">
                <div>
                  <strong>收款码配置</strong>
                  <span>{donationDraft.qr_image_url ? '已配置' : '待配置'}</span>
                </div>
                {donationSettingsLoading && <span className="mini-chip">同步中</span>}
              </div>
              <form className="donation-settings-form" onSubmit={(event) => void submitDonationSettings(event)}>
                <label>
                  收款码图片地址
                  <input
                    value={donationDraft.qr_image_url}
                    onChange={(event) => changeDonationDraft('qr_image_url', event.currentTarget.value)}
                    placeholder="https://..."
                    disabled={savingDonationSettings}
                  />
                </label>
                <label className="donation-settings-hint">
                  学生端提示
                  <textarea
                    maxLength={180}
                    rows={3}
                    value={donationDraft.payment_hint}
                    onChange={(event) => changeDonationDraft('payment_hint', event.currentTarget.value)}
                    disabled={savingDonationSettings}
                  />
                </label>
                <button type="submit" disabled={savingDonationSettings}>
                  {savingDonationSettings ? '保存中' : '保存配置'}
                </button>
              </form>
              {donationDraft.qr_image_url ? (
                <div className="donation-settings-preview">
                  <img src={donationDraft.qr_image_url} alt="收款码预览" />
                  <span>收款码预览</span>
                </div>
              ) : (
                <p className="muted">收款码待配置。</p>
              )}
              {donationSettingsMessage && (
                <p className={donationSettingsMessage.includes('失败') ? 'form-error donation-settings-message' : 'form-success donation-settings-message'} aria-live="polite">
                  {donationSettingsMessage}
                </p>
              )}
            </section>

            <section className="status-card fund-expense-card" aria-label="家庭基金支出">
              <div className="fund-section-head">
                <div>
                  <strong>支出记录</strong>
                  <span>入账 ¥{formatAmount(fundSummary.paidTotal)} · 支出 ¥{formatAmount(fundSummary.expenseTotal)} · 余额 ¥{formatAmount(fundSummary.balance)}</span>
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
                  <input value={expenseDraft.title} onChange={(event) => changeExpenseDraft('title', event.currentTarget.value)} placeholder="例如：AI 订阅" maxLength={40} />
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
                    {savingExpense ? '保存中' : editingExpenseId ? '更新支出' : '记支出'}
                  </button>
                </div>
              </form>
              <div className="fund-expense-history">
                <div className="fund-expense-history-summary">
                  <div>
                    <strong>支出明细</strong>
                    <span>{fundExpenses.length} 笔 · ¥{formatAmount(fundSummary.expenseTotal)}</span>
                  </div>
                  <button
                    aria-expanded={expenseHistoryOpen}
                    type="button"
                    className="fund-expense-toggle"
                    disabled={fundExpenses.length === 0}
                    onClick={() => setExpenseHistoryOpen((open) => !open)}
                  >
                    {expenseHistoryOpen ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                    {expenseHistoryOpen ? '收起' : '展开'}
                  </button>
                </div>
                {fundExpenses.length === 0 && <p className="muted">暂无支出。</p>}
                {expenseHistoryOpen && fundExpenses.length > 0 && (
                  <div className="fund-expense-list">
                    {fundExpenses.map((expense) => (
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
                )}
              </div>
            </section>
          </div>
        )}
      </section>
    </section>
  )
}
