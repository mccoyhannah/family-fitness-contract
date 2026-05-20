import { useMemo } from 'react'
import ExerciseCard from '../../components/ExerciseCard'
import { useAuth } from '../../hooks/useAuth'
import { usePlans } from '../../hooks/usePlans'
import { formatDay } from '../../lib/date'
import { buildPlan, planToExercises } from '../../lib/plan'
import { formatPlanFocusText, formatPlanSourceLabel } from '../../lib/planDisplay'

export default function Plan() {
  const { profile } = useAuth()
  const { plans } = usePlans(profile?.id)
  const week = useMemo(() => buildPlan(new Date()), [])
  const trainingDays = plans.filter((plan) => plan.is_training).length

  return (
    <section className="screen with-nav">
      <div className="page-title">
        <h2>本周计划</h2>
        <p>优先显示教练制定计划；没有教练计划时，可以在今日页自己制定当天计划。</p>
      </div>
      <div className="status-card action-card">
        <strong>已安排 {plans.length} 天</strong>
        <p>{trainingDays} 天训练，{Math.max(0, plans.length - trainingDays)} 天恢复或复盘。</p>
      </div>
      <div className="week-list">
        {week.map((day) => {
          const plan = plans.find((item) => item.date === day.date)
          return (
            <article className="day-card" key={day.date}>
              <div className="day-head">
                <strong>{formatDay(day.date)}</strong>
                <span className={plan ? `plan-source-tag ${plan.source}` : 'plan-source-tag empty'}>
                  {plan ? formatPlanSourceLabel(plan.source) : '未制定'}
                </span>
              </div>
              {plan ? (
                <>
                  <p className="muted">{plan.title} · {formatPlanFocusText(plan.focus, plan.source)} · 截止 {plan.deadline}</p>
                  {planToExercises(plan).map((exercise) => (
                    <ExerciseCard exercise={exercise} key={exercise.id} />
                  ))}
                </>
              ) : (
                <p className="muted">当天没有明确计划，不会自动罚款。</p>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
