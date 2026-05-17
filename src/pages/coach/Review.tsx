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

  const runReviewAction = async (checkInId: string, action: () => Promise<void>, successMessage: string, confirmMessage: string) => {
    if (reviewingCheckInIdRef.current) return
    reviewingCheckInIdRef.current = checkInId
    if (!window.confirm(confirmMessage)) {
      reviewingCheckInIdRef.current = ''
      return
    }
    setReviewingCheckInId(checkInId)
    try {
      await action()
      notifyApp({ tone: 'success', message: successMessage })
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
          return (
            <article className="review-card" key={item.id}>
              <div>
                <strong>{displayName} · {formatDay(item.date)}</strong>
                <span>{plan ? `${plan.title} · ${plan.source === 'coach' ? '教练制定' : '成员自定'}` : '旧打卡或计划未同步'}</span>
                <span>{item.note || '等待确认'}</span>
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
                    void runReviewAction(
                      item.id,
                      () => updateCheckIn(item.id, 'completed'),
                      '已通过这条打卡。',
                      `确认通过 ${displayName} 在 ${formatDay(item.date)} 的打卡？`,
                    )
                  }
                  disabled={Boolean(reviewingCheckInId)}
                >
                  {reviewingCheckInId === item.id ? '处理中' : '通过'}
                </button>
                {item.leave_reason && (
                  <button
                    type="button"
                    onClick={() =>
                      void runReviewAction(
                        item.id,
                        () => approveLeave(item.id, item.user_id, item.date),
                        '已准假，并处理当天罚款。',
                        `确认准假 ${displayName} 在 ${formatDay(item.date)} 的记录？`,
                      )
                    }
                    disabled={Boolean(reviewingCheckInId)}
                  >
                    准假
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    void runReviewAction(
                      item.id,
                      () => updateCheckIn(item.id, 'missed'),
                      '已记录为缺卡。',
                      `确认把 ${displayName} 在 ${formatDay(item.date)} 的记录改为缺卡？`,
                    )
                  }
                  disabled={Boolean(reviewingCheckInId)}
                >
                  记缺卡
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
