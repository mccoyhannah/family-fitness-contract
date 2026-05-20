import { useMemo, useState } from 'react'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { useCheckIns } from '../../hooks/useCheckIns'
import { usePenalties } from '../../hooks/usePenalties'
import { formatDay } from '../../lib/date'
import { notifyApp } from '../../lib/notice'
import type { Penalty } from '../../lib/types'

const WAIVER_PREFIX = '[免罚申请]'
const waiverReasonTemplates = [
  '实在太忙忘记打卡了，已经完成训练。',
  '身体不舒服，请求这次免罚。',
  '不会操作软件，其实训练已经做完了。',
]

export default function Ledger() {
  const { profile } = useAuth()
  const { penalties, updatePenalty } = usePenalties(profile?.id)
  const { checkIns, upsertCheckIn } = useCheckIns(profile?.id)
  const [waiverTarget, setWaiverTarget] = useState<Penalty | null>(null)
  const [waiverReason, setWaiverReason] = useState('')
  const [submittingWaiver, setSubmittingWaiver] = useState(false)
  const total = penalties.filter((item) => item.status === 'pending').reduce((sum, item) => sum + item.amount, 0)
  const reported = penalties.filter((item) => item.status === 'payment_reported').length
  const settled = penalties.filter((item) => item.status === 'paid' || item.status === 'waived').length
  const formatAmount = (amount: number) => (Number.isInteger(amount) ? `${amount}` : amount.toFixed(2))
  const checkInByDate = useMemo(() => new Map(checkIns.map((item) => [item.date, item])), [checkIns])

  const markPaid = async (penaltyId: string) => {
    try {
      await updatePenalty(penaltyId, 'payment_reported')
      notifyApp({ tone: 'success', message: '已提交付款确认，等管理端核对后才会变成已支付。' })
    } catch {
      notifyApp({ tone: 'warning', message: '付款确认失败，请检查网络后再试。' })
    }
  }

  const openWaiverRequest = (penalty: Penalty) => {
    setWaiverTarget(penalty)
    setWaiverReason('')
  }

  const closeWaiverRequest = () => {
    if (submittingWaiver) return
    setWaiverTarget(null)
    setWaiverReason('')
  }

  const submitWaiverRequest = async () => {
    if (!profile || !waiverTarget || submittingWaiver) return
    const reason = waiverReason.trim()
    if (!reason) {
      notifyApp({ tone: 'warning', message: '先写一句免罚理由，管理端才好审核。' })
      return
    }

    const existingCheckIn = checkInByDate.get(waiverTarget.date)
    if (existingCheckIn && existingCheckIn.status !== 'missed') {
      notifyApp({ tone: 'warning', message: '这天的记录状态已变化，请刷新账本后再申请。' })
      setWaiverTarget(null)
      setWaiverReason('')
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
      setWaiverTarget(null)
      setWaiverReason('')
    } catch {
      notifyApp({ tone: 'warning', message: '免罚申请提交失败，请检查网络后再试。' })
    } finally {
      setSubmittingWaiver(false)
    }
  }

  return (
    <section className="screen with-nav">
      <div className="hero-panel">
        <span className="hero-kicker">账本</span>
        <h2>待支付 ¥{formatAmount(total)}</h2>
        <p>v2 先保留账本，不做微信收款码付款页。</p>
      </div>
      <div className="status-card action-card">
        <strong>{penalties.length} 条账款记录</strong>
        <p>{reported} 笔付款待管理端确认，{settled} 条已处理；如已线下付款，可先点“我已付款”。</p>
      </div>
      <div className="penalty-list">
        {penalties.length === 0 && <p className="muted">暂无罚款记录。请假不会生成待支付罚款。</p>}
        {penalties.map((penalty) => {
          const checkIn = checkInByDate.get(penalty.date)
          const isWaiverPending = penalty.status === 'pending' && checkIn?.status === 'pending_review'
          const canRequestWaiver = penalty.status === 'pending' && checkIn?.status === 'missed'
          return (
            <article className={`penalty-card${isWaiverPending ? ' waiver-under-review' : ''}`} key={penalty.id}>
              <div className="penalty-copy">
                <strong>¥{formatAmount(penalty.amount)}</strong>
                <span className="penalty-meta">{formatDay(penalty.date)} · 连续第 {penalty.consecutive_count} 天</span>
                {penalty.source_type === 'missed_checkin' && <span className="penalty-source-note">原因：缺卡自动生成</span>}
                {isWaiverPending && <span className="waiver-inline-note">免罚申请已提交，先等管理端审核。</span>}
                {penalty.status === 'payment_reported' && <span className="waiver-inline-note">付款已上报，等待管理端确认。</span>}
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
                  <button type="button" onClick={() => void markPaid(penalty.id)}>我已付款</button>
                  {canRequestWaiver && (
                    <button type="button" onClick={() => openWaiverRequest(penalty)}>
                      申请免罚
                    </button>
                  )}
                  {isWaiverPending && <button type="button" disabled>免罚审核中</button>}
                </div>
              )}
            </article>
          )
        })}
      </div>
      {waiverTarget && (
        <div className="waiver-modal-backdrop" role="presentation">
          <section className="waiver-modal" role="dialog" aria-modal="true" aria-labelledby="waiver-title">
            <div>
              <span className="hero-kicker">补卡免罚</span>
              <h3 id="waiver-title">{formatDay(waiverTarget.date)} 的免罚申请</h3>
              <p>选一个理由，或自己写一句。提交后会进入管理端审核，罚金不会被你自己直接免掉。</p>
            </div>
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
            <div className="waiver-modal-actions">
              <button type="button" onClick={closeWaiverRequest} disabled={submittingWaiver}>
                取消
              </button>
              <button type="button" onClick={() => void submitWaiverRequest()} disabled={submittingWaiver}>
                {submittingWaiver ? '提交中' : '提交申请'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
