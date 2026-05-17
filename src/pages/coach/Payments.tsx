import MemberSelect from '../../components/MemberSelect'
import StatusPill from '../../components/StatusPill'
import { notifyApp } from '../../components/AppNotice'
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
  const pendingTotal = scopedPenalties
    .filter((penalty) => penalty.status === 'pending')
    .reduce((sum, penalty) => sum + penalty.amount, 0)
  const settledCount = scopedPenalties.filter((penalty) => penalty.status !== 'pending').length

  const setPenaltyStatus = async (penaltyId: string, status: 'paid' | 'waived') => {
    try {
      await updatePenalty(penaltyId, status)
      notifyApp({ tone: 'success', message: status === 'paid' ? '账款已标记为已付。' : '账款已豁免。' })
    } catch {
      notifyApp({ tone: 'warning', message: '账款操作失败，请检查网络后再试。' })
    }
  }

  return (
    <section className="screen with-nav">
      <div className="page-title">
        <h2>账款列表</h2>
        <p>按当前成员查看欠款，教练可标记已支付或豁免。</p>
      </div>
      <MemberSelect members={members} selectedMemberId={selectedMemberId} onChange={setSelectedMemberId} />
      <div className="status-card action-card">
        <strong>待确认 ¥{pendingTotal}</strong>
        <p>{settledCount} 条已处理；未支付记录可以标记已付或豁免。</p>
      </div>
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
                <button type="button" onClick={() => void setPenaltyStatus(penalty.id, 'paid')}>标记已付</button>
                <button type="button" onClick={() => void setPenaltyStatus(penalty.id, 'waived')}>豁免</button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
