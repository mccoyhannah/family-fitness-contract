import { ChevronDown, ChevronUp, PencilLine, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import ExerciseCard from '../../components/ExerciseCard'
import PlanEditor from '../../components/PlanEditor'
import { useAuth } from '../../hooks/useAuth'
import { useCheckIns } from '../../hooks/useCheckIns'
import { usePenalties } from '../../hooks/usePenalties'
import { usePenaltySettings } from '../../hooks/usePenaltySettings'
import { usePlans } from '../../hooks/usePlans'
import { formatDay, toISODate } from '../../lib/date'
import { notifyApp } from '../../lib/notice'
import { buildPlan, planFromTemplate, planToExercises } from '../../lib/plan'
import { getStudentPlanCardAction } from '../../lib/planCalendar'
import { formatPlanFocusText, formatPlanSourceLabel } from '../../lib/planDisplay'
import { getRestConflict } from '../../lib/restRules'
import type { Plan, PlanDay, PlanDraft } from '../../lib/types'

export default function Plan() {
  const { profile } = useAuth()
  const { checkIns } = useCheckIns(profile?.id)
  const { penalties } = usePenalties(profile?.id)
  const { settings: penaltySettings } = usePenaltySettings()
  const { plans, savePlan, withdrawPlan } = usePlans(profile?.id)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => new Set())
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [withdrawingDate, setWithdrawingDate] = useState<string | null>(null)
  const week = useMemo(() => buildPlan(new Date()), [])
  const today = toISODate(new Date())
  const weekDates = useMemo(() => new Set(week.map((day) => day.date)), [week])
  const weekPlans = plans.filter((plan) => weekDates.has(plan.date))
  const trainingDays = weekPlans.filter((plan) => plan.is_training).length
  const restDays = Math.max(0, weekPlans.length - trainingDays)

  const toggleExpanded = (date: string) => {
    setExpandedDates((current) => {
      const next = new Set(current)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  const saveStudentPlan = async (draft: PlanDraft) => {
    if (!draft.is_training) {
      const conflict = getRestConflict(draft.date, plans, checkIns, penalties)
      if (conflict) {
        notifyApp({ tone: 'warning', message: conflict.message })
        throw new Error(conflict.message)
      }
    }
    await savePlan(draft)
    setEditingDate(null)
    setExpandedDates((current) => new Set(current).add(draft.date))
    notifyApp({ tone: 'success', message: '自定计划已保存。' })
  }

  const withdrawStudentRest = async (plan: Plan) => {
    if (plan.date !== today || plan.source !== 'student' || plan.is_training) {
      notifyApp({ tone: 'warning', message: '只有今天自己设置的休息可以撤回。' })
      return
    }
    if (checkIns.some((item) => item.date === plan.date)) {
      notifyApp({ tone: 'warning', message: '今天已有记录，不能撤回休息安排。' })
      return
    }
    setWithdrawingDate(plan.date)
    try {
      await withdrawPlan(plan)
      setEditingDate(null)
      setExpandedDates((current) => {
        const next = new Set(current)
        next.delete(plan.date)
        return next
      })
      notifyApp({ tone: 'success', message: '已撤回休息安排。' })
    } catch (err) {
      notifyApp({ tone: 'warning', message: err instanceof Error ? err.message : '撤回休息失败，请刷新后重试。' })
    } finally {
      setWithdrawingDate(null)
    }
  }

  return (
    <section className="screen with-nav plan-screen">
      <div className="page-title">
        <h2>本周计划</h2>
      </div>
      <div className="plan-week-overview" aria-label="本周计划概览">
        <div className="plan-week-overview-title">
          <span>本周概览</span>
          <strong>{weekPlans.length} 天</strong>
        </div>
        <div className="plan-week-overview-stats">
          <span>
            <strong>{weekPlans.length}</strong>
            <small>已安排</small>
          </span>
          <span>
            <strong>{trainingDays}</strong>
            <small>训练</small>
          </span>
          <span>
            <strong>{restDays}</strong>
            <small>恢复</small>
          </span>
        </div>
      </div>
      <div className="week-list">
        {week.map((day) => {
          const plan = plans.find((item) => item.date === day.date)
          const editing = editingDate === day.date
          const hasCheckIn = checkIns.some((item) => item.date === day.date)
          return (
            <PlanDayCard
              checkInDeadline={penaltySettings.check_in_deadline}
              day={day}
              editing={editing}
              expanded={expandedDates.has(day.date)}
              hasCheckIn={hasCheckIn}
              key={day.date}
              plan={plan}
              studentId={profile?.id}
              today={today}
              withdrawing={withdrawingDate === day.date}
              onCancelEdit={() => setEditingDate(null)}
              onEdit={() => {
                setEditingDate(day.date)
                setExpandedDates((current) => new Set(current).add(day.date))
              }}
              onSave={saveStudentPlan}
              onToggle={() => toggleExpanded(day.date)}
              onWithdrawRest={withdrawStudentRest}
            />
          )
        })}
      </div>
    </section>
  )
}

function PlanDayCard({
  checkInDeadline,
  day,
  editing,
  expanded,
  hasCheckIn,
  onCancelEdit,
  onEdit,
  onSave,
  onToggle,
  onWithdrawRest,
  plan,
  studentId,
  today,
  withdrawing,
}: {
  checkInDeadline: string
  day: PlanDay
  editing: boolean
  expanded: boolean
  hasCheckIn: boolean
  onCancelEdit: () => void
  onEdit: () => void
  onSave: (draft: PlanDraft) => Promise<void>
  onToggle: () => void
  onWithdrawRest: (plan: Plan) => Promise<void>
  plan?: Plan
  studentId?: string
  today: string
  withdrawing: boolean
}) {
  const exercises = plan ? planToExercises(plan) : []
  const action = getStudentPlanCardAction(plan, today)
  const canWithdrawRest = Boolean(plan && action.canWithdrawRest && !hasCheckIn && !editing)
  const draft = useMemo(() => {
    if (!studentId) return null
    if (plan && action.canConvertRestToTraining) return planToTrainingDraft(plan, day, studentId)
    if (plan) return planToDraft(plan)
    return planFromTemplate(studentId, day, 'student')
  }, [action.canConvertRestToTraining, day, plan, studentId])
  const editorTitle = action.canConvertRestToTraining ? '改成训练计划' : plan ? '编辑自定计划' : '制定这一天的计划'
  const submitLabel = action.canConvertRestToTraining ? '保存训练计划' : plan ? '保存自定计划' : '保存这天计划'
  const restTitle = plan && !plan.is_training ? formatRestPlanTitle(plan.title) : ''

  return (
    <article className={`day-card plan-day-card${expanded ? ' expanded' : ''}${editing ? ' editing' : ''}`}>
      <div className="plan-day-summary">
        <div className="plan-day-title">
          <strong>{formatDay(day.date)}</strong>
          <span className={plan ? `plan-source-tag ${plan.source}` : 'plan-source-tag empty'}>
            {plan ? formatPlanSourceLabel(plan.source) : '未制定'}
            {plan?.source === 'coach' && <small>只读</small>}
          </span>
        </div>
        {plan?.is_training && <strong className="plan-day-training-title">{plan.title}</strong>}
        {plan && !plan.is_training && <p className="muted">{restTitle}</p>}
        {plan?.is_training && (
          <div className="plan-day-meta">
            <span>{plan.items.length} 个动作</span>
          </div>
        )}
      </div>

      <div className="plan-card-actions">
        {action.canView && plan && (
          <button className="ghost-button" type="button" onClick={onToggle}>
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            {expanded ? '收起计划' : '查看计划'}
          </button>
        )}
        {action.editLabel && (action.canEdit || action.canConvertRestToTraining) && (
          <button className="ghost-button plan-edit-trigger" disabled={!draft} type="button" onClick={onEdit}>
            <PencilLine size={18} />
            {action.editLabel}
          </button>
        )}
        {canWithdrawRest && plan && (
          <button className="ghost-button withdraw-rest-button" disabled={withdrawing} type="button" onClick={() => void onWithdrawRest(plan)}>
            <RotateCcw size={18} />
            {withdrawing ? '撤回中' : '撤回休息'}
          </button>
        )}
      </div>

      {expanded && action.canView && plan && !editing && (
        <div className="plan-day-detail">
          {plan.is_training && <p className="plan-day-focus-strip">{formatPlanFocusText(plan.focus, plan.source)}</p>}
          {exercises.map((exercise) => (
            <ExerciseCard exercise={exercise} key={exercise.id} />
          ))}
        </div>
      )}

      {editing && draft && (
        <div className="plan-day-editor">
          <div className="plan-editor-strip">
            <strong>{editorTitle}</strong>
            <button className="ghost-button" type="button" onClick={onCancelEdit}>
              取消
            </button>
          </div>
          <PlanEditor
            checkInDeadline={checkInDeadline}
            initial={draft}
            submitLabel={submitLabel}
            onSubmit={onSave}
          />
        </div>
      )}
    </article>
  )
}

function formatRestPlanTitle(title: string) {
  const normalized = title.trim()
  return normalized && normalized !== '今日休息' ? normalized : '恢复日'
}

function planToTrainingDraft(plan: Plan, day: PlanDay, userId: string): PlanDraft {
  const draft = planFromTemplate(userId, day, 'student')
  return { ...draft, id: plan.id }
}

function planToDraft(plan: Plan): PlanDraft {
  return {
    date: plan.date,
    deadline: plan.deadline,
    focus: plan.focus,
    id: plan.id,
    is_training: plan.is_training,
    items: plan.items.map((item) => ({
      id: item.id,
      name: item.name,
      note: item.note,
      reps: item.reps,
      sets: item.sets,
      sort_order: item.sort_order,
    })),
    source: plan.source,
    title: plan.title,
    user_id: plan.user_id,
  }
}
