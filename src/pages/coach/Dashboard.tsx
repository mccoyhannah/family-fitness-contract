import { AlertTriangle, BarChart3, ReceiptText } from 'lucide-react'
import Metric from '../../components/Metric'
import { useCoachData } from '../../hooks/useCoachData'

export default function CoachDashboard() {
  const { checkIns, penalties, profiles } = useCoachData()
  const pendingReview = checkIns.filter((item) => item.status === 'pending_review').length
  const pendingPenalty = penalties.filter((item) => item.status === 'pending')
  const pendingTotal = pendingPenalty.reduce((sum, item) => sum + item.amount, 0)

  return (
    <section className="screen with-nav">
      <div className="hero-panel">
        <span className="hero-kicker">Coach Console</span>
        <h2>远程监督台</h2>
        <p>Realtime 订阅已接入骨架；爸打卡后管理端会刷新。</p>
      </div>
      <div className="metric-row">
        <Metric icon={<BarChart3 />} label="学员" value={`${profiles.length} 人`} />
        <Metric icon={<AlertTriangle />} label="待确认" value={`${pendingReview} 条`} />
        <Metric icon={<ReceiptText />} label="待支付" value={`¥${pendingTotal}`} />
      </div>
    </section>
  )
}
