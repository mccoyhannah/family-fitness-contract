import { useRef, useState } from 'react'
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
  const { checkIns, penalties, updateCheckIn, updatePenalty } = useCoachData()
  const { evidenceFor, reload: reloadEvidence } = useCheckInEvidence('coach')
  const retriedEvidenceKeysRef = useRef(new Set<string>())
  const reviewingCheckInIdRef = useRef('')
  const retrySequenceRef = useRef(0)
  const [failedEvidenceKeys, setFailedEvidenceKeys] = useState<Set<string>>(() => new Set())
  const [confirmRequest, setConfirmRequest] = useState<ReviewConfirmRequest | null>(null)
  const [reviewingCheckInId, setReviewingCheckInId] = useState('')
  const [retryNonceByEvidenceKey, setRetryNonceByEvidenceKey] = useState<Record<string, number>>({})
  const { plans } = usePlans(selectedMember?.id)
  const memberNameById = new Map(members.map((member) => [member.id, displayMemberLabel(member)]))
  const pending = membersReady
    ? checkIns.filter((item) => item.status === 'pending_review' && (!selectedMember || item.user_id === selectedMember.id))
    : []
  const evidenceCount = pending.reduce((sum, item) => sum + evidenceFor(item.id).length, 0)

  const approveLeave = async (id: string, userId: string, date: string) => {
    await updateCheckIn(id, 'excused')
    const penalty = penalties.find((item) => item.user_id === userId && item.date === date)
    if (penalty) await updatePenalty(penalty.id, 'waived')
  }

  const approveCheckIn = async (id: string, userId: string, date: string) => {
    await updateCheckIn(id, 'completed')
    const penalty = penalties.find((item) => item.user_id === userId && item.date === date)
    if (penalty) await updatePenalty(penalty.id, 'waived')
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
          const plan = plans.find((row) => row.id === item.plan_id || row.date === item.date)
          const itemEvidence = evidenceFor(item.id)
          const hasWaiverRequest = isWaiverRequest(item.leave_reason)
          const waiverReason = cleanWaiverReason(item.leave_reason)
          return (
            <article className={`review-card${hasWaiverRequest ? ' waiver-review-card' : ''}`} key={item.id}>
              <div>
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
                {itemEvidence.length > 0 && (
                  <div className="evidence-grid">
                    {itemEvidence.map((row) => (
                      row.signed_url ? (
                        failedEvidenceKeys.has(evidenceKey(row.id, row.signed_url)) ? (
                          <span className="mini-chip" key={row.id}>{row.file_name} 无法加载</span>
                        ) : (
                          <img
                            alt={row.file_name}
                            decoding="async"
                            key={row.id}
                            loading="lazy"
                            src={evidenceSrc(row.signed_url, row.id)}
                            onError={() => handleEvidenceError(row.id, row.signed_url!)}
                          />
                        )
                      ) : (
                        <span className="mini-chip" key={row.id}>{row.file_name}</span>
                      )
                    ))}
                  </div>
                )}
              </div>
              <StatusPill status={item.status} />
              <div className="row-actions">
                <button
                  type="button"
                  onClick={() =>
                    requestReviewAction(
                      item.id,
                      () => approveCheckIn(item.id, item.user_id, item.date),
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
                        () => approveLeave(item.id, item.user_id, item.date),
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
                  type="button"
                  onClick={() =>
                    requestReviewAction(
                      item.id,
                      () => updateCheckIn(item.id, 'missed'),
                      '已记录为缺卡。',
                      `确认把 ${displayName} 在 ${formatDay(item.date)} 的记录改为缺卡？`,
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
    </section>
  )
}
