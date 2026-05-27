import { AlertTriangle, CalendarCheck, ChevronDown, ChevronUp, Flame, RotateCcw, Umbrella } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ExerciseCard from '../../components/ExerciseCard'
import FatigueCards from '../../components/FatigueCards'
import Metric from '../../components/Metric'
import PlanEditor from '../../components/PlanEditor'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { useCheckIns } from '../../hooks/useCheckIns'
import { usePenalties } from '../../hooks/usePenalties'
import { usePenaltySettings } from '../../hooks/usePenaltySettings'
import { usePlans } from '../../hooks/usePlans'
import { toISODate } from '../../lib/date'
import { buildLeaveRequestReason, validateLeaveRequest } from '../../lib/leaveRequest'
import { notifyApp } from '../../lib/notice'
import { buildPlan, planFromTemplate, planToExercises } from '../../lib/plan'
import { formatPlanFocusText, formatPlanSourceLabel } from '../../lib/planDisplay'
import { getRestConflict, type RestConflict } from '../../lib/restRules'
import { buildMissedSync } from '../../lib/sync'
import { rawErrorMessage } from '../../lib/supabaseErrors'
import type { CheckIn, Exercise, Plan, PlanDraft } from '../../lib/types'

export default function Today() {
  const { profile } = useAuth()
  const { checkIns, loading: checkInsLoading, reload: reloadCheckIns, setCheckIns, upsertCheckIn, withdrawCheckIn } = useCheckIns(profile?.id)
  const { penalties, loading: penaltiesLoading, reload: reloadPenalties, setPenalties, upsertPenalty } = usePenalties(profile?.id)
  const { ready: penaltySettingsReady, settings: penaltySettings } = usePenaltySettings()
  const { loading: plansLoading, plans, savePlan } = usePlans(profile?.id)
  const [leaveFatigue, setLeaveFatigue] = useState<number | null>(null)
  const [leaveOffWorkTime, setLeaveOffWorkTime] = useState('')
  const [leaveReason, setLeaveReason] = useState('')
  const [memberCodeOpen, setMemberCodeOpen] = useState(false)
  const [restSaving, setRestSaving] = useState(false)
  const [requestingLeave, setRequestingLeave] = useState(false)
  const [selfPlanOpen, setSelfPlanOpen] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const navigate = useNavigate()
  const completedSyncKeyRef = useRef<string | null>(null)
  const syncingKeyRef = useRef<string | null>(null)
  const today = toISODate(new Date())
  const templatePlan = useMemo(() => buildPlan(new Date()), [today])
  const todayTemplate = templatePlan.find((day) => day.date === today) ?? templatePlan[0]
  const todayPlan = plans.find((plan) => plan.date === today)
  const todayExercises = todayPlan ? planToExercises(todayPlan) : []
  const todayCheckIn = checkIns.find((checkIn) => checkIn.date === today)
  const restConflict = useMemo(
    () => getRestConflict(today, plans, checkIns, penalties),
    [checkIns, penalties, plans, today],
  )
  const restBlockedMessage = restConflict?.message ?? null
  const pendingTotal = penalties
    .filter((penalty) => penalty.status === 'pending')
    .reduce((sum, penalty) => sum + penalty.amount, 0)
  const showLoadingSkeleton =
    (checkInsLoading || penaltiesLoading || plansLoading) &&
    plans.length === 0 &&
    checkIns.length === 0 &&
    penalties.length === 0

  useEffect(() => {
    if (!profile) return
    if (!penaltySettingsReady) return
    if (checkInsLoading || penaltiesLoading || plansLoading) return
    const syncKey = `${profile.id}:${profile.created_at ?? 'unknown'}:${today}:${plans.map((plan) => plan.id).join(',')}:${penaltySettings.base_amount}:${penaltySettings.daily_increment}:${penaltySettings.max_amount}`
    if (completedSyncKeyRef.current === syncKey || syncingKeyRef.current === syncKey) return

    const synced = buildMissedSync(profile.id, plans, checkIns, penalties, new Date(), profile.created_at, penaltySettings)
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
    penaltySettings,
    penaltySettingsReady,
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
    if (!profile || todayCheckIn || requestingLeave) return
    const leaveDraft = { fatigue: leaveFatigue, offWorkTime: leaveOffWorkTime, reason: leaveReason }
    const validationMessage = validateLeaveRequest(leaveDraft)
    if (validationMessage) {
      notifyApp({ tone: 'warning', message: validationMessage })
      return
    }
    setRequestingLeave(true)
    try {
      await upsertCheckIn(buildCheckIn(
        profile.id,
        todayPlan?.id ?? null,
        today,
        'pending_review',
        '请假申请，等待教练确认',
        buildLeaveRequestReason(leaveDraft),
        leaveFatigue,
      ))
      setLeaveFatigue(null)
      setLeaveOffWorkTime('')
      setLeaveReason('')
      notifyApp({ tone: 'success', message: '请假申请已提交，等待管理端确认。' })
    } catch {
      notifyApp({ tone: 'warning', message: '请假申请提交失败，请稍后重试。' })
    } finally {
      setRequestingLeave(false)
    }
  }

  const markTodayRest = async () => {
    if (!profile || !todayTemplate || todayCheckIn || restSaving) return
    if (restBlockedMessage) {
      notifyApp({ tone: 'warning', message: restBlockedMessage })
      return
    }
    setRestSaving(true)
    try {
      await savePlan({
        user_id: profile.id,
        date: today,
        title: '今日休息',
        focus: '主动恢复',
        deadline: todayTemplate.deadline || '23:00',
        is_training: false,
        source: 'student',
        items: [],
      })
      notifyApp({ tone: 'success', message: '今天已记为休息日，不会按缺卡处理。' })
    } catch {
      notifyApp({ tone: 'warning', message: '今日休息保存失败，请稍后重试。' })
    } finally {
      setRestSaving(false)
    }
  }

  const withdrawTodayCheckIn = async () => {
    if (!todayCheckIn || withdrawing) return
    if (todayCheckIn.status !== 'pending_review') {
      notifyApp({ tone: 'warning', message: '这条打卡已经审核，不能撤回。' })
      return
    }
    setWithdrawing(true)
    try {
      await withdrawCheckIn(todayCheckIn)
      notifyApp({ tone: 'success', message: '已撤回本次打卡，可以重新提交。' })
    } catch (err) {
      notifyApp({ tone: 'warning', message: rawErrorMessage(err, '撤回失败，请稍后重试。') })
    } finally {
      setWithdrawing(false)
    }
  }

  const selfPlanDraft = useMemo<PlanDraft | null>(() => {
    if (!profile) return null
    return planFromTemplate(profile.id, todayTemplate, 'student')
  }, [profile, todayTemplate])

  if (showLoadingSkeleton) return <TodayLoadingSkeleton />

  if (!todayTemplate) {
    return (
      <section className="screen with-nav contract-home-screen">
        <div className="status-card action-card contract-clause-card">
          <strong>今天还没有默认训练模板</strong>
          <p>可以先等管理端下发计划，或稍后刷新页面。</p>
        </div>
      </section>
    )
  }

  return (
    <section className="screen with-nav contract-home-screen">
      {restConflict && !todayCheckIn && (
        <RestRestrictionNotice
          conflict={restConflict}
          onPlanEdit={() => navigate('/plan')}
        />
      )}
      <TodayHeroSection
        checkIn={todayCheckIn}
        pendingTotal={pendingTotal}
        plan={todayPlan}
        todayExercises={todayExercises}
      />
      {todayCheckIn && (
        <TodayCheckInSummary
          checkIn={todayCheckIn}
          canMakeUp={todayCheckIn.status === 'missed'}
          onMakeUp={startCheckIn}
          withdrawing={withdrawing}
          onWithdraw={withdrawTodayCheckIn}
        />
      )}

      {todayPlan ? (
        <TodayTrainingSection
          checkIn={todayCheckIn}
          exercises={todayExercises}
          leaveFatigue={leaveFatigue}
          leaveOffWorkTime={leaveOffWorkTime}
          leaveReason={leaveReason}
          plan={todayPlan}
          requestingLeave={requestingLeave}
          restBlockedMessage={restBlockedMessage}
          onAskLeave={askLeave}
          onLeaveFatigueChange={setLeaveFatigue}
          onLeaveOffWorkTimeChange={setLeaveOffWorkTime}
          onStartCheckIn={startCheckIn}
          onLeaveReasonChange={setLeaveReason}
          onPlanEdit={() => navigate('/plan')}
        />
      ) : (
        selfPlanDraft && (
          <TodayOpenPlanSection
            checkIn={todayCheckIn}
            draft={selfPlanDraft}
            leaveFatigue={leaveFatigue}
            leaveOffWorkTime={leaveOffWorkTime}
            leaveReason={leaveReason}
            open={selfPlanOpen}
            requestingLeave={requestingLeave}
            restBlockedMessage={restBlockedMessage}
            restSaving={restSaving}
            onAskLeave={askLeave}
            onLeaveFatigueChange={setLeaveFatigue}
            onLeaveOffWorkTimeChange={setLeaveOffWorkTime}
            onLeaveReasonChange={setLeaveReason}
            onMarkRest={markTodayRest}
            onSave={savePlan}
            onTogglePlan={() => setSelfPlanOpen((current) => !current)}
          />
        )
      )}

      {profile?.member_code && (
        <MemberCodeCard
          memberCode={profile.member_code}
          open={memberCodeOpen}
          onToggle={() => setMemberCodeOpen((current) => !current)}
        />
      )}
    </section>
  )
}

function RestRestrictionNotice({ conflict, onPlanEdit }: { conflict: RestConflict; onPlanEdit: () => void }) {
  return (
    <div className="status-card rest-conflict-notice contract-clause-card" role="alert">
      <div className="rest-conflict-head">
        <AlertTriangle size={22} />
        <strong>{conflict.kind === 'rest' ? '今天不能继续休息' : '今天必须处理缺卡后的安排'}</strong>
      </div>
      <p>{conflict.message}</p>
      <button className="ghost-button rest-conflict-edit-button" type="button" onClick={onPlanEdit}>
        改成训练计划
      </button>
    </div>
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
    <div className="hero-panel contract-cover-panel">
      <span className="hero-kicker">
        <CalendarCheck size={18} />
        今日计划
      </span>
      <h2 className="plan-title-with-source">
        <span>{plan?.title ?? '今天还没有计划'}</span>
        {plan && <span className={`plan-source-tag ${plan.source}`}>{formatPlanSourceLabel(plan.source)}</span>}
      </h2>
      <p>{plan ? `${formatPlanFocusText(plan.focus, plan.source)} · 截止 ${plan.deadline}` : '可以等教练制定，也可以自己先定今天的训练。'}</p>
      <div className="metric-row three-col">
        <Metric icon={<CalendarCheck />} label="今日状态" value={plan && !plan.is_training ? '已休息' : checkIn ? '已记录' : '待完成'} />
        <Metric icon={<Flame />} label="待付罚款" value={`¥${pendingTotal}`} />
        <Metric icon={<CalendarCheck />} label="今日动作" value={plan ? (plan.is_training ? `${todayExercises.length} 个` : '恢复日') : '未制定'} />
      </div>
    </div>
  )
}

function MemberCodeCard({
  memberCode,
  open,
  onToggle,
}: {
  memberCode: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className={`status-card participant-code-card member-binding-card contract-clause-card${open ? ' open' : ''}`}>
      <button aria-expanded={open} className="member-binding-toggle" type="button" onClick={onToggle}>
        <span>
          <strong>绑定信息</strong>
          <small>{open ? '成员码用于绑定管理端' : '成员码已收起'}</small>
        </span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && (
        <div className="member-binding-detail">
          <span className="member-code-value">{memberCode}</span>
          <p>需要重新绑定时，把这个码发给管理者。</p>
        </div>
      )}
    </div>
  )
}

