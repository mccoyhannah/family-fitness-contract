import StatusPill from '../../components/StatusPill'
import { useCoachData } from '../../hooks/useCoachData'
import { formatDay } from '../../lib/date'

export default function CoachReview() {
  const { checkIns, profiles, updateCheckIn } = useCoachData()
  const pending = checkIns.filter((item) => item.status === 'pending_review')

  return (
    <section className="screen with-nav">
      <div className="page-title">
        <h2>异常待确认</h2>
        <p>v2 用 pending_review 队列替代自由切换视角。</p>
      </div>
      <div className="review-list">
        {pending.length === 0 && <p className="muted">当前没有待确认打卡。</p>}
        {pending.map((item) => {
          const profile = profiles.find((row) => row.id === item.user_id)
          return (
            <article className="review-card" key={item.id}>
              <div>
                <strong>{profile?.name ?? '学员'} · {formatDay(item.date)}</strong>
                <span>{item.note || '等待确认'}</span>
              </div>
              <StatusPill status={item.status} />
              <div className="row-actions">
                <button type="button" onClick={() => void updateCheckIn(item.id, 'completed')}>通过</button>
                <button type="button" onClick={() => void updateCheckIn(item.id, 'missed')}>记缺卡</button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
