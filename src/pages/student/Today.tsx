import { CalendarCheck, Flame, Umbrella } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import ExerciseCard from '../../components/ExerciseCard'
import Metric from '../../components/Metric'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { useCheckIns } from '../../hooks/useCheckIns'
import { usePenalties } from '../../hooks/usePenalties'
import { toISODate } from '../../lib/date'
import { buildPlan } from '../../lib/plan'
import { buildMissedSync } from '../../lib/sync'
import type { CheckIn } from '../../lib/types'

export default function Today() {
  const { profile } = useAuth()
  const { checkIns, setCheckIns, upsertCheckIn } = useCheckIns(profile?.id)
  const { penalties, setPenalties, updatePenalty, upsertPenalty } = usePenalties(profile?.id)
  const [leaveReason, setLeaveReason] = useState('')
  const today = toISODate(new Date())
  const plan = useMemo(() => buildPlan(new Date()), [])
  const todayPlan = plan.find((day) => day.date === today) ?? plan[0]
  const todayCheckIn = checkIns.find((checkIn) => checkIn.date === today)
  const pendingTotal = penalties
    .filter((penalty) => penalty.status === 'pending')
    .reduce((sum, penalty) => sum + penalty.amount, 0)

  useEffect(() => {
    if (!profile) return
    const synced = buildMissedSync(profile.id, plan, checkIns, penalties)
    const userCheckIns = synced.checkIns.filter((checkIn) => checkIn.user_id === profile.id)
    const userPenalties = synced.penalties.filter((penalty) => penalty.user_id === profile.id)
    const newCheckIns = userCheckIns.filter(
      (checkIn) => !checkIns.some((existing) => existing.user_id === checkIn.user_id && existing.date === checkIn.date),
    )
    const newPenalties = userPenalties.filter(
      (penalty) => !penalties.some((existing) => existing.user_id === penalty.user_id && existing.date === penalty.date),
    )

    newCheckIns.forEach((checkIn) => void upsertCheckIn(checkIn))
    newPenalties.forEach((penalty) => void upsertPenalty(penalty))

    if (newCheckIns.length > 0) setCheckIns(userCheckIns)
    if (newPenalties.length > 0) setPenalties(userPenalties)
  }, [checkIns, penalties, plan, profile, setCheckIns, setPenalties, upsertCheckIn, upsertPenalty])

  const complete = async () => {
    if (!profile) return
    await upsertCheckIn(buildCheckIn(profile.id, today, 'completed', '完成今日训练'))
  }

  const askLeave = async () => {
    if (!profile) return
    await upsertCheckIn(buildCheckIn(profile.id, today, 'excused', '今天请假', leaveReason))
    const penalty = penalties.find((item) => item.date === today)
    if (penalty) await updatePenalty(penalty.id, 'waived')
    setLeaveReason('')
  }

  return (
    <section className="screen with-nav">
      <div className="hero-panel">
        <span className="hero-kicker">
          <Flame size={18} />
          云同步 v2
        </span>
        <h2>{todayPlan.title}</h2>
        <p>{todayPlan.focus} · 截止 {todayPlan.deadline}</p>
        <div className="metric-row">
          <Metric icon={<CalendarCheck />} label="今日状态" value={todayCheckIn ? '已记录' : '待完成'} />
          <Metric icon={<Flame />} label="待付罚款" value={`¥${pendingTotal}`} />
        </div>
      </div>

      {todayCheckIn && (
        <div className="status-card">
          <StatusPill status={todayCheckIn.status} />
          <p>{todayCheckIn.leave_reason || todayCheckIn.note || '记录已同步。'}</p>
        </div>
      )}

      <div className="section-heading">
        <h3>今日训练</h3>
        <span>{todayPlan.isTraining ? `${todayPlan.exercises.length} 个动作` : '恢复日'}</span>
      </div>
      <div className="exercise-list">
        {todayPlan.exercises.map((exercise) => (
          <ExerciseCard exercise={exercise} key={exercise.id} />
        ))}
      </div>

      <button className="primary-action" disabled={Boolean(todayCheckIn)} type="button" onClick={complete}>
        完成今日训练
      </button>

      <div className="leave-card">
        <label>
          请假理由，可空
          <input
            value={leaveReason}
            onChange={(event) => setLeaveReason(event.target.value)}
            placeholder="出差 / 身体不适 / 今天休息"
          />
        </label>
        <button disabled={todayCheckIn?.status === 'excused'} type="button" onClick={askLeave}>
          <Umbrella size={20} />
          今天请假，自动豁免
        </button>
      </div>
    </section>
  )
}

function buildCheckIn(
  userId: string,
  date: string,
  status: CheckIn['status'],
  note: string,
  leaveReason: string | null = null,
): CheckIn {
  return {
    id: `local-${date}`,
    user_id: userId,
    date,
    status,
    fatigue: status === 'completed' ? 3 : null,
    issues: [],
    note,
    leave_reason: leaveReason,
  }
}
