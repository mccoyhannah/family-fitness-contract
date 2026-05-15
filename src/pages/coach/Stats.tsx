import { Flame, ReceiptText } from 'lucide-react'
import Metric from '../../components/Metric'
import { useCoachData } from '../../hooks/useCoachData'

export default function CoachStats() {
  const { checkIns, penalties, profiles } = useCoachData()

  return (
    <section className="screen with-nav">
      <div className="page-title">
        <h2>统计看板</h2>
        <p>本轮先做汇总骨架；90 天热力图和月度结算放到 v3。</p>
      </div>
      <div className="stats-list">
        {profiles.map((profile) => {
          const completed = checkIns.filter((item) => item.user_id === profile.id && item.status === 'completed').length
          const pending = penalties
            .filter((item) => item.user_id === profile.id && item.status === 'pending')
            .reduce((sum, item) => sum + item.amount, 0)
          return (
            <article className="stats-card" key={profile.id}>
              <h3>{profile.name}</h3>
              <div className="metric-row">
                <Metric icon={<Flame />} label="完成次数" value={`${completed}`} />
                <Metric icon={<ReceiptText />} label="待付" value={`¥${pending}`} />
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
