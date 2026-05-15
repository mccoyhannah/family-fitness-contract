import StatusPill from '../../components/StatusPill'
import { useCoachData } from '../../hooks/useCoachData'
import { formatDay } from '../../lib/date'

export default function CoachPayments() {
  const { penalties, profiles, updatePenalty } = useCoachData()

  return (
    <section className="screen with-nav">
      <div className="page-title">
        <h2>罚款列表</h2>
        <p>教练可把罚款标记为已支付或豁免。</p>
      </div>
      <div className="penalty-list">
        {penalties.length === 0 && <p className="muted">当前没有罚款记录。</p>}
        {penalties.map((penalty) => {
          const profile = profiles.find((row) => row.id === penalty.user_id)
          return (
            <article className="penalty-card" key={penalty.id}>
              <div>
                <strong>¥{penalty.amount}</strong>
                <span>{profile?.name ?? '学员'} · {formatDay(penalty.date)} · 连续第 {penalty.consecutive_count} 天</span>
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
