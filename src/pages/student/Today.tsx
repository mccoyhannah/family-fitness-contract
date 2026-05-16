import { CalendarCheck, Flame, Umbrella } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  const { checkIns, loading: checkInsLoading, reload: reloadCheckIns, setCheckIns, upsertCheckIn } = useCheckIns(profile?.id)
  const { penalties, loading: penaltiesLoading, reload: reloadPenalties, setPenalties, upsertPenalty } = usePenalties(profile?.id)
  const [leaveReason, setLeaveReason] = useState('')
  const syncedKeyRef = useRef<string | null>(null)
  const today = toISODate(new Date())
  const plan = useMemo(() => buildPlan(new Date()), [])
  const todayPlan = plan.find((day) => day.date === today) ?? plan[0]
  const todayCheckIn = checkIns.find((checkIn) => checkIn.date === today)
  const pendingTotal = penalties
    .filter((penalty) => penalty.status === 'pending')
    .reduce((sum, penalty) => sum + penalty.amount, 0)

  useEffect(() => {
    if (!profile) return
    if (checkInsLoading || penaltiesLoading) return
    const syncKey = `${profile.id}:${today}`
    if (syncedKeyRef.current === syncKey) return
    syncedKeyRef.current = syncKey

    const synced = buildMissedSync(profile.id, plan, checkIns, penalties)
    const userCheckIns = synced.checkIns.filter((checkIn) => checkIn.user_id === profile.id)
    const userPenalties = synced.penalties.filter((penalty) => penalty.user_id === profile.id)
    const newCheckIns = userCheckIns.filter(
      (checkIn) => !checkIns.some((existing) => existing.user_id === checkIn.user_id && existing.date === checkIn.date),
    )
    const newPenalties = userPenalties.filter(
      (penalty) => !penalties.some((existing) => existing.user_id === penalty.user_id && existing.date === penalty.date),
    )

    const persist = async () => {
      await Promise.all([
        ...newCheckIns.map((checkIn) => upsertCheckIn(checkIn)),
        ...newPenalties.map((penalty) => upsertPenalty(penalty)),
      ])
      await Promise.all([reloadCheckIns(), reloadPenalties()])
    }

    if (newCheckIns.length > 0) setCheckIns(userCheckIns)
    if (newPenalties.length > 0) setPenalties(userPenalties)
    if (newCheckIns.length > 0 || newPenalties.length > 0) void persist()
  }, [
    checkIns,
    checkInsLoading,
    penalties,
    penaltiesLoading,
    plan,
    profile,
    reloadCheckIns,
    reloadPenalties,
    setCheckIns,
    setPenalties,
    today,
    upsertCheckIn,
    upsertPenalty,
  ])

  const complete = async () => {
    if (!profile) return
    await upsertCheckIn(buildCheckIn(profile.id, today, 'completed', '完成今日训练'))
  }

  const askLeave = async () => {
    if (!profile) return
    await upsertCheckIn(buildCheckIn(profile.id, today, 'pending_review', '请假申请，等待教练确认', leaveReason))
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
        <button disabled={Boolean(todayCheckIn)} type="button" onClick={askLeave}>
          <Umbrella size={20} />
          申请请假，待教练确认
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
