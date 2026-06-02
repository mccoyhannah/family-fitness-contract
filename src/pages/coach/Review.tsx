import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import MemberSelect from '../../components/MemberSelect'
import { useAuth } from '../../hooks/useAuth'
import { useCoachData } from '../../hooks/useCoachData'
import { useMembers } from '../../hooks/useMembers'
import { usePlans } from '../../hooks/usePlans'
import { formatDay } from '../../lib/date'
import { displayMemberLabel } from '../../lib/memberLabels'
import { notifyApp } from '../../lib/notice'
import type { CheckIn, Plan } from '../../lib/types'

const WAIVER_PREFIX = '[免罚申请]'
const REVIEW_DRAFT_STORAGE_PREFIX = 'family-fitness-contract:coach-review-drafts:v1'

type ReviewConfirmTone = 'primary' | 'danger'

type ReviewConfirmRequest = {
  action: () => Promise<void>
  actionLabel: string
  checkInId: string
  dateLabel: string
  memberName: string
  summary: string
  successMessage: string
  title: string
  tone: ReviewConfirmTone
}

type LeaveRequestDetails = {
  arrivalRange: string
  fatigueText: string
  reason: string
}

type ReviewFact = {
  label: string
  tone?: 'warning'
  value: string
}

function isWaiverRequest(reason?: string | null) {
  return Boolean(reason?.includes(WAIVER_PREFIX))
}

function cleanWaiverReason(reason?: string | null) {
  return reason?.replace(WAIVER_PREFIX, '').trim() || ''
}

function cleanLeaveReason(reason?: string | null) {
  const trimmed = reason?.trim() || ''
  if (!trimmed || isWaiverRequest(trimmed)) return ''
  return trimmed
    .replace(/；?理由：\s*未填写\s*$/, '')
    .replace(/；\s*$/, '')
    .trim()
}

function isMissingLeaveText(text: string) {
  return !text.trim() || ['未填写', '无', '没有'].includes(text.trim())
}

function parseLeaveRequestDetails(reason?: string | null): LeaveRequestDetails {
  const cleaned = cleanLeaveReason(reason)
  if (!cleaned) return { arrivalRange: '', fatigueText: '', reason: '' }

  const unmatched: string[] = []
  let arrivalRange = ''
  let fatigueText = ''

  cleaned
    .split(/[；;]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .forEach((segment) => {
      const arrivalMatch = segment.match(/^(?:到家时间段|到家时间|下班时间)\s*[:：]?\s*(.+)$/)
      if (arrivalMatch?.[1]) {
        arrivalRange = arrivalMatch[1].trim()
        return
      }

      const fatigueMatch = segment.match(/^疲劳(?:度)?\s*[:：]?\s*(.+)$/)
      if (fatigueMatch?.[1]) {
        fatigueText = fatigueMatch[1].trim()
        return
      }

      const reasonMatch = segment.match(/^理由\s*[:：]\s*(.+)$/)
      if (reasonMatch?.[1]) {
        const reasonText = reasonMatch[1].trim()
        if (!isMissingLeaveText(reasonText)) unmatched.push(reasonText)
        return
      }

      if (!isMissingLeaveText(segment)) unmatched.push(segment)
    })

  return {
    arrivalRange,
    fatigueText,
    reason: unmatched.join('；'),
  }
}

function cleanReviewNote(note?: string | null) {
  const trimmed = note?.trim() || ''
  const defaultNotes = new Set([
    '已提交，等待教练确认。',
    '补交打卡，等待教练确认。',
    '请假申请，等待教练确认',
    '请假申请，等待教练确认。',
    '补卡免罚申请，等待管理端审核。',
  ])
  return defaultNotes.has(trimmed) ? '' : trimmed
}

function fatigueLabel(fatigue: number | null) {
  if (!fatigue) return '未填写'
  if (fatigue <= 1) return '1/5 · 轻松'
  if (fatigue === 2) return '2/5 · 正常'
  if (fatigue === 3) return '3/5 · 有点累'
  if (fatigue === 4) return '4/5 · 很累'
  return '5/5 · 不舒服'
}

function fatigueReviewSummary(fatigue: number | null) {
  if (!fatigue) return { detail: '', score: '疲劳未填写' }
  const level = Math.min(Math.max(fatigue, 1), 5)
  const detail = level <= 1
    ? '轻松'
    : level === 2
      ? '正常'
      : level === 3
        ? '有点累'
        : level === 4
          ? '很累'
          : '不舒服'
  return {
    detail,
    score: `疲劳 ${level}/5`,
  }
}

function fatigueReviewValue(fatigue: number | null) {
  if (!fatigue) return ''
  const summary = fatigueReviewSummary(fatigue)
  const score = summary.score.replace(/^疲劳\s*/, '')
  return summary.detail ? `${score} · ${summary.detail}` : score
}

function reviewDraftStorageKey(coachId?: string) {
  return coachId ? `${REVIEW_DRAFT_STORAGE_PREFIX}:${coachId}` : null
}

function readReviewDrafts(coachId?: string) {
  const key = reviewDraftStorageKey(coachId)
  if (!key) return {}
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).filter(([id, value]) => id && typeof value === 'string' && value.trim()),
    ) as Record<string, string>
  } catch {
    return {}
  }
}

