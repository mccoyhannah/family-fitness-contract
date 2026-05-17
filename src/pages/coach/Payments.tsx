import MemberSelect from '../../components/MemberSelect'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { useCoachData } from '../../hooks/useCoachData'
import { useMembers } from '../../hooks/useMembers'
import { formatDay } from '../../lib/date'

export default function CoachPayments() {
  const { profile } = useAuth()
  const { members, selectedMember, selectedMemberId, setSelectedMemberId } = useMembers(profile?.id)
  const { penalties, profiles, updatePenalty } = useCoachData()
  const scopedPenalties = selectedMember ? penalties.filter((penalty) => penalty.user_id === selectedMember.id) : penalties
  const memberNameById = new Map(members.map((member) => [member.id, member.display_name]))

  return (
    <section className="screen with-nav">
      <div className="page-title">
        <h2>账款列表</h2>
        <p>按当前成员查看欠款，教练可标记已支付或豁免。</p>
      </div>
      <MemberSelect members={members} selectedMemberId={selectedMemberId} onChange={setSelectedMemberId} />
      <div className="penalty-list">
        {scopedPenalties.length === 0 && <p className="muted">当前没有罚款记录。</p>}
        {scopedPenalties.map((penalty) => {
          const profile = profiles.find((row) => row.id === penalty.user_id)
          const displayName = memberNameById.get(penalty.user_id) ?? profile?.name ?? '学员'
          return (
            <article className="penalty-card" key={penalty.id}>
              <div>
                <strong>¥{penalty.amount}</strong>
                <span>{displayName} · {formatDay(penalty.date)} · 连续第 {penalty.consecutive_count} 天</span>
              </div>
              <StatusPill status={penalty.status} />
              <div className="row-actions">
                <button type="button" onClick={() => void updatePenalty(penalty.id, 'paid')}>标记已付</button>
                <button type="button" onClick={() => void updatePenalty(penalty.id, 'waived')}>豁免</button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
