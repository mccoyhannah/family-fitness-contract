import { CheckCircle2, CircleSlash, ReceiptText } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import MemberSelect from '../../components/MemberSelect'
import Metric from '../../components/Metric'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { useCoachData } from '../../hooks/useCoachData'
import { useMembers } from '../../hooks/useMembers'
import { formatDay } from '../../lib/date'
import { displayMemberLabel } from '../../lib/memberLabels'
import { notifyApp } from '../../lib/notice'

type PenaltyConfirmRequest = {
  date: string
  displayName: string
  message: string
  penaltyId: string
  status: 'paid' | 'waived'
  successMessage: string
  title: string
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'payment_reported' | 'paid' | 'waived'>('all')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'amount-desc'>('newest')
  const [confirmRequest, setConfirmRequest] = useState<PenaltyConfirmRequest | null>(null)
  const modalRef = useRef<HTMLElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [updatingPenaltyId, setUpdatingPenaltyId] = useState('')
  const updatingPenaltyIdRef = useRef('')
  const scopedPenalties = useMemo(
    () => membersReady ? selectedMember ? penalties.filter((penalty) => penalty.user_id === selectedMember.id) : penalties : [],
    [membersReady, penalties, selectedMember],
  )
  const memberNameById = new Map(members.map((member) => [member.id, displayMemberLabel(member)]))
  const scopeLabel = selectedMember ? `${displayMemberLabel(selectedMember)}口径` : '全员口径'
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
            if (penalty.status === 'paid') summary.paidTotal += amount
            if (penalty.status === 'waived') summary.waivedTotal += amount
          }
          return summary
        },
        { paidTotal: 0, pendingCount: 0, pendingTotal: 0, reportedCount: 0, settledCount: 0, waivedTotal: 0 },
      ),
    [scopedPenalties],
  )
  const visiblePenalties = useMemo(() => {
    const filtered = statusFilter === 'all' ? scopedPenalties : scopedPenalties.filter((penalty) => penalty.status === statusFilter)
    return filtered.slice().sort((a, b) => {
      if (sortOrder === 'oldest') return a.date.localeCompare(b.date)
      if (sortOrder === 'amount-desc') return b.amount - a.amount || b.date.localeCompare(a.date)
      return b.date.localeCompare(a.date)
    })
  }, [scopedPenalties, sortOrder, statusFilter])
  const formatAmount = (amount: number) => (Number.isInteger(amount) ? `${amount}` : amount.toFixed(2))

  useEffect(() => {
    if (!confirmRequest) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () =>
      Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute('disabled'))

    window.setTimeout(() => {
      const elements = focusable()
      elements[elements.length - 1]?.focus()
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!updatingPenaltyIdRef.current) setConfirmRequest(null)
        return
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (elements.length === 0) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
    }
  }, [confirmRequest])

  const requestPenaltyStatus = (penaltyId: string, status: 'paid' | 'waived', displayName: string, date: string) => {
    if (updatingPenaltyIdRef.current || confirmRequest) return
    const actionCopy =
      status === 'paid'
        ? {
            message: `确认将 ${displayName} 在 ${formatDay(date)} 的账款标记为已付？`,
            successMessage: '账款已标记为已付。',
            title: '确认已收到付款？',
          }
        : {
            message: `确认豁免 ${displayName} 在 ${formatDay(date)} 的这笔账款？`,
            successMessage: '账款已豁免。',
            title: '确认豁免账款？',
          }
    setConfirmRequest({ date, displayName, penaltyId, status, ...actionCopy })
  }

  const cancelPenaltyStatus = () => {
    if (updatingPenaltyIdRef.current) return
    setConfirmRequest(null)
  }

  const confirmPenaltyStatus = async () => {
    if (!confirmRequest || updatingPenaltyIdRef.current) return
    const { penaltyId, status, successMessage } = confirmRequest
    updatingPenaltyIdRef.current = penaltyId
    setUpdatingPenaltyId(penaltyId)
    try {
      await updatePenalty(penaltyId, status)
      notifyApp({ tone: 'success', message: successMessage })
      setConfirmRequest(null)
    } catch {
      notifyApp({ tone: 'warning', message: '账款操作失败，请检查网络后再试。' })
    } finally {
      updatingPenaltyIdRef.current = ''
      setUpdatingPenaltyId('')
    }
  }

  return (
    <section className="screen with-nav payments-screen">
      <div className="page-title">
        <h2>账款列表</h2>
        <p>按当前成员查看欠款，教练可标记已支付或豁免。</p>
      </div>
      <MemberSelect loading={membersLoading} members={members} ready={membersReady} selectedMemberId={selectedMemberId} onChange={setSelectedMemberId} />
      <div className="metric-row three-col">
        <Metric icon={<ReceiptText />} label="待支付" value={`¥${formatAmount(penaltySummary.pendingTotal)}`} />
        <Metric icon={<CheckCircle2 />} label="已支付" value={`¥${formatAmount(penaltySummary.paidTotal)}`} />
        <Metric icon={<CircleSlash />} label="已豁免" value={`¥${formatAmount(penaltySummary.waivedTotal)}`} />
      </div>
      <div className="payments-controls">
        <div className="status-card action-card payments-summary">
          <strong>{membersReady ? `${visiblePenalties.length} 条当前记录` : '正在同步成员'}</strong>
          <p>{membersReady ? `${scopeLabel}：${penaltySummary.pendingCount} 条待支付，${penaltySummary.reportedCount} 笔付款待确认，${penaltySummary.settledCount} 条已处理；筛选只影响下方列表。` : '成员列表稳定后再显示账款记录。'}</p>
        </div>
        <div className="payments-toolbar" aria-label="账款筛选">
          <label>
            状态筛选
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">全部</option>
              <option value="pending">待支付</option>
              <option value="payment_reported">付款待确认</option>
              <option value="paid">已付</option>
              <option value="waived">豁免</option>
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
        {visiblePenalties.length === 0 && <p className="muted">当前没有符合筛选条件的罚款记录。</p>}
        {visiblePenalties.map((penalty) => {
          const displayName = memberNameById.get(penalty.user_id) || '成员'
          return (
            <article className="penalty-card payment-card" key={penalty.id}>
              <div className="payment-copy">
                <strong>¥{formatAmount(penalty.amount)}</strong>
                <span className="penalty-meta">{displayName} · {formatDay(penalty.date)} · 连续第 {penalty.consecutive_count} 天</span>
                {penalty.source_type === 'missed_checkin' && <span className="penalty-source-note">原因：缺卡自动生成</span>}
              </div>
              <div className="payment-status">
                <StatusPill status={penalty.status} />
              </div>
              <div className="row-actions payment-actions">
                <button
                  type="button"
                  disabled={Boolean(updatingPenaltyId || confirmRequest)}
                  onClick={() => requestPenaltyStatus(penalty.id, 'paid', displayName, penalty.date)}
                >
                  {updatingPenaltyId === penalty.id ? '处理中' : penalty.status === 'payment_reported' ? '确认已收' : '标记已付'}
                </button>
                <button
                  type="button"
                  disabled={Boolean(updatingPenaltyId || confirmRequest)}
                  onClick={() => requestPenaltyStatus(penalty.id, 'waived', displayName, penalty.date)}
                >
                  豁免
                </button>
              </div>
            </article>
          )
        })}
      </div>
      {confirmRequest && (
        <div className="waiver-modal-backdrop" role="presentation">
          <section
            className="waiver-modal review-confirm-modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-confirm-title"
          >
            <div>
              <span className="hero-kicker">账款确认</span>
              <h3 id="payment-confirm-title">{confirmRequest.title}</h3>
              <p>{confirmRequest.message}</p>
            </div>
            <div className="waiver-modal-actions">
              <button type="button" onClick={cancelPenaltyStatus} disabled={Boolean(updatingPenaltyId)}>
                取消
              </button>
              <button type="button" onClick={() => void confirmPenaltyStatus()} disabled={Boolean(updatingPenaltyId)}>
                {updatingPenaltyId ? '处理中' : '确认操作'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
