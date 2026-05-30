import { AlertTriangle, BarChart3, CalendarDays, ReceiptText, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import MemberSelect from '../../components/MemberSelect'
import Metric from '../../components/Metric'
import { useAuth } from '../../hooks/useAuth'
import { useCheckInEvidence } from '../../hooks/useCheckInEvidence'
import { useCoachData } from '../../hooks/useCoachData'
import { useMembers } from '../../hooks/useMembers'
import { usePlans } from '../../hooks/usePlans'
import { formatDay, isPastDeadline, toISODate } from '../../lib/date'
import type { CheckIn, CheckInEvidence, CheckInStatus, Plan } from '../../lib/types'

type RecentRecord = {
  checkIn?: CheckIn
  date: string
  detail: string
  id: string
  plan?: Plan
  statusLabel: string
  tone: CheckInStatus | 'rest' | 'scheduled' | 'today_due'
}

const WAIVER_PREFIX = '[免罚申请]'

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

function isWaiverRequest(reason?: string | null) {
  return Boolean(reason?.includes(WAIVER_PREFIX))
}

function cleanWaiverReason(reason?: string | null) {
  return reason?.replace(WAIVER_PREFIX, '').trim() || '未填写理由'
}

function fatigueLabel(fatigue: number | null) {
  if (!fatigue) return '未填写'
  if (fatigue <= 1) return '1/5 · 轻松'
  if (fatigue === 2) return '2/5 · 正常'
  if (fatigue === 3) return '3/5 · 有点累'
  if (fatigue === 4) return '4/5 · 很累'
  return '5/5 · 不舒服'
}

function formatTimestamp(value?: string | null) {
  if (!value) return '无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '无'
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
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

function recordFromCheckIn(checkIn: CheckIn, plan?: Plan): RecentRecord {
  return {
    checkIn,
    date: checkIn.date,
    detail: checkInDetail(checkIn),
    id: checkIn.id,
    plan,
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
      plan,
      statusLabel: plan.date === today ? '今日休息' : '休息日',
      tone: 'rest',
    }
  }

  if (isPastDeadline(plan.date, plan.deadline)) {
    return {
      date: plan.date,
      detail: '未打卡',
      id: `missed-plan-${plan.id}`,
      plan,
      statusLabel: '缺卡',
      tone: 'missed',
    }
  }

  return {
    date: plan.date,
    detail: planDetail(plan),
    id: `scheduled-plan-${plan.id}`,
    plan,
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
  const { evidenceFor } = useCheckInEvidence(selectedMember?.id)
  const { plans } = usePlans(selectedMember?.id)
  const modalRef = useRef<HTMLElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<RecentRecord | null>(null)
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
    const plansById = new Map(plans.map((plan) => [plan.id, plan] as const))
    const plansByDate = new Map(plans.map((plan) => [plan.date, plan] as const))
    scopedCheckIns.forEach((checkIn) => {
      const plan = (checkIn.plan_id ? plansById.get(checkIn.plan_id) : undefined) ?? plansByDate.get(checkIn.date)
      recordsByDate.set(checkIn.date, recordFromCheckIn(checkIn, plan))
    })
    plans.forEach((plan) => {
      if (!recordsByDate.has(plan.date)) recordsByDate.set(plan.date, recordFromPlan(plan, today))
    })
    return Array.from(recordsByDate.values()).sort(sortRecentRecords(today)).slice(0, 5)
  }, [plans, scopedCheckIns, today])
  const selectedEvidence = selectedRecord?.checkIn ? evidenceFor(selectedRecord.checkIn.id) : []

  const openRecord = (record: RecentRecord) => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSelectedRecord(record)
  }

  const closeRecord = () => {
    setSelectedRecord(null)
  }

  useEffect(() => {
    if (!selectedRecord) {
      previousFocusRef.current?.focus({ preventScroll: true })
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeRecord()
    }

    window.addEventListener('keydown', onKeyDown)
    const frame = window.requestAnimationFrame(() => modalRef.current?.focus({ preventScroll: true }))
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [selectedRecord])

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
              <button
                aria-label={`查看${formatDay(item.date)}${item.statusLabel}详情`}
                className="review-card dashboard-row dashboard-record-button"
                key={item.id}
                type="button"
                onClick={() => openRecord(item)}
              >
                <div className="dashboard-record-copy">
                  <strong className="dashboard-record-date">{formatDay(item.date)}</strong>
                  <span className="dashboard-record-detail">{cleanRecentRecordDetail(item.detail)}</span>
                </div>
                <span className={`status-pill ${toneClass[item.tone]}`}>
                  <span className="status-dot" aria-hidden="true" />
                  {item.statusLabel}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {selectedRecord && createPortal(
        <div className="waiver-modal-backdrop dashboard-record-backdrop" role="presentation">
          <DashboardRecordModal
            evidence={selectedEvidence}
            modalRef={modalRef}
            record={selectedRecord}
            onClose={closeRecord}
          />
        </div>,
        document.body,
      )}
    </section>
  )
}

