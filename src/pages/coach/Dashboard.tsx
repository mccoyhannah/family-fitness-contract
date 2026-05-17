import { AlertTriangle, BarChart3, CalendarDays, ReceiptText } from 'lucide-react'
import { Link } from 'react-router-dom'
import MemberSelect from '../../components/MemberSelect'
import Metric from '../../components/Metric'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { useCoachData } from '../../hooks/useCoachData'
import { useMembers } from '../../hooks/useMembers'
import { usePlans } from '../../hooks/usePlans'
import { formatDay } from '../../lib/date'

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
  const completed = scopedCheckIns.filter((item) => item.status === 'completed').length
  const completionRate = scopedCheckIns.length > 0 ? `${Math.round((completed / scopedCheckIns.length) * 100)}%` : '0%'
  const recentCheckIns = scopedCheckIns
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
  const nextStep =
    pendingReview > 0
      ? `有 ${pendingReview} 条记录需要审核。`
      : pendingTotal > 0
        ? `还有 ¥${pendingTotal} 待确认账款。`
        : selectedMember
          ? '当前成员没有待办，可以继续安排下一次计划。'
          : '先添加成员，再开始监督。'

  return (
    <section className="screen with-nav">
      <div className="hero-panel">
        <span className="hero-kicker">Coach Console</span>
        <h2>远程监督台</h2>
        <p>{selectedMember ? `当前正在看 ${selectedMember.display_name} 的计划、打卡和账款。` : '先添加成员，再制定计划。'}</p>
      </div>
      <MemberSelect members={members} selectedMemberId={selectedMemberId} onChange={setSelectedMemberId} />
      <div className="metric-row">
        <Metric icon={<BarChart3 />} label="学员" value={`${profiles.length} 人`} />
        <Metric icon={<AlertTriangle />} label="待确认" value={`${pendingReview} 条`} />
        <Metric icon={<ReceiptText />} label="待支付" value={`¥${pendingTotal}`} />
        <Metric icon={<CalendarDays />} label="完成率" value={completionRate} />
      </div>

      <div className="status-card action-card">
        <strong>{selectedMember ? `${selectedMember.display_name} 的下一步` : '管理端下一步'}</strong>
        <p>{nextStep}</p>
        <div className="row-actions">
          <Link to="/admin/review">去审核</Link>
          <Link to="/admin/payments">看账款</Link>
          <Link to="/admin/members">排计划</Link>
        </div>
      </div>

      {selectedMember && (
        <>
          <div className="section-heading">
            <h3>最近记录</h3>
            <span>{plans.length} 天计划</span>
          </div>
          <div className="review-list">
            {recentCheckIns.length === 0 && <p className="muted">这个成员还没有打卡记录。</p>}
            {recentCheckIns.map((item) => (
              <article className="review-card dashboard-row" key={item.id}>
                <div>
                  <strong>{formatDay(item.date)}</strong>
                  <span>{item.note || item.leave_reason || '训练记录'}</span>
                </div>
                <StatusPill status={item.status} />
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
