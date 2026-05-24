import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'
import MemberSelect from '../../components/MemberSelect'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { useCoachData } from '../../hooks/useCoachData'
import { useMembers } from '../../hooks/useMembers'
import { usePlans } from '../../hooks/usePlans'
import { formatDay } from '../../lib/date'
import { displayMemberLabel } from '../../lib/memberLabels'
import { notifyApp } from '../../lib/notice'
import type { CheckIn, Plan } from '../../lib/types'

const WAIVER_PREFIX = '[免罚申请]'

type ReviewConfirmRequest = {
  action: () => Promise<void>
  checkInId: string
  message: string
  successMessage: string
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

export default function CoachReview() {
  const { profile: coach } = useAuth()
  const {
    loading: membersLoading,
    members,
    ready: membersReady,
    selectedMember,
    selectedMemberId,
    setSelectedMemberId,
  } = useMembers(coach?.id)
  const { checkIns, deletePendingCheckIn, markCheckInMissedWithPenalty, penalties, updateCheckIn, updatePenalty } = useCoachData()
  const reviewingCheckInIdRef = useRef('')
  const [confirmRequest, setConfirmRequest] = useState<ReviewConfirmRequest | null>(null)
  const [expandedCheckInIds, setExpandedCheckInIds] = useState<Set<string>>(() => new Set())
  const [reviewingCheckInId, setReviewingCheckInId] = useState('')
  const [reviewCommentById, setReviewCommentById] = useState<Record<string, string>>({})
  const { plans } = usePlans(selectedMember?.id)
  const memberNameById = new Map(members.map((member) => [member.id, displayMemberLabel(member)]))
  const pending = membersReady
    ? checkIns.filter((item) => item.status === 'pending_review' && (!selectedMember || item.user_id === selectedMember.id))
    : []

  const buildReviewUpdate = (comment: string) => ({
    review_comment: comment.trim() || null,
    reviewed_at: new Date().toISOString(),
    reviewer_id: coach?.id ?? null,
  })

  const approveLeave = async (id: string, userId: string, date: string, comment: string) => {
    await updateCheckIn(id, 'excused', buildReviewUpdate(comment))
    const penalty = penalties.find((item) => item.user_id === userId && item.date === date)
    if (penalty) await updatePenalty(penalty.id, 'waived')
  }

  const approveCheckIn = async (id: string, userId: string, date: string, comment: string) => {
    await updateCheckIn(id, 'completed', buildReviewUpdate(comment))
    const penalty = penalties.find((item) => item.user_id === userId && item.date === date)
    if (penalty) await updatePenalty(penalty.id, 'waived')
  }

  const returnForResubmission = async (checkIn: CheckIn) => {
    if (checkIn.status !== 'pending_review') {
      throw new Error('只能退回待审核的打卡。')
    }
    await deletePendingCheckIn(checkIn)
  }

  const requestReviewAction = (checkInId: string, action: () => Promise<void>, successMessage: string, message: string) => {
    if (reviewingCheckInIdRef.current || confirmRequest) return
    setConfirmRequest({ action, checkInId, message, successMessage })
  }

  const cancelReviewAction = () => {
    if (reviewingCheckInIdRef.current) return
    setConfirmRequest(null)
  }

  const confirmReviewAction = async () => {
    if (!confirmRequest || reviewingCheckInIdRef.current) return
    const { action, checkInId, successMessage } = confirmRequest
    reviewingCheckInIdRef.current = checkInId
    setReviewingCheckInId(checkInId)
    try {
      await action()
      notifyApp({ tone: 'success', message: successMessage })
      setConfirmRequest(null)
    } catch {
      notifyApp({ tone: 'warning', message: '审核操作失败，请检查网络后再试。' })
    } finally {
      reviewingCheckInIdRef.current = ''
      setReviewingCheckInId('')
    }
  }

  const coachMemberLabel = (memberId: string) => memberNameById.get(memberId) || '成员'
  const toggleExpanded = (checkInId: string) => {
    setExpandedCheckInIds((current) => {
      const next = new Set(current)
      if (next.has(checkInId)) next.delete(checkInId)
      else next.add(checkInId)
      return next
    })
  }

  return (
    <section className="screen with-nav review-screen">
      <div className="page-title">
        <h2>异常待确认</h2>
      </div>
      <MemberSelect loading={membersLoading} members={members} ready={membersReady} selectedMemberId={selectedMemberId} onChange={setSelectedMemberId} />
      <div className="review-summary-bar" aria-live="polite">
        <strong>{membersReady ? `${pending.length} 条待确认` : '正在同步成员'}</strong>
        <span>{selectedMember ? displayMemberLabel(selectedMember) : '全部成员'}</span>
      </div>
      <div className="review-list">
        {pending.length === 0 && <p className="muted review-empty-state">暂无待确认</p>}
        {pending.map((item) => {
          const displayName = coachMemberLabel(item.user_id)
          const memberPlans = plans.filter((row) => row.user_id === item.user_id)
          const plan = memberPlans.find((row) => row.id === item.plan_id || row.date === item.date)
          const hasWaiverRequest = isWaiverRequest(item.leave_reason)
          const waiverReason = cleanWaiverReason(item.leave_reason)
          const isExpanded = expandedCheckInIds.has(item.id)
          const reviewKind = hasWaiverRequest ? '补卡免罚' : item.leave_reason ? '请假' : '打卡'
          const planSummary = plan ? `${plan.title} · ${plan.source === 'coach' ? '教练' : '成员'}` : '计划未同步'
          const reviewComment = reviewCommentById[item.id] ?? item.review_comment ?? ''
          return (
            <article className={`review-card review-detail-card${hasWaiverRequest ? ' waiver-review-card' : ''}`} key={item.id}>
              <div className="review-card-summary">
                <div className="review-card-copy">
                  <div className="review-card-title-row">
                    <strong>{displayName}</strong>
                    <span className="review-date-chip">{formatDay(item.date)}</span>
                  </div>
                  <div className="review-card-meta">
                    <span className={hasWaiverRequest ? 'review-meta-chip review-type-chip waiver' : 'review-meta-chip review-type-chip'}>{reviewKind}</span>
                    <span className="review-meta-chip">疲劳 {fatigueLabel(item.fatigue)}</span>
                    <span className={item.issues.length > 0 ? 'review-meta-chip warning' : 'review-meta-chip'}>{item.issues.length > 0 ? `异常 ${item.issues.length}` : '无异常'}</span>
                    <span className="review-meta-chip review-plan-chip">{planSummary}</span>
                  </div>
                </div>
                <div className="review-status-column">
                  <StatusPill status={item.status} />
                  <button
                    aria-expanded={isExpanded}
                    className="review-expand-button"
                    type="button"
                    onClick={() => toggleExpanded(item.id)}
                  >
                    {isExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                    {isExpanded ? '收起' : '详情/留言'}
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="review-expanded-stack">
                  <ReviewExpandedDetails
                    checkIn={item}
                    hasWaiverRequest={hasWaiverRequest}
                    plan={plan}
                    waiverReason={waiverReason}
                  />
                  <label className="review-comment-field review-inline-comment">
                    <span className="review-comment-label-row">
                      <strong>留言</strong>
                    </span>
                    <textarea
                      disabled={Boolean(reviewingCheckInId || confirmRequest)}
                      maxLength={220}
                      rows={3}
                      value={reviewComment}
                      onChange={(event) =>
                        setReviewCommentById((current) => ({ ...current, [item.id]: event.target.value }))
                      }
                      placeholder="可写留言"
                    />
                  </label>
                </div>
              )}
              <div className="row-actions review-actions">
                <button
                  className="review-action-primary"
                  type="button"
                  onClick={() =>
                    requestReviewAction(
                      item.id,
                      () => approveCheckIn(item.id, item.user_id, item.date, reviewComment),
                      hasWaiverRequest ? '已通过补卡。' : '已通过打卡。',
                      hasWaiverRequest
                        ? `确认通过补卡 · ${displayName} · ${formatDay(item.date)}？`
                        : `确认通过 · ${displayName} · ${formatDay(item.date)}？`,
                    )
                  }
                  disabled={Boolean(reviewingCheckInId || confirmRequest)}
                >
                  {reviewingCheckInId === item.id ? '处理中' : hasWaiverRequest ? '通过补卡' : '通过'}
                </button>
                {item.leave_reason && (
                  <button
                    className="review-action-secondary"
                    type="button"
                    onClick={() =>
                      requestReviewAction(
                        item.id,
                        () => approveLeave(item.id, item.user_id, item.date, reviewComment),
                        '已准假。',
                        `确认准假 · ${displayName} · ${formatDay(item.date)}？`,
                      )
                    }
                    disabled={Boolean(reviewingCheckInId || confirmRequest)}
                  >
                    准假
                  </button>
                )}
                <button
                  className="return-review-button"
                  type="button"
                  onClick={() =>
                    requestReviewAction(
                      item.id,
                      () => returnForResubmission(item),
                      '已退回。',
                      `确认退回 · ${displayName} · ${formatDay(item.date)}？`,
                    )
                  }
                  disabled={Boolean(reviewingCheckInId || confirmRequest)}
                >
                  <RotateCcw size={17} />
                  退回
                </button>
                <button
                  className="review-action-danger"
                  type="button"
                  onClick={() =>
                    requestReviewAction(
                      item.id,
                      () => markCheckInMissedWithPenalty(item, memberPlans, buildReviewUpdate(reviewComment)),
                      '已记为缺卡。',
                      `确认记缺卡 · ${displayName} · ${formatDay(item.date)}？`,
                    )
                  }
                  disabled={Boolean(reviewingCheckInId || confirmRequest)}
                >
                  记缺卡
                </button>
              </div>
            </article>
          )
        })}
      </div>
      {confirmRequest && (
        <div className="waiver-modal-backdrop" role="presentation">
          <section className="waiver-modal review-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="review-confirm-title">
            <div>
              <h3 id="review-confirm-title">确认</h3>
              <p>{confirmRequest.message}</p>
            </div>
            <div className="waiver-modal-actions">
              <button type="button" onClick={cancelReviewAction} disabled={Boolean(reviewingCheckInId)}>
                取消
              </button>
              <button type="button" onClick={() => void confirmReviewAction()} disabled={Boolean(reviewingCheckInId)}>
                {reviewingCheckInId ? '处理中' : '确认'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

function ReviewExpandedDetails({
  checkIn,
  hasWaiverRequest,
  plan,
  waiverReason,
}: {
  checkIn: CheckIn
  hasWaiverRequest: boolean
  plan?: Plan
  waiverReason: string
}) {
  const note = checkIn.note || (checkIn.leave_reason && !hasWaiverRequest ? checkIn.leave_reason : '')

  return (
    <div className="review-detail-panel">
      <section className="review-detail-section">
        <div className="review-detail-head">
          <strong>打卡备注</strong>
          <span>疲劳度 {fatigueLabel(checkIn.fatigue)}</span>
        </div>
        {hasWaiverRequest && <p className="review-note-box">免罚申请：{waiverReason}</p>}
        {note ? <p className="review-note-box">{note}</p> : <p className="review-empty-detail">暂无备注。</p>}
        {checkIn.issues.length > 0 ? (
          <div className="review-chip-row">
            {checkIn.issues.map((issue) => (
              <span className="mini-chip" key={issue}>{issue}</span>
            ))}
          </div>
        ) : (
          <p className="review-empty-detail">无异常标记。</p>
        )}
      </section>

      <section className="review-detail-section">
        <div className="review-detail-head">
          <strong>计划内容</strong>
          <span>{plan ? `${plan.source === 'coach' ? '教练制定' : '成员自定'} · 截止 ${plan.deadline}` : '未同步'}</span>
        </div>
        {plan ? (
          <>
            <p className="review-plan-summary">{plan.title} · {plan.focus}</p>
            {plan.items.length > 0 ? (
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
              <p className="review-empty-detail">{plan.is_training ? '暂无动作明细。' : '恢复日。'}</p>
            )}
          </>
        ) : (
          <p className="review-empty-detail">计划未同步。</p>
        )}
      </section>

    </div>
  )
}
