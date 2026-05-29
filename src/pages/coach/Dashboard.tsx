import { AlertTriangle, BarChart3, CalendarDays, ReceiptText } from 'lucide-react'
import { useMemo } from 'react'
import MemberSelect from '../../components/MemberSelect'
import Metric from '../../components/Metric'
import { useAuth } from '../../hooks/useAuth'
import { useCoachData } from '../../hooks/useCoachData'
import { useMembers } from '../../hooks/useMembers'
import { usePlans } from '../../hooks/usePlans'
import { formatDay, isPastDeadline, toISODate } from '../../lib/date'
import type { CheckIn, CheckInStatus, Plan } from '../../lib/types'

type RecentRecord = {
  date: string
  detail: string
  id: string
  statusLabel: string
  tone: CheckInStatus | 'rest' | 'scheduled' | 'today_due'
}

const checkInStatusLabel: Record<CheckInStatus, string> = {
  completed: '已完成',
  excused: '已请假',
  missed: '缺卡',
  pending_review: '待审核',
}

const toneClass: Record<RecentRecord['tone'], string> = {
  completed: 'completed',
  excused: 'excused',
  missed: 'missed',
  pending_review: 'pending_review',
  rest: 'rest',
  scheduled: 'scheduled',
  today_due: 'today_due',
}

function cleanRecentRecordDetail(detail: string) {
  return detail
    .replace('最近 7 天无计划且未打卡，自动判定缺卡', '未打卡')
    .replace('最近 7 天无计划且未打卡', '未打卡')
    .replace('无计划且未打卡', '未打卡')
    .replace('训练日未打卡', '未打卡')
    .replace('过了截止时间自动判定缺卡', '未打卡')
    .replace(/^.+ · 过了截止时间未打卡$/, '未打卡')
    .replace('过了截止时间未打卡', '未打卡')
    .replace('自动判定缺卡', '缺卡')
}

function checkInDetail(checkIn: CheckIn) {
  if (checkIn.status === 'completed') return checkIn.note || '训练已完成'
  if (checkIn.status === 'excused') return checkIn.leave_reason || checkIn.note || '已请假'
  if (checkIn.status === 'pending_review') return checkIn.note || '等待审核'
  return cleanRecentRecordDetail(checkIn.note || checkIn.leave_reason || '训练日未打卡')
}

function planDetail(plan: Plan) {
  return plan.items.length > 0 ? `${plan.title} · ${plan.items.length} 个动作` : plan.title
}

function recordFromCheckIn(checkIn: CheckIn): RecentRecord {
  return {
    date: checkIn.date,
    detail: checkInDetail(checkIn),
    id: checkIn.id,
    statusLabel: checkInStatusLabel[checkIn.status],
    tone: checkIn.status,
  }
}

function recordFromPlan(plan: Plan, today: string): RecentRecord {
  if (!plan.is_training) {
    return {
      date: plan.date,
      detail: plan.date === today ? '已休息' : '休息',
      id: `rest-plan-${plan.id}`,
      statusLabel: plan.date === today ? '今日休息' : '休息日',
      tone: 'rest',
    }
  }

  if (isPastDeadline(plan.date, plan.deadline)) {
    return {
      date: plan.date,
      detail: '未打卡',
      id: `missed-plan-${plan.id}`,
      statusLabel: '缺卡',
      tone: 'missed',
    }
  }

  return {
    date: plan.date,
    detail: planDetail(plan),
    id: `scheduled-plan-${plan.id}`,
    statusLabel: plan.date === today ? '今日待打卡' : '已安排',
    tone: plan.date === today ? 'today_due' : 'scheduled',
  }
}

function sortRecentRecords(today: string) {
  return (a: RecentRecord, b: RecentRecord) => {
    const aFuture = a.date > today
    const bFuture = b.date > today
    if (aFuture !== bFuture) return aFuture ? 1 : -1
    return aFuture ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)
  }
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
  const { checkIns, penalties, profiles, ready: coachDataReady } = useCoachData()
  const { plans } = usePlans(selectedMember?.id)
  const scopedCheckIns = selectedMember ? checkIns.filter((item) => item.user_id === selectedMember.id) : checkIns
  const scopedPenalties = selectedMember ? penalties.filter((item) => item.user_id === selectedMember.id) : penalties
  const pendingReview = scopedCheckIns.filter((item) => item.status === 'pending_review').length
  const paymentReported = scopedPenalties.filter((item) => item.status === 'payment_reported').length
  const pendingPenalty = scopedPenalties.filter((item) => item.status === 'pending')
  const pendingTotal = pendingPenalty.reduce((sum, item) => sum + item.amount, 0)
  const completed = scopedCheckIns.filter((item) => item.status === 'completed').length
  const missed = scopedCheckIns.filter((item) => item.status === 'missed').length
  const finishedTotal = completed + missed
  const completionRate = finishedTotal > 0 ? `${Math.round((completed / finishedTotal) * 100)}%` : '0%'
  const today = toISODate(new Date())
  const recentRecords = useMemo<RecentRecord[]>(() => {
    const recordsByDate = new Map<string, RecentRecord>()
    scopedCheckIns.forEach((checkIn) => {
      recordsByDate.set(checkIn.date, recordFromCheckIn(checkIn))
    })
    plans.forEach((plan) => {
      if (!recordsByDate.has(plan.date)) recordsByDate.set(plan.date, recordFromPlan(plan, today))
    })
    return Array.from(recordsByDate.values()).sort(sortRecentRecords(today)).slice(0, 5)
  }, [plans, scopedCheckIns, today])

  return (
    <section className="screen with-nav">
      <div className="hero-panel">
        <span className="hero-kicker">Coach Console</span>
        <h2>远程监督台</h2>
      </div>
      <MemberSelect loading={membersLoading} members={members} ready={membersReady} selectedMemberId={selectedMemberId} onChange={setSelectedMemberId} />
      <div className="metric-row">
        <Metric icon={<BarChart3 />} label="学员" value={coachDataReady ? `${profiles.length} 人` : '同步中'} />
        <Metric icon={<AlertTriangle />} label="待确认" value={coachDataReady ? `${pendingReview + paymentReported} 条` : '同步中'} />
        <Metric icon={<ReceiptText />} label="待支付" value={coachDataReady ? `¥${pendingTotal}` : '同步中'} />
        <Metric icon={<CalendarDays />} label="完成率" value={completionRate} />
      </div>

      {selectedMember && (
        <>
          <div className="section-heading">
            <h3>最近记录</h3>
            <span>{recentRecords.length} 条记录</span>
          </div>
          <div className="review-list">
            {recentRecords.length === 0 && <p className="muted">这个成员还没有计划、请假或打卡记录。</p>}
            {recentRecords.map((item) => (
              <article className="review-card dashboard-row" key={item.id}>
                <div className="dashboard-record-copy">
                  <strong className="dashboard-record-date">{formatDay(item.date)}</strong>
                  <span className="dashboard-record-detail">{cleanRecentRecordDetail(item.detail)}</span>
                </div>
                <span className={`status-pill ${toneClass[item.tone]}`}>
                  <span className="status-dot" aria-hidden="true" />
                  {item.statusLabel}
                </span>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