function TodayCheckInSummary({
  checkIn,
  canMakeUp,
  onMakeUp,
  onWithdraw,
  withdrawing,
}: {
  checkIn: CheckIn
  canMakeUp: boolean
  onMakeUp: () => void
  onWithdraw: () => void
  withdrawing: boolean
}) {
  const canWithdraw = checkIn.status === 'pending_review'
  return (
    <div className={`status-card checkin-clause-card contract-clause-card${canWithdraw ? ' pending-checkin-card' : ''}`}>
      <div className="checkin-summary-head">
        <StatusPill status={checkIn.status} />
        <span>{canWithdraw ? '等待教练审核' : canMakeUp ? '可补交审核' : '今日记录'}</span>
      </div>
      <p>{checkIn.leave_reason || checkIn.note || '记录已同步。'}</p>
      {checkIn.review_comment && (
        <div className="coach-comment-box">
          <strong>教练留言</strong>
          <p>{checkIn.review_comment}</p>
        </div>
      )}
      {canWithdraw && (
        <button className="withdraw-checkin-button" disabled={withdrawing} type="button" onClick={() => void onWithdraw()}>
          <RotateCcw size={18} />
          {withdrawing ? '撤回中' : '撤回本次打卡'}
        </button>
      )}
      {canMakeUp && (
        <button className="withdraw-checkin-button make-up-checkin-button" type="button" onClick={onMakeUp}>
          <RotateCcw size={18} />
          补交打卡，等待审核
        </button>
      )}
    </div>
  )
}

