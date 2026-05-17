import { CheckCircle2, CircleSlash, ReceiptText } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import MemberSelect from '../../components/MemberSelect'
import Metric from '../../components/Metric'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { useCoachData } from '../../hooks/useCoachData'
import { useMembers } from '../../hooks/useMembers'
import { formatDay } from '../../lib/date'
import { displayMemberLabel } from '../../lib/memberLabels'
import { notifyApp } from '../../lib/notice'

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'waived'>('all')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'amount-desc'>('newest')
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
          } else {
            summary.settledCount += 1
            if (penalty.status === 'paid') summary.paidTotal += amount
            if (penalty.status === 'waived') summary.waivedTotal += amount
          }
          return summary
        },
        { paidTotal: 0, pendingCount: 0, pendingTotal: 0, settledCount: 0, waivedTotal: 0 },
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

  const setPenaltyStatus = async (penaltyId: string, status: 'paid' | 'waived', displayName: string, date: string) => {
    if (updatingPenaltyIdRef.current) return
    const actionLabel = status === 'paid' ? '标记为已付' : '豁免'
    if (!window.confirm(`确认将 ${displayName} 在 ${formatDay(date)} 的账款${actionLabel}？`)) return
    updatingPenaltyIdRef.current = penaltyId
    setUpdatingPenaltyId(penaltyId)
    try {
      await updatePenalty(penaltyId, status)
      notifyApp({ tone: 'success', message: status === 'paid' ? '账款已标记为已付。' : '账款已豁免。' })
    } catch {
      notifyApp({ tone: 'warning', message: '账款操作失败，请检查网络后再试。' })
    } finally {
      updatingPenaltyIdRef.current = ''
      setUpdatingPenaltyId('')
    }
  }

  return (
    <section className="screen with-nav">
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
      <div className="status-card action-card">
        <strong>{membersReady ? `${visiblePenalties.length} 条当前记录` : '正在同步成员'}</strong>
        <p>{membersReady ? `${scopeLabel}：${penaltySummary.pendingCount} 条待支付，${penaltySummary.settledCount} 条已处理；筛选只影响下方列表。` : '成员列表稳定后再显示账款记录。'}</p>
      </div>
      <div className="form-grid">
        <label>
          状态筛选
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="all">全部</option>
            <option value="pending">待支付</option>
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
      <div className="penalty-list">
        {visiblePenalties.length === 0 && <p className="muted">当前没有符合筛选条件的罚款记录。</p>}
        {visiblePenalties.map((penalty) => {
          const displayName = memberNameById.get(penalty.user_id) || '成员'
          return (
            <article className="penalty-card" key={penalty.id}>
              <div>
                <strong>¥{formatAmount(penalty.amount)}</strong>
                <span>{displayName} · {formatDay(penalty.date)} · 连续第 {penalty.consecutive_count} 天</span>
              </div>
              <StatusPill status={penalty.status} />
              <div className="row-actions">
                <button
                  type="button"
                  disabled={Boolean(updatingPenaltyId)}
                  onClick={() => void setPenaltyStatus(penalty.id, 'paid', displayName, penalty.date)}
                >
                  {updatingPenaltyId === penalty.id ? '处理中' : '标记已付'}
                </button>
                <button
                  type="button"
                  disabled={Boolean(updatingPenaltyId)}
                  onClick={() => void setPenaltyStatus(penalty.id, 'waived', displayName, penalty.date)}
                >
                  豁免
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
