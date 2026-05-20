import { ChevronDown, ChevronUp, PencilLine } from 'lucide-react'
import { useMemo, useState } from 'react'
import ExerciseCard from '../../components/ExerciseCard'
import PlanEditor from '../../components/PlanEditor'
import { useAuth } from '../../hooks/useAuth'
import { usePlans } from '../../hooks/usePlans'
import { formatDay } from '../../lib/date'
import { notifyApp } from '../../lib/notice'
import { buildPlan, planFromTemplate, planToExercises } from '../../lib/plan'
import { formatPlanFocusText, formatPlanSourceLabel } from '../../lib/planDisplay'
import type { Plan, PlanDay, PlanDraft } from '../../lib/types'

export default function Plan() {
  const { profile } = useAuth()
  const { plans, savePlan } = usePlans(profile?.id)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => new Set())
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const week = useMemo(() => buildPlan(new Date()), [])
  const trainingDays = plans.filter((plan) => plan.is_training).length

  const toggleExpanded = (date: string) => {
    setExpandedDates((current) => {
      const next = new Set(current)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  const saveStudentPlan = async (draft: PlanDraft) => {
    await savePlan(draft)
    setEditingDate(null)
    setExpandedDates((current) => new Set(current).add(draft.date))
    notifyApp({ tone: 'success', message: '自定计划已保存。' })
  }

  return (
    <section className="screen with-nav plan-screen">
      <div className="page-title">
        <h2>本周计划</h2>
        <p>优先显示教练制定计划；未制定的日期，可以直接在卡片里制定自己的计划。</p>
      </div>
      <div className="status-card action-card">
        <strong>已安排 {plans.length} 天</strong>
        <p>{trainingDays} 天训练，{Math.max(0, plans.length - trainingDays)} 天恢复或复盘。</p>
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
  const canEdit = !plan || plan.source === 'student'
  const draft = useMemo(() => {
    if (!studentId) return null
    if (plan) return planToDraft(plan)
    return planFromTemplate(studentId, day, 'student')
  }, [day, plan, studentId])

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
        <p className="muted">
          {plan
            ? `${plan.title} · ${formatPlanFocusText(plan.focus, plan.source)} · 截止 ${plan.deadline}`
            : '当天还没有明确计划。'}
        </p>
        {plan && (
          <div className="plan-day-meta">
            <span>{plan.is_training ? `${plan.items.length} 个动作` : '恢复日'}</span>
          </div>
        )}
      </div>

      <div className="plan-card-actions">
        {plan && (
          <button className="ghost-button" type="button" onClick={onToggle}>
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            {expanded ? '收起计划' : '查看计划'}
          </button>
        )}
        {canEdit && (
          <button className="ghost-button plan-edit-trigger" disabled={!draft} type="button" onClick={onEdit}>
            <PencilLine size={18} />
            {plan ? '编辑计划' : '制定计划'}
          </button>
        )}
      </div>

      {expanded && plan && !editing && (
        <div className="plan-day-detail">
          {exercises.map((exercise) => (
            <ExerciseCard exercise={exercise} key={exercise.id} />
          ))}
        </div>
      )}

      {editing && draft && (
        <div className="plan-day-editor">
          <div className="plan-editor-strip">
            <strong>{plan ? '编辑自定计划' : '制定这一天的计划'}</strong>
            <button className="ghost-button" type="button" onClick={onCancelEdit}>
              取消
            </button>
          </div>
          <PlanEditor initial={draft} submitLabel={plan ? '保存自定计划' : '保存这天计划'} onSubmit={onSave} />
        </div>
      )}
    </article>
  )
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