function TodayTrainingSection({
  checkIn,
  exercises,
  leaveFatigue,
  leaveOffWorkTime,
  leaveReason,
  onAskLeave,
  onLeaveFatigueChange,
  onLeaveOffWorkTimeChange,
  onStartCheckIn,
  onLeaveReasonChange,
  onPlanEdit,
  plan,
  requestingLeave,
  restBlockedMessage,
}: {
  checkIn?: CheckIn
  exercises: Exercise[]
  leaveFatigue: number | null
  leaveOffWorkTime: string
  leaveReason: string
  onAskLeave: () => Promise<void>
  onLeaveFatigueChange: (value: number | null) => void
  onLeaveOffWorkTimeChange: (value: string) => void
  onStartCheckIn: () => void
  onLeaveReasonChange: (value: string) => void
  onPlanEdit: () => void
  plan: Plan
  requestingLeave: boolean
  restBlockedMessage?: string | null
}) {
  return (
    <section className="contract-section training-clause-section">
      <div className="section-heading contract-section-heading">
        <h3>{plan.is_training ? '今日训练' : '今日休息'}</h3>
        <span>{plan.is_training ? `${plan.items.length} 个动作` : '恢复日'}</span>
      </div>
      {plan.is_training ? (
        <>
          <div className="exercise-list">
            {exercises.map((exercise) => (
              <ExerciseCard exercise={exercise} key={exercise.id} />
            ))}
          </div>

          <button className="primary-action" disabled={!(!checkIn || checkIn.status === 'missed')} type="button" onClick={onStartCheckIn}>
            {checkIn?.status === 'missed' ? '补交打卡，等待审核' : '去提交打卡'}
          </button>
        </>
      ) : (
        <div className="status-card rest-day-card contract-clause-card">
          <strong>{restBlockedMessage ? '今天不能继续休息' : '今天已记为休息日'}</strong>
          <p>{restBlockedMessage || '不需要提交训练打卡。明天如果没有计划、请假或休息选择，就会按缺卡处理。'}</p>
          {restBlockedMessage && (
            <button className="ghost-button rest-conflict-edit-button" type="button" onClick={onPlanEdit}>
              改成训练计划
            </button>
          )}
        </div>
      )}

      {(plan.is_training || restBlockedMessage) && (
        <div className="leave-card contract-clause-card">
          <LeaveRequestFields
            disabled={Boolean(checkIn) || requestingLeave}
            fatigue={leaveFatigue}
            offWorkTime={leaveOffWorkTime}
            reason={leaveReason}
            onFatigueChange={onLeaveFatigueChange}
            onOffWorkTimeChange={onLeaveOffWorkTimeChange}
            onReasonChange={onLeaveReasonChange}
          />
          <button disabled={Boolean(checkIn) || requestingLeave} type="button" onClick={() => void onAskLeave()}>
            <Umbrella size={20} />
            {requestingLeave ? '提交中' : '申请请假，待教练确认'}
          </button>
        </div>
      )}
    </section>
  )
}

