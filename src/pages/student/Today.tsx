import { CalendarCheck, Flame, Umbrella } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ExerciseCard from '../../components/ExerciseCard'
import Metric from '../../components/Metric'
import PlanEditor from '../../components/PlanEditor'
import StatusPill from '../../components/StatusPill'
import { notifyApp } from '../../components/AppNotice'
import { useAuth } from '../../hooks/useAuth'
import { useCheckIns } from '../../hooks/useCheckIns'
import { usePenalties } from '../../hooks/usePenalties'
import { usePlans } from '../../hooks/usePlans'
import { toISODate } from '../../lib/date'
import { buildPlan, planFromTemplate, planToExercises } from '../../lib/plan'
import { buildMissedSync } from '../../lib/sync'
import type { CheckIn, Exercise, Plan, PlanDraft } from '../../lib/types'

export default function Today() {
  const { profile } = useAuth()
  const { checkIns, loading: checkInsLoading, reload: reloadCheckIns, setCheckIns, upsertCheckIn } = useCheckIns(profile?.id)
  const { penalties, loading: penaltiesLoading, reload: reloadPenalties, setPenalties, upsertPenalty } = usePenalties(profile?.id)
  const { loading: plansLoading, plans, savePlan } = usePlans(profile?.id)
  const [leaveReason, setLeaveReason] = useState('')
  const navigate = useNavigate()
  const completedSyncKeyRef = useRef<string | null>(null)
  const syncingKeyRef = useRef<string | null>(null)
  const today = toISODate(new Date())
  const templatePlan = useMemo(() => buildPlan(new Date()), [today])
  const todayTemplate = templatePlan.find((day) => day.date === today) ?? templatePlan[0]
  const todayPlan = plans.find((plan) => plan.date === today)
  const todayExercises = todayPlan ? planToExercises(todayPlan) : []
  const todayCheckIn = checkIns.find((checkIn) => checkIn.date === today)
  const pendingTotal = penalties
    .filter((penalty) => penalty.status === 'pending')
    .reduce((sum, penalty) => sum + penalty.amount, 0)
  const nextStep = todayCheckIn
    ? '今天已记录，剩下就是等管理端确认。'
    : todayPlan
      ? '训练后去打卡页提交疲劳度、备注和图片证据。'
      : '先自己制定今日计划，或等管理端下发计划。'
  const showLoadingSkeleton =
    (checkInsLoading || penaltiesLoading || plansLoading) &&
    plans.length === 0 &&
    checkIns.length === 0 &&
    penalties.length === 0

  useEffect(() => {
    if (!profile) return
    if (checkInsLoading || penaltiesLoading || plansLoading) return
    const syncKey = `${profile.id}:${today}:${plans.map((plan) => plan.id).join(',')}`
    if (completedSyncKeyRef.current === syncKey || syncingKeyRef.current === syncKey) return

    const synced = buildMissedSync(profile.id, plans, checkIns, penalties)
    const userCheckIns = synced.checkIns.filter((checkIn) => checkIn.user_id === profile.id)
    const userPenalties = synced.penalties.filter((penalty) => penalty.user_id === profile.id)
    const newCheckIns = userCheckIns.filter(
      (checkIn) => !checkIns.some((existing) => existing.user_id === checkIn.user_id && existing.date === checkIn.date),
    )
    const newPenalties = userPenalties.filter(
      (penalty) => !penalties.some((existing) => existing.user_id === penalty.user_id && existing.date === penalty.date),
    )

    if (newCheckIns.length === 0 && newPenalties.length === 0) {
      completedSyncKeyRef.current = syncKey
      return
    }

    syncingKeyRef.current = syncKey
    if (newCheckIns.length > 0) setCheckIns(userCheckIns)
    if (newPenalties.length > 0) setPenalties(userPenalties)

    const persist = async () => {
      try {
        await Promise.all([
          ...newCheckIns.map((checkIn) => upsertCheckIn(checkIn)),
          ...newPenalties.map((penalty) => upsertPenalty(penalty)),
        ])
        await Promise.all([reloadCheckIns(), reloadPenalties()])
        completedSyncKeyRef.current = syncKey
      } catch {
        notifyApp({ tone: 'warning', message: '缺卡和罚款同步失败，请检查网络后刷新。' })
        await Promise.all([reloadCheckIns(), reloadPenalties()])
      } finally {
        if (syncingKeyRef.current === syncKey) syncingKeyRef.current = null
      }
    }

    void persist()
  }, [
    checkIns,
    checkInsLoading,
    penalties,
    penaltiesLoading,
    plans,
    plansLoading,
    profile,
    reloadCheckIns,
    reloadPenalties,
    setCheckIns,
    setPenalties,
    today,
    upsertCheckIn,
    upsertPenalty,
  ])

  const startCheckIn = () => {
    navigate('/checkin')
  }

  const askLeave = async () => {
    if (!profile || !todayPlan) return
    try {
      await upsertCheckIn(buildCheckIn(profile.id, todayPlan.id, today, 'pending_review', '请假申请，等待教练确认', leaveReason))
      setLeaveReason('')
      notifyApp({ tone: 'success', message: '请假申请已提交，等待管理端确认。' })
    } catch {
      notifyApp({ tone: 'warning', message: '请假申请提交失败，请稍后重试。' })
    }
  }

  const selfPlanDraft = useMemo<PlanDraft | null>(() => {
    if (!profile) return null
    return planFromTemplate(profile.id, todayTemplate, 'student')
  }, [profile, todayTemplate])

  if (showLoadingSkeleton) return <TodayLoadingSkeleton />

  return (
    <section className="screen with-nav">
      <TodayHeroSection
        checkIn={todayCheckIn}
        pendingTotal={pendingTotal}
        plan={todayPlan}
        todayExercises={todayExercises}
      />
      <TodayActionCard nextStep={nextStep} />
      {profile?.member_code && <MemberCodeCard memberCode={profile.member_code} />}
      {todayCheckIn && <TodayCheckInSummary checkIn={todayCheckIn} />}

      {todayPlan ? (
        <TodayTrainingSection
          checkIn={todayCheckIn}
          exercises={todayExercises}
          leaveReason={leaveReason}
          plan={todayPlan}
          onAskLeave={askLeave}
          onStartCheckIn={startCheckIn}
          onLeaveReasonChange={setLeaveReason}
        />
      ) : (
        selfPlanDraft && <TodaySelfPlanSection draft={selfPlanDraft} onSave={savePlan} />
      )}
    </section>
  )
}