function DashboardRecordModal({
  evidence,
  modalRef,
  onClose,
  record,
}: {
  evidence: CheckInEvidence[]
  modalRef: RefObject<HTMLElement | null>
  onClose: () => void
  record: RecentRecord
}) {
  const checkIn = record.checkIn
  const plan = record.plan
  const waiverReason = isWaiverRequest(checkIn?.leave_reason) ? cleanWaiverReason(checkIn?.leave_reason) : null
  const leaveReason = checkIn?.leave_reason && !waiverReason ? checkIn.leave_reason : null
  const hasReview = Boolean(checkIn?.review_comment || checkIn?.reviewed_at)

  return (
    <section
      aria-describedby="dashboard-record-detail"
      aria-labelledby="dashboard-record-title"
      aria-modal="true"
      className="waiver-modal dashboard-record-modal"
      ref={modalRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="dashboard-record-modal-head">
        <div className="review-confirm-copy">
          <span className="review-confirm-kicker">记录回看</span>
          <h3 id="dashboard-record-title">{formatDay(record.date)}</h3>
          <p id="dashboard-record-detail">{record.statusLabel} · {cleanRecentRecordDetail(record.detail)}</p>
        </div>
        <button className="icon-action dashboard-record-close" type="button" onClick={onClose} aria-label="关闭记录详情">
          <X size={18} />
        </button>
      </div>

      <div className="review-confirm-meta dashboard-record-meta" aria-label="记录摘要">
        <span>
          <small>状态</small>
          <strong>{record.statusLabel}</strong>
        </span>
        <span>
          <small>提交时间</small>
          <strong>{formatTimestamp(checkIn?.created_at)}</strong>
        </span>
      </div>

      <div className="review-detail-panel dashboard-record-detail-panel">
        <section className="review-detail-section">
          <div className="review-detail-head">
            <strong>学员提交</strong>
            <span>{checkIn ? `疲劳度 ${fatigueLabel(checkIn.fatigue)}` : '无提交'}</span>
          </div>
          {checkIn ? (
            <>
              {waiverReason && <p className="review-note-box">补卡免罚：{waiverReason}</p>}
              {leaveReason && <p className="review-note-box">请假理由：{leaveReason}</p>}
              {checkIn.note ? <p className="review-note-box">{checkIn.note}</p> : <p className="review-empty-detail">未填写备注。</p>}
              {checkIn.issues.length > 0 ? (
                <div className="review-chip-row">
                  {checkIn.issues.map((issue) => (
                    <span className="mini-chip" key={issue}>{issue}</span>
                  ))}
                </div>
              ) : (
                <p className="review-empty-detail">无异常标记。</p>
              )}
            </>
          ) : (
            <p className="review-empty-detail">这条记录来自当天计划，还没有单独提交打卡内容。</p>
          )}
        </section>

        <section className="review-detail-section">
          <div className="review-detail-head">
            <strong>审核信息</strong>
            <span>{formatTimestamp(checkIn?.reviewed_at)}</span>
          </div>
          {hasReview ? (
            <p className="review-note-box">{checkIn?.review_comment || '已审核，未填写留言。'}</p>
          ) : (
            <p className="review-empty-detail">暂无审核留言。</p>
          )}
        </section>

        <section className="review-detail-section">
          <div className="review-detail-head">
            <strong>当天计划</strong>
            <span>{plan ? `${plan.source === 'coach' ? '教练制定' : '成员自定'} · 截止 ${plan.deadline}` : '未同步'}</span>
          </div>
          {plan ? (
            <>
              <p className="review-plan-summary">{plan.title} · {plan.focus || (plan.is_training ? '训练日' : '恢复日')}</p>
              {plan.is_training && plan.items.length > 0 ? (
                <div className="review-plan-list">
                  {plan.items.map((item) => (
                    <article className="review-plan-item" key={item.id}>
                      <strong>{item.name}</strong>
                      <span>{item.sets} · {item.reps}</span>
                      {item.note && <p>{item.note}</p>}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="review-empty-detail">{plan.is_training ? '暂无动作明细。' : '恢复日，无需训练打卡。'}</p>
              )}
            </>
          ) : (
            <p className="review-empty-detail">计划未同步。</p>
          )}
        </section>

        <section className="review-detail-section">
          <div className="review-detail-head">
            <strong>历史照片</strong>
            <span>{evidence.length} 张</span>
          </div>
          {evidence.length > 0 ? (
            <div className="evidence-grid dashboard-evidence-grid">
              {evidence.map((item) =>
                item.signed_url ? (
                  <a href={item.signed_url} key={item.id} target="_blank" rel="noreferrer" aria-label={`打开 ${item.file_name}`}>
                    <img src={item.signed_url} alt={item.file_name || '打卡照片'} />
                  </a>
                ) : (
                  <span className="mini-chip" key={item.id}>{item.file_name || '照片记录'}</span>
                ),
              )}
            </div>
          ) : (
            <p className="review-empty-detail">本次记录没有历史照片证据。</p>
          )}
        </section>
      </div>
    </section>
  )
}
