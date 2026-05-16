import { AlertTriangle, BarChart3, CalendarDays, ReceiptText } from 'lucide-react'
import MemberSelect from '../../components/MemberSelect'
import Metric from '../../components/Metric'
import { useAuth } from '../../hooks/useAuth'
import { useCoachData } from '../../hooks/useCoachData'
import { useMembers } from '../../hooks/useMembers'
import { usePlans } from '../../hooks/usePlans'

export default function CoachDashboard() {
  const { profile } = useAuth()
  const { members, selectedMember, selectedMemberId, setSelectedMemberId } = useMembers(profile?.id)
  const { checkIns, penalties, profiles } = useCoachData()
  const { plans } = usePlans(selectedMember?.id)
  const scopedCheckIns = selectedMember ? checkIns.filter((item) => item.user_id === selectedMember.id) : checkIns
  const scopedPenalties = selectedMember ? penalties.filter((item) => item.user_id === selectedMember.id) : penalties
  const pendingReview = scopedCheckIns.filter((item) => item.status === 'pending_review').length
  const pendingPenalty = scopedPenalties.filter((item) => item.status === 'pending')
  const pendingTotal = pendingPenalty.reduce((sum, item) => sum + item.amount, 0)

  return (
    <section className="screen with-nav">
      <div className="hero-panel">
        <span className="hero-kicker">Coach Console</span>
        <h2>远程监督台</h2>
        <p>{selectedMember ? `当前正在看 ${selectedMember.name} 的计划、打卡和账款。` : '先添加成员，再制定计划。'}</p>
      </div>
      <MemberSelect members={members} selectedMemberId={selectedMemberId} onChange={setSelectedMemberId} />
      <div className="metric-row">
        <Metric icon={<BarChart3 />} label="学员" value={`${profiles.length} 人`} />
        <Metric icon={<AlertTriangle />} label="待确认" value={`${pendingReview} 条`} />
        <Metric icon={<ReceiptText />} label="待支付" value={`¥${pendingTotal}`} />
        <Metric icon={<CalendarDays />} label="计划" value={`${plans.length} 天`} />
      </div>
    </section>
  )
}