function TodayHeroSection({
  checkIn,
  pendingTotal,
  plan,
  todayExercises,
}: {
  checkIn?: CheckIn
  pendingTotal: number
  plan?: Plan
  todayExercises: Exercise[]
}) {
  return (
    <div className="hero-panel">
      <span className="hero-kicker">
        <Flame size={18} />
        云同步 v2
      </span>
      <h2>{plan?.title ?? '今天还没有计划'}</h2>
      <p>{plan ? `${plan.focus} · 截止 ${plan.deadline}` : '可以等教练制定，也可以自己先定今天的训练。'}</p>
      <div className="metric-row three-col">
        <Metric icon={<CalendarCheck />} label="今日状态" value={checkIn ? '已记录' : '待完成'} />
        <Metric icon={<Flame />} label="待付罚款" value={`¥${pendingTotal}`} />
        <Metric icon={<CalendarCheck />} label="今日动作" value={plan ? (plan.is_training ? `${todayExercises.length} 个` : '恢复日') : '未制定'} />
      </div>
    </div>
  )
}

function TodayActionCard({ nextStep }: { nextStep: string }) {
  return (
    <div className="status-card action-card">
      <strong>下一步</strong>
      <p>{nextStep}</p>
    </div>
  )
}

function MemberCodeCard({ memberCode }: { memberCode: string }) {
  return (
    <div className="status-card">
      <strong>我的成员码：{memberCode}</strong>
      <p>把这个码发给管理者，就能把你的账号绑定进家庭成员列表。</p>
    </div>
  )
}

function TodayCheckInSummary({ checkIn }: { checkIn: CheckIn }) {
  return (
    <div className="status-card">
      <StatusPill status={checkIn.status} />
      <p>{checkIn.leave_reason || checkIn.note || '记录已同步。'}</p>
    </div>
  )
}

function TodayTrainingSection({
  checkIn,
  exercises,
  leaveReason,
  onAskLeave,
  onStartCheckIn,
  onLeaveReasonChange,
  plan,
}: {
  checkIn?: CheckIn
  exercises: Exercise[]
  leaveReason: string
  onAskLeave: () => Promise<void>
  onStartCheckIn: () => void
  onLeaveReasonChange: (value: string) => void
  plan: Plan
}) {
  return (
    <>
      <div className="section-heading">
        <h3>今日训练</h3>
        <span>{plan.is_training ? `${plan.items.length} 个动作` : '恢复日'}</span>
      </div>
      <div className="exercise-list">
        {exercises.map((exercise) => (
          <ExerciseCard exercise={exercise} key={exercise.id} />
        ))}
      </div>

      <button className="primary-action" disabled={Boolean(checkIn)} type="button" onClick={onStartCheckIn}>
        去提交打卡
      </button>

      <div className="leave-card">
        <label>
          请假理由，可空
          <input
            maxLength={120}
            value={leaveReason}
            onChange={(event) => onLeaveReasonChange(event.target.value)}
            placeholder="出差 / 身体不适 / 今天休息"
          />
        </label>
        <button disabled={Boolean(checkIn)} type="button" onClick={() => void onAskLeave()}>
          <Umbrella size={20} />
          申请请假，待教练确认
        </button>
      </div>
    </>
  )
}

function TodaySelfPlanSection({ draft, onSave }: { draft: PlanDraft; onSave: (draft: PlanDraft) => Promise<Plan> }) {
  return (
    <>
      <div className="section-heading">
        <h3>自己制定今日计划</h3>
        <span>不等于罚款</span>
      </div>
      <PlanEditor initial={draft} submitLabel="保存今日自定计划" onSubmit={async (nextDraft) => void (await onSave(nextDraft))} />
    </>
  )
}

function TodayLoadingSkeleton() {
  return (
    <section className="screen with-nav" aria-busy="true">
      <div className="hero-panel skeleton-card" aria-label="正在加载今日计划">
        <span className="skeleton-line short" />
        <span className="skeleton-line title" />
        <span className="skeleton-line" />
        <div className="metric-row three-col">
          <span className="skeleton-tile" />
          <span className="skeleton-tile" />
          <span className="skeleton-tile" />
        </div>
      </div>
      <div className="status-card skeleton-card">
        <span className="skeleton-line medium" />
        <span className="skeleton-line" />
      </div>
      <div className="exercise-list">
        <span className="skeleton-row" />
        <span className="skeleton-row" />
        <span className="skeleton-row" />
      </div>
    </section>
  )
}

function buildCheckIn(
  userId: string,
  planId: string,
  date: string,
  status: CheckIn['status'],
  note: string,
  leaveReason: string | null = null,
): CheckIn {
  return {
    id: `local-${date}-${planId}`,
    user_id: userId,
    plan_id: planId,
    date,
    status,
    fatigue: status === 'completed' ? 3 : null,
    issues: [],
    note,
    leave_reason: leaveReason,
  }
}
