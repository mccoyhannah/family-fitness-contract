import { ChevronDown, ChevronUp, PencilLine } from 'lucide-react'
import { useMemo, useState } from 'react'
import ExerciseCard from '../../components/ExerciseCard'
import PlanEditor from '../../components/PlanEditor'
import { useAuth } from '../../hooks/useAuth'
import { useCheckIns } from '../../hooks/useCheckIns'
import { usePenalties } from '../../hooks/usePenalties'
import { usePlans } from '../../hooks/usePlans'
import { formatDay } from '../../lib/date'
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
  const { plans, savePlan } = usePlans(profile?.id)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => new Set())
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const week = useMemo(() => buildPlan(new Date()), [])
  const weekDates = useMemo(() => new Set(week.map((day) => day.date)), [week])
  const weekPlans = plans.filter((plan) => weekDates.has(plan.date))
  const trainingDays = weekPlans.filter((plan) => plan.is_training).length

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

  return (
    <section className="screen with-nav plan-screen">
      <div className="page-title">
        <h2>本周计划</h2>
      </div>
      <div className="status-card action-card">
        <strong>本周已安排 {weekPlans.length} 天</strong>
        <p>{trainingDays} 天训练，{Math.max(0, weekPlans.length - trainingDays)} 天恢复。</p>
      </div>
      <div className="week-list">
        {week.map((day) => {
          const plan = plans.find((item) => item.date === day.date)
          const editing = editingDate === day.date
          return (
            <PlanDayCard
              day={day}
              editing={editing}
              expanded={expandedDates.has(day.date)}
              key={day.date}
              plan={plan}
              studentId={profile?.id}
              onCancelEdit={() => setEditingDate(null)}
              onEdit={() => {
                setEditingDate(day.date)
                setExpandedDates((current) => new Set(current).add(day.date))
              }}
              onSave={saveStudentPlan}
              onToggle={() => toggleExpanded(day.date)}
            />
          )
        })}
      </div>
    </section>
  )
}

function PlanDayCard({
  day,
  editing,
  expanded,
  onCancelEdit,
  onEdit,
  onSave,
  onToggle,
  plan,
  studentId,
}: {
  day: PlanDay
  editing: boolean
  expanded: boolean
  onCancelEdit: () => void
  onEdit: () => void
  onSave: (draft: PlanDraft) => Promise<void>
  onToggle: () => void
  plan?: Plan
  studentId?: string
}) {
  const exercises = plan ? planToExercises(plan) : []
  const action = getStudentPlanCardAction(plan)
  const draft = useMemo(() => {
    if (!studentId) return null
    if (plan && action.canConvertRestToTraining) return planToTrainingDraft(plan, day, studentId)
    if (plan) return planToDraft(plan)
    return planFromTemplate(studentId, day, 'student')
  }, [action.canConvertRestToTraining, day, plan, studentId])
  const editorTitle = action.canConvertRestToTraining ? '改成训练计划' : plan ? '编辑自定计划' : '制定这一天的计划'
  const submitLabel = action.canConvertRestToTraining ? '保存训练计划' : plan ? '保存自定计划' : '保存这天计划'

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
        {plan && (
          <p className="muted">
            {plan.is_training
              ? `${plan.title} · ${formatPlanFocusText(plan.focus, plan.source)} · 截止 ${plan.deadline}`
              : plan.title}
          </p>
        )}
        {plan && (
          <div className="plan-day-meta">
            <span>{plan.is_training ? `${plan.items.length} 个动作` : '恢复日'}</span>
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
      </div>

      {expanded && action.canView && plan && !editing && (
        <div className="plan-day-detail">
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
            initial={draft}
            submitLabel={submitLabel}
            onSubmit={onSave}
          />
        </div>
      )}
    </article>
  )
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
