import ExerciseCard from '../../components/ExerciseCard'
import { formatDay } from '../../lib/date'
import { buildPlan } from '../../lib/plan'

export default function Plan() {
  const plan = buildPlan(new Date())

  return (
    <section className="screen with-nav">
      <div className="page-title">
        <h2>本周计划</h2>
        <p>计划仍然 hardcode；v3 再做教练端编辑。</p>
      </div>
      <div className="week-list">
        {plan.map((day) => (
          <article className="day-card" key={day.date}>
            <div className="day-head">
              <strong>{formatDay(day.date)}</strong>
              <span>{day.isTraining ? day.title : '恢复 / 请假不罚'}</span>
            </div>
            {day.exercises.map((exercise) => (
              <ExerciseCard exercise={exercise} key={exercise.id} />
            ))}
          </article>
        ))}
      </div>
    </section>
  )
}
