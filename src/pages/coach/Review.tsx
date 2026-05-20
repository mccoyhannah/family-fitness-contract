import { ChevronDown, ChevronUp, RotateCcw, X, ZoomIn } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import MemberSelect from '../../components/MemberSelect'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { useCheckInEvidence } from '../../hooks/useCheckInEvidence'
import { useCoachData } from '../../hooks/useCoachData'
import { useMembers } from '../../hooks/useMembers'
import { usePlans } from '../../hooks/usePlans'
import { formatDay } from '../../lib/date'
import { displayMemberLabel } from '../../lib/memberLabels'
import { notifyApp } from '../../lib/notice'
import type { CheckIn, CheckInEvidence, Plan } from '../../lib/types'

const WAIVER_PREFIX = '[免罚申请]'

type ReviewConfirmRequest = {
  action: () => Promise<void>
  checkInId: string
  message: string
  successMessage: string
}

type EvidenceLightbox = {
  fileName: string
  url: string
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
  const { deleteEvidenceForCheckIn, evidenceFor, reload: reloadEvidence } = useCheckInEvidence('coach')
  const retriedEvidenceKeysRef = useRef(new Set<string>())
  const reviewingCheckInIdRef = useRef('')
  const retrySequenceRef = useRef(0)
  const [failedEvidenceKeys, setFailedEvidenceKeys] = useState<Set<string>>(() => new Set())
  const [confirmRequest, setConfirmRequest] = useState<ReviewConfirmRequest | null>(null)
  const [expandedCheckInIds, setExpandedCheckInIds] = useState<Set<string>>(() => new Set())
  const [lightboxEvidence, setLightboxEvidence] = useState<EvidenceLightbox | null>(null)
  const [reviewingCheckInId, setReviewingCheckInId] = useState('')
  const [reviewCommentById, setReviewCommentById] = useState<Record<string, string>>({})
  const [retryNonceByEvidenceKey, setRetryNonceByEvidenceKey] = useState<Record<string, number>>({})
  const { plans } = usePlans(selectedMember?.id)
  const memberNameById = new Map(members.map((member) => [member.id, displayMemberLabel(member)]))
  const pending = membersReady
    ? checkIns.filter((item) => item.status === 'pending_review' && (!selectedMember || item.user_id === selectedMember.id))
    : []
  const evidenceCount = pending.reduce((sum, item) => sum + evidenceFor(item.id).length, 0)

  useEffect(() => {
    if (!lightboxEvidence) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxEvidence(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [lightboxEvidence])

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
    await deleteEvidenceForCheckIn(checkIn.id, checkIn.user_id)
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

  const evidenceKey = (evidenceId: string, signedUrl: string) => `${evidenceId}:${signedUrl}`

  const handleEvidenceError = (evidenceId: string, signedUrl: string) => {
    const key = evidenceKey(evidenceId, signedUrl)
    if (retriedEvidenceKeysRef.current.has(key)) {
      setFailedEvidenceKeys((current) => new Set(current).add(key))
      return
    }
    retriedEvidenceKeysRef.current.add(key)
    retrySequenceRef.current += 1
    setRetryNonceByEvidenceKey((current) => ({ ...current, [key]: retrySequenceRef.current }))
    void reloadEvidence().catch(() => {
      setFailedEvidenceKeys((current) => new Set(current).add(key))
    })
  }

  const evidenceSrc = (signedUrl: string, evidenceId: string) => {
    const nonce = retryNonceByEvidenceKey[evidenceKey(evidenceId, signedUrl)]
    if (!nonce) return signedUrl
    return `${signedUrl}${signedUrl.includes('?') ? '&' : '?'}retry=${nonce}`
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
    <section className="screen with-nav">
      <div className="page-title">
        <h2>异常待确认</h2>
        <p>按成员审核打卡、请假和图片证据。</p>
      </div>
      <MemberSelect loading={membersLoading} members={members} ready={membersReady} selectedMemberId={selectedMemberId} onChange={setSelectedMemberId} />
      <div className="status-card action-card">
        <strong>{membersReady ? `${pending.length} 条待确认` : '正在同步成员'}</strong>
        <p>{membersReady ? evidenceCount > 0 ? `包含 ${evidenceCount} 张图片证据。` : '没有图片证据时，重点看备注和异常标记。' : '成员列表稳定后再显示待确认记录。'}</p>
      </div>
      <div className="review-list">
        {pending.length === 0 && <p className="muted">当前没有待确认打卡。</p>}
        {pending.map((item) => {
          const displayName = coachMemberLabel(item.user_id)
          const memberPlans = plans.filter((row) => row.user_id === item.user_id)
          const plan = memberPlans.find((row) => row.id === item.plan_id || row.date === item.date)
          const itemEvidence = evidenceFor(item.id)
          const hasWaiverRequest = isWaiverRequest(item.leave_reason)
          const waiverReason = cleanWaiverReason(item.leave_reason)
          const isExpanded = expandedCheckInIds.has(item.id)
          const reviewComment = reviewCommentById[item.id] ?? item.review_comment ?? ''
          return (
            <article className={`review-card review-detail-card${hasWaiverRequest ? ' waiver-review-card' : ''}`} key={item.id}>
              <div className="review-card-summary">
                <div className="review-card-copy">
                  <strong>{displayName} · {formatDay(item.date)}</strong>
                  <span>{plan ? `${plan.title} · ${plan.source === 'coach' ? '教练制定' : '成员自定'}` : '旧打卡或计划未同步'}</span>
                  {hasWaiverRequest && <span className="waiver-review-badge">补卡免罚申请</span>}
                  {hasWaiverRequest ? (
                    <>
                      <span className="waiver-review-reason">申请理由：{waiverReason}</span>
                      {item.note && <span>记录备注：{item.note}</span>}
                    </>
                  ) : (
                    <span>{item.leave_reason ? `理由：${item.leave_reason}` : item.note || '等待确认'}</span>
                  )}
                  {item.issues.length > 0 && <span>异常：{item.issues.join('、')}</span>}
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
                    {isExpanded ? '收起详情' : '查看详情'}
                  </button>
                </div>
              </div>
              {isExpanded && (
                <ReviewExpandedDetails
                  checkIn={item}
                  evidence={itemEvidence}
                  failedEvidenceKeys={failedEvidenceKeys}
                  hasWaiverRequest={hasWaiverRequest}
                  onEvidenceError={handleEvidenceError}
                  onOpenEvidence={setLightboxEvidence}
                  plan={plan}
                  signedEvidenceKey={evidenceKey}
                  signedEvidenceSrc={evidenceSrc}
                  waiverReason={waiverReason}
                />
              )}
              <label className="review-comment-field review-inline-comment">
                <span className="review-comment-label-row">
                  <strong>给学员留言</strong>
                  <small>审核后学生端可见，可空</small>
                </span>
                <textarea
                  disabled={Boolean(reviewingCheckInId || confirmRequest)}
                  maxLength={220}
                  rows={3}
                  value={reviewComment}
                  onChange={(event) =>
                    setReviewCommentById((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                  placeholder="例如：动作完成得不错，下次深蹲注意膝盖方向。"
                />
              </label>
              <div className="row-actions">
                <button
                  type="button"
                  onClick={() =>
                    requestReviewAction(
                      item.id,
                      () => approveCheckIn(item.id, item.user_id, item.date, reviewComment),
                      hasWaiverRequest ? '已通过补卡，并处理当天罚款。' : '已通过这条打卡，并处理当天罚款。',
                      hasWaiverRequest
                        ? `确认通过 ${displayName} 在 ${formatDay(item.date)} 的补卡申请，并免除当天罚款？`
                        : `确认通过 ${displayName} 在 ${formatDay(item.date)} 的打卡？`,
                    )
                  }
                  disabled={Boolean(reviewingCheckInId || confirmRequest)}
                >
                  {reviewingCheckInId === item.id ? '处理中' : hasWaiverRequest ? '通过补卡' : '通过'}
                </button>
                {item.leave_reason && (
                  <button
                    type="button"
                    onClick={() =>
                      requestReviewAction(
                        item.id,
                        () => approveLeave(item.id, item.user_id, item.date, reviewComment),
                        '已准假，并处理当天罚款。',
                        `确认准假 ${displayName} 在 ${formatDay(item.date)} 的记录？`,
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
                      '已退回，学员可以重新提交打卡。',
                      `确认退回 ${displayName} 在 ${formatDay(item.date)} 的打卡，让学员重新提交？`,
                    )
                  }
                  disabled={Boolean(reviewingCheckInId || confirmRequest)}
                >
                  <RotateCcw size={17} />
                  退回重交
                </button>
                <button
                  type="button"
                  onClick={() =>
                    requestReviewAction(
                      item.id,
                      () => markCheckInMissedWithPenalty(item, memberPlans, buildReviewUpdate(reviewComment)),
                      '已记录为缺卡，并同步当天罚款。',
                      `确认把 ${displayName} 在 ${formatDay(item.date)} 的记录改为缺卡，并同步当天罚款？`,
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
              <span className="hero-kicker">审核确认</span>
              <h3 id="review-confirm-title">确认这次操作？</h3>
              <p>{confirmRequest.message}</p>
            </div>
            <div className="waiver-modal-actions">
              <button type="button" onClick={cancelReviewAction} disabled={Boolean(reviewingCheckInId)}>
                取消
              </button>
              <button type="button" onClick={() => void confirmReviewAction()} disabled={Boolean(reviewingCheckInId)}>
                {reviewingCheckInId ? '处理中' : '确认操作'}
              </button>
            </div>
          </section>
        </div>
      )}
      {lightboxEvidence && (
        <div className="evidence-lightbox-backdrop" role="presentation" onClick={() => setLightboxEvidence(null)}>
          <section
            aria-label={`${lightboxEvidence.fileName} 图片预览`}
            aria-modal="true"
            className="evidence-lightbox"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <strong>{lightboxEvidence.fileName}</strong>
              <button aria-label="关闭图片预览" type="button" onClick={() => setLightboxEvidence(null)}>
                <X size={20} />
              </button>
            </header>
            <img alt={lightboxEvidence.fileName} src={lightboxEvidence.url} />
          </section>
        </div>
      )}
    </section>
  )
}

function ReviewExpandedDetails({
  checkIn,
  evidence,
  failedEvidenceKeys,
  hasWaiverRequest,
  onEvidenceError,
  onOpenEvidence,
  plan,
  signedEvidenceKey,
  signedEvidenceSrc,
  waiverReason,
}: {
  checkIn: CheckIn
  evidence: CheckInEvidence[]
  failedEvidenceKeys: Set<string>
  hasWaiverRequest: boolean
  onEvidenceError: (evidenceId: string, signedUrl: string) => void
  onOpenEvidence: (evidence: EvidenceLightbox) => void
  plan?: Plan
  signedEvidenceKey: (evidenceId: string, signedUrl: string) => string
  signedEvidenceSrc: (signedUrl: string, evidenceId: string) => string
  waiverReason: string
}) {
  const note = checkIn.note || (checkIn.leave_reason && !hasWaiverRequest ? checkIn.leave_reason : '')

  return (
    <div className="review-detail-panel">
      <section className="review-detail-section">
        <div className="review-detail-head">
          <strong>打卡凭证</strong>
          <span>{evidence.length > 0 ? `${evidence.length} 张` : '无图片'}</span>
        </div>
        {evidence.length > 0 ? (
          <div className="evidence-grid review-evidence-grid">
            {evidence.map((row) => {
              if (!row.signed_url) return <span className="mini-chip" key={row.id}>{row.file_name}</span>
              const key = signedEvidenceKey(row.id, row.signed_url)
              if (failedEvidenceKeys.has(key)) return <span className="mini-chip" key={row.id}>{row.file_name} 无法加载</span>
              const src = signedEvidenceSrc(row.signed_url, row.id)
              return (
                <figure className="review-evidence-thumb" key={row.id}>
                  <button
                    aria-label={`放大查看 ${row.file_name}`}
                    className="review-evidence-open"
                    type="button"
                    onClick={() => onOpenEvidence({ fileName: row.file_name, url: src })}
                  >
                    <img
                      alt={row.file_name}
                      decoding="async"
                      loading="lazy"
                      src={src}
                      onError={() => onEvidenceError(row.id, row.signed_url!)}
                    />
                    <span><ZoomIn size={14} /> 放大查看</span>
                  </button>
                  <figcaption>{row.file_name}</figcaption>
                </figure>
              )
            })}
          </div>
        ) : (
          <p className="review-empty-detail">成员没有上传图片，重点看备注、异常和计划完成情况。</p>
        )}
      </section>

      <section className="review-detail-section">
        <div className="review-detail-head">
          <strong>打卡备注</strong>
          <span>疲劳度 {fatigueLabel(checkIn.fatigue)}</span>
        </div>
        {hasWaiverRequest && <p className="review-note-box">免罚申请：{waiverReason}</p>}
        {note ? <p className="review-note-box">{note}</p> : <p className="review-empty-detail">成员没有填写额外备注。</p>}
        {checkIn.issues.length > 0 ? (
          <div className="review-chip-row">
            {checkIn.issues.map((issue) => (
              <span className="mini-chip" key={issue}>{issue}</span>
            ))}
          </div>
        ) : (
          <p className="review-empty-detail">没有勾选异常标记。</p>
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
              <p className="review-empty-detail">{plan.is_training ? '这份计划还没有动作明细。' : '这是恢复日，没有训练动作。'}</p>
            )}
          </>
        ) : (
          <p className="review-empty-detail">没有找到关联计划，可能是旧记录，或当前成员计划还未同步完成。</p>
        )}
      </section>

    </div>
  )
}