function writeReviewDrafts(coachId: string | undefined, drafts: Record<string, string>) {
  const key = reviewDraftStorageKey(coachId)
  if (!key) return
  try {
    if (Object.keys(drafts).length === 0) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(drafts))
  } catch {
    // Storage may be unavailable; keep the in-memory draft so review can continue.
  }
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
  const {
    checkIns,
    deletePendingCheckIn,
    markCheckInMissedWithPenalty,
    penalties,
    ready: coachDataReady,
    updateCheckIn,
    updatePenalty,
  } = useCoachData()
  const screenRef = useRef<HTMLElement | null>(null)
  const confirmModalRef = useRef<HTMLElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const reviewScrollTopRef = useRef(0)
  const reviewingCheckInIdRef = useRef('')
  const [confirmRequest, setConfirmRequest] = useState<ReviewConfirmRequest | null>(null)
  const [expandedCheckInIds, setExpandedCheckInIds] = useState<Set<string>>(() => new Set())
  const [reviewingCheckInId, setReviewingCheckInId] = useState('')
  const [reviewCommentById, setReviewCommentById] = useState<Record<string, string>>(() => readReviewDrafts(coach?.id))
  const { plans } = usePlans(selectedMember?.id)
  const memberNameById = new Map(members.map((member) => [member.id, displayMemberLabel(member)]))
  const pending = membersReady
    ? checkIns.filter((item) => item.status === 'pending_review' && (!selectedMember || item.user_id === selectedMember.id))
    : []
  const pendingCheckInIdsKey = checkIns
    .filter((item) => item.status === 'pending_review')
    .map((item) => item.id)
    .sort()
    .join(',')

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
      throw new Error('只能退回待审核记录。')
    }
    await deletePendingCheckIn(checkIn)
  }

  const requestReviewAction = (request: ReviewConfirmRequest) => {
    if (reviewingCheckInIdRef.current || confirmRequest) return
    reviewScrollTopRef.current = screenRef.current?.scrollTop ?? 0
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setConfirmRequest(request)
  }

  const cancelReviewAction = () => {
    if (reviewingCheckInIdRef.current) return
    setConfirmRequest(null)
  }

  const updateReviewCommentDraft = (checkInId: string, value: string) => {
    setReviewCommentById((current) => {
      const next = { ...current }
      if (value.trim()) next[checkInId] = value
      else delete next[checkInId]
      writeReviewDrafts(coach?.id, next)
      return next
    })
  }

  const clearReviewCommentDraft = (checkInId: string) => {
    setReviewCommentById((current) => {
      if (!(checkInId in current)) return current
      const next = { ...current }
      delete next[checkInId]
      writeReviewDrafts(coach?.id, next)
      return next
    })
  }

  const confirmReviewAction = async () => {
    if (!confirmRequest || reviewingCheckInIdRef.current) return
    const { action, checkInId, successMessage } = confirmRequest
    reviewingCheckInIdRef.current = checkInId
    setReviewingCheckInId(checkInId)
    try {
      await action()
      clearReviewCommentDraft(checkInId)
      notifyApp({ tone: 'success', message: successMessage })
      setConfirmRequest(null)
    } catch {
      notifyApp({ tone: 'warning', message: '审核操作失败，请检查网络后再试。' })
    } finally {
      reviewingCheckInIdRef.current = ''
      setReviewingCheckInId('')
    }
  }

  useEffect(() => {
    setReviewCommentById(readReviewDrafts(coach?.id))
  }, [coach?.id])

  useEffect(() => {
    if (!coachDataReady) return
    const validIds = new Set(pendingCheckInIdsKey ? pendingCheckInIdsKey.split(',') : [])
    setReviewCommentById((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => validIds.has(id)))
      if (Object.keys(next).length === Object.keys(current).length) return current
      writeReviewDrafts(coach?.id, next)
      return next
    })
  }, [coach?.id, coachDataReady, pendingCheckInIdsKey])

  useEffect(() => {
    const screen = screenRef.current
    if (!confirmRequest) {
      screen?.scrollTo({ top: reviewScrollTopRef.current })
      previousFocusRef.current?.focus({ preventScroll: true })
      return
    }

    const restoreScroll = () => {
      screen?.scrollTo({ top: reviewScrollTopRef.current })
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      cancelReviewAction()
    }

    restoreScroll()
    window.addEventListener('keydown', onKeyDown)
    const frame = window.requestAnimationFrame(() => {
      restoreScroll()
      confirmModalRef.current?.focus({ preventScroll: true })
    })

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [confirmRequest])

  const coachMemberLabel = (memberId: string) => memberNameById.get(memberId) || '成员'
  const reviewTargetLabel = selectedMember ? displayMemberLabel(selectedMember) : '全部成员'
  const reviewSummary = membersReady ? `${pending.length} 条待处理 · ${reviewTargetLabel}` : '正在同步成员'
  const toggleExpanded = (checkInId: string) => {
    setExpandedCheckInIds((current) => {
      const next = new Set(current)
      if (next.has(checkInId)) next.delete(checkInId)
      else next.add(checkInId)
      return next
    })
  }

  return (
    <section className="screen with-nav review-screen" ref={screenRef}>
      <div className="page-title review-page-title">
        <h2>打卡审核</h2>
        <p aria-live="polite">{reviewSummary}</p>
      </div>
      <div className="review-toolbar">
        <MemberSelect
          label="成员"
          loading={membersLoading}
          members={members}
          ready={membersReady}
          selectedMemberId={selectedMemberId}
          variant="compact"
          onChange={setSelectedMemberId}
        />
      </div>
      <div className="review-list">
        {pending.map((item) => {
          const displayName = coachMemberLabel(item.user_id)
          const memberPlans = plans.filter((row) => row.user_id === item.user_id)
          const plan = memberPlans.find((row) => row.id === item.plan_id || row.date === item.date)
          const hasWaiverRequest = isWaiverRequest(item.leave_reason)
          const hasLeaveRequest = Boolean(item.leave_reason && !hasWaiverRequest)
          const waiverReason = cleanWaiverReason(item.leave_reason)
          const leaveDetails = hasLeaveRequest ? parseLeaveRequestDetails(item.leave_reason) : null
          const isExpanded = expandedCheckInIds.has(item.id)
          const reviewKind = hasWaiverRequest ? '补卡免罚' : hasLeaveRequest ? '请假申请' : '打卡审核'
          const reviewToneClass = hasWaiverRequest ? ' waiver' : hasLeaveRequest ? ' leave' : ''
          const issueSummary = item.issues.length > 0 ? `有不适 ${item.issues.length} 项` : null
          const reviewComment = reviewCommentById[item.id] ?? item.review_comment ?? ''
          const summaryFacts: ReviewFact[] = [
            ...(item.fatigue ? [{ label: '疲劳', value: fatigueReviewValue(item.fatigue) }] : []),
            ...(hasLeaveRequest && leaveDetails?.arrivalRange ? [{ label: '到家', value: leaveDetails.arrivalRange }] : []),
            ...(issueSummary ? [{ label: '身体', tone: 'warning' as const, value: issueSummary }] : []),
            ...(!item.leave_reason && plan ? [{ label: '计划', value: plan.title }] : []),
          ]
          const primaryReviewAction = hasLeaveRequest
            ? {
                action: () => approveLeave(item.id, item.user_id, item.date, reviewComment),
                actionLabel: '准假',
                successMessage: '已准假。',
                summary: '准假后这一天将不再按缺卡处理。',
                title: '确认准假',
              }
            : {
                action: () => approveCheckIn(item.id, item.user_id, item.date, reviewComment),
                actionLabel: hasWaiverRequest ? '通过补卡' : '通过',
                successMessage: hasWaiverRequest ? '已通过补卡。' : '已通过打卡。',
                summary: hasWaiverRequest ? '通过后将补卡记为完成，并同步免罚。' : '通过后这次打卡将记为完成。',
                title: hasWaiverRequest ? '确认通过补卡' : '确认通过打卡',
              }
          const returnActionLabel = item.leave_reason ? '退回申请' : '退回'
          return (
            <article className={`review-card review-detail-card${hasWaiverRequest ? ' waiver-review-card' : ''}`} key={item.id}>
              <div className="review-card-topline">
                <div className="review-card-person">
                  <strong>{displayName}</strong>
                  <span className="review-date-chip">{formatDay(item.date)}</span>
                </div>
                <div className="review-status-column">
                  <span className="review-task-status">待审核</span>
                </div>
              </div>
              <div className={`review-work-order${reviewToneClass}`} aria-label="待处理摘要">
                <div className="review-work-copy">
                  <span className="review-work-kicker">审核任务</span>
                  <strong>{reviewKind}</strong>
                  {summaryFacts.length > 0 && (
                    <div className="review-fact-grid">
                      {summaryFacts.map((fact) => (
                        <span className={`review-fact-pill${fact.tone ? ` ${fact.tone}` : ''}`} key={`${fact.label}-${fact.value}`}>
                          <small>{fact.label}</small>
                          <b>{fact.value}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
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
              {isExpanded && (
                <div className="review-expanded-stack">
                  <ReviewExpandedDetails
                    checkIn={item}
                    hasLeaveRequest={hasLeaveRequest}
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
                      onChange={(event) => updateReviewCommentDraft(item.id, event.target.value)}
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
                    requestReviewAction({
                      action: primaryReviewAction.action,
                      actionLabel: primaryReviewAction.actionLabel,
                      checkInId: item.id,
                      dateLabel: formatDay(item.date),
                      memberName: displayName,
                      successMessage: primaryReviewAction.successMessage,
                      summary: primaryReviewAction.summary,
                      title: primaryReviewAction.title,
                      tone: 'primary',
                    })
                  }
                  disabled={Boolean(reviewingCheckInId || confirmRequest)}
                >
                  {reviewingCheckInId === item.id ? '处理中' : primaryReviewAction.actionLabel}
                </button>
                <button
                  className="return-review-button"
                  type="button"
                  onClick={() =>
                    requestReviewAction({
                      action: () => returnForResubmission(item),
                      actionLabel: returnActionLabel,
                      checkInId: item.id,
                      dateLabel: formatDay(item.date),
                      memberName: displayName,
                      successMessage: '已退回。',
                      summary: item.leave_reason ? '退回后成员需要重新提交这次申请。' : '退回后成员需要重新提交这次打卡。',
                      title: item.leave_reason ? '确认退回申请' : '确认退回',
                      tone: 'primary',
                    })
                  }
                  disabled={Boolean(reviewingCheckInId || confirmRequest)}
                >
                  <RotateCcw size={17} />
                  {returnActionLabel}
                </button>
                <button
                  className="review-action-danger"
                  type="button"
                  onClick={() =>
                    requestReviewAction({
                      action: () => markCheckInMissedWithPenalty(item, memberPlans, buildReviewUpdate(reviewComment)),
                      actionLabel: '记缺卡',
                      checkInId: item.id,
                      dateLabel: formatDay(item.date),
                      memberName: displayName,
                      successMessage: '已记为缺卡。',
                      summary: '记缺卡后会按规则生成或保留对应账款。',
                      title: '确认记缺卡',
                      tone: 'danger',
                    })
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
      {confirmRequest && createPortal(
        <div className="waiver-modal-backdrop review-confirm-backdrop" role="presentation">
          <section
            className={`waiver-modal review-confirm-modal${confirmRequest.tone === 'danger' ? ' danger' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-confirm-title"
            aria-describedby="review-confirm-detail"
            ref={confirmModalRef}
            tabIndex={-1}
          >
            <div className="review-confirm-copy">
              <span className="review-confirm-kicker">审核确认</span>
              <h3 id="review-confirm-title">{confirmRequest.title}</h3>
              <p id="review-confirm-detail">{confirmRequest.summary}</p>
            </div>
            <div className="review-confirm-meta" aria-label="确认对象">
              <span>
                <small>成员</small>
                <strong>{confirmRequest.memberName}</strong>
              </span>
              <span>
                <small>日期</small>
                <strong>{confirmRequest.dateLabel}</strong>
              </span>
            </div>
            <div className="waiver-modal-actions review-confirm-actions">
              <button type="button" onClick={cancelReviewAction} disabled={Boolean(reviewingCheckInId)}>
                取消
              </button>
              <button type="button" onClick={() => void confirmReviewAction()} disabled={Boolean(reviewingCheckInId)}>
                {reviewingCheckInId ? '处理中' : confirmRequest.actionLabel}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </section>
  )
}

function ReviewExpandedDetails({
  checkIn,
  hasLeaveRequest,
  hasWaiverRequest,
  plan,
  waiverReason,
}: {
  checkIn: CheckIn
  hasLeaveRequest: boolean
  hasWaiverRequest: boolean
  plan?: Plan
  waiverReason: string
}) {
  const note = cleanReviewNote(checkIn.note)
  const leaveDetails = hasLeaveRequest ? parseLeaveRequestDetails(checkIn.leave_reason) : null
  const leaveFacts: ReviewFact[] = [
    ...(leaveDetails?.arrivalRange ? [{ label: '到家', value: leaveDetails.arrivalRange }] : []),
    ...(checkIn.fatigue
      ? [{ label: '疲劳', value: fatigueReviewValue(checkIn.fatigue) }]
      : leaveDetails?.fatigueText
        ? [{ label: '疲劳', value: leaveDetails.fatigueText }]
        : []),
  ]
  const explanation = hasLeaveRequest ? leaveDetails?.reason || '' : note
  const hasExplanation = Boolean(explanation || (hasWaiverRequest && waiverReason))
  const hasBodyStatus = Boolean(checkIn.fatigue || checkIn.issues.length > 0)
  const shouldShowDetailSection = hasExplanation || hasBodyStatus || leaveFacts.length > 0
  const detailTitle = hasWaiverRequest
    ? '补卡说明'
    : hasLeaveRequest
      ? '请假说明'
      : hasExplanation
        ? '打卡备注'
        : '身体状态'

  return (
    <div className="review-detail-panel">
      {shouldShowDetailSection && (
        <section className={`review-detail-section review-dossier-section${hasLeaveRequest ? ' leave' : ''}`}>
          <div className="review-detail-head">
            <strong>{detailTitle}</strong>
            {checkIn.fatigue && !hasLeaveRequest && <span>疲劳度 {fatigueLabel(checkIn.fatigue)}</span>}
          </div>
          {leaveFacts.length > 0 && (
            <div className="review-detail-facts">
              {leaveFacts.map((fact) => (
                <span className="review-detail-fact" key={`${fact.label}-${fact.value}`}>
                  <small>{fact.label}</small>
                  <strong>{fact.value}</strong>
                </span>
              ))}
            </div>
          )}
          {hasWaiverRequest && waiverReason && (
            <div className="review-note-box">
              <small>免罚申请</small>
              <p>{waiverReason}</p>
            </div>
          )}
          {explanation && (
            <div className="review-note-box">
              <small>{hasLeaveRequest ? '说明' : '备注'}</small>
              <p>{explanation}</p>
            </div>
          )}
          {checkIn.issues.length > 0 && (
            <div className="review-chip-row">
              {checkIn.issues.map((issue) => (
                <span className="mini-chip" key={issue}>{issue}</span>
              ))}
            </div>
          )}
        </section>
      )}

      {plan && (
        <section className="review-detail-section review-dossier-section">
          <div className="review-detail-head">
            <strong>对应计划</strong>
            <span>{plan.source === 'coach' ? '教练制定' : '成员自定'}</span>
          </div>
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
        </section>
      )}

    </div>
  )
}