function TodayOpenPlanSection({
  checkIn,
  draft,
  leaveFatigue,
  leaveOffWorkTime,
  leaveReason,
  onAskLeave,
  onLeaveFatigueChange,
  onLeaveOffWorkTimeChange,
  onLeaveReasonChange,
  onMarkRest,
  onSave,
  onTogglePlan,
  open,
  requestingLeave,
  restBlockedMessage,
  restSaving,
}: {
  checkIn?: CheckIn
  draft: PlanDraft
  leaveFatigue: number | null
  leaveOffWorkTime: string
  leaveReason: string
  onAskLeave: () => Promise<void>
  onLeaveFatigueChange: (value: number | null) => void
  onLeaveOffWorkTimeChange: (value: string) => void
  onLeaveReasonChange: (value: string) => void
  onMarkRest: () => Promise<void>
  onSave: (draft: PlanDraft) => Promise<Plan>
  onTogglePlan: () => void
  open: boolean
  requestingLeave: boolean
  restBlockedMessage?: string | null
  restSaving: boolean
}) {
  const disabled = Boolean(checkIn)
  return (
    <section className="contract-section self-plan-clause-section open-plan-section">
      <div className="section-heading contract-section-heading">
        <h3>今天怎么安排</h3>
        <span>{disabled ? '已提交记录' : '三选一'}</span>
      </div>
      <div className="status-card action-card today-choice-card contract-clause-card">
        <strong>今天还没有计划</strong>
        <p>可以休息、请假，或者自己定一个训练计划。只要做了选择，就不会被当成“什么都没做”。</p>
        <div className="today-choice-actions">
          {restBlockedMessage && <p className="form-warning">{restBlockedMessage}</p>}
          <button disabled={disabled || restSaving || Boolean(restBlockedMessage)} type="button" onClick={() => void onMarkRest()}>
            <CalendarCheck size={18} />
            {restSaving ? '保存中' : '今日休息'}
          </button>
          <button disabled={disabled || requestingLeave} type="button" onClick={() => void onAskLeave()}>
            <Umbrella size={18} />
            {requestingLeave ? '提交中' : '申请请假'}
          </button>
          <button aria-expanded={open} className="ghost-button" disabled={disabled} type="button" onClick={onTogglePlan}>
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            {open ? '收起自定计划' : '自己制定计划'}
          </button>
        </div>
        <LeaveRequestFields
          disabled={disabled || requestingLeave}
          fatigue={leaveFatigue}
          offWorkTime={leaveOffWorkTime}
          reason={leaveReason}
          onFatigueChange={onLeaveFatigueChange}
          onOffWorkTimeChange={onLeaveOffWorkTimeChange}
          onReasonChange={onLeaveReasonChange}
        />
      </div>
      {open && (
        <PlanEditor
          initial={draft}
          restBlockedMessage={restBlockedMessage}
          submitLabel="保存今日自定计划"
          onSubmit={async (nextDraft) => void (await onSave(nextDraft))}
        />
      )}
    </section>
  )
}

