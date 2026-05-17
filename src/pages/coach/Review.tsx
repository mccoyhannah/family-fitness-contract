import MemberSelect from '../../components/MemberSelect'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { useCheckInEvidence } from '../../hooks/useCheckInEvidence'
import { useCoachData } from '../../hooks/useCoachData'
import { useMembers } from '../../hooks/useMembers'
import { usePlans } from '../../hooks/usePlans'
import { formatDay } from '../../lib/date'

export default function CoachReview() {
  const { profile: coach } = useAuth()
  const { members, selectedMember, selectedMemberId, setSelectedMemberId } = useMembers(coach?.id)
  const { checkIns, penalties, profiles, updateCheckIn, updatePenalty } = useCoachData()
  const { evidenceFor } = useCheckInEvidence('coach')
  const { plans } = usePlans(selectedMember?.id)
  const memberNameById = new Map(members.map((member) => [member.id, member.display_name]))
  const pending = checkIns.filter(
    (item) => item.status === 'pending_review' && (!selectedMember || item.user_id === selectedMember.id),
  )

  const approveLeave = async (id: string, userId: string, date: string) => {
    await updateCheckIn(id, 'excused')
    const penalty = penalties.find((item) => item.user_id === userId && item.date === date)
    if (penalty) await updatePenalty(penalty.id, 'waived')
  }

  return (
    <section className="screen with-nav">
      <div className="page-title">
        <h2>异常待确认</h2>
        <p>按成员审核打卡、请假和图片证据。</p>
      </div>
      <MemberSelect members={members} selectedMemberId={selectedMemberId} onChange={setSelectedMemberId} />
      <div className="review-list">
        {pending.length === 0 && <p className="muted">当前没有待确认打卡。</p>}
        {pending.map((item) => {
          const profile = profiles.find((row) => row.id === item.user_id)
          const displayName = memberNameById.get(item.user_id) ?? profile?.name ?? '学员'
          const plan = plans.find((row) => row.id === item.plan_id || row.date === item.date)
          const evidence = evidenceFor(item.id)
          return (
            <article className="review-card" key={item.id}>
              <div>
                <strong>{displayName} · {formatDay(item.date)}</strong>
                <span>{plan ? `${plan.title} · ${plan.source === 'coach' ? '教练制定' : '成员自定'}` : '旧打卡或计划未同步'}</span>
                <span>{item.note || '等待确认'}</span>
                {item.issues.length > 0 && <span>异常：{item.issues.join('、')}</span>}
                {evidence.length > 0 && (
                  <div className="evidence-grid">
                    {evidence.map((row) => (
                      row.signed_url ? <img alt={row.file_name} key={row.id} src={row.signed_url} /> : <span className="mini-chip" key={row.id}>{row.file_name}</span>
                    ))}
                  </div>
                )}
              </div>
              <StatusPill status={item.status} />
              <div className="row-actions">
                <button type="button" onClick={() => void updateCheckIn(item.id, 'completed')}>通过</button>
                {item.leave_reason && (
                  <button type="button" onClick={() => void approveLeave(item.id, item.user_id, item.date)}>准假</button>
                )}
                <button type="button" onClick={() => void updateCheckIn(item.id, 'missed')}>记缺卡</button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
