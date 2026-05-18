import { AlertTriangle, BarChart3, CalendarDays, ReceiptText, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import MemberSelect from '../../components/MemberSelect'
import Metric from '../../components/Metric'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { useCoachData } from '../../hooks/useCoachData'
import { useMembers } from '../../hooks/useMembers'
import { usePlans } from '../../hooks/usePlans'
import { formatDay, isPastDeadline } from '../../lib/date'
import { displayMemberLabel } from '../../lib/memberLabels'
import type { CheckInStatus } from '../../lib/types'

type RecentRecord = {
  id: string
  date: string
  detail: string
  status: CheckInStatus
}

export default function CoachDashboard() {
  const { profile } = useAuth()
  const {
    loading: membersLoading,
    members,
    ready: membersReady,
    selectedMember,
    selectedMemberId,
    setSelectedMemberId,
  } = useMembers(profile?.id)
  const { checkIns, penalties, profiles, ready: coachDataReady, reload: reloadCoachData } = useCoachData()
  const { plans, reload: reloadPlans } = usePlans(selectedMember?.id)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const scopedCheckIns = selectedMember ? checkIns.filter((item) => item.user_id === selectedMember.id) : checkIns
  const scopedPenalties = selectedMember ? penalties.filter((item) => item.user_id === selectedMember.id) : penalties
  const pendingReview = scopedCheckIns.filter((item) => item.status === 'pending_review').length
  const pendingPenalty = scopedPenalties.filter((item) => item.status === 'pending')
  const pendingTotal = pendingPenalty.reduce((sum, item) => sum + item.amount, 0)
  const completed = scopedCheckIns.filter((item) => item.status === 'completed').length
  const missed = scopedCheckIns.filter((item) => item.status === 'missed').length
  const finishedTotal = completed + missed
  const completionRate = finishedTotal > 0 ? `${Math.round((completed / finishedTotal) * 100)}%` : '0%'
  const selectedMemberLabel = selectedMember ? displayMemberLabel(selectedMember) : ''
  const checkInDateSet = new Set(scopedCheckIns.map((item) => item.date))
  const recentRecords: RecentRecord[] = [
    ...scopedCheckIns.map((item) => ({
      id: item.id,
      date: item.date,
      detail: item.note || item.leave_reason || '训练记录',
      status: item.status,
    })),
    ...plans
      .filter((plan) => plan.is_training && isPastDeadline(plan.date, plan.deadline) && !checkInDateSet.has(plan.date))
      .map((plan) => ({
        id: `missed-plan-${plan.id}`,
        date: plan.date,
        detail: `${plan.title} · 过了截止时间未打卡`,
        status: 'missed' as CheckInStatus,
      })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
  const nextStep =
    !membersReady
      ? '正在同步成员列表。'
      : pendingReview > 0
      ? `有 ${pendingReview} 条记录需要审核。`
      : pendingTotal > 0
        ? `还有 ¥${pendingTotal} 待确认账款。`
        : selectedMember
          ? '当前成员没有待办，可以继续安排下一次计划。'
          : '先添加成员，再开始监督。'
  const refresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      await Promise.all([reloadCoachData(), selectedMember ? reloadPlans() : Promise.resolve()])
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <section className="screen with-nav">
      <div className="hero-panel">
        <span className="hero-kicker">Coach Console</span>
        <h2>远程监督台</h2>
        <p>{!membersReady ? '正在同步成员、计划和账款。' : selectedMember ? `当前正在看 ${selectedMemberLabel} 的计划、打卡和账款。` : '先添加成员，再制定计划。'}</p>
      </div>
      <MemberSelect loading={membersLoading} members={members} ready={membersReady} selectedMemberId={selectedMemberId} onChange={setSelectedMemberId} />
      <div className="metric-row">
        <Metric icon={<BarChart3 />} label="学员" value={coachDataReady ? `${profiles.length} 人` : '同步中'} />
        <Metric icon={<AlertTriangle />} label="待确认" value={coachDataReady ? `${pendingReview} 条` : '同步中'} />
        <Metric icon={<ReceiptText />} label="待支付" value={coachDataReady ? `¥${pendingTotal}` : '同步中'} />
        <Metric icon={<CalendarDays />} label="完成率" value={completionRate} />
      </div>

      <div className="status-card action-card">
        <strong>{selectedMember ? `${selectedMemberLabel} 的下一步` : '管理端下一步'}</strong>
        <p>{nextStep}</p>
        <div className="row-actions">
          <button type="button" disabled={isRefreshing} onClick={() => void refresh()}>
            <RefreshCw className={isRefreshing ? 'spin-icon' : undefined} size={18} />
            {isRefreshing ? '刷新中' : '刷新'}
          </button>
          <Link to="/admin/review">去审核</Link>
          <Link to="/admin/payments">看账款</Link>
          <Link to="/admin/members">排计划</Link>
        </div>
      </div>

      {selectedMember && (
        <>
          <div className="section-heading">
            <h3>最近记录</h3>
            <span>{recentRecords.length} 条记录</span>
          </div>
          <div className="review-list">
            {recentRecords.length === 0 && <p className="muted">这个成员还没有已完成或已过截止时间的计划记录。</p>}
            {recentRecords.map((item) => (
              <article className="review-card dashboard-row" key={item.id}>
                <div>
                  <strong>{formatDay(item.date)}</strong>
                  <span>{item.detail}</span>
                </div>
                <StatusPill status={item.status} />
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
