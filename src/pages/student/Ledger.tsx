import type { FormEvent } from 'react'
import { useMemo, useState } from 'react'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { useCheckIns } from '../../hooks/useCheckIns'
import { useDonationSettings } from '../../hooks/useDonationSettings'
import { useFundExpenses } from '../../hooks/useFundExpenses'
import { usePenalties } from '../../hooks/usePenalties'
import { formatDay } from '../../lib/date'
import { notifyApp } from '../../lib/notice'
import type { FundExpensePurpose, Penalty } from '../../lib/types'

const WAIVER_PREFIX = '[免罚申请]'
const waiverReasonTemplates = [
  '实在太忙忘记打卡了，已经完成训练。',
  '身体不舒服，请求这次免罚。',
  '不会操作软件，其实训练已经做完了。',
]

const fundPurposeLabel: Record<FundExpensePurpose, string> = {
  ai: 'AI TOKEN / 订阅',
  fitness: '健身装备',
  general: '通用',
}

function toDateTimeLocalValue(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 16)
}

function toDonationIso(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function formatDonationTime(value?: string | null) {
  if (!value) return ''
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

export default function Ledger() {
  const { profile } = useAuth()
  const { penalties, updatePenalty } = usePenalties(profile?.id)
  const { checkIns, upsertCheckIn } = useCheckIns(profile?.id)
  const { settings: donationSettings } = useDonationSettings()
  const { expenses: fundExpenses } = useFundExpenses()
  const [donationTargetId, setDonationTargetId] = useState('')
  const [donationTime, setDonationTime] = useState(() => toDateTimeLocalValue())
  const [donationNote, setDonationNote] = useState('')
  const [submittingDonation, setSubmittingDonation] = useState(false)
  const [waiverTargetId, setWaiverTargetId] = useState('')
  const [waiverReason, setWaiverReason] = useState('')
  const [submittingWaiver, setSubmittingWaiver] = useState(false)
  const pendingTotal = penalties.filter((item) => item.status === 'pending').reduce((sum, item) => sum + item.amount, 0)
  const reported = penalties.filter((item) => item.status === 'payment_reported').length
  const settled = penalties.filter((item) => item.status === 'paid' || item.status === 'waived').length
  const paidTotal = penalties.filter((item) => item.status === 'paid').reduce((sum, item) => sum + item.amount, 0)
  const expenseTotal = fundExpenses.reduce((sum, item) => sum + item.amount, 0)
  const formatAmount = (amount: number) => (Number.isInteger(amount) ? `${amount}` : amount.toFixed(2))
  const checkInByDate = useMemo(() => new Map(checkIns.map((item) => [item.date, item])), [checkIns])

  const openDonationConfirm = (penalty: Penalty) => {
    setDonationTargetId(penalty.id)
    setDonationTime(toDateTimeLocalValue())
    setDonationNote('')
    setWaiverTargetId('')
    setWaiverReason('')
  }

  const closeDonationConfirm = () => {
    if (submittingDonation) return
    setDonationTargetId('')
    setDonationTime(toDateTimeLocalValue())
    setDonationNote('')
  }

  const submitDonationConfirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const donationTarget = penalties.find((penalty) => penalty.id === donationTargetId) ?? null
    if (!donationTarget || submittingDonation) return
    const donationReportedAt = toDonationIso(donationTime)
    if (!donationReportedAt) {
      notifyApp({ tone: 'warning', message: '请填写有效的捐赠时间。' })
      return
    }
    setSubmittingDonation(true)
    try {
      await updatePenalty(donationTarget.id, {
        donation_note: donationNote.trim() || null,
        donation_reported_at: donationReportedAt,
        status: 'payment_reported',
      })
      notifyApp({ tone: 'success', message: '已确认捐赠，等待管理端核对入账。' })
      closeDonationConfirm()
    } catch {
      notifyApp({ tone: 'warning', message: '捐赠确认失败，请检查网络后再试。' })
    } finally {
      setSubmittingDonation(false)
    }
  }

  const openWaiverRequest = (penalty: Penalty) => {
    setWaiverTargetId(penalty.id)
    setWaiverReason('')
    setDonationTargetId('')
    setDonationNote('')
  }

  const closeWaiverRequest = () => {
    if (submittingWaiver) return
    setWaiverTargetId('')
    setWaiverReason('')
  }

  const submitWaiverRequest = async () => {
    const waiverTarget = penalties.find((penalty) => penalty.id === waiverTargetId) ?? null
    if (!profile || !waiverTarget || submittingWaiver) return
    const reason = waiverReason.trim()
    if (!reason) {
      notifyApp({ tone: 'warning', message: '先写一句免罚理由，管理端才好审核。' })
      return
    }

    const existingCheckIn = checkInByDate.get(waiverTarget.date)
    if (existingCheckIn && existingCheckIn.status !== 'missed') {
      notifyApp({ tone: 'warning', message: '这天的记录状态已变化，请刷新账本后再申请。' })
      closeWaiverRequest()
      return
    }

    setSubmittingWaiver(true)
    try {
      await upsertCheckIn({
        id: existingCheckIn?.id,
        user_id: profile.id,
        plan_id: existingCheckIn?.plan_id ?? null,
        date: waiverTarget.date,
        status: 'pending_review',
        fatigue: existingCheckIn?.fatigue ?? null,
        issues: existingCheckIn?.issues ?? [],
        note: existingCheckIn?.note || '补卡免罚申请，等待管理端审核。',
        leave_reason: `${WAIVER_PREFIX} ${reason}`,
      })
      notifyApp({ tone: 'success', message: '已提交免罚申请，等待管理端审核。' })
      closeWaiverRequest()
    } catch {
      notifyApp({ tone: 'warning', message: '免罚申请提交失败，请检查网络后再试。' })
    } finally {
      setSubmittingWaiver(false)
    }
  }

  return (
    <section className="screen with-nav">
      <div className="hero-panel">
        <span className="hero-kicker">家庭基金</span>
        <h2>待贡献 ¥{formatAmount(pendingTotal)}</h2>
      </div>
      <div className="status-card action-card ledger-fund-summary">
        <strong>已入账 ¥{formatAmount(paidTotal)} · 已用于 ¥{formatAmount(expenseTotal)}</strong>
        <p>待核对 {reported} 笔 · 已处理 {settled} 条</p>
      </div>
      {fundExpenses.length > 0 && (
        <div className="status-card ledger-expense-preview">
          <strong>基金使用记录</strong>
          <div className="ledger-expense-list">
            {fundExpenses.slice(0, 3).map((expense) => (
              <span key={expense.id}>
                {expense.title} · {fundPurposeLabel[expense.purpose]} · ¥{formatAmount(expense.amount)}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="penalty-list">
        {penalties.length === 0 && <p className="muted">暂无待贡献记录。请假和今日休息不会生成家庭基金贡献。</p>}
        {penalties.map((penalty) => {
          const checkIn = checkInByDate.get(penalty.date)
          const isWaiverPending = penalty.status === 'pending' && checkIn?.status === 'pending_review'
          const canRequestWaiver = penalty.status === 'pending' && checkIn?.status === 'missed'
          const isDonationOpen = donationTargetId === penalty.id
          const isWaiverOpen = waiverTargetId === penalty.id
          return (
            <article className={`penalty-card${isWaiverPending ? ' waiver-under-review' : ''}`} key={penalty.id}>
              <div className="penalty-copy">
                <strong>缺卡贡献 ¥{formatAmount(penalty.amount)}</strong>
                <span className="penalty-meta">{formatDay(penalty.date)} · 连续第 {penalty.consecutive_count} 天</span>
                {penalty.source_type === 'missed_checkin' && <span className="penalty-source-note">原因：缺卡</span>}
                {isWaiverPending && <span className="waiver-inline-note">免罚申请已提交，先等管理端审核。</span>}
                {penalty.status === 'payment_reported' && <span className="waiver-inline-note">已确认捐赠，等待管理端核对。</span>}
                {penalty.donation_reported_at && (
                  <span className="waiver-inline-note">捐赠时间：{formatDonationTime(penalty.donation_reported_at)}</span>
                )}
                {penalty.donation_note && <span className="waiver-inline-note">备注：{penalty.donation_note}</span>}
                {checkIn?.review_comment && (
                  <div className="coach-comment-box ledger-comment-box">
                    <strong>教练留言</strong>
                    <p>{checkIn.review_comment}</p>
                  </div>
                )}
              </div>
              <StatusPill status={penalty.status} />
              {penalty.status === 'pending' && (
                <div className="row-actions">
                  <button type="button" onClick={() => openDonationConfirm(penalty)} disabled={submittingDonation}>
                    确认已捐赠
                  </button>
                  {canRequestWaiver && (
                    <button type="button" onClick={() => openWaiverRequest(penalty)}>
                      申请免罚
                    </button>
                  )}
                  {isWaiverPending && <button type="button" disabled>免罚审核中</button>}
                </div>
              )}
              {isDonationOpen && (
                <form className="inline-confirm ledger-donation-inline" onSubmit={(event) => void submitDonationConfirm(event)}>
                  <div className="ledger-donation-paybox">
                    {donationSettings.qr_image_url ? (
                      <img src={donationSettings.qr_image_url} alt="家庭基金收款码" />
                    ) : (
                      <div className="ledger-donation-qr-placeholder">收款码待配置</div>
                    )}
                    <div>
                      <strong>本次捐赠 ¥{formatAmount(penalty.amount)}</strong>
                      <p>{donationSettings.payment_hint}</p>
                    </div>
                  </div>
                  <label>
                    捐赠时间
                    <input
                      type="datetime-local"
                      value={donationTime}
                      onChange={(event) => setDonationTime(event.currentTarget.value)}
                      disabled={submittingDonation}
                      required
                    />
                  </label>
                  <label>
                    简单备注
                    <textarea
                      maxLength={120}
                      rows={3}
                      value={donationNote}
                      onChange={(event) => setDonationNote(event.currentTarget.value)}
                      disabled={submittingDonation}
                      placeholder="比如：刚扫了微信，时间是现在。"
                    />
                  </label>
                  <div>
                    <button type="button" onClick={closeDonationConfirm} disabled={submittingDonation}>
                      取消
                    </button>
                    <button type="submit" disabled={submittingDonation}>
                      {submittingDonation ? '提交中' : '提交核对'}
                    </button>
                  </div>
                </form>
              )}
              {isWaiverOpen && (
                <div className="inline-confirm ledger-waiver-inline">
                  <p>{formatDay(penalty.date)} 的免罚申请</p>
                  <div className="waiver-template-grid">
                    {waiverReasonTemplates.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setWaiverReason(reason)}
                        disabled={submittingWaiver}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  <label>
                    申请理由
                    <textarea
                      maxLength={160}
                      rows={4}
                      value={waiverReason}
                      onChange={(event) => setWaiverReason(event.target.value)}
                      disabled={submittingWaiver}
                      placeholder="比如：昨天练完忘记打卡了，请帮我审核一下。"
                    />
                  </label>
                  <div>
                    <button type="button" onClick={closeWaiverRequest} disabled={submittingWaiver}>
                      取消
                    </button>
                    <button type="button" onClick={() => void submitWaiverRequest()} disabled={submittingWaiver}>
                      {submittingWaiver ? '提交中' : '提交申请'}
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