function LeaveRequestFields({
  disabled,
  fatigue,
  offWorkTime,
  onFatigueChange,
  onOffWorkTimeChange,
  onReasonChange,
  reason,
}: {
  disabled: boolean
  fatigue: number | null
  offWorkTime: string
  onFatigueChange: (value: number | null) => void
  onOffWorkTimeChange: (value: string) => void
  onReasonChange: (value: string) => void
  reason: string
}) {
  return (
    <div className="leave-request-fields">
      <div className="leave-details-grid">
        <label>
          下班时间
          <input
            disabled={disabled}
            type="time"
            value={offWorkTime}
            onChange={(event) => onOffWorkTimeChange(event.target.value)}
          />
        </label>
        <label>
          请假理由，可空
          <input
            disabled={disabled}
            maxLength={80}
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="加班太晚 / 身体不适 / 家庭安排"
          />
        </label>
      </div>
      <div className={disabled ? 'leave-fatigue-field disabled' : 'leave-fatigue-field'}>
        <FatigueCards disabled={disabled} value={fatigue} onChange={onFatigueChange} />
      </div>
    </div>
  )
}

function TodayLoadingSkeleton() {
  return (
    <section className="screen with-nav contract-home-screen" aria-busy="true">
      <div className="hero-panel skeleton-card contract-cover-panel" aria-label="正在加载今日计划">
        <span className="skeleton-line short" />
        <span className="skeleton-line title" />
        <span className="skeleton-line" />
        <div className="metric-row three-col">
          <span className="skeleton-tile" />
          <span className="skeleton-tile" />
          <span className="skeleton-tile" />
        </div>
      </div>
      <div className="status-card skeleton-card contract-clause-card">
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
  planId: string | null,
  date: string,
  status: CheckIn['status'],
  note: string,
  leaveReason: string | null = null,
  fatigue: number | null = null,
): CheckIn {
  return {
    id: `local-${date}-${planId ?? 'no-plan'}`,
    user_id: userId,
    plan_id: planId,
    date,
    status,
    fatigue: fatigue ?? (status === 'completed' ? 3 : null),
    issues: [],
    note,
    leave_reason: leaveReason,
  }
}
